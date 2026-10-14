/**
 * ASTROLABE API — /api/v1/consent (POST)
 * Record a consent grant/revoke. Appends to in-memory consentRecords.
 * Returns a receipt so the employee can prove what they agreed to.
 */
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { success, error } from "@/lib/api/envelope";
import {
  consentRecords,
  employees,
  pulseResponses,
  type ConsentRecord,
} from "@/lib/data/pack";
import { assess, engineNow, resolveAsOf } from "@/lib/engine/engine";
import { guard } from "@/lib/privacy/guard";
import { appendAudit } from "@/lib/privacy/audit";

export const dynamic = "force-dynamic";

/**
 * The consent text the employee was shown, hashed. A stored hash of a string
 * nobody can re-derive is theatre, so this hashes the actual copy keyed to
 * purpose and version; changing the wording changes the hash.
 */
const CONSENT_TEXTS: Record<string, string> = {
  journey_assistance: "We use your journey data to tell you what is next and who owns it.",
  pulse_capture: "Optional short surveys at stage gates, only if you say yes.",
  share_pulse_summary: "Optional: share a summary of your answers with your HR partner when a human needs to step in.",
  comment_retention: "Optional: keep what you typed in the comment box. If this is off, the text is deleted and only the score remains.",
  aggregate_analytics: "Counts of people like you in cohorts of five or more, never about you specifically.",
  manager_visibility: "Your manager sees only the steps they themselves own.",
};

function consentTextHash(purpose: string, version: string): string {
  const text = `${CONSENT_TEXTS[purpose] ?? purpose}|${version}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

const VALID_PURPOSES: ReadonlySet<ConsentRecord["purpose"]> = new Set([
  "journey_assistance",
  "pulse_capture",
  "share_pulse_summary",
  "comment_retention",
  "aggregate_analytics",
  "manager_visibility",
]);

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: {
    employeeId?: string;
    purpose?: string;
    granted?: boolean;
    version?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const employeeId = body.employeeId ?? "";
  const purpose = body.purpose as ConsentRecord["purpose"] | undefined;
  const granted = body.granted;
  const version = body.version ?? "";

  if (!employeeId) {
    return error("E_VALIDATION", "`employeeId` is required", 422);
  }
  if (!purpose || !VALID_PURPOSES.has(purpose)) {
    return error(
      "E_VALIDATION",
      "`purpose` is required and must be a known purpose",
      422,
      {
        hint: "One of: journey_assistance, pulse_capture, share_pulse_summary, comment_retention, aggregate_analytics, manager_visibility",
      }
    );
  }
  if (typeof granted !== "boolean") {
    return error("E_VALIDATION", "`granted` must be a boolean", 422);
  }
  if (!version) {
    return error("E_VALIDATION", "`version` is required", 422, {
      hint: "Use the current consent text version, e.g. 'v1'.",
    });
  }

  // Consent belongs to the employee and to nobody else (PRD §15, §29 263).
  const auth = await guard(req, "consent.write");
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "employee" || auth.session.sub !== employeeId) {
    return error("E_FORBIDDEN", "Only the employee can change their own consent.", 403, { retryable: false });
  }

  // Optional: warn (not fail) if employee unknown — still allow consent record.
  if (!employees.find((e) => e.id === employeeId)) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404);
  }

  const now = engineNow();
  const receiptId = `RC-${now.getTime().toString(36)}`;
  const revoking = !granted;
  const newRecord: ConsentRecord = {
    id: `CN-${now.getTime().toString(36)}`,
    employeeId,
    purpose,
    granted,
    grantedAt: now.toISOString(),
    revokedAt: revoking ? now.toISOString() : undefined,
    version,
    // A hash of the consent text that was actually shown, so a later change of
    // wording is provable rather than merely plausible (PRD §29 202).
    textHash: consentTextHash(purpose, version),
  };

  // Append-only: a revocation is a new row, never an edit of the grant.
  consentRecords.push(newRecord);
  appendAudit({
    actor: employeeId,
    actorRole: "employee",
    action: revoking ? "consent.revoke" : "consent.grant",
    subject: employeeId,
    lawfulBasis: "consent",
    purpose,
  });

  // Revoking comment retention deletes the text now and confirms it (PRD §23-36,
  // §29 153/211). The score stays if pulse consent is still granted.
  let deletedComments = 0;
  if (revoking && purpose === "comment_retention") {
    for (const p of pulseResponses) {
      if (p.employeeId === employeeId && p.commentText) {
        p.commentText = undefined;
        deletedComments++;
      }
    }
  }

  // The effect is immediate and visible: recompute the assessment with the new
  // ledger rather than waiting for the next event to touch it (§29 147/159/209).
  const employee = employees.find((e) => e.id === employeeId)!;
  const recomputed = assess(employee, resolveAsOf(engineNow()));

  return success(
    {
      receiptId,
      consentRecordId: newRecord.id,
      grantedAt: now.toISOString(),
      revokedAt: newRecord.revokedAt,
      purpose,
      granted,
      version,
      textHash: newRecord.textHash,
      deletedComments,
      effect: {
        band: recomputed.band,
        score: recomputed.score,
        suppressedFamilies: recomputed.suppressedFamilies,
        explanation: recomputed.signals
          .filter((s) => s.code === "PS-04")
          .map((s) => s.description)[0],
      },
    },
    {
      servedFrom: "live",
      asOf: now.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
