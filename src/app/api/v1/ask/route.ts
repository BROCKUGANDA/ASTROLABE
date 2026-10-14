/**
 * ASTROLABE API — /api/v1/ask (POST)
 * Policy answering with simulated 3-stage retrieval + composition.
 * PRD §13, §19.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { answer } from "@/lib/policy/retrieval";
import type { Locale } from "@/lib/data/pack";

export const dynamic = "force-dynamic";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: { question?: string; locale?: "en" | "ar"; employeeId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const question = (body.question ?? "").trim();
  const locale: Locale = body.locale === "ar" ? "ar" : "en";

  if (!question) {
    return error("E_VALIDATION", "`question` is required", 422, {
      hint: "Ask something like: 'What is the relocation allowance for a single joiner?'",
    });
  }
  if (question.length > 1000) {
    return error("E_VALIDATION", "Question too long (max 1000 chars)", 422);
  }

  // Simulate 3-stage thinking: retrieval, reading, drafting.
  // 400–700ms total artificial latency (PRD §13 retrieval simulation).
  const totalLatency = 400 + Math.floor(Math.random() * 300);
  await delay(totalLatency);

  const policyAnswer = answer(question, locale);

  const stages = ["checking your journey", "reading policy", "drafting"];

  return success(
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
}
