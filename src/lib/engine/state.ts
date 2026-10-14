/**
 * Derived journey state (PRD §10). Step status, stage and clocks are computed
 * from the append-only event log plus the versioned map — never stored, never
 * hand-edited — so deleting every derived value and replaying the log rebuilds
 * the same state (PRD §29 01, §22-378).
 */

import type { Employee, JourneyEvent, JourneyStage, JourneyStep } from "../data/pack";
import { addWorkingHours, calendarFor, elapsedSplit, type PauseWindow } from "./calendar";
import { buildGraph, rootBlockers, type JourneyGraph } from "./graph";
import { daysBetween } from "./clock";

export type StepStatus =
  | "not_started"
  | "in_progress"
  | "waiting_employee"
  | "waiting_owner"
  | "blocked"
  | "done"
  | "skipped";

export type BreachLevel = "none" | "due_soon" | "breached" | "hard";

export interface StepState {
  stepKey: string;
  status: StepStatus;
  startedAt?: string;
  dueAt?: string;
  completedAt?: string;
  /** Direct open dependencies. */
  blockedBy: string[];
  /** The steps that actually hold this up, resolved through the graph. */
  rootBlockers: { key: string; label: string; chainLength: number }[];
  blockerChainLength: number;
  breachLevel: BreachLevel;
  targetHours: number;
  /** Wall-clock hours since the step started, excluding pauses. */
  elapsedHours: number;
  /** Hours charged against the working calendar — the breach denominator. */
  workingElapsedHours: number;
  pausedHours: number;
  remainingHours: number;
  untimed: boolean;
  ownerGroup: string;
  actor: "employee" | "owner" | "system";
  policyRefs: string[];
  dependsOn: string[];
  stage: string;
  label: string;
  labelAr: string;
  requestType?: string;
  journeyType: string;
  /** Open (not done, not skipped) transitive descendants. */
  downstreamAtRisk: number;
  /** Direct dependents that are open — what this step actually holds up right now. */
  directlyBlocking: string[];
  /** Event ids that produced this status, newest last. */
  evidenceEventIds: string[];
  /** Out-of-order completion or reopened-without-reason. */
  contradictions: string[];
}

export interface UnmappedActivity {
  stepKey: string;
  eventIds: string[];
  latestOccurredAt: string;
}

export interface StageInference {
  stage: string;
  dayInStage: number;
  reason: string;
}

/** Events for one employee that are visible at or before `asOf`. */
export function visibleEvents(
  events: JourneyEvent[],
  employeeId: string,
  asOf: Date,
): JourneyEvent[] {
  return events
    .filter((e) => e.employeeId === employeeId && new Date(e.occurredAt) <= asOf)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}

/** Events recorded late are still honoured at their occurred time (PRD §2-027). */
export function learnedBy(events: JourneyEvent[], asOf: Date): JourneyEvent[] {
  return events.filter((e) => new Date(e.recordedAt) <= asOf);
}

export function futureEvents(
  events: JourneyEvent[],
  employeeId: string,
  asOf: Date,
): JourneyEvent[] {
  return events.filter((e) => e.employeeId === employeeId && new Date(e.occurredAt) > asOf);
}

/**
 * Intervals in which the step sat waiting on the employee: from each
 * `waiting_employee` event until the next event for that step, or until `asOf`
 * when nothing has resumed it.
 */
function waitingEmployeeWindows(stepEvents: JourneyEvent[], asOf: Date): PauseWindow[] {
  const out: PauseWindow[] = [];
  for (let i = 0; i < stepEvents.length; i++) {
    const ev = stepEvents[i];
    if (ev.type !== "waiting_employee") continue;
    const next = stepEvents.slice(i + 1).find((e) => e.type !== "waiting_employee");
    out.push({
      from: ev.occurredAt,
      to: next ? next.occurredAt : null,
      reason: `waiting_employee:${ev.id}`,
    });
  }
  return out.filter((w) => new Date(w.from) <= asOf);
}

function applyEventSequence(stepEvents: JourneyEvent[]): {
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  contradictions: string[];
} {
  let status: StepStatus = "not_started";
  let startedAt: string | undefined;
  let completedAt: string | undefined;
  const contradictions: string[] = [];

  for (const ev of stepEvents) {
    switch (ev.type) {
      case "started":
        if (status === "done") {
          // Reopened after completion — latest transition wins, but the
          // contradiction is recorded rather than silently overwritten (§23-5).
          contradictions.push(`reopened_after_done:${ev.id}`);
          completedAt = undefined;
        }
        status = "in_progress";
        if (!startedAt) startedAt = ev.occurredAt;
        break;
      case "completed":
        status = "done";
        completedAt = ev.occurredAt;
        if (!startedAt) startedAt = ev.occurredAt;
        break;
      case "waiting_employee":
        if (status !== "done") status = "waiting_employee";
        if (!startedAt) startedAt = ev.occurredAt;
        break;
      case "waiting_owner":
        if (status !== "done") status = "waiting_owner";
        if (!startedAt) startedAt = ev.occurredAt;
        break;
      case "blocked":
        if (status !== "done") status = "blocked";
        if (!startedAt) startedAt = ev.occurredAt;
        break;
      case "unblocked":
        if (status === "blocked") status = "in_progress";
        break;
      case "skipped":
        status = "skipped";
        break;
      case "note":
        // Notes carry no state; they are evidence, not transitions.
        break;
    }
  }
  return { status, startedAt, completedAt, contradictions };
}

/**
 * Compute every step state for one employee's journey in a single pass.
 * Dependency status is resolved from a memo, so a wide or deep map costs O(n).
 */
export function computeStepStates(
  employee: Employee,
  steps: JourneyStep[],
  events: JourneyEvent[],
  asOf: Date,
  graph?: JourneyGraph,
): Map<string, StepState> {
  const g = graph ?? buildGraph(steps);
  const journeySteps = steps.filter((s) => s.journeyType === employee.journeyType);
  const byEmployee = visibleEvents(events, employee.id, asOf);
  const byStep = new Map<string, JourneyEvent[]>();
  for (const ev of byEmployee) {
    const list = byStep.get(ev.stepKey) ?? [];
    list.push(ev);
    byStep.set(ev.stepKey, list);
  }

  const raw = new Map<
    string,
    { status: StepStatus; startedAt?: string; completedAt?: string; contradictions: string[] }
  >();
  for (const s of journeySteps) raw.set(s.key, applyEventSequence(byStep.get(s.key) ?? []));

  const isOpen = (key: string) => {
    const r = raw.get(key);
    if (!r) return false;
    return r.status !== "done" && r.status !== "skipped";
  };

  const cal = calendarFor(employee.location);
  const leaves: PauseWindow[] = (employee.leaveWindows ?? []).map((l) => ({
    from: l.from,
    to: l.to,
    reason: l.reason,
  }));

  const out = new Map<string, StepState>();
  for (const s of journeySteps) {
    const stepEvents = byStep.get(s.key) ?? [];
    const r = raw.get(s.key) as ReturnType<typeof applyEventSequence>;

    // A step is blocked when an open dependency holds it, whatever sequence it
    // has locally — except a step already done or skipped.
    const openDeps = s.dependsOn.filter(isOpen);
    let status = r.status;
    if (openDeps.length > 0 && status !== "done" && status !== "skipped") {
      if (status === "not_started" || status === "in_progress") status = "blocked";
    }

    const waits = waitingEmployeeWindows(stepEvents, asOf);
    const pauses = [...leaves, ...waits];
    const untimed = !s.targetHours || s.targetHours <= 0;
    const dueAt =
      r.startedAt && !untimed
        ? addWorkingHours(r.startedAt, s.targetHours, cal, pauses, asOf)
        : undefined;

    let wallElapsedMs = 0;
    let chargeableMs = 0;
    let pausedMs = 0;
    if (r.startedAt && status !== "done" && status !== "skipped") {
      const split = elapsedSplit(
        new Date(r.startedAt).getTime(),
        asOf.getTime(),
        cal,
        pauses,
        asOf,
      );
      wallElapsedMs = split.wallMs;
      chargeableMs = split.chargeableMs;
      pausedMs = split.pausedMs;
    }
    const workingElapsedHours = chargeableMs / 3600000;
    const remainingHours = dueAt
      ? Math.max(0, (new Date(dueAt).getTime() - asOf.getTime()) / 3600000)
      : 0;

    // Out-of-order completion: finished while a dependency was still open.
    const contradictions = [...r.contradictions];
    if (status === "done" && r.completedAt) {
      const depsOpenAtCompletion = s.dependsOn.filter((d) => {
        const dep = raw.get(d);
        if (!dep) return false;
        const depDoneAt = dep.completedAt ? new Date(dep.completedAt).getTime() : Infinity;
        return depDoneAt > new Date(r.completedAt as string).getTime();
      });
      if (depsOpenAtCompletion.length > 0) {
        contradictions.push(`completed_before_prerequisite:${depsOpenAtCompletion.join(",")}`);
      }
    }

    const blockers = rootBlockers(s.key, g, isOpen);
    const downstreamOpen = (g.downstream.get(s.key) ?? []).filter(isOpen);
    const directlyBlocking = journeySteps
      .filter((d) => d.dependsOn.includes(s.key) && isOpen(d.key))
      .map((d) => d.key);

    out.set(s.key, {
      stepKey: s.key,
      status,
      startedAt: r.startedAt,
      dueAt,
      completedAt: r.completedAt,
      blockedBy: openDeps,
      rootBlockers: blockers.map((b) => ({
        key: b.key,
        label: g.steps.get(b.key)?.label ?? b.key,
        chainLength: b.chainLength,
      })),
      blockerChainLength: blockers.reduce((m, b) => Math.max(m, b.chainLength), 0),
      breachLevel:
        untimed || status === "done" || status === "skipped"
          ? "none"
          : breachLevel(workingElapsedHours, s.targetHours),
      targetHours: s.targetHours,
      elapsedHours: Math.max(0, (wallElapsedMs - pausedMs) / 3600000),
      workingElapsedHours,
      pausedHours: pausedMs / 3600000,
      remainingHours,
      untimed,
      ownerGroup: s.ownerGroup,
      actor: s.actor,
      policyRefs: s.policyRefs,
      dependsOn: s.dependsOn,
      stage: s.stage,
      label: s.label,
      labelAr: s.labelAr,
      requestType: s.requestType,
      journeyType: s.journeyType,
      downstreamAtRisk: downstreamOpen.length,
      directlyBlocking,
      evidenceEventIds: stepEvents.map((e) => e.id),
      contradictions,
    });
  }
  return out;
}

/**
 * PRD §10 breach ladder: due_soon under 20% remaining, breached past target,
 * hard past 200%. Measured on working hours so a weekend never creates a
 * breach on its own.
 */
export function breachLevel(elapsedHours: number, targetHours: number): BreachLevel {
  if (!targetHours || targetHours <= 0) return "none";
  const ratio = elapsedHours / targetHours;
  if (ratio >= 2.0) return "hard";
  if (ratio >= 1.0) return "breached";
  if (ratio >= 0.8) return "due_soon";
  return "none";
}

/**
 * Stage = the earliest stage that has activity and is not fully complete, so a
 * gap never lets the companion advance optimistically (PRD §10, §2-028).
 */
export function inferStage(
  employee: Employee,
  stages: JourneyStage[],
  steps: JourneyStep[],
  events: JourneyEvent[],
  asOf: Date,
  states: Map<string, StepState>,
): StageInference {
  const journeyStages = stages
    .filter((s) => s.journeyType === employee.journeyType)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));

  const journeySteps = steps.filter((s) => s.journeyType === employee.journeyType);
  if (journeyStages.length === 0) {
    return { stage: "unknown", dayInStage: 0, reason: "No stages defined for this journey type." };
  }

  const byEmployee = visibleEvents(events, employee.id, asOf);
  if (byEmployee.length === 0) {
    return {
      stage: journeyStages[0].key,
      dayInStage: 0,
      reason: "No events recorded — the journey has not started in the system.",
    };
  }

  let chosen = journeyStages[journeyStages.length - 1];
  let reason = "Every stage is complete; the journey is at its end.";
  for (const st of journeyStages) {
    const stSteps = journeySteps.filter((s) => s.stage === st.key);
    if (stSteps.length === 0) continue;
    const stStates = stSteps.map((s) => states.get(s.key)).filter(Boolean) as StepState[];
    const anyTouched = stStates.some((s) => s.status !== "not_started");
    const allSettled = stStates.every((s) => s.status === "done" || s.status === "skipped");
    if (anyTouched && !allSettled) {
      chosen = st;
      reason = "Earliest stage with activity that is not fully complete (conservative tie-break).";
      break;
    }
  }

  const stageStepKeys = new Set(
    journeySteps.filter((s) => s.stage === chosen.key).map((s) => s.key),
  );
  const firstInStage = byEmployee.find((e) => stageStepKeys.has(e.stepKey));
  const anchor = firstInStage?.occurredAt ?? byEmployee[0].occurredAt;
  return {
    stage: chosen.key,
    dayInStage: Math.max(1, Math.floor(daysBetween(anchor, asOf)) + 1),
    reason,
  };
}

/** Events whose step key is not in the map: surfaced, never dropped (§10, §23-7). */
export function unmappedActivity(
  steps: JourneyStep[],
  events: JourneyEvent[],
  employeeId: string,
  asOf: Date,
): UnmappedActivity[] {
  const known = new Set(steps.map((s) => s.key));
  const grouped = new Map<string, UnmappedActivity>();
  for (const ev of visibleEvents(events, employeeId, asOf)) {
    if (known.has(ev.stepKey)) continue;
    const cur = grouped.get(ev.stepKey) ?? {
      stepKey: ev.stepKey,
      eventIds: [],
      latestOccurredAt: ev.occurredAt,
    };
    cur.eventIds.push(ev.id);
    if (ev.occurredAt > cur.latestOccurredAt) cur.latestOccurredAt = ev.occurredAt;
    grouped.set(ev.stepKey, cur);
  }
  return [...grouped.values()].sort((a, b) => a.stepKey.localeCompare(b.stepKey));
}
