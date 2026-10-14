/**
 * ASTROLABE API — /api/v1/journey/me (GET)
 * The employee's own journey state at `asOf`.
 *
 * PRD §29 item 25 / PRD §17-340 — Deterministic core works with model
 * switched off. This handler makes ZERO model calls. Every field on the
 * response (stage, day-in-stage, band, score, signals, suppressed families,
 * next-best-step, every step's status/SLA/breach-level) is produced by the
 * pure functions in `src/lib/engine/engine.ts` (`assess`, `nextBestStep`,
 * `computeStepState`) and the synthetic pack in `src/lib/data/pack.ts`.
 * No `fetch`, no `Math.random`, no `Date.now` inside the engine — the only
 * time source is the `asOf` parameter (defaulting to `new Date()` for the
 * live demo, but overridable for replay). You could set `ASTROLABE_MODEL=off`
 * and the entire `/journey/me` response would be byte-identical.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { employees, getOwner } from "@/lib/data/pack";
import { assess, computeStepState, nextBestStep, eventsForEmployee } from "@/lib/engine/engine";
import { steps as ALL_STEPS } from "@/lib/data/pack";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const employeeId = req.nextUrl.searchParams.get("employeeId") ?? "E-1042";
  const asOfParam = req.nextUrl.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();

  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404, {
      hint: "Try one of E-1042, E-1043, E-1044, E-1045, E-1046",
    });
  }

  const start = Date.now();
  const assessment = assess(employee, asOf);
  const nbs = nextBestStep(employee, asOf);
  const employeeEvents = eventsForEmployee(employee.id);
  const journeySteps = ALL_STEPS.filter((s) => s.journeyType === employee.journeyType);
  const stepStates = journeySteps.map((s) => computeStepState(employee, s, employeeEvents, asOf));

  const manager = getOwner(employee.managerId);
  const hrbp = getOwner(employee.hrbpId);

  const data = {
    employee: {
      id: employee.id,
      ref: employee.ref,
      displayName: employee.displayName,
      displayNameAr: employee.displayNameAr,
      role: employee.role,
      roleAr: employee.roleAr,
      team: employee.team,
      location: employee.location,
      locale: employee.locale,
      journeyType: employee.journeyType,
      startDate: employee.startDate,
      effectiveDate: employee.effectiveDate,
      manager: manager ? { id: manager.id, name: manager.name, role: manager.role } : null,
      hrbp: hrbp ? { id: hrbp.id, name: hrbp.name, role: hrbp.role } : null,
    },
    stage: assessment.stage,
    dayInStage: assessment.dayInStage,
    band: assessment.band,
    score: assessment.score,
    signals: assessment.signals,
    suppressedFamilies: assessment.suppressedFamilies,
    nextBestStep: nbs,
    steps: stepStates.map((s) => ({
      stepKey: s.stepKey,
      label: s.label,
      labelAr: s.labelAr,
      stage: s.stage,
      status: s.status,
      ownerGroup: s.ownerGroup,
      actor: s.actor,
      startedAt: s.startedAt,
      dueAt: s.dueAt,
      completedAt: s.completedAt,
      blockedBy: s.blockedBy,
      breachLevel: s.breachLevel,
      targetHours: s.targetHours,
      elapsedHours: s.elapsedHours,
      remainingHours: s.remainingHours,
      downstreamAtRisk: s.downstreamAtRisk,
      policyRefs: s.policyRefs,
      requestType: s.requestType,
      journeyType: s.journeyType,
    })),
    engineVersion: assessment.engineVersion,
    mapVersion: assessment.mapVersion,
    corpusVersion: assessment.corpusVersion,
  };

  return success(data, {
    servedFrom: "live",
    asOf: asOf.toISOString(),
    latencyMs: Date.now() - start,
  });
}
