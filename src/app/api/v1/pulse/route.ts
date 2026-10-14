/**
 * ASTROLABE API — /api/v1/pulse (POST)
 * Submit a pulse response. Consent-gated: pulse_capture must be granted.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import {
  pulseResponses,
  employees,
  getConsent,
  type PulseResponse,
} from "@/lib/data/pack";
import { guard } from "@/lib/privacy/guard";
import { appendAudit } from "@/lib/privacy/audit";
import { assess, engineNow, resolveAsOf } from "@/lib/engine/engine";

export const dynamic = "force-dynamic";

/**
 * Credential and national-identifier patterns are stripped from free text before
 * it is stored. A pulse comment is a place people paste account details without
 * thinking; the product must not keep them (PRD §23-34, §29 212).
 */
const SENSITIVE_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "uae_emirates_id", pattern: /\b784[-\s]?\d{9}[-\s]?\d\b/gi },
  { name: "iban", pattern: /\bAE\d{2}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{3}\b/gi },
  { name: "card_number", pattern: /\b(?:\d[ -]*?){13,19}\b/g },
  { name: "bearer_token", pattern: /\b(?:ak|sk|ghp|xoxb|ya29)[-_][A-Za-z0-9-_]{10,}\b/g },
];

export function redactSensitive(text: string): { text: string; redacted: boolean; kinds: string[] } {
  let out = text;
  const kinds: string[] = [];
  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    if (pattern.test(out)) {
      kinds.push(name);
      out = out.replace(pattern, `[redacted:${name}]`);
    }
    pattern.lastIndex = 0;
  }
  return { text: out, redacted: kinds.length > 0, kinds };
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: {
    employeeId?: string;
    stage?: string;
    score?: number;
    commentText?: string;
    consentId?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const employeeId = body.employeeId ?? "";
  const stage = body.stage ?? "";
  let score = body.score;
  let commentText = body.commentText;
  const consentId = body.consentId ?? "";

  // Only the employee answers their own pulse, and it needs a session.
  const auth = await guard(req, "pulse.write");
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "employee" || auth.session.sub !== employeeId) {
    return error("E_FORBIDDEN", "Only the employee can record their own pulse answer.", 403, { retryable: false });
  }

  if (!employeeId) {
    return error("E_VALIDATION", "`employeeId` is required", 422);
  }
  if (!stage) {
    return error("E_VALIDATION", "`stage` is required", 422);
  }
  if (typeof score !== "number" || score < 1 || score > 5 || !Number.isInteger(score)) {
    return error("E_VALIDATION", "`score` must be an integer 1–5", 422);
  }
  if (!consentId) {
    return error("E_VALIDATION", "`consentId` is required", 422);
  }

  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404);
  }

  // Consent gate.
  if (!getConsent(employeeId, "pulse_capture")) {
    return error(
      "E_CONSENT_REQUIRED",
      "Pulse capture consent required",
      412,
      {
        hint: "Enable pulse capture in Me → Consent",
      }
    );
  }

  // Credentials and identifier patterns are stripped before storage, and again
  // before anything reaches a model (PRD §23-34, §29 212/213).
  if (commentText) {
    const redacted = redactSensitive(commentText);
    if (redacted.redacted) {
      appendAudit({
        actor: employeeId,
        actorRole: "employee",
        action: "pulse.comment_redacted",
        subject: employeeId,
        lawfulBasis: "consent",
        purpose: "early_warning",
      });
    }
    commentText = redacted.text;
  }

  // One answer per employee, stage and day (PRD §20-391).
  const dayKey = new Date().toISOString().slice(0, 10);
  const existing = pulseResponses.find(
    (p) => p.employeeId === employeeId && p.stage === stage && p.createdAt.slice(0, 10) === dayKey
  );
  if (existing) {
    return success(
      { pulseId: existing.id, duplicate: true, dedupedOn: "employee+stage+day", storedComment: Boolean(existing.commentText) },
      { servedFrom: "cache", latencyMs: Date.now() - start }
    );
  }

  const now = engineNow();
  const newPulse: PulseResponse = {
    id: `PS-${now.getTime().toString(36)}`,
    employeeId,
    stage,
    score,
    commentText: commentText ?? undefined,
    commentRef: commentText ? `PC-${now.getTime().toString(36)}` : undefined,
    consentId,
    createdAt: now.toISOString(),
  };

  // In-memory mutation (prototype only).
  // Score and comment carry separate consents: without comment retention the
  // text is not stored at all, and the answer says so (PRD §15, §29 152).
  if (newPulse.commentText && !getConsent(employeeId, "comment_retention")) {
    newPulse.commentText = undefined;
    newPulse.commentRef = undefined;
  }

  pulseResponses.push(newPulse);
  appendAudit({
    actor: employeeId,
    actorRole: "employee",
    action: "pulse.submit",
    subject: employeeId,
    lawfulBasis: "consent",
    purpose: "early_warning",
  });

  // The employee sees the effect straight away, including which family fed it.
  const recomputed = assess(employee, resolveAsOf(engineNow()));

  return success(
    {
      ...newPulse,
      effect: {
        band: recomputed.band,
        score: recomputed.score,
        suppressedFamilies: recomputed.suppressedFamilies,
      },
      commentStored: Boolean(newPulse.commentText),
    },
    {
      servedFrom: "live",
      asOf: now.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
