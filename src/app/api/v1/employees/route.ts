/**
 * ASTROLABE API — /api/v1/employees (GET)
 * Lightweight list of all employees — used by judge mode scenario switcher
 * and any client that needs to populate an employee picker.
 */
import { NextRequest } from "next/server";
import { success } from "@/lib/api/envelope";
import { employees } from "@/lib/data/pack";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const start = Date.now();
  const items = employees.map((e) => ({
    id: e.id,
    ref: e.ref,
    displayName: e.displayName,
    displayNameAr: e.displayNameAr,
    journeyType: e.journeyType,
    stage: e.stage,
    location: e.location,
    role: e.role,
    team: e.team,
    startDate: e.startDate,
    effectiveDate: e.effectiveDate,
    managerId: e.managerId,
    hrbpId: e.hrbpId,
  }));

  return success(
    { items },
    {
      servedFrom: "live",
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    },
  );
}
