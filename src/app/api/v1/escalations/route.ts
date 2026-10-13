/**
 * ASTROLABE API — /api/v1/escalations (POST)
 * Build a named-human escalation packet. Requires a named owner.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { employees, getOwner } from "@/lib/data/pack";
import { assess } from "@/lib/engine/engine";
import { buildEscalationPacket } from "@/lib/actions/actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: {
    employeeId?: string;
    decisionRequested?: string;
    sharePulseSummary?: boolean;
    namedOwnerId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const employeeId = body.employeeId ?? "";
  const decisionRequested = (body.decisionRequested ?? "").trim();
  const sharePulseSummary = body.sharePulseSummary === true;
  const namedOwnerId = (body.namedOwnerId ?? "").trim();

  if (!employeeId) {
    return error("E_VALIDATION", "`employeeId` is required", 422);
  }
  if (!decisionRequested) {
    return error("E_VALIDATION", "`decisionRequested` is required", 422);
  }
  if (!namedOwnerId) {
    return error(
      "E_UNPROCESSABLE",
      "Named owner required for escalation",
      422,
      {
        hint: "Escalations must be addressed to a named human — pass `namedOwnerId`.",
      }
    );
  }

  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404);
  }

  // Verify named owner exists (HRBP, manager, or functional owner).
  const namedOwner = getOwner(namedOwnerId);
  if (!namedOwner) {
    return error(
      "E_NOT_FOUND",
      `Named owner ${namedOwnerId} not found`,
      404,
      {
        hint: "Use an id from owners/managers/hrbps (e.g. HRBP-1, MGR-1, O-HR-1).",
      }
    );
  }

  const assessment = assess(employee);
  const packet = buildEscalationPacket(
    employee,
    assessment,
    decisionRequested,
    sharePulseSummary
  );

  // Override the named owner with the caller's choice (the builder defaults to HRBP).
  const packetWithNamedOwner = {
    ...packet,
    namedOwner: {
      id: namedOwner.id,
      name: namedOwner.name,
      role: namedOwner.role,
      email: namedOwner.email,
    },
  };

  return success(packetWithNamedOwner, {
    servedFrom: "live",
    asOf: new Date().toISOString(),
    latencyMs: Date.now() - start,
  });
}
