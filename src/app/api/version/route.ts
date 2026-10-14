/**
 * GET /api/version — Version info (PRD §19, §20)
 * ---------------------------------------------
 * Returns build/runtime version metadata so operators and CI can confirm
 * which engine, pack, and corpus are deployed.
 *
 * Body (plain JSON):
 *   {
 *     name: "ASTROLABE",
 *     version: "1.0.0",
 *     engineVersion, packVersion, corpusVersion,
 *     buildTime: <ISO>,
 *     gitSha: "prototype"
 *   }
 */

import { NextResponse } from "next/server";
import { validateConfig } from "@/lib/config";
import { ENGINE_VERSION, PACK_VERSION, CORPUS_VERSION } from "@/lib/data/pack";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Captured once at module load so buildTime is stable across requests within
// a single process lifetime.
const buildTime = new Date().toISOString();

export async function GET(): Promise<NextResponse> {
  const cfg = validateConfig();

  return NextResponse.json({
    name: "ASTROLABE",
    version: cfg.version,
    engineVersion: ENGINE_VERSION,
    packVersion: PACK_VERSION,
    corpusVersion: CORPUS_VERSION,
    buildTime,
    gitSha: "prototype",
  });
}
