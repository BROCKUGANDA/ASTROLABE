/**
 * ASTROLABE assessment composition: state → signals → fusion → next best step.
 *
 * Every entry point takes an `EngineData` so a test or a judge scenario can hand
 * the engine a contradictory, sparse or brand-new event log without touching the
 * synthetic pack (PRD §29 024, §23 edge case 58).
 */

import {
  employees as ALL_EMPLOYEES,
  events as ALL_EVENTS,
  steps as ALL_STEPS,
  stages as ALL_STAGES,
  serviceRequests as ALL_REQUESTS,
  pulseResponses as ALL_PULSE,
  policies as ALL_POLICIES,
  consentRecords as ALL_CONSENTS,
  answerLog as ALL_ANSWERS,
  intakeDrafts as ALL_DRAFTS,
  owners as ALL_OWNERS,
  managers as ALL_MANAGERS,
  hrbps as ALL_HRBPS,
  MAP_VERSION,
  CORPUS_VERSION,
  ENGINE_VERSION,
  type AnswerRecord,
  type ConsentRecord,
  type Employee,
  type IntakeDraftRecord,
  type JourneyEvent,
  type JourneyStage,
  type JourneyStep,
  type PolicyChunk,
  type PulseResponse,
  type ServiceRequest,
} from "../data/pack";
import { resolveAsOf } from "./clock";
import { buildGraph, assertAcyclic, type JourneyGraph } from "./graph";
import {
  computeStepStates,
  futureEvents,
  inferStage as inferStageFrom,
  unmappedActivity as unmappedFrom,
  visibleEvents,
  type StepState,
  type UnmappedActivity,
} from "./state";
import { computeSignals, type FiredSignal } from "./signals";
import {
  BAND_THRESHOLDS,
  FAMILY_CAPS,
  SIGNAL_PACK_VERSION,
  type SignalFamily,
} from "./signal-catalogue";

export type Band = "steady" | "watch" | "friction" | "blocked";

export interface EngineData {
  steps: JourneyStep[];
  stages: JourneyStage[];
  events: JourneyEvent[];
  requests: ServiceRequest[];
  pulse: PulseResponse[];
  answers: AnswerRecord[];
  drafts: IntakeDraftRecord[];
  policies: PolicyChunk[];
  consents: ConsentRecord[];
  ownerIds: Set<string>;
}

/** The synthetic pack, read live: routes mutate these arrays in place. */
export function packData(): EngineData {
  return {
    steps: ALL_STEPS,
    stages: ALL_STAGES,
    events: ALL_EVENTS,
    requests: ALL_REQUESTS,
    pulse: ALL_PULSE,
    answers: ALL_ANSWERS,
    drafts: ALL_DRAFTS,
    policies: ALL_POLICIES,
    consents: ALL_CONSENTS,
    ownerIds: new Set([...ALL_OWNERS, ...ALL_MANAGERS, ...ALL_HRBPS].map((o) => o.id)),
  };
}

export interface FamilyArithmetic {
  family: SignalFamily;
  raw: number;
  capped: number;
  cap: number;
  suppressed: boolean;
}

export interface Assessment {
  employeeId: string;
  asOf: string;
  band: Band;
  score: number;
  signals: FiredSignal[];
  suppressedFamilies: SignalFamily[];
  familyArithmetic: FamilyArithmetic[];
  hardTrips: string[];
  forcedBlocked: boolean;
  /** A Blocked verdict from a hard trip survives an empty total (PRD §11). */
  bandReason: string;
  mapVersion: string;
  corpusVersion: string;
  engineVersion: string;
  signalPackVersion: string;
  stage: string;
  dayInStage: number;
  stageReason: string;
  unmappedActivity: UnmappedActivity[];
  /** Data-quality flags are counted but never presented as employee friction. */
  dataQualityOnly: boolean;
  /** False for nudge-only and data-quality verdicts: never enters the HRBP queue. */
  hrbpEligible: boolean;
}

export interface NextBestStep {
  stepKey: string;
  label: string;
  labelAr: string;
  ownerGroup: string;
  dueAt?: string;
  policyRefs: string[];
  actor: "employee" | "owner" | "system";
  reason: string;
  reasonAr: string;
  requestType?: string;
  primary: boolean;
  rank: number;
  downstreamAtRisk: number;
  breachLevel: StepState["breachLevel"];
}

export interface NextBestStepResult {
  primary: NextBestStep | null;
  secondary: NextBestStep[];
  /** Explicit nothing-to-do state rather than an empty list (PRD §4-071). */
  nothingToDo: boolean;
  explanation: string[];
}

const graphCache = new Map<string, JourneyGraph>();

function graphFor(steps: JourneyStep[]): JourneyGraph {
  const key = `${steps.length}:${steps.map((s) => s.key).join(",")}`;
  const cached = graphCache.get(key);
  if (cached) {
    if (cached.cycles.length > 0) assertAcyclic(cached);
    return cached;
  }
  const g = buildGraph(steps);
  assertAcyclic(g);
  graphCache.set(key, g);
  return g;
}

/**
 * Fuse signals into a band. Family caps are applied to family totals before the
 * sum, suppressed families contribute exactly zero, and a hard trip can never be
 * outvoted by a low total (PRD §11, §29 085/095/017).
 */
export function fuse(
  signals: FiredSignal[],
  suppressed: SignalFamily[]
): {
  score: number;
  band: Band;
  hardTrips: string[];
  forcedBlocked: boolean;
  familyArithmetic: FamilyArithmetic[];
  bandReason: string;
} {
  const families: SignalFamily[] = ["TL", "DP", "RQ", "EN", "PS", "MB", "DQ"];
  const familyArithmetic: FamilyArithmetic[] = [];
  let score = 0;

  for (const family of families) {
    const isSuppressed = suppressed.includes(family);
    const raw = isSuppressed
      ? 0
      : signals.filter((s) => s.family === family).reduce((sum, s) => sum + s.weight, 0);
    const capped = Math.min(raw, FAMILY_CAPS[family]);
    familyArithmetic.push({ family, raw, capped, cap: FAMILY_CAPS[family], suppressed: isSuppressed });
    score += capped;
  }

  const hardTrips = signals.filter((s) => s.hardTrip).map((s) => s.code);
  const forcedBlocked = signals.some((s) => s.forceBlocked);

  let band: Band = "steady";
  if (score >= BAND_THRESHOLDS.blocked.min) band = "blocked";
  else if (score >= BAND_THRESHOLDS.friction.min) band = "friction";
  else if (score >= BAND_THRESHOLDS.watch.min) band = "watch";

  let bandReason = `Score ${score} from capped family totals → ${band}.`;

  // Any hard-trip weight lifts the floor to Friction, whatever the arithmetic says.
  const floorBand: Band | null = hardTrips.length > 0 ? "friction" : null;
  const rank: Record<Band, number> = { steady: 0, watch: 1, friction: 2, blocked: 3 };
  if (floorBand && rank[band] < rank[floorBand]) {
    bandReason = `Score ${score} would read ${band}, but a hard trip holds the floor at Friction.`;
    band = floorBand;
  }
  // DP-02, PS-05 and MB-04 force Blocked and nothing can pull it back down.
  if (forcedBlocked && band !== "blocked") {
    bandReason = `Score ${score} would read ${band}; ${hardTrips.filter((c) => signals.find((s) => s.code === c && s.forceBlocked)).join(", ")} forces Blocked.`;
    band = "blocked";
  }

  return { score, band, hardTrips, forcedBlocked, familyArithmetic, bandReason };
}

export function assess(
  employee: Employee,
  asOf?: string | Date,
  data: EngineData = packData()
): Assessment {
  const clock = resolveAsOf(asOf);
  const graph = graphFor(data.steps);
  const states = computeStepStates(employee, data.steps, data.events, clock, graph);
  const employeeVisible = visibleEvents(data.events, employee.id, clock);
  const unmapped = unmappedFrom(data.steps, data.events, employee.id, clock);
  const { fired, suppressed } = computeSignals({
    employee,
    states,
    steps: data.steps,
    visibleEvents: employeeVisible,
    futureEventIds: futureEvents(data.events, employee.id, clock).map((e) => e.id),
    requests: data.requests.filter((r) => r.employeeId === employee.id),
    pulse: data.pulse.filter((p) => p.employeeId === employee.id),
    answers: data.answers.filter((a) => a.employeeId === employee.id),
    drafts: data.drafts.filter((d) => d.employeeId === employee.id),
    consents: data.consents,
    unmapped,
    graph,
    policySlugs: new Set(data.policies.map((p) => p.docSlug)),
    ownerIds: data.ownerIds,
    asOf: clock,
  });

  const fusion = fuse(fired, suppressed);
  const stageInfo = inferStageFrom(employee, data.stages, data.steps, data.events, clock, states);

  const substantive = fired.filter((s) => !s.dataQuality && !s.nudgeOnly);
  const bandWithoutDataQuality = fuse(substantive, suppressed).band;

  return {
    employeeId: employee.id,
    asOf: clock.toISOString(),
    band: fusion.band,
    score: fusion.score,
    signals: fired,
    suppressedFamilies: suppressed,
    familyArithmetic: fusion.familyArithmetic,
    hardTrips: fusion.hardTrips,
    forcedBlocked: fusion.forcedBlocked,
    bandReason: fusion.bandReason,
    mapVersion: MAP_VERSION,
    corpusVersion: data.policies.length > 0 ? CORPUS_VERSION : "unavailable",
    engineVersion: ENGINE_VERSION,
    signalPackVersion: SIGNAL_PACK_VERSION,
    stage: stageInfo.stage,
    dayInStage: stageInfo.dayInStage,
    stageReason: stageInfo.reason,
    unmappedActivity: unmapped,
    dataQualityOnly: substantive.length === 0 && fired.length > 0,
    hrbpEligible: bandWithoutDataQuality === "friction" || bandWithoutDataQuality === "blocked",
  };
}

/**
 * Rank candidates by hard breach, then downstream steps at risk, then nearest
 * due date, then whether the employee can act, then effort. Ties break on the
 * step key so two runs always agree (PRD §4-072).
 */
export function nextBestSteps(
  employee: Employee,
  asOf?: string | Date,
  data: EngineData = packData()
): NextBestStepResult {
  const clock = resolveAsOf(asOf);
  const graph = graphFor(data.steps);
  const states = computeStepStates(employee, data.steps, data.events, clock, graph);
  const stageInfo = inferStageFrom(employee, data.stages, data.steps, data.events, clock, states);

  const journeyStages = data.stages
    .filter((s) => s.journeyType === employee.journeyType)
    .sort((a, b) => a.order - b.order);
  const stageIdx = journeyStages.findIndex((s) => s.key === stageInfo.stage);
  const allowed = new Set(journeyStages.slice(Math.max(0, stageIdx), stageIdx + 2).map((s) => s.key));

  const candidates = [...states.values()].filter((s) => {
    if (s.status === "done" || s.status === "skipped") return false;
    if (!allowed.has(s.stage)) return false;
    // A blocked step is not actionable itself — its root blocker is.
    return s.blockedBy.length === 0;
  });

  const explanation = [
    `Candidates from stages ${[...allowed].join(", ")}: ${candidates.length}`,
    "Rank: hard breach > downstream at risk > nearest due date > employee can act > shortest target > step key",
  ];

  if (candidates.length === 0) {
    return {
      primary: null,
      secondary: [],
      nothingToDo: true,
      explanation: [...explanation, "No actionable step: either everything is done or every open step waits on someone else."],
    };
  }

  const rank = (a: StepState, b: StepState): number => {
    const aHard = a.breachLevel === "hard" ? 1 : 0;
    const bHard = b.breachLevel === "hard" ? 1 : 0;
    if (aHard !== bHard) return bHard - aHard;
    if (a.downstreamAtRisk !== b.downstreamAtRisk) return b.downstreamAtRisk - a.downstreamAtRisk;
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    const aAct = a.actor === "employee" ? 0 : 1;
    const bAct = b.actor === "employee" ? 0 : 1;
    if (aAct !== bAct) return aAct - bAct;
    if (a.targetHours !== b.targetHours) return a.targetHours - b.targetHours;
    return a.stepKey.localeCompare(b.stepKey);
  };

  const ordered = [...candidates].sort(rank);
  const toStep = (s: StepState, primary: boolean, index: number): NextBestStep => {
    const step = graph.steps.get(s.stepKey) as JourneyStep;
    let reason: string;
    let reasonAr: string;
    if (s.breachLevel === "hard") {
      reason = `${step.label} has taken more than double its target — it is the most urgent thing open.`;
      reasonAr = `${step.labelAr} تجاوز ضعف المستهدف — الأكثر إلحاحاً.`;
    } else if (s.actor === "employee") {
      reason = `${step.label} is yours to do${s.downstreamAtRisk > 0 ? `, and it unblocks ${s.downstreamAtRisk} later step(s)` : ""}.`;
      reasonAr = `${step.labelAr} خطوتك${s.downstreamAtRisk > 0 ? ` وتحرر ${s.downstreamAtRisk} خطوة لاحقة` : ""}.`;
    } else {
      const holder = s.rootBlockers[0];
      reason = `${step.label} is with ${step.ownerGroup}${holder ? ` — it is holding up ${holder.label}` : ""}. You are not the delay.`;
      reasonAr = `${step.labelAr} مع ${step.ownerGroup} — لست أنت السبب.`;
    }
    return {
      stepKey: step.key,
      label: step.label,
      labelAr: step.labelAr,
      ownerGroup: step.ownerGroup,
      dueAt: s.dueAt,
      policyRefs: step.policyRefs,
      actor: step.actor,
      reason,
      reasonAr,
      requestType: step.requestType,
      primary,
      rank: index + 1,
      downstreamAtRisk: s.downstreamAtRisk,
      breachLevel: s.breachLevel,
    };
  };

  return {
    primary: toStep(ordered[0], true, 0),
    secondary: ordered.slice(1, 4).map((s, i) => toStep(s, false, i + 1)),
    nothingToDo: false,
    explanation: [
      ...explanation,
      `Primary ${ordered[0].stepKey}: breach=${ordered[0].breachLevel}, downstream=${ordered[0].downstreamAtRisk}, due=${ordered[0].dueAt ?? "untimed"}`,
    ],
  };
}

export function employeeById(id: string): Employee | undefined {
  return ALL_EMPLOYEES.find((e) => e.id === id);
}

export { inferStageFrom as inferStage };
export { computeStepStates } from "./state";
export { ENGINE_VERSION, SIGNAL_PACK_VERSION, MAP_VERSION };
