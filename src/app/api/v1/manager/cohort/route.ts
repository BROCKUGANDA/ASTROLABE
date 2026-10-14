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
  engineNow,
} from "@/lib/engine/engine";
import { guard } from "@/lib/privacy/guard";
import { appendAudit } from "@/lib/privacy/audit";
import { PERFORMANCE_USE, assertNotUsedForPerformance } from "@/lib/privacy/access";

export const dynamic = "force-dynamic";

/**
 * The manager response type, declared so that the privacy boundary is a property
 * of the schema rather than of a component that happens not to render a field
 * (PRD §16, §29 202/240). There is no place in this type for a sentiment score,
 * a pulse score, a comment, a transcript or a per-person friction band, and the
 * handler asserts the serialised payload carries none of them.
 */
interface ManagerOwnedStep {
  stepKey: string;
  label: string;
  status: string;
  dueAt?: string;
  breachLevel: "none" | "due_soon" | "breached" | "hard";
}

interface ManagerCohortRow {
  employeeId: string;
  employeeName: string;
  journeyType: string;
  stage: string;
  dayInStage: number;
  /** Percentage of mapped steps complete — a cohort fact, not a judgement on a person. */
  aggregateCompletion: number;
  ownedSteps: ManagerOwnedStep[];
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  // A manager asks about their own cohort; the cohort comes from the session,
  // not from a query parameter they typed.
  const auth = await guard(req, "manager.cohort");
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const requestedManager = req.nextUrl.searchParams.get("managerId");
  const managerId = requestedManager ?? session.sub;
  if (session.role !== "admin" && session.role !== "judge" && managerId !== session.sub) {
    return error("E_FORBIDDEN", "A manager session may only read its own cohort.", 403, {
      hint: "The cohort is fixed by the session, not by a parameter.",
    });
  }

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

  // Row-level scope: a manager session only ever sees its own reporting line.
  const visibleCohort = session.role === "admin" || session.role === "judge"
    ? cohort
    : cohort.filter((e) => session.scope.includes(e.id));

  appendAudit({
    actor: session.sub,
    actorRole: session.role,
    action: "manager.cohort.read",
    subject: managerId,
    lawfulBasis: "legitimate_interests",
    purpose: "manager_owned_steps",
  });

  // One authoritative clock, shared with the employee surfaces.
  const asOf = engineNow();

  const items: ManagerCohortRow[] = visibleCohort.map((employee) => {
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

  const payload = {
    managerId,
    items,
    /**
     * Stated on the screen and in the payload: this is not a monitoring tool.
     * `performance_use` is a constant the serialisation layer checks, not a hint.
     */
    boundary: {
      purpose: "steps the manager owns, plus cohort completion",
      notProvided: ["sentiment", "pulse scores", "comments", "transcripts", "per-person friction bands"],
      performanceUse: PERFORMANCE_USE,
      onScreenNotice: "This view shows the steps you own. It is not a way to watch people.",
    },
  };
  // The check runs over the person rows: the boundary block above is the
  // declaration of the rule, not a violation of it.
  assertNotUsedForPerformance({ managerId, items });

  return success(
    payload,
    {
      servedFrom: "live",
      asOf: asOf.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
