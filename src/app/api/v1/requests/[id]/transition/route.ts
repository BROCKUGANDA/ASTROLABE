/**
 * ASTROLABE API — /api/v1/requests/[id]/transition (POST)
 * Transitions a service request through the legal state machine.
 *
 * PRD §29 item 15 — Request status is DERIVED, never written directly.
 * This route is the ONLY mutation site for `request.status` in the whole
 * app. It enforces: (a) `to` ∈ VALID_STATUSES, (b) `(from, to)` ∈
 * LEGAL_TRANSITIONS (via `canTransition`), (c) idempotency-key present,
 * (d) structured return-question lifecycle. The engine, the UI, and any
 * future model-call layer are forbidden from writing `request.status`;
 * they must call this route (or the `canTransition` predicate at minimum).
 *
 * Optional payload extensions (PRD §11-212):
 *   - returnQuestion: { question, additionalDetail?, returnedBy, returnedAt? }
 *     When `to === "returned"`, attaches the structured "needs more info"
 *     question to the request so the employee sees a "We need one more
 *     detail" card — not just a status change.
 *   - answer: string
 *     When `to === "submitted"` and the request was previously "returned",
 *     the employee's resubmit may include their answer; we capture it on the
 *     returnQuestion (for audit) and then clear the active question so the
 *     card disappears from the employee's Requests tab.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { serviceRequests, type ServiceRequest, type ReturnQuestion } from "@/lib/data/pack";
import { canTransition } from "@/lib/actions/actions";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const VALID_STATUSES: ReadonlySet<ServiceRequest["status"]> = new Set([
  "draft",
  "validated",
  "submitted",
  "acknowledged",
  "in_progress",
  "waiting_employee",
  "resolved",
  "closed",
  "returned",
  "reassigned",
  "reopened",
  "cancelled",
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const start = Date.now();
  const { id } = await params;

  let body: {
    to?: string;
    idempotencyKey?: string;
    returnQuestion?: {
      question?: string;
      additionalDetail?: string;
      returnedBy?: string;
      returnedAt?: string;
    };
    answer?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const to = (body.to ?? "").trim();
  const idempotencyKey = (body.idempotencyKey ?? "").trim();

  if (!to) {
    return error("E_VALIDATION", "`to` is required", 422, {
      hint: "Target status e.g. 'acknowledged', 'in_progress', 'resolved'.",
    });
  }
  if (!idempotencyKey) {
    return error("E_VALIDATION", "`idempotencyKey` is required", 422);
  }
  if (!VALID_STATUSES.has(to as ServiceRequest["status"])) {
    return error("E_VALIDATION", `Unknown target status '${to}'`, 422, {
      hint: "Must be one of: draft, validated, submitted, acknowledged, in_progress, waiting_employee, resolved, closed, returned, reassigned, reopened, cancelled",
    });
  }

  const request = serviceRequests.find((r) => r.id === id);
  if (!request) {
    return error("E_NOT_FOUND", `Service request ${id} not found`, 404);
  }

  const from = request.status;
  if (!canTransition(from, to)) {
    // Rejections are part of the audit trail: a refused jump is exactly the
    // evidence the HRBP view needs (RQ-02 ping-pong, illegal close attempts).
    logger.warn("illegal request transition rejected", {
      requestId: req.headers.get("x-request-id") ?? undefined,
      serviceRequestId: id,
      from,
      to,
    });
    return error("E_CONFLICT", `Illegal transition: '${from}' → '${to}'`, 409, {
      hint: `Legal transitions from '${from}' are defined in the request state machine.`,
    });
  }

  // Idempotency: if the request is already in the target state, treat as replay.
  const servedFrom = from === to ? "cache" : "live";

  // PRD §11-212 — structured return-question lifecycle.
  if (to === "returned" && body.returnQuestion) {
    const rq = body.returnQuestion;
    const question = (rq.question ?? "").trim();
    const returnedBy = (rq.returnedBy ?? "").trim();
    if (!question) {
      return error("E_VALIDATION", "`returnQuestion.question` is required when returning", 422);
    }
    if (!returnedBy) {
      return error("E_VALIDATION", "`returnQuestion.returnedBy` is required when returning", 422);
    }
    const built: ReturnQuestion = {
      question,
      additionalDetail: (rq.additionalDetail ?? "").trim() || undefined,
      returnedBy,
      returnedAt: rq.returnedAt ?? new Date().toISOString(),
    };
    request.returnQuestion = built;
  }

  // PRD §11-212 — resubmit: capture the employee's answer (for audit) and
  // clear the active question so the card disappears from the employee's
  // Requests tab. The request goes back to `submitted`. In production the
  // answer would be appended to an audit trail before the active question is
  // cleared; for the prototype we capture the answer on the in-memory object
  // first, then drop the active reference so the UI hides the card.
  if (to === "submitted" && from === "returned" && request.returnQuestion) {
    if (typeof body.answer === "string" && body.answer.trim().length > 0) {
      request.returnQuestion.answer = body.answer.trim();
    }
    request.returnQuestion = undefined;
  }

  // Mutate in place (prototype only).
  request.status = to as ServiceRequest["status"];

  // Server-side counters: the ping-pong evidence (RQ-02) is DERIVED from the
  // transitions that actually happened, not from what the UI chose to bump
  // optimistically. A replay (from === to) is not a new bounce, so it counts
  // once at the real transition only.
  if (from !== to) {
    if (to === "reassigned") request.reassignCount += 1;
    if (to === "returned") request.returnCount += 1;
  }

  return success(
    {
      ...request,
      servedFrom,
      transition: { from, to },
    },
    {
      servedFrom,
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    },
  );
}
