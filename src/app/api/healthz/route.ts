/**
 * GET /api/healthz — Liveness probe (PRD §19, §20)
 * -----------------------------------------------
 * Returns 200 the moment the Node process is up and able to respond.
 * Performs NO dependency checks — that is the job of /api/readyz.
 *
 * Body (plain JSON, not the API envelope — health probes must be lightweight
 * and not require envelope parsing):
 *   { status: "ok", uptime: <seconds>, timestamp: <ISO> }
 */

import { NextResponse } from "next/server";
import { validateConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  // Ensure config is validated (cached after first call). Intentionally cheap.
  validateConfig();

  return NextResponse.json(
    {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
