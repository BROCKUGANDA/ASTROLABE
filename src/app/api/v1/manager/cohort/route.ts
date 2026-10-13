/**
 * ASTROLABE API — /api/v1/manager/cohort (GET)
 * A manager-facing cohort view: ONLY the manager's own obligations.
 * No sentiment, no pulse, no friction scores per person (by design).
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { employees, steps as ALL_STEPS, events as ALL_EVENTS } from "@/lib/data/pack";
import {
  computeStepState,
  inferStage,
} from "@/lib/engine/engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const start = Date.now();
  const managerId = req.nextUrl.searchParams.get("managerId");

  if (!managerId) {
    return error("E_VALIDATION", "`managerId` query parameter is required", 422, {
      hint: "?managerId=MGR-1",
    });
  }

  const cohort = employees.filter((e) => e.managerId === managerId);
  if (cohort.length === 0) {
    return error(
      "E_NOT_FOUND",
      `No employees found for manager ${managerId}`,
      404,
      { hint: "Try MGR-1 or MGR-2." }
    );
  }

  const asOf = new Date();

  const items = cohort.map((employee) => {
    const employeeEvents = ALL_EVENTS.filter((e) => e.employeeId === employee.id);
    const journeySteps = ALL_STEPS.filter((s) => s.journeyType === employee.journeyType);
    const stepStates = journeySteps.map((s) =>
      computeStepState(employee, s, employeeEvents, asOf)
    );

    const { stage, dayInStage } = inferStage(employee, employeeEvents, asOf);

    const doneCount = stepStates.filter(
      (s) => s.status === "done" || s.status === "skipped"
    ).length;
    const aggregateCompletion =
      stepStates.length > 0 ? Math.round((doneCount / stepStates.length) * 100) : 0;

    // Only the manager's own HR-owner obligations.
    // PRD §11-205: surface breachLevel so the manager surface can
    // detect late steps even when the API consumer doesn't have the
    // engine on hand. Stays within the schema boundary — still no
    // sentiment, pulse, or friction scores per person.
    const ownedSteps = stepStates
      .filter((s) => s.ownerGroup === "HR" && s.actor === "owner")
      .map((s) => ({
        stepKey: s.stepKey,
        label: s.label,
        status: s.status,
        dueAt: s.dueAt,
        breachLevel: s.breachLevel,
      }));

    return {
      employeeId: employee.id,
      employeeName: employee.displayName,
      journeyType: employee.journeyType,
      stage,
      dayInStage,
      aggregateCompletion,
      ownedSteps,
    };
  });

  return success(
    { managerId, items },
    {
      servedFrom: "live",
      asOf: asOf.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
