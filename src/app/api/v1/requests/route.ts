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

  const employeeId = body.employeeId ?? "";
  const type = body.type as RequestType | undefined;
  const payload = body.payload ?? {};
  const idempotencyKey = (body.idempotencyKey ?? "").trim();

  if (!employeeId) {
    return error("E_VALIDATION", "`employeeId` is required", 422);
  }
  if (!type) {
    return error("E_VALIDATION", "`type` is required", 422, {
      hint: "One of: it_kit, system_access, visa, relocation, payroll, training, facilities, manager_handover",
    });
  }
  if (!idempotencyKey) {
    return error("E_VALIDATION", "`idempotencyKey` is required", 422, {
      hint: "Provide a stable client-generated key to dedupe retries.",
    });
  }

  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404);
  }

  const schema = INTAKE_SCHEMAS[type];
  if (!schema) {
    return error("E_VALIDATION", `Unknown request type '${type}'`, 422);
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
    return error(
      "E_VALIDATION",
      `Missing required fields: ${missing.join(", ")}`,
      422,
      { hint: `Required fields for '${type}' are defined in INTAKE_SCHEMAS.` }
    );
  }

  // Idempotency: return cached request if seen before.
  const cached = serviceRequests.find((r) => r.idempotencyKey === idempotencyKey);
  if (cached) {
    return success(
      { ...cached, servedFrom: "cache" as const },
      {
        servedFrom: "cache",
        asOf: new Date().toISOString(),
        latencyMs: Date.now() - start,
      }
    );
  }

  // Resolve owner (functional fallback may apply).
  const { owner, path: ownerPath, fallbackUsed } = resolveOwner(type, employee, schema.ownerGroup);
  if (!owner) {
    return error(
      "E_NO_OWNER",
      `No owner could be resolved for request type '${type}' and employee ${employeeId}`,
      422,
      {
        hint: "Owner resolution chain exhausted. Assign manually via HRBP.",
        retryable: false,
      }
    );
  }

  const now = new Date();
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

  return success(
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
}
