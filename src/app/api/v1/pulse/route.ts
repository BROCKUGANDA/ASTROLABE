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

export const dynamic = "force-dynamic";

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
  const score = body.score;
  const commentText = body.commentText;
  const consentId = body.consentId ?? "";

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

  const now = new Date();
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
  pulseResponses.push(newPulse);

  return success(newPulse, {
    servedFrom: "live",
    asOf: now.toISOString(),
    latencyMs: Date.now() - start,
  });
}
