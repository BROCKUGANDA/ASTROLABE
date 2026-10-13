/**
 * ASTROLABE API — /api/v1/requests/[id]/return-question
 *  GET  : returns the current structured "needs more info" question for a
 *         request (or null when none is set).
 *  POST : sets the structured question on a returned request — body:
 *         { question, additionalDetail?, returnedBy }.
 *
 * PRD §11-212 — when a service owner returns a request with "needs more info",
 * they pick a STANDARD question (not free text) and may add a brief detail.
 * The employee then sees a structured "We need one more detail" card in their
 * Requests tab — a "your next move" trigger, NOT a red error.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { serviceRequests, type ReturnQuestion } from "@/lib/data/pack";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id } = await params;
  const request = serviceRequests.find((r) => r.id === id);
  if (!request) {
    return error("E_NOT_FOUND", `Service request ${id} not found`, 404);
  }
  return success(
    { returnQuestion: request.returnQuestion ?? null },
    {
      servedFrom: "live",
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id } = await params;

  let body: {
    question?: string;
    additionalDetail?: string;
    returnedBy?: string;
    returnedAt?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const question = (body.question ?? "").trim();
  const additionalDetail = (body.additionalDetail ?? "").trim();
  const returnedBy = (body.returnedBy ?? "").trim();

  if (!question) {
    return error("E_VALIDATION", "`question` is required", 422, {
      hint: "Pick a standard question from STANDARD_QUESTIONS for the request type.",
    });
  }
  if (!returnedBy) {
    return error("E_VALIDATION", "`returnedBy` is required", 422, {
      hint: "The named service owner who is asking — e.g. 'Mona Said'.",
    });
  }

  const request = serviceRequests.find((r) => r.id === id);
  if (!request) {
    return error("E_NOT_FOUND", `Service request ${id} not found`, 404);
  }

  const rq: ReturnQuestion = {
    question,
    additionalDetail: additionalDetail || undefined,
    returnedBy,
    returnedAt: body.returnedAt ?? new Date().toISOString(),
  };
  // In-memory mutation (prototype only). Status is updated by the caller via
  // the transition route; this endpoint only owns the structured-question
  // payload itself.
  request.returnQuestion = rq;

  return success(
    { ...request, returnQuestion: rq },
    {
      servedFrom: "live",
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
