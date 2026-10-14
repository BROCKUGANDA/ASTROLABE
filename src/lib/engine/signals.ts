/**
 * The 42 friction signals (PRD §11). Every predicate is a pure function of the
 * event log, request telemetry and consented pulse data, returns evidence
 * references rather than prose, and takes its weight from the versioned
 * catalogue — the model cannot add, remove or reweight one (PRD §11-092).
 */

import type {
  AnswerRecord,
  ConsentRecord,
  Employee,
  IntakeDraftRecord,
  JourneyEvent,
  JourneyStep,
  PulseResponse,
  ServiceRequest,
} from "../data/pack";
import { daysBetween, hoursBetween } from "./clock";
import type { StepState, UnmappedActivity } from "./state";
import type { JourneyGraph } from "./graph";
import {
  SIGNAL_CATALOGUE,
  type SignalFamily,
} from "./signal-catalogue";

export interface FiredSignal {
  code: string;
  family: SignalFamily;
  weight: number;
  evidenceRefs: string[];
  asOf: string;
  description: string;
  descriptionAr: string;
  hardTrip: boolean;
  forceBlocked: boolean;
  nudgeOnly: boolean;
  dataQuality: boolean;
  /** False for disclosures about data outside the as-of window: recorded, not scored. */
  counts?: boolean;
}

export interface SignalInput {
  employee: Employee;
  states: Map<string, StepState>;
  steps: JourneyStep[];
  visibleEvents: JourneyEvent[];
  futureEventIds: string[];
  requests: ServiceRequest[];
  pulse: PulseResponse[];
  answers: AnswerRecord[];
  drafts: IntakeDraftRecord[];
  consents: ConsentRecord[];
  unmapped: UnmappedActivity[];
  graph: JourneyGraph;
  /** Slugs present in the policy corpus — DQ-05 tests references against this. */
  policySlugs: Set<string>;
  /** Ids in the owner directory; an assignee outside it is unroutable. */
  ownerIds: Set<string>;
  asOf: Date;
}

/**
 * Day-N expectations the employee is told out loud (PRD §11 TL-03). Kept as
 * data so a second entity can restate its own promises without touching code.
 */
export const DAY_N_EXPECTATIONS: { stepKey: string; maxDaysFromStart: number; promise: string }[] = [
  { stepKey: "ob_offer_signed", maxDaysFromStart: 3, promise: "offer signed within 3 days" },
  { stepKey: "ob_passport_upload", maxDaysFromStart: 5, promise: "passport scan within 5 days" },
  { stepKey: "ob_badge_issued", maxDaysFromStart: 1, promise: "badge on day 1" },
  { stepKey: "ob_kit_issued", maxDaysFromStart: 2, promise: "laptop and phone by day 2" },
];

/** Deterministic lexicon for PS-03 (PRD §15: the model labels, never scores). */
export const BLOCKED_IGNORED_LEXICON = /(ignored|no one (has )?(replied|answered)|nobody replied|no reply|still waiting for (an )?answer|been (stuck|blocked)|nothing happened)/i;
/** PS-05 explicit request for help. */
export const HELP_NOW_LEXICON = /(i need help now|i'm stuck|i am stuck|urgent|someone please|please help)/i;

const DAY = 86400000;

function mk(
  code: string,
  input: SignalInput,
  evidenceRefs: string[],
  description: string,
  descriptionAr: string,
  overrides?: Partial<FiredSignal>
): FiredSignal {
  const spec = SIGNAL_CATALOGUE[code];
  if (!spec) throw new Error(`Unknown signal code ${code} — not in the versioned catalogue`);
  return {
    code,
    family: spec.family,
    // Weights are never authored here; the catalogue owns them.
    weight: spec.weight,
    evidenceRefs,
    asOf: input.asOf.toISOString(),
    description,
    descriptionAr,
    hardTrip: Boolean(spec.hardTrip),
    forceBlocked: Boolean(spec.forceBlocked),
    nudgeOnly: Boolean(spec.nudgeOnly),
    dataQuality: Boolean(spec.dataQuality),
    counts: spec.scoring !== false,
    ...overrides,
  };
}

const openStates = (input: SignalInput): StepState[] =>
  [...input.states.values()].filter((s) => s.status !== "done" && s.status !== "skipped");

function hasConsent(input: SignalInput, purpose: ConsentRecord["purpose"]): boolean {
  // Consent is also read as-of: a grant recorded after the clock in use does not
  // authorise data at that clock, and a revocation before it is honoured.
  const rows = input.consents
    .filter((c) => c.employeeId === input.employee.id && c.purpose === purpose && new Date(c.grantedAt) <= input.asOf)
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt) || b.id.localeCompare(a.id));
  if (rows.length === 0) {
    // Defaults are the PRD §15 table: journey assistance is required for the
    // product to exist, aggregate analytics and manager visibility of owned
    // steps are on, everything that touches pulse data is off.
    return purpose === "journey_assistance" || purpose === "aggregate_analytics" || purpose === "manager_visibility";
  }
  const latest = rows[0];
  return latest.granted && !latest.revokedAt;
}

export function computeSignals(input: SignalInput): { fired: FiredSignal[]; suppressed: SignalFamily[] } {
  const fired: FiredSignal[] = [];
  const suppressed: SignalFamily[] = [];
  const { asOf, employee, states } = input;
  const opens = openStates(input);
  const byKey = (key: string) => states.get(key);

  /* ===================== TL · timing (TL-01…TL-08) ===================== */
  for (const s of opens) {
    // TL-01 past target on the wall clock, before any calendar excuse.
    if (!s.untimed && s.elapsedHours >= s.targetHours && s.startedAt) {
      fired.push(mk("TL-01", input,
        [`step:${s.stepKey}`, ...s.evidenceEventIds.map((id) => `event:${id}`)],
        `${s.label} is past its ${s.targetHours}h target.`,
        `${s.labelAr} تجاوز هدفه البالغ ${s.targetHours} ساعة.`));
      // TL-06 the same breach still holds after weekends, holidays and leave.
      if (s.workingElapsedHours >= s.targetHours) {
        fired.push(mk("TL-06", input,
          [`step:${s.stepKey}`, `workingHours:${s.workingElapsedHours.toFixed(1)}`],
          `${s.label} is still late after working days and holidays are taken into account.`,
          `${s.labelAr} ما يزال متأخراً بعد احتساب أيام العمل والعطلات.`));
      }
    }
    // TL-02 past 200% of target.
    if (s.breachLevel === "hard") {
      fired.push(mk("TL-02", input,
        [`step:${s.stepKey}`, `workingHours:${s.workingElapsedHours.toFixed(1)}`, `target:${s.targetHours}`],
        `${s.label} has taken more than double its target time.`,
        `${s.labelAr} استغرق أكثر من ضعف الوقت المستهدف.`));
    }
    // TL-08 a required step with no target time cannot be late — but the map is wrong.
    if (s.untimed) {
      fired.push(mk("TL-08", input,
        [`step:${s.stepKey}`],
        `${s.label} has no target time in the journey map, so we cannot say when it is due.`,
        `${s.labelAr} ليس له وقت مستهدف في خريطة الرحلة.`));
    }
  }

  // TL-07 out-of-order completion. This has to be read over every step, done
  // included: the contradiction is that something finished before its
  // prerequisite did.
  for (const s of [...states.values()]) {
    const outOfOrder = s.contradictions.filter((c) => c.startsWith("completed_before_prerequisite"));
    if (outOfOrder.length > 0) {
      fired.push(mk("TL-07", input,
        [`step:${s.stepKey}`, ...outOfOrder, ...s.evidenceEventIds.map((id) => `event:${id}`)],
        `${s.label} was completed before the step it depends on. We show both, and we do not rewrite history.`,
        `${s.labelAr} اكتمل قبل الخطوة التي يعتمد عليها.`));
    }
  }

  // TL-03 a day-N promise that has not been kept.
  const daysSinceStart = (asOf.getTime() - new Date(employee.startDate).getTime()) / DAY;
  for (const exp of DAY_N_EXPECTATIONS) {
    const s = byKey(exp.stepKey);
    if (!s || s.status === "done" || s.status === "skipped") continue;
    if (daysSinceStart >= exp.maxDaysFromStart) {
      fired.push(mk("TL-03", input,
        [`step:${exp.stepKey}`, `day:${Math.floor(daysSinceStart)}`, `promise:${exp.promise}`],
        `We said ${exp.promise}. It has been ${Math.floor(daysSinceStart)} days and it is not done.`,
        `قلنا ${exp.promise}. مضت ${Math.floor(daysSinceStart)} أيام ولم يكتمل.`));
    }
  }

  // TL-04 pre-boarding under 60% with the start date inside five days.
  const daysToStart = (new Date(employee.startDate).getTime() - asOf.getTime()) / DAY;
  if (employee.journeyType === "onboarding" && daysToStart >= 0 && daysToStart <= 5) {
    const pre = [...states.values()].filter((s) => s.stage === "pre_boarding");
    if (pre.length > 0) {
      const pct = pre.filter((s) => s.status === "done").length / pre.length;
      if (pct < 0.6) {
        fired.push(mk("TL-04", input,
          pre.map((s) => `step:${s.stepKey}:${s.status}`),
          `The first day is in ${Math.ceil(daysToStart)} day(s) and ${Math.round(pct * 100)}% of the before-you-arrive steps are done.`,
          `اليوم الأول بعد ${Math.ceil(daysToStart)} يوم و${Math.round(pct * 100)}% من الخطوات السابقة مكتمل.`));
      }
    }
  }

  // TL-05 three days of silence on an active stage that is not waiting on the employee.
  const lastEvent = input.visibleEvents[input.visibleEvents.length - 1];
  const stageIsOpen = opens.some((s) => s.status !== "not_started");
  if (lastEvent && stageIsOpen && hoursBetween(lastEvent.occurredAt, asOf) > 72) {
    fired.push(mk("TL-05", input,
      [`event:${lastEvent.id}`, `lastOccurredAt:${lastEvent.occurredAt}`],
      `Nothing has happened on this journey for ${Math.floor(hoursBetween(lastEvent.occurredAt, asOf) / 24)} days.`,
      `لم يحدث شيء على هذه الرحلة منذ ${Math.floor(hoursBetween(lastEvent.occurredAt, asOf) / 24)} يوماً.`));
  }

  /* ================= DP · dependencies (DP-01…DP-06) ================= */
  for (const s of opens) {
    // DP-01 directly holding up two or more steps. Only a step that has actually
    // begun (or is already late) counts: a chain that has not started yet is
    // normal sequencing, not friction.
    const startedOrLate = Boolean(s.startedAt) || s.breachLevel !== "none";
    if (s.directlyBlocking.length >= 2 && startedOrLate) {
      fired.push(mk("DP-01", input,
        [`step:${s.stepKey}`, ...s.directlyBlocking.map((d) => `blocks:${d}`), `downstream:${s.downstreamAtRisk}`],
        `${s.label} is not finished and it holds up ${s.directlyBlocking.length} later steps.`,
        `${s.labelAr} غير مكتمل ويحجب ${s.directlyBlocking.length} خطوات لاحقة.`));
    }
    // DP-03 provisioning was under way and then stopped for a document or an asset.
    if ((s.stepKey.includes("access") || s.ownerGroup === "IT") && s.status === "blocked" && s.startedAt) {
      fired.push(mk("DP-03", input,
        [`step:${s.stepKey}`, `event:${s.evidenceEventIds[0]}`, ...s.blockedBy.map((b) => `blocked_by:${b}`)],
        `${s.label} started and then stopped, waiting on a document or an asset.`,
        `${s.labelAr} بدأ ثم توقف بانتظار مستند أو أصل.`));
    }
  }

  // DP-02 the authorisation step, stalled more than a week. Hard trip.
  for (const s of opens) {
    const isVisa = s.stepKey.includes("visa") || s.ownerGroup === "Immigration";
    if (!isVisa || !s.startedAt) continue;
    const stalledDays = daysBetween(s.startedAt, asOf);
    if (stalledDays > 7) {
      fired.push(mk("DP-02", input,
        [`step:${s.stepKey}`, `event:${s.evidenceEventIds.slice(-1)[0] ?? "none"}`, `stalledDays:${stalledDays.toFixed(1)}`],
        `The visa step ${s.label} has been open for ${stalledDays.toFixed(0)} days. Nothing else can finish until it does.`,
        `خطوة التأشيرة ${s.labelAr} مفتوحة منذ ${stalledDays.toFixed(0)} يوماً.`));
    }
  }

  // DP-04 training is booked while the access it needs is still missing. "Booked"
  // means the step actually started — a step that has merely not begun is normal
  // sequencing, not a lost seat.
  for (const s of opens) {
    if (!s.stepKey.includes("training") || !s.startedAt) continue;
    const missingPrereq = s.dependsOn.find((d) => {
      const dep = byKey(d);
      return dep && dep.status !== "done" && dep.status !== "skipped";
    });
    if (missingPrereq) {
      fired.push(mk("DP-04", input,
        [`step:${s.stepKey}`, `prereq:${missingPrereq}`],
        `${s.label} is in motion but ${byKey(missingPrereq)?.label ?? missingPrereq} is not ready.`,
        `${s.labelAr} جارٍ لكن ${byKey(missingPrereq)?.labelAr ?? missingPrereq} غير جاهز.`));
    }
  }

  // DP-05 a signed transfer with no handover after five days.
  const handover = byKey("mb_release_handover");
  if (handover && handover.status !== "done" && handover.startedAt && daysBetween(handover.startedAt, asOf) > 5) {
    fired.push(mk("DP-05", input,
      [`step:mb_release_handover`, `stalledDays:${daysBetween(handover.startedAt, asOf).toFixed(1)}`],
      `The transfer is approved and the releasing manager has not started the handover for ${daysBetween(handover.startedAt, asOf).toFixed(0)} days.`,
      `النقل معتمد ولم يبدأ تسليم المدير السابق منذ ${daysBetween(handover.startedAt, asOf).toFixed(0)} يوماً.`));
  }

  // DP-06 allowance still pending with a housing deadline inside two weeks.
  const allowance = byKey("ob_relocation_allowance");
  if (allowance && allowance.status !== "done" && allowance.status !== "skipped") {
    const housing = byKey("ob_housing_arranged");
    const deadlineIso = housing?.dueAt ?? employee.arrivalDate ?? employee.startDate;
    const daysToDeadline = (new Date(deadlineIso).getTime() - asOf.getTime()) / DAY;
    if (daysToDeadline < 14) {
      fired.push(mk("DP-06", input,
        [`step:ob_relocation_allowance`, `status:${allowance.status}`, `deadline:${deadlineIso}`],
        `The relocation allowance is not settled and the housing deadline is ${Math.max(0, daysToDeadline).toFixed(0)} days away.`,
        `بدل الانتقال غير محسم وموعد السكن بعد ${Math.max(0, daysToDeadline).toFixed(0)} يوماً.`));
    }
  }

  /* ================= RQ · request telemetry (RQ-01…RQ-07) ================= */
  const liveRequests = input.requests.filter((r) => r.status !== "closed" && r.status !== "cancelled" && r.status !== "resolved");
  for (const r of liveRequests) {
    // RQ-01 older than the promise made for its type.
    if (hoursBetween(r.openedAt, asOf) > r.slaHours) {
      fired.push(mk("RQ-01", input,
        [`request:${r.id}`, `ref:${r.ref}`, `ageHours:${hoursBetween(r.openedAt, asOf).toFixed(0)}`, `sla:${r.slaHours}`],
        `Request ${r.ref} has been open ${Math.floor(hoursBetween(r.openedAt, asOf) / 24)} days against a ${r.slaHours}h target.`,
        `الطلب ${r.ref} مفتوح منذ ${Math.floor(hoursBetween(r.openedAt, asOf) / 24)} يوماً مقابل ${r.slaHours} ساعة.`));
    }
    if (r.reassignCount >= 3) {
      fired.push(mk("RQ-02", input,
        [`request:${r.id}`, `ref:${r.ref}`, `reassignCount:${r.reassignCount}`],
        `Request ${r.ref} has been passed between queues ${r.reassignCount} times.`,
        `الطلب ${r.ref} نُقل بين الطوابير ${r.reassignCount} مرات.`));
    }
    if (r.returnCount >= 2) {
      fired.push(mk("RQ-03", input,
        [`request:${r.id}`, `ref:${r.ref}`, `returnCount:${r.returnCount}`],
        `Request ${r.ref} was sent back ${r.returnCount} times as incomplete.`,
        `الطلب ${r.ref} أُرجع ${r.returnCount} مرات كغير مكتمل.`));
    }
    if (r.status === "reopened") {
      fired.push(mk("RQ-06", input,
        [`request:${r.id}`, `ref:${r.ref}`, `status:reopened`],
        `Request ${r.ref} was closed and had to be reopened.`,
        `الطلب ${r.ref} أُغلق وأعيد فتحه.`));
    }
    if (r.status === "waiting_employee" && daysBetween(r.openedAt, asOf) > 5) {
      fired.push(mk("RQ-07", input,
        [`request:${r.id}`, `ref:${r.ref}`, `waitingDays:${daysBetween(r.openedAt, asOf).toFixed(1)}`],
        `Request ${r.ref} is waiting on you, not on the company.`,
        `الطلب ${r.ref} ينتظرك أنت.`));
    }
    // RQ-05 an assignee the owner directory cannot resolve — blank, or a person
    // who has left (PRD §23 edge case 21).
    if (!r.assignee || !r.assignee.trim() || !input.ownerIds.has(r.assignee)) {
      fired.push(mk("RQ-05", input,
        [`request:${r.id}`, `ref:${r.ref}`, `assignee:${r.assignee || "blank"}`],
        `Request ${r.ref} has no owner we can reach (${r.assignee || "blank"}). We will tell you who we told instead.`,
        `الطلب ${r.ref} لا مالك له يمكن الوصول إليه.`));
    }
  }
  // RQ-04 the same intent twice inside 72 hours.
  const byType = new Map<string, ServiceRequest[]>();
  for (const r of liveRequests) {
    const list = byType.get(r.type) ?? [];
    list.push(r);
    byType.set(r.type, list);
  }
  for (const [type, list] of byType) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    for (let i = 1; i < sorted.length; i++) {
      if (new Date(sorted[i].openedAt).getTime() - new Date(sorted[i - 1].openedAt).getTime() <= 72 * 3600000) {
        fired.push(mk("RQ-04", input,
          [`request:${sorted[i].id}`, `duplicate_of:${sorted[i - 1].id}`, `type:${type}`],
          `You asked for "${type}" twice within 72 hours (${sorted[i - 1].ref} and ${sorted[i].ref}).`,
          `طلبت "${type}" مرتين خلال 72 ساعة.`));
        break;
      }
    }
  }

  /* ================= EN · engagement (EN-01…EN-05) ================= */
  const answersIn24h = input.answers.filter((a) => hoursBetween(a.askedAt, asOf) <= 24);
  const abstains24h = answersIn24h.filter((a) => a.kind === "abstain");
  if (abstains24h.length >= 3) {
    fired.push(mk("EN-01", input,
      abstains24h.map((a) => `answer:${a.id}`),
      `We could not answer ${abstains24h.length} questions in the last day. That is on us, not on you.`,
      `لم نتمكن من الإجابة على ${abstains24h.length} أسئلة خلال يوم.`));
  }
  const topicCounts = new Map<string, AnswerRecord[]>();
  for (const a of input.answers.filter((x) => (asOf.getTime() - new Date(x.askedAt).getTime()) <= 7 * DAY)) {
    const list = topicCounts.get(a.topicKey) ?? [];
    list.push(a);
    topicCounts.set(a.topicKey, list);
  }
  for (const [topic, list] of topicCounts) {
    if (list.length >= 3) {
      fired.push(mk("EN-02", input,
        list.map((a) => `answer:${a.id}`),
        `You have asked about the same thing ${list.length} times this week (${topic}).`,
        `سألت عن نفس الشيء ${list.length} مرات هذا الأسبوع.`));
    }
  }
  // EN-03 only when there is something for the employee to actually do. Silence
  // while the company holds every step is DP/TL territory, not disengagement.
  const employeeStepEvents = input.visibleEvents.filter((e) => {
    const st = states.get(e.stepKey);
    return st?.actor === "employee";
  });
  const lastEmployeeTouch = employeeStepEvents[employeeStepEvents.length - 1];
  const daysSinceEmployeeTouch = lastEmployeeTouch ? daysBetween(lastEmployeeTouch.occurredAt, asOf) : daysSinceStart;
  const waitingOnEmployee = opens.some((s) => s.actor === "employee" && s.blockedBy.length === 0);
  if (stageIsOpen && waitingOnEmployee && daysSinceEmployeeTouch >= 5) {
    fired.push(mk("EN-03", input,
      [lastEmployeeTouch ? `event:${lastEmployeeTouch.id}` : `employee:${employee.id}`, `idleDays:${daysSinceEmployeeTouch.toFixed(1)}`],
      `Your checklist has not been opened in ${Math.floor(daysSinceEmployeeTouch)} days.`,
      `لم تُفتح قائمتك منذ ${Math.floor(daysSinceEmployeeTouch)} يوماً.`));
  }
  const helpSeeking = input.answers.filter((a) => a.intent === "help_seeking");
  if (helpSeeking.length >= 2) {
    fired.push(mk("EN-04", input,
      helpSeeking.map((a) => `answer:${a.id}`),
      `You have asked for a person ${helpSeeking.length} times. A human should already be on this.`,
      `طلبت شخصاً ${helpSeeking.length} مرات.`));
  }
  const abandonedByType = new Map<string, IntakeDraftRecord[]>();
  for (const d of input.drafts.filter((x) => x.status === "abandoned")) {
    const list = abandonedByType.get(d.type) ?? [];
    list.push(d);
    abandonedByType.set(d.type, list);
  }
  for (const [type, list] of abandonedByType) {
    if (list.length >= 2) {
      fired.push(mk("EN-05", input,
        list.map((d) => `draft:${d.id}`),
        `The ${type} form was started and left ${list.length} times — it is asking for something you do not have.`,
        `نموذج ${type} بدأ وغادر ${list.length} مرات.`));
    }
  }

  /* ================= PS · pulse (PS-01…PS-05, consent-gated) ================= */
  const pulseConsent = hasConsent(input, "pulse_capture");
  const commentConsent = hasConsent(input, "comment_retention");
  if (!pulseConsent) {
    suppressed.push("PS");
    // PS-04 is the disclosure, not a score: weight 0, always visible in the trace.
    fired.push(mk("PS-04", input,
      [`employee:${employee.id}`, `purpose:pulse_capture`, `granted:false`],
      "Feedback answers are switched off, so this view uses journey and request data only.",
      "إجابات التغذية الراجعة مطفأة، لذا يستخدم هذا العرض بيانات الرحلة والطلبات فقط."));
  } else {
    const ordered = [...input.pulse].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const p of ordered) {
      if (p.score <= 2) {
        fired.push(mk("PS-01", input,
          [`pulse:${p.id}`, `stage:${p.stage}`, `score:${p.score}`],
          `You told us at ${p.stage} that you felt unsure (${p.score}/5).`,
          `أخبرتنا في ${p.stage} بأنك غير متأكد (${p.score}/5).`));
      }
      if (p.commentText && HELP_NOW_LEXICON.test(p.commentText)) {
        fired.push(mk("PS-05", input,
          [`pulse:${p.id}`, `lexicon:help_now`, ...(p.commentRef ? [`comment:${p.commentRef}`] : [])],
          `You told us you need help now. That goes to a person, not an archive.`,
          `أخبرتنا أنك تحتاج مساعدة الآن. يذهب هذا إلى شخص.`));
      } else if (commentConsent && p.commentText && BLOCKED_IGNORED_LEXICON.test(p.commentText)) {
        fired.push(mk("PS-03", input,
          [`pulse:${p.id}`, `lexicon:blocked_or_ignored`, ...(p.commentRef ? [`comment:${p.commentRef}`] : [])],
          `Your words match "ignored or blocked". We do not score how you feel; this is a keyword match you can read.`,
          `كلامك يطابق "تم تجاهلي". هذه مطابقة كلمات وليست تقييماً.`));
      }
    }
    for (let i = 2; i < ordered.length; i++) {
      if (ordered[i].score < ordered[i - 1].score && ordered[i - 1].score < ordered[i - 2].score) {
        fired.push(mk("PS-02", input,
          [`pulse:${ordered[i - 2].id}`, `pulse:${ordered[i - 1].id}`, `pulse:${ordered[i].id}`,
           `trend:${ordered[i - 2].score}>${ordered[i - 1].score}>${ordered[i].score}`],
          `Your last three answers have gone down each time (${ordered[i - 2].score}, ${ordered[i - 1].score}, ${ordered[i].score}).`,
          `آخر ثلاث إجابات تنخفض كل مرة.`));
      }
    }
  }

  /* ================= MB · mobility (MB-01…MB-06) ================= */
  if (employee.journeyType === "mobility" && employee.effectiveDate) {
    const since = daysBetween(employee.effectiveDate, asOf);
    const roleAccess = byKey("mb_role_access");
    if (roleAccess && roleAccess.status !== "done" && roleAccess.status !== "skipped" && since > 3) {
      fired.push(mk("MB-01", input,
        [`step:mb_role_access`, `status:${roleAccess.status}`, `daysSinceEffective:${since.toFixed(0)}`],
        `Your start date in the new role passed ${since.toFixed(0)} days ago and the access profile has not changed.`,
        `تاريخ السريان مضى عليه ${since.toFixed(0)} يوماً وملف الوصول لم يتغير.`));
    }
    const hasRelocationCase = input.requests.some((r) => r.type === "relocation");
    if (employee.previousLocation && employee.previousLocation !== employee.location && !hasRelocationCase) {
      fired.push(mk("MB-02", input,
        [`employee:${employee.id}`, `from:${employee.previousLocation}`, `to:${employee.location}`, `relocation_request:none`],
        `You moved from ${employee.previousLocation} to ${employee.location} and nobody has opened a relocation case.`,
        `انتقلت من ${employee.previousLocation} إلى ${employee.location} دون ملف انتقال.`));
    }
    const dual = byKey("mb_dual_reporting");
    if (dual && dual.status !== "done" && dual.status !== "skipped" && since > 7) {
      fired.push(mk("MB-03", input,
        [`step:mb_dual_reporting`, `status:${dual.status}`, `daysSinceEffective:${since.toFixed(0)}`],
        `Two managers still think they have you, ${since.toFixed(0)} days after your effective date.`,
        `مديران ما يزالان يظنان أنك معهما.`));
    }
    const payroll = byKey("mb_payroll_change");
    if (payroll && payroll.status !== "done" && payroll.status !== "skipped") {
      const cutoff = new Date(asOf);
      cutoff.setUTCHours(0, 0, 0, 0);
      cutoff.setUTCDate(25);
      if (cutoff <= asOf) cutoff.setUTCMonth(cutoff.getUTCMonth() + 1);
      const daysToCutoff = (cutoff.getTime() - asOf.getTime()) / DAY;
      if (daysToCutoff < 7) {
        fired.push(mk("MB-04", input,
          [`step:mb_payroll_change`, `status:${payroll.status}`, `cutoff:${cutoff.toISOString()}`],
          `The pay change is not confirmed and the payroll cutoff is in ${daysToCutoff.toFixed(0)} days. If it slips you are paid wrong for a month.`,
          `تغيير الراتب غير مؤكد وتقطع الرواتب بعد ${daysToCutoff.toFixed(0)} يوماً.`));
      }
    }
    const assets = byKey("mb_asset_return");
    if (assets && assets.status !== "done" && assets.status !== "skipped") {
      const overdueDays = assets.dueAt ? daysBetween(assets.dueAt, asOf) : 0;
      if (overdueDays > 10) {
        fired.push(mk("MB-05", input,
          [`step:mb_asset_return`, `dueAt:${assets.dueAt}`, `overdueDays:${overdueDays.toFixed(0)}`],
          `Previous-team equipment is ${overdueDays.toFixed(0)} days overdue for return.`,
          `معدات الفريق السابق متأخرة ${overdueDays.toFixed(0)} يوماً.`));
      }
    }
    const training = byKey("mb_training_booked");
    if (training && training.status === "not_started" && since > 5) {
      fired.push(mk("MB-06", input,
        [`step:mb_training_booked`, `status:not_started`, `daysSinceEffective:${since.toFixed(0)}`],
        `Mandatory training for the new role has not been booked, ${since.toFixed(0)} days after your start date.`,
        `التدريب الإلزامي لم يُحجز منذ ${since.toFixed(0)} يوماً.`));
    }
  }

  /* ================= DQ · data quality (DQ-01…DQ-05) ================= */
  if (!employee.managerId || !employee.hrbpId) {
    fired.push(mk("DQ-01", input,
      [`employee:${employee.id}`, `manager:${employee.managerId || "missing"}`, `hrbp:${employee.hrbpId || "missing"}`],
      `Your record is missing a manager or an HR partner, so we route to a team rather than a person.`,
      `سجلك يفتقد مديراً أو شريك موارد، لذا نوجّه إلى فريق.`));
  }
  const reopened = [...states.values()].flatMap((s) =>
    s.contradictions.filter((c) => c.startsWith("reopened_after_done:")).map((c) => `step:${s.stepKey}:${c}`));
  if (reopened.length > 0) {
    fired.push(mk("DQ-02", input,
      reopened,
      `A step was marked finished, then reopened without a reason recorded. We show both.`,
      `عُدت خطوة إلى العمل بعد إتمامها دون سبب مسجل.`));
  }
  if (input.futureEventIds.length > 0) {
    fired.push(mk("DQ-03", input,
      input.futureEventIds.map((id) => `event:${id}`),
      `${input.futureEventIds.length} event(s) are dated in the future. They are excluded from your status.`,
      `${input.futureEventIds.length} حدث بتاريخ مستقبلي، مستبعد من حالتك.`));
  }
  const journeyTypes = new Set(input.visibleEvents
    .map((e) => input.graph.steps.get(e.stepKey)?.journeyType)
    .filter(Boolean));
  if (employee.secondaryJourneyType || journeyTypes.size > 1) {
    fired.push(mk("DQ-04", input,
      [`employee:${employee.id}`, `journeys:${[...journeyTypes].join(",") || employee.journeyType}`,
       `secondary:${employee.secondaryJourneyType ?? "none"}`],
      `You appear in two journeys at once. We run both and put the nearer deadline first.`,
      `تظهر في رحلتين في وقت واحد.`));
  }
  // DQ-05 two ways the map and the corpus disagree: activity for a step the map
  // does not define, and a step citing a document the corpus does not hold.
  const danglingRefs = input.steps
    .filter((s) => s.journeyType === employee.journeyType)
    .flatMap((s) => s.policyRefs
      .filter((ref) => !input.policySlugs.has(ref.split("#")[0]))
      .map((ref) => `step:${s.key}:ref:${ref}`));
  const unmappedRefs = input.unmapped.flatMap((u) =>
    [`unmapped_step:${u.stepKey}`, ...u.eventIds.map((id) => `event:${id}`)]);
  if (unmappedRefs.length > 0 || danglingRefs.length > 0) {
    fired.push(mk("DQ-05", input,
      [...unmappedRefs, ...danglingRefs],
      unmappedRefs.length > 0
        ? `${input.unmapped.length} activity record(s) refer to steps not in your journey map. We list them as unmapped instead of dropping them.`
        : `Some journey steps point at a policy that is not in the corpus.`,
      unmappedRefs.length > 0
        ? `${input.unmapped.length} نشاط يشير إلى خطوات غير موجودة في الخريطة.`
        : `بعض الخطوات تشير إلى سياسة غير موجودة.`));
  }

  return { fired: dedupeSignals(fired), suppressed };
}

/**
 * One instance per signal code per evidence set (PRD §5-091): the strongest
 * evidence survives and the code is never counted twice for the same step.
 */
function dedupeSignals(fired: FiredSignal[]): FiredSignal[] {
  const best = new Map<string, FiredSignal>();
  for (const sig of fired) {
    const key = `${sig.code}:${sig.evidenceRefs.find((r) => r.startsWith("step:")) ?? sig.evidenceRefs.find((r) => r.startsWith("request:")) ?? sig.evidenceRefs.find((r) => r.startsWith("pulse:")) ?? sig.evidenceRefs.find((r) => r.startsWith("answer:")) ?? sig.evidenceRefs.find((r) => r.startsWith("draft:")) ?? ""}`;
    const existing = best.get(key);
    if (!existing || sig.weight > existing.weight) best.set(key, sig);
  }
  return [...best.values()].sort((a, b) => a.code.localeCompare(b.code));
}
