/**
 * ASTROLABE API — /api/v1/ask (POST)
 * Policy answering with simulated 3-stage retrieval + composition.
 * PRD §13, §19.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { answer } from "@/lib/policy/retrieval";
import type { Locale } from "@/lib/data/pack";
import {
  rateLimit,
  getClientIp,
  buildIdentifier,
  formatRetrySeconds,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  // Rate limit BEFORE we spend a turn on parsing — defence first (PRD §19).
  // Scope: "ask" — 30 / 5 min per (ip + employeeId).
  let body: { question?: string; locale?: "en" | "ar"; employeeId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const ip = getClientIp(req);
  const userId =
    typeof body.employeeId === "string" && body.employeeId.length > 0
      ? body.employeeId
      : null;
  const rlId = buildIdentifier("ask", ip, userId);
  const rl = rateLimit(rlId, RATE_LIMITS.ask.limit, RATE_LIMITS.ask.windowMs);
  if (!rl.success) {
    const retrySec = formatRetrySeconds(rl.resetAt);
    logger.warn("ask rate-limited", {
      rlId,
      retrySec,
      requestId: req.headers.get("x-request-id") ?? undefined,
    });
    const res = error(
      "E_RATE_LIMIT",
      "Too many questions. Please wait a moment.",
      429,
      {
        hint: `Try again in ${retrySec} seconds`,
        retryable: true,
      }
    );
    res.headers.set("Retry-After", String(retrySec));
    res.headers.set("X-RateLimit-Remaining", "0");
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
    res.headers.set("X-RateLimit-Limit", String(RATE_LIMITS.ask.limit));
    return res;
  }

  const question = (body.question ?? "").trim();
  const locale: Locale = body.locale === "ar" ? "ar" : "en";

  if (!question) {
    const res = error("E_VALIDATION", "`question` is required", 422, {
      hint: "Ask something like: 'What is the relocation allowance for a single joiner?'",
    });
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  }
  if (question.length > 1000) {
    const res = error("E_VALIDATION", "Question too long (max 1000 chars)", 422);
    res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
    return res;
  }

  // Simulate 3-stage thinking: retrieval, reading, drafting.
  // 400–700ms total artificial latency (PRD §13 retrieval simulation).
  const totalLatency = 400 + Math.floor(Math.random() * 300);
  await delay(totalLatency);

  const policyAnswer = answer(question, locale);

  const stages = ["checking your journey", "reading policy", "drafting"];

  const res = success(
    {
      stages,
      answer: policyAnswer,
      employeeId: body.employeeId ?? null,
    },
    {
      // The PolicyAnswer's own `servedFrom` is one of "live"|"extractive"|"cache".
      // The API envelope only knows "live"|"cache"|"deterministic", so we map
      // "extractive" → "live" (the retrieval was live, just extractive in style).
      servedFrom: policyAnswer.servedFrom === "cache" ? "cache" : "live",
      degraded: policyAnswer.degraded,
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    }
  );
  res.headers.set("X-RateLimit-Remaining", String(rl.remaining));
  res.headers.set("X-RateLimit-Reset", String(Math.ceil(rl.resetAt / 1000)));
  res.headers.set("X-RateLimit-Limit", String(RATE_LIMITS.ask.limit));
  return res;
}
