/**
 * ASTROLABE API — /api/v1/admin/replay (POST)
 * Re-run the deterministic engine against an as-of timestamp for one,
 * many, or all employees. Returns a jobId + the assessments.
 *
 * PRD §29 item 46 / PRD §19-378 — Replay is deterministic. The engine is
 * pure (no I/O, no Math.random, no Date.now inside `src/lib/engine`), so
 * `POST /api/v1/admin/replay { asOf: T }` always yields byte-identical
 * `results` for the same `asOf` (+ same `employeeIds` filter, same pack
 * version, same engine version). The response stamps `mapVersion`,
 * `corpusVersion`, `engineVersion`, `packVersion` via the success envelope
 * so callers can prove they got the same artefact across runs. The only
 * non-deterministic field on the response is `jobId` (a `Date.now`-based
 * slug for human tracking) and `latencyMs` — both live in `meta`, not in
 * the replayed `results`. This is the judge-mode "rewind".
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { employees } from "@/lib/data/pack";
import { assess, type Assessment } from "@/lib/engine/engine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: { asOf?: string; employeeIds?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const asOfRaw = body.asOf ?? "";
  if (!asOfRaw) {
    return error("E_VALIDATION", "`asOf` is required (ISO 8601)", 422, {
      hint: "e.g. 2024-10-19T10:00:00Z",
    });
  }

  const asOf = new Date(asOfRaw);
  if (Number.isNaN(asOf.getTime())) {
    return error("E_VALIDATION", "`asOf` is not a valid date", 422);
  }

  const requestedIds = body.employeeIds ?? [];
  const targetEmployees = requestedIds.length
    ? employees.filter((e) => requestedIds.includes(e.id))
    : employees;

  // Surface any unknown employeeIds rather than silently skipping.
  if (requestedIds.length) {
    const unknown = requestedIds.filter(
      (id) => !employees.find((e) => e.id === id)
    );
    if (unknown.length > 0) {
      return error(
        "E_NOT_FOUND",
        `Unknown employeeIds: ${unknown.join(", ")}`,
        404
      );
    }
  }

  const results: Assessment[] = targetEmployees.map((e) => assess(e, asOf));

  const jobId = `replay-${Date.now().toString(36)}`;

  return success(
    { jobId, asOf: asOf.toISOString(), results },
    {
      servedFrom: "deterministic",
      asOf: asOf.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
