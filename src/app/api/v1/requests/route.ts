/**
 * ASTROLABE API — /api/v1/requests
 *  GET  : list service requests (cursor pagination, optional employeeId filter)
 *  POST : create a new service request (idempotent, schema-validated, owner-resolved)
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import {
  serviceRequests,
  employees,
  type ServiceRequest,
  type RequestType,
  type Owner,
} from "@/lib/data/pack";
import { INTAKE_SCHEMAS, resolveOwner } from "@/lib/actions/actions";
import { engineNow } from "@/lib/engine/engine";
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
  const idempotencyKey = (body.idempotencyKey ?? "").trim();

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
  if (!idempotencyKey) {
    const res = error("E_VALIDATION", "`idempotencyKey` is required", 422, {
      hint: "Provide a stable client-generated key to dedupe retries.",
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

  // Idempotency: return cached request if seen before.
  const cached = serviceRequests.find((r) => r.idempotencyKey === idempotencyKey);
  if (cached) {
    const res = success(
      { ...cached, servedFrom: "cache" as const },
      {
        servedFrom: "cache",
        asOf: new Date().toISOString(),
        latencyMs: Date.now() - start,
      }
    );
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
    res.headers.set("X-RateLimit-Limit", String(RATE_LIMITS.requests.limit));
    return res;
  }

  // Resolve owner (functional fallback may apply).
  const { owner, path: ownerPath, fallbackUsed } = resolveOwner(type, employee, schema.ownerGroup);
  if (!owner) {
    const res = error(
      "E_NO_OWNER",
      `No owner could be resolved for request type '${type}' and employee ${employeeId}`,
      422,
      {
        hint: "Owner resolution chain exhausted. Assign manually via HRBP.",
        retryable: false,
      }
    );
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  }

  const now = engineNow();
  const newRequest: ServiceRequest = {
    id: `SR-2024-${now.getTime().toString(36)}`,
    ref: `SR-2024-${now.getTime().toString(36)}`,
    employeeId,
    type,
    ownerGroup: schema.ownerGroup,
    assignee: owner.id,
    status: "submitted",
    openedAt: now.toISOString(),
    slaHours: schema.slaHours,
    reassignCount: 0,
    returnCount: 0,
    idempotencyKey,
  };

  // In-memory mutation (prototype only).
  serviceRequests.push(newRequest);

  const res = success(
    {
      ...newRequest,
      servedFrom: "live" as const,
      owner: { id: owner.id, name: owner.name, role: owner.role, email: owner.email } as Pick<Owner, "id" | "name" | "role" | "email">,
      ownerResolution: { path: ownerPath, fallbackUsed },
    },
    {
      servedFrom: "live",
      asOf: now.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
  res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
  res.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
  res.headers.set("X-RateLimit-Limit", String(RATE_LIMITS.requests.limit));
  return res;
}
