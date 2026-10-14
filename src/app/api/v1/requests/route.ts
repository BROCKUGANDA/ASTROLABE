/**
 * ASTROLABE API — /api/v1/requests
 *  GET  : list service requests (cursor pagination, optional employeeId filter)
 *  POST : create a new service request (server-derived dedup, schema-validated,
 *         directory owner resolution, working-calendar expected-by)
 *
 * Dedup is the SERVER's job, not the caller's (see src/lib/requests/intake.ts):
 * a create is a duplicate when (employeeId, type, payloadHash) matches a request
 * opened within DUPLICATE_WINDOW_MS, whether or not the caller sent a key. A
 * duplicate returns HTTP 200 with the EXISTING request + `duplicate: true` and
 * is recorded via noteDuplicate so the HRBP view can see the repeat. An explicit
 * `X-Idempotency-Key` header (or body `idempotencyKey`) is still honoured: the
 * same key + same payload replays the ticket, the same key + DIFFERENT payload
 * is a caller bug and returns 409 E_CONFLICT.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { guard } from "@/lib/privacy/guard";
import {
  serviceRequests,
  employees,
  type RequestType,
  type Owner,
} from "@/lib/data/pack";
import { INTAKE_SCHEMAS } from "@/lib/actions/actions";
import { engineNow } from "@/lib/engine/engine";
import {
  expectedByFor,
  assessIntake,
  commitIntake,
  intakeRecordFor,
  noteDuplicate,
} from "@/lib/requests/intake";
import {
  rateLimit,
  getClientIp,
  buildIdentifier,
  formatRetrySeconds,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const start = Date.now();
  const employeeId = req.nextUrl.searchParams.get("employeeId");
  const cursor = req.nextUrl.searchParams.get("cursor");

  let items = [...serviceRequests].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  if (employeeId) {
    items = items.filter((r) => r.employeeId === employeeId);
  }

  // Cursor = ISO openedAt + id (so order is stable).
  if (cursor) {
    const cursorIdx = items.findIndex((r) => `${r.openedAt}|${r.id}` === cursor);
    if (cursorIdx >= 0) {
      items = items.slice(cursorIdx + 1);
    }
  }

  const page = items.slice(0, PAGE_SIZE);
  const nextCursor =
    items.length > PAGE_SIZE && page.length > 0
      ? `${page[page.length - 1].openedAt}|${page[page.length - 1].id}`
      : null;

  return success(
    { items: page, nextCursor },
    {
      servedFrom: "live",
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}

export async function POST(req: NextRequest) {
  // Creating a ticket is a state change, so it needs a session: an employee or
  // an HRBP acting for one, never an anonymous caller.
  const auth = await guard(req, "requests.create");
  if (!auth.ok) return auth.response;
  const start = Date.now();

  let body: {
    employeeId?: string;
    type?: RequestType;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  // Rate limit BEFORE we resolve the owner / mutate state (PRD §19).
  // Scope: "requests" — 10 / hour per (ip + employeeId).
  const ip = getClientIp(req);
  const userId =
    typeof body.employeeId === "string" && body.employeeId.length > 0
      ? body.employeeId
      : null;
  const rlId = buildIdentifier("requests", ip, userId);
  const rl = rateLimit(
    rlId,
    RATE_LIMITS.requests.limit,
    RATE_LIMITS.requests.windowMs
  );
  if (!rl.success) {
    const retrySec = formatRetrySeconds(rl.resetAt);
    logger.warn("requests rate-limited", {
      rlId,
      retrySec,
      requestId: req.headers.get("x-request-id") ?? undefined,
    });
    const res = error(
      "E_RATE_LIMIT",
      "Too many requests submitted. Please wait before opening another.",
      429,
      {
        hint: `Try again in ${retrySec} seconds`,
        retryable: true,
      }
    );
    res.headers.set("Retry-After", String(retrySec));
    res.headers.set("X-RateLimit-Remaining", "0");
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
    res.headers.set("X-RateLimit-Limit", String(RATE_LIMITS.requests.limit));
    return res;
  }

  const employeeId = body.employeeId ?? "";
  const type = body.type as RequestType | undefined;
  const payload = body.payload ?? {};
  // An explicit key still counts, but it is a courtesy, not the dedup engine:
  // header wins over body, and neither is required any more.
  const idempotencyKey = (
    req.headers.get("x-idempotency-key") ?? body.idempotencyKey ?? ""
  ).trim();

  if (!employeeId) {
    const res = error("E_VALIDATION", "`employeeId` is required", 422);
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  }
  if (!type) {
    const res = error("E_VALIDATION", "`type` is required", 422, {
      hint: "One of: it_kit, system_access, visa, relocation, payroll, training, facilities, manager_handover",
    });
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  }

  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    const res = error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404);
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  }

  const schema = INTAKE_SCHEMAS[type];
  if (!schema) {
    const res = error("E_VALIDATION", `Unknown request type '${type}'`, 422);
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  }

  // Validate required intake fields.
  const missing: string[] = [];
  for (const field of schema.fields) {
    if (field.required) {
      const v = payload[field.key];
      if (v === undefined || v === null || v === "" || v === false) {
        missing.push(field.key);
      }
    }
  }
  if (missing.length > 0) {
    const res = error(
      "E_VALIDATION",
      `Missing required fields: ${missing.join(", ")}`,
      422,
      { hint: `Required fields for '${type}' are defined in INTAKE_SCHEMAS.` }
    );
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  }

  // Server-derived intake assessment: canonical payload hash, dedup lookup,
  // directory owner resolution and working-calendar expected-by. There must be
  // no `await` between the duplicate check and the commit below — the single
  // process event loop is what makes ten concurrent submits collapse into one
  // row (see intake.ts commitIntake docs).
  const assessment = assessIntake({
    employee,
    type,
    schema,
    rawPayload: payload,
    idempotencyKey,
    asOf: engineNow(),
  });
  const rateHeaders = (res: ReturnType<typeof success>) => {
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
    res.headers.set("X-RateLimit-Limit", String(RATE_LIMITS.requests.limit));
    return res;
  };

  // Same caller key, DIFFERENT payload — a caller bug against its own
  // idempotency promise. Refuse rather than file something else under it.
  if (assessment.keyConflict) {
    const conflict = assessment.keyConflict;
    logger.warn("intake idempotency-key conflict", {
      requestId: req.headers.get("x-request-id") ?? undefined,
      employeeId,
      type,
      idempotencyKey,
      existingRef: conflict.ref,
    });
    return rateHeaders(
      error(
        "E_CONFLICT",
        `Idempotency key '${idempotencyKey}' was already used for a different payload (request ${conflict.ref}).`,
        409,
        {
          hint: "Reuse a key only for the exact same request body; use a new key for a different one.",
          retryable: false,
        }
      )
    );
  }

  // Duplicate: the same employee, type and canonical payload inside the
  // dedup window (or the same key with the same payload). Return the EXISTING
  // ticket with duplicate: true and record the repeat for the HRBP view.
  if (assessment.duplicateOf) {
    const { request: existing, via } = assessment.duplicateOf;
    const at = assessment.openedAt;
    const hoursSinceOpened = Math.max(
      0,
      (new Date(at).getTime() - new Date(existing.openedAt).getTime()) / 3_600_000
    );
    noteDuplicate({
      employeeId,
      type,
      existingRef: existing.ref,
      existingId: existing.id,
      at,
      payloadHash: assessment.payloadHash,
      via,
      hoursSinceOpened,
    });
    const record = intakeRecordFor(existing.id);
    const expectedBy =
      record?.expectedBy ?? expectedByFor(existing.openedAt, schema.slaHours, assessment.location);
    logger.info("intake duplicate collapsed", {
      requestId: req.headers.get("x-request-id") ?? undefined,
      employeeId,
      type,
      via,
      existingRef: existing.ref,
      hoursSinceOpened: Math.round(hoursSinceOpened * 10) / 10,
    });
    return rateHeaders(
      success(
        {
          ...existing,
          ref: existing.ref,
          duplicate: true,
          expectedBy,
          servedFrom: "cache" as const,
        },
        {
          servedFrom: "cache",
          asOf: at,
          latencyMs: Date.now() - start,
        }
      )
    );
  }

  // Resolve owner via the versioned directory (step → location queue →
  // functional fallback → HRBP of record). No owner → E_NO_OWNER, and the
  // directory names who was told instead.
  const { resolution } = assessment;
  if (!resolution.owner) {
    const noOwner = resolution.noOwner;
    return rateHeaders(
      error(
        "E_NO_OWNER",
        noOwner?.message ??
          `No owner could be resolved for request type '${type}' and employee ${employeeId}`,
        422,
        {
          hint: noOwner
            ? `Directory path: ${resolution.path.join(" → ")}`
            : "Owner resolution chain exhausted. Assign manually via HRBP.",
          retryable: false,
          ownerHint: noOwner?.toldInstead ?? undefined,
        }
      )
    );
  }

  const { request, record } = commitIntake(assessment);
  const owner = resolution.owner;

  return rateHeaders(
    success(
      {
        ...request,
        servedFrom: "live" as const,
        duplicate: false,
        expectedBy: record.expectedBy,
        payload: record.payload,
        owner: { id: owner.id, name: owner.name, role: owner.role, email: owner.email } as Pick<Owner, "id" | "name" | "role" | "email">,
        backupOwner: resolution.backup
          ? { id: resolution.backup.id, name: resolution.backup.name, role: resolution.backup.role, email: resolution.backup.email }
          : null,
        ownerResolution: {
          path: resolution.path,
          rung: resolution.rung,
          fallbackUsed: resolution.fallbackUsed,
          directoryVersion: resolution.directoryVersion,
        },
      },
      {
        servedFrom: "live",
        asOf: assessment.openedAt,
        latencyMs: Date.now() - start,
      }
    )
  );
}
