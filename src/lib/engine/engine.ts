/**
 * ASTROLABE Deterministic Journey Engine — public surface.
 *
 * The implementation is split so each rule set can be tested on its own:
 *   calendar.ts  working calendars, SLA arithmetic, pause windows
 *   graph.ts     the journey map DAG, cycle detection, blockers, map lint
 *   state.ts     derived step status, stage inference, unmapped activity
 *   signals.ts   the 42 friction signals
 *   assess.ts    fusion into bands, next-best-step ranking
 *
 * This module keeps the historical import path (`@/lib/engine/engine`) plus the
 * original function signatures, so existing call sites read the same verdict
 * they always did while the engine underneath becomes state-driven.
 *
 * Non-negotiables (PRD §10, §11, §19):
 *  - pure: no I/O, no Math.random, no wall clock unless the caller asks for it
 *  - as-of filtering: only events at or before T are visible
 *  - conservative tie-breaks: earlier stage, lower band
 *  - unmapped events surface as activity, never dropped
 *  - consent suppression zeroes the family inside the engine and is disclosed
 *  - a hard trip cannot be outvoted by a low total
 */

import type { Employee, JourneyEvent } from "../data/pack";
import { events as ALL_EVENTS } from "../data/pack";
import { resolveAsOf } from "./clock";
import { computeStepStates } from "./state";
import { buildGraph } from "./graph";
import {
  assess as assessNew,
  inferStage as inferStageFull,
  nextBestSteps as nextBestStepsFull,
  packData,
  type Assessment,
  type EngineData,
  type NextBestStep,
  type NextBestStepResult,
} from "./assess";
import type { FiredSignal } from "./signals";
import { SIGNAL_CATALOGUE, FAMILY_CAPS, BAND_THRESHOLDS, SIGNAL_PACK_VERSION } from "./signal-catalogue";
import { CALENDARS, type WorkingCalendar } from "./calendar";

export type StepStatus = import("./state").StepStatus;
export type BreachLevel = import("./state").BreachLevel;
export type Band = Assessment["band"];
export type SignalFamily = keyof typeof FAMILY_CAPS;
export type StepState = import("./state").StepState;
export type FrictionSignal = FiredSignal;
export type { Assessment, EngineData, NextBestStep, NextBestStepResult, FiredSignal, WorkingCalendar };
export { FAMILY_CAPS, BAND_THRESHOLDS, SIGNAL_CATALOGUE, SIGNAL_PACK_VERSION, CALENDARS };
export { ENGINE_VERSION, MAP_VERSION, CORPUS_VERSION } from "../data/pack";
export { resolveAsOf, engineNow, frozenNow } from "./clock";
export {
  computeStepStates,
  breachLevel,
  visibleEvents,
  futureEvents,
  unmappedActivity,
  learnedBy,
} from "./state";
export type { UnmappedActivity, StageInference } from "./state";
export { computeSignals, DAY_N_EXPECTATIONS, BLOCKED_IGNORED_LEXICON, HELP_NOW_LEXICON } from "./signals";
export type { SignalInput } from "./signals";
export { buildGraph, assertAcyclic, lintMap, rootBlockers, snapshotMap, diffMaps } from "./graph";
export type { JourneyGraph, MapLint } from "./graph";
export { assess, packData, employeeById, fuse } from "./assess";
export type { FamilyArithmetic } from "./assess";
export { addWorkingHours, elapsedSplit, calendarFor, isWorkingDay, humanDuration, CALENDARS as LOCATION_CALENDARS } from "./calendar";

/* ============================================================
   COMPATIBILITY SHIMS — call sites written before the split
   ============================================================ */

/**
 * Next actionable steps: one primary plus at most three secondaries.
 * `nextBestStep` below keeps the old single-object contract.
 */
export function nextBestSteps(
  employee: Employee,
  asOf?: Date | string,
  data: EngineData = packData()
): NextBestStepResult {
  return nextBestStepsFull(employee, asOf, data);
}

/** Legacy signature: exactly one primary action, or null when nothing is actionable. */
export function nextBestStep(employee: Employee, asOf?: Date | string): NextBestStep | null {
  return nextBestStepsFull(employee, asOf).primary;
}

/**
 * Legacy signature: stage inference from an event list. The full version in
 * state.ts takes the precomputed state map; this shim recomputes what it needs
 * so a call site that only has events still gets the same answer.
 */
export function inferStage(
  employee: Employee,
  employeeEvents: JourneyEvent[],
  asOf: Date
): { stage: string; dayInStage: number } {
  const data = { ...packData(), events: employeeEvents };
  const graph = buildGraph(data.steps);
  const states = computeStepStates(employee, data.steps, employeeEvents, asOf, graph);
  const result = inferStageFull(employee, data.stages, data.steps, employeeEvents, asOf, states);
  return { stage: result.stage, dayInStage: result.dayInStage };
}

/** Single-step convenience for call sites that have not moved to computeStepStates. */
export function computeStepState(
  employee: Employee,
  step: { key: string },
  employeeEvents: JourneyEvent[],
  asOf: Date
): StepState {
  const data = { ...packData(), events: employeeEvents };
  const states = computeStepStates(employee, data.steps, employeeEvents, asOf, buildGraph(data.steps));
  const state = states.get(step.key);
  if (!state) throw new Error(`Step ${step.key} is not in the journey map`);
  return state;
}

export function eventsForEmployee(employeeId: string): JourneyEvent[] {
  return ALL_EVENTS.filter((e) => e.employeeId === employeeId);
}

/* ============================================================
   ENGINE TRACE — judge mode visibility (PRD §18 judge screen)
   ============================================================ */

export interface EngineTrace {
  employeeId: string;
  asOf: string;
  stageInference: { stage: string; reason: string };
  signalsFired: { code: string; weight: number; family: string; evidence: string[]; hardTrip: boolean }[];
  signalsSuppressed: { family: string; reason: string }[];
  familyArithmetic: { family: string; raw: number; capped: number; cap: number; suppressed: boolean }[];
  band: { score: number; band: Band; hardTrips: string[]; forcedBlocked: boolean; reason: string };
  nextBestStep: { stepKey: string; reason: string } | null;
  nextBestStepRanking: string[];
  unmappedActivity: { stepKey: string; eventIds: string[] }[];
  versions: { map: string; corpus: string; engine: string; signals: string };
  servedFrom: "live" | "cache" | "deterministic";
  degraded: string[];
}

export function trace(employee: Employee, asOf?: Date | string): EngineTrace {
  const clock = resolveAsOf(asOf);
  const assessment = assessNew(employee, clock);
  const ranked = nextBestStepsFull(employee, clock);

  return {
    employeeId: employee.id,
    asOf: clock.toISOString(),
    stageInference: { stage: assessment.stage, reason: assessment.stageReason },
    signalsFired: assessment.signals.map((s) => ({
      code: s.code,
      weight: s.weight,
      family: s.family,
      evidence: s.evidenceRefs,
      hardTrip: s.hardTrip,
    })),
    signalsSuppressed: assessment.suppressedFamilies.map((family) => ({
      family,
      reason:
        family === "PS"
          ? "Pulse consent not granted — the family contributes 0 and the employee is told so."
          : "Consent absent for this family.",
    })),
    familyArithmetic: assessment.familyArithmetic,
    band: {
      score: assessment.score,
      band: assessment.band,
      hardTrips: assessment.hardTrips,
      forcedBlocked: assessment.forcedBlocked,
      reason: assessment.bandReason,
    },
    nextBestStep: ranked.primary ? { stepKey: ranked.primary.stepKey, reason: ranked.primary.reason } : null,
    nextBestStepRanking: ranked.explanation,
    unmappedActivity: assessment.unmappedActivity.map((u) => ({ stepKey: u.stepKey, eventIds: u.eventIds })),
    versions: {
      map: assessment.mapVersion,
      corpus: assessment.corpusVersion,
      engine: assessment.engineVersion,
      signals: assessment.signalPackVersion,
    },
    servedFrom: "deterministic",
    degraded: [],
  };
}
