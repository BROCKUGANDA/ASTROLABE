/**
 * GET /api/readyz — Readiness probe (PRD §19, §20)
 * -----------------------------------------------
 * Checks every dependency the app needs to serve real traffic:
 *   - db:     a trivial Prisma query (User.count) confirms the SQLite file
 *             is present, the schema is pushed, and the client can connect.
 *   - corpus: the policies array is non-empty (policy retrieval layer).
 *   - map:    the steps array is non-empty (journey map layer).
 *   - engine: ENGINE_VERSION is set (deterministic engine loaded).
 *
 * Returns 200 { status: "ok", checks, timestamp } when all healthy,
 * or 503 { status: "degraded", checks, timestamp } when any check is down.
 *
 * Plain JSON (not the API envelope) — health probes must be lightweight.
 */

import { NextResponse } from "next/server";
import { validateConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { policies, steps, ENGINE_VERSION } from "@/lib/data/pack";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckStatus = "ok" | "down";

interface ReadinessChecks {
  db: CheckStatus;
  corpus: CheckStatus;
  map: CheckStatus;
  engine: CheckStatus;
}

async function checkDb(): Promise<CheckStatus> {
  try {
    await db.user.count();
    return "ok";
  } catch (err) {
    logger.warn("readyz DB check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "down";
  }
}

export async function GET(): Promise<NextResponse> {
  validateConfig();

  const dbStatus = await checkDb();

  const checks: ReadinessChecks = {
    db: dbStatus,
    corpus: policies.length > 0 ? "ok" : "down",
    map: steps.length > 0 ? "ok" : "down",
    engine: ENGINE_VERSION ? "ok" : "down",
  };

  const allOk = (Object.values(checks) as CheckStatus[]).every((s) => s === "ok");

  if (!allOk) {
    logger.warn("readyz reporting degraded", { checks });
  }

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 },
  );
}
