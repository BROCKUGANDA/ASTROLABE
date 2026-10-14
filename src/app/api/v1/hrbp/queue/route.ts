/**
 * ASTROLABE API — /api/v1/hrbp/queue (GET)
 * Build the HRBP work queue: assess every employee, rank by band severity
 * then by lead time (hours since first journey event) descending.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { employees, events, getOwner } from "@/lib/data/pack";
import { assess, type Band } from "@/lib/engine/engine";

export const dynamic = "force-dynamic";

const BAND_SEVERITY: Record<Band, number> = {
  blocked: 3,
  friction: 2,
  watch: 1,
  steady: 0,
};

export async function GET(req: NextRequest) {
  const start = Date.now();
  const bandFilter = req.nextUrl.searchParams.get("band") as Band | null;

  if (bandFilter && !(bandFilter in BAND_SEVERITY)) {
    return error("E_VALIDATION", `Unknown band '${bandFilter}'`, 422, {
      hint: "Filter must be one of: blocked, friction, watch, steady",
    });
  }

  const items = employees.map((employee) => {
    const assessment = assess(employee);
    const employeeEvents = events
      .filter((e) => e.employeeId === employee.id)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const firstEventAt = employeeEvents[0]?.occurredAt ?? employee.startDate;
    const leadTimeHours =
      (Date.now() - new Date(firstEventAt).getTime()) / 3600000;

    const topSignals = [...assessment.signals]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((s) => ({
        code: s.code,
        weight: s.weight,
        description: s.description,
      }));

    // Last 10 events for the hover-expand preview sparkline (oldest → newest).
    const recentEvents = employeeEvents.slice(-10).map((e) => ({
      occurredAt: e.occurredAt,
      type: e.type,
    }));

    const hrbp = getOwner(employee.hrbpId);
    const suggestedOwner = hrbp
      ? { id: hrbp.id, name: hrbp.name, role: hrbp.role, email: hrbp.email }
      : null;

    return {
      employeeId: employee.id,
      employeeName: employee.displayName,
      journeyType: employee.journeyType,
      stage: assessment.stage,
      band: assessment.band,
      score: assessment.score,
      topSignals,
      recentEvents,
      leadTimeHours: Math.round(leadTimeHours),
      suggestedOwner,
    };
  });

  const filtered = bandFilter
    ? items.filter((i) => i.band === bandFilter)
    : items;

  filtered.sort((a, b) => {
    const sevDiff = BAND_SEVERITY[b.band] - BAND_SEVERITY[a.band];
    if (sevDiff !== 0) return sevDiff;
    return b.leadTimeHours - a.leadTimeHours;
  });

  return success(
    { items: filtered },
    {
      servedFrom: "live",
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
