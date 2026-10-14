/**
 * ASTROLABE API — /api/v1/escalations (POST)
 * Build a named-human escalation packet AND file it (src/lib/escalations/store).
 * Requires a named owner. The packet used to be built and thrown away: nothing
 * remembered it existed, so the same employee could be escalated twice in an
 * afternoon and nobody was told. Now:
 *  - a second escalation for the same (employeeId, rootCause) inside 72h returns
 *    the EXISTING one with `duplicate: true` and counts the repeat against it
 *    (noteEscalationDuplicate) instead of filing another;
 *  - the store owns the employee notification and the 4-working-hour
 *    acknowledgement deadline — this route just passes the engine clock and the
 *    default directory through and exposes what the store computed.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { guard } from "@/lib/privacy/guard";
import { employees, getOwner } from "@/lib/data/pack";
import { assess, engineNow } from "@/lib/engine/engine";
import { buildEscalationPacket } from "@/lib/actions/actions";
import { DEFAULT_DIRECTORY } from "@/lib/requests/directory";
import {
  findExistingEscalation,
  noteEscalationDuplicate,
  recordEscalation,
  type StoredEscalation,
} from "@/lib/escalations/store";

export const dynamic = "force-dynamic";

/** What the employee is told about what was shared (packet is facts-only). */
function employeeVisibleNote(namedOwnerName: string): { en: string; ar: string } {
  return {
    en: `We shared your journey facts and open requests with ${namedOwnerName}. Your free-text comments were NOT included.`,
    ar: `شاركنا ${namedOwnerName} حقائق رحلتك وطلباتك المفتوحة فقط. تعليقاتك الكتابية لم تُرسل.`,
  };
}

function escalationPayload(stored: StoredEscalation, duplicate: boolean) {
  return {
    ...stored.packet,
    escalationId: stored.packet.id,
    duplicate,
    rootCause: stored.rootCause,
    createdAt: stored.createdAt,
    ackDeadlineAt: stored.ackDeadlineAt,
    acknowledgedAt: stored.acknowledgedAt,
    reroutedAt: stored.reroutedAt,
    duplicateCount: stored.duplicateCount,
    lastDuplicateAt: stored.lastDuplicateAt,
    namedOwner: stored.packet.namedOwner,
    backupOwner: stored.packet.backupOwner ?? null,
    employeeNote: employeeVisibleNote(stored.packet.namedOwner.name),
    freeTextExcluded: stored.packet.consentStatement.freeTextExcluded,
    stored: true,
  };
}

export async function POST(req: NextRequest) {
  // Only a person with a duty of care may file a packet about someone.
  const auth = await guard(req, "escalations.create");
  if (!auth.ok) return auth.response;
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
    return error("E_UNPROCESSABLE", "Named owner required for escalation", 422, {
      hint: "Escalations must be addressed to a named human — pass `namedOwnerId`.",
    });
  }

  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404);
  }

  // Verify named owner exists (HRBP, manager, or functional owner).
  const namedOwner = getOwner(namedOwnerId);
  if (!namedOwner) {
    return error("E_NOT_FOUND", `Named owner ${namedOwnerId} not found`, 404, {
      hint: "Use an id from owners/managers/hrbps (e.g. HRBP-1, MGR-1, O-HR-1).",
    });
  }

  const assessment = assess(employee);
  const packet = buildEscalationPacket(employee, assessment, decisionRequested, sharePulseSummary);

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

  // The root cause key for the dedup guard: the top signal code is the engine's
  // own name for "why this is in front of a human".
  const now = engineNow();
  const at = now.toISOString();
  const rootCause = packetWithNamedOwner.topSignals[0]?.code ?? `decision:${decisionRequested}`;

  const existing = findExistingEscalation(employee.id, rootCause, now);
  if (existing) {
    noteEscalationDuplicate(existing, at);
    return success(escalationPayload(existing, true), {
      servedFrom: "cache",
      asOf: at,
      latencyMs: Date.now() - start,
    });
  }

  const stored = recordEscalation({
    packet: packetWithNamedOwner,
    rootCause,
    employee,
    nowIso: now,
    directory: DEFAULT_DIRECTORY,
  });

  return success(escalationPayload(stored, false), {
    servedFrom: "live",
    asOf: at,
    latencyMs: Date.now() - start,
  });
}
