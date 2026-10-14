/**
 * Every one of the 42 signals, tested at its boundary: a baseline world where
 * the signal must NOT appear, and a one-variable perturbation where it MUST.
 * A signal test that only asserts the positive half proves nothing about the
 * threshold (PRD §29 093, 441).
 */

import { describe, expect, test } from "bun:test";
import {
  MAP,
  baseEmployee,
  codes,
  consent,
  daysAgo,
  daysAhead,
  ev,
  hasSignal,
  hoursAgo,
  pulse,
  request,
  answer,
  draft,
  runCase,
} from "./world";
import { SIGNAL_CATALOGUE, BAND_THRESHOLDS } from "../../src/lib/engine/signal-catalogue";
import { assess, packData } from "../../src/lib/engine/engine";

const E = "T-001";

/**
 * A compliant onboarding as of the frozen clock: every promise kept, nothing
 * stalled, no requests, no pulse. This is the negative half of every test.
 */
function baseline(eventsOverride?: ReturnType<typeof ev>[], employeeOverrides = {}) {
  const employee = baseEmployee(employeeOverrides);
  const id = employee.id;
  const events = eventsOverride ?? [
    ev(id, "ob_offer_signed", "completed", daysAgo(4)),
    ev(id, "ob_passport_upload", "completed", daysAgo(4)),
    ev(id, "ob_relocation_allowance", "completed", daysAgo(3)),
    ev(id, "ob_visa_application", "completed", daysAgo(3)),
    ev(id, "ob_visa_approval", "completed", daysAgo(2)),
    ev(id, "ob_flight_booked", "completed", daysAgo(2)),
    ev(id, "ob_housing_arranged", "completed", daysAgo(2)),
    ev(id, "ob_kit_issued", "completed", daysAgo(1)),
    ev(id, "ob_access_provisioned", "completed", daysAgo(1)),
    ev(id, "ob_badge_issued", "completed", daysAgo(1)),
    ev(id, "ob_induction_complete", "completed", hoursAgo(10)),
    ev(id, "ob_training_booked", "started", hoursAgo(10)),
    ev(id, "ob_buddy_assigned", "started", hoursAgo(5)),
  ];
  return { employee, events };
}

function withConsents(extra: ReturnType<typeof consent>[] = []) {
  return [consent(E, "journey_assistance", true), ...extra];
}

describe("baseline proves the quiet case", () => {
  test("a compliant journey produces no friction, only the consent disclosure", () => {
    const { employee, events } = baseline();
    const a = runCase({ employee, events, consents: withConsents() });
    // PS-04 is the weight-0 disclosure that pulse data was excluded; it is the
    // only thing a quiet, compliant journey may say.
    expect(a.signals.filter((s) => s.weight > 0)).toEqual([]);
    expect(codes(a)).toEqual(["PS-04"]);
    expect(a.band).toBe("steady");
    expect(a.score).toBe(0);
  });
});

describe("TL family", () => {
  test("TL-01 step past target, not before", () => {
    // 30 hours into a 24h target — late, but not double late.
    const late = baseline([
      ...baseline().events.slice(0, 7),
      ev(E, "ob_kit_issued", "started", hoursAgo(30)),
    ]);
    const fired = runCase({ employee: late.employee, events: late.events, consents: withConsents() });
    expect(hasSignal(fired, "TL-01").length).toBeGreaterThan(0);

    const onTime = baseline([
      ...baseline().events.slice(0, 7),
      ev(E, "ob_kit_issued", "started", hoursAgo(6)),
    ]);
    const quiet = runCase({ employee: onTime.employee, events: onTime.events, consents: withConsents() });
    expect(hasSignal(quiet, "TL-01").length).toBe(0);
  });

  test("TL-02 only past 200% of target", () => {
    const doubleLate = baseline([
      ...baseline().events.slice(0, 7),
      ev(E, "ob_kit_issued", "started", daysAgo(6)),
    ]);
    const a = runCase({ employee: doubleLate.employee, events: doubleLate.events, consents: withConsents() });
    expect(hasSignal(a, "TL-02").length).toBeGreaterThan(0);
    expect(a.hardTrips).toContain("TL-02");

    const justLate = baseline([
      ...baseline().events.slice(0, 7),
      ev(E, "ob_kit_issued", "started", hoursAgo(30)),
    ]);
    const b = runCase({ employee: justLate.employee, events: justLate.events, consents: withConsents() });
    expect(hasSignal(b, "TL-02").length).toBe(0);
  });

  test("TL-03 the day-2 laptop promise, broken and kept", () => {
    const broken = baseline([
      ...baseline().events.slice(0, 7),
      ev(E, "ob_kit_issued", "started", hoursAgo(10)),
    ]);
    const a = runCase({ employee: broken.employee, events: broken.events, consents: withConsents() });
    expect(hasSignal(a, "TL-03").length).toBeGreaterThan(0);
    expect(a.signals.find((s) => s.code === "TL-03" && s.description.includes("laptop"))).toBeDefined();

    const kept = baseline();
    const b = runCase({ employee: kept.employee, events: kept.events, consents: withConsents() });
    expect(hasSignal(b, "TL-03").length).toBe(0);
  });

  test("TL-04 pre-boarding under 60% inside five days of starting", () => {
    const atRisk = baseline([ev(E, "ob_offer_signed", "completed", daysAgo(9))], { startDate: daysAhead(3) });
    const a = runCase({ employee: atRisk.employee, events: atRisk.events, consents: withConsents() });
    expect(hasSignal(a, "TL-04").length).toBeGreaterThan(0);

    const ready = baseline([
      ev(E, "ob_offer_signed", "completed", daysAgo(9)),
      ev(E, "ob_passport_upload", "completed", daysAgo(8)),
      ev(E, "ob_relocation_allowance", "completed", daysAgo(7)),
    ], { startDate: daysAhead(3) });
    const b = runCase({ employee: ready.employee, events: ready.events, consents: withConsents() });
    expect(hasSignal(b, "TL-04").length).toBe(0);
  });

  test("TL-05 72h of silence, and one hour less", () => {
    // Every recorded event is older than the window, so the only difference
    // between the two cases is whether the silence has passed 72 hours.
    const silent = baseline([
      ev(E, "ob_offer_signed", "completed", daysAgo(10)),
      ev(E, "ob_passport_upload", "completed", daysAgo(9)),
      ev(E, "ob_relocation_allowance", "completed", daysAgo(8)),
      ev(E, "ob_visa_application", "completed", daysAgo(8)),
      ev(E, "ob_visa_approval", "completed", daysAgo(6)),
      ev(E, "ob_kit_issued", "started", daysAgo(4)),
    ]);
    const a = runCase({ employee: silent.employee, events: silent.events, consents: withConsents() });
    expect(hasSignal(a, "TL-05").length).toBeGreaterThan(0);

    const recent = baseline([
      ev(E, "ob_offer_signed", "completed", daysAgo(10)),
      ev(E, "ob_passport_upload", "completed", daysAgo(9)),
      ev(E, "ob_relocation_allowance", "completed", daysAgo(8)),
      ev(E, "ob_visa_application", "completed", daysAgo(8)),
      ev(E, "ob_visa_approval", "completed", daysAgo(6)),
      ev(E, "ob_kit_issued", "started", daysAgo(4)),
      ev(E, "ob_kit_issued", "note", hoursAgo(70)),
    ]);
    const b = runCase({ employee: recent.employee, events: recent.events, consents: withConsents() });
    expect(hasSignal(b, "TL-05").length).toBe(0);
  });

  test("TL-06 only when the breach survives the working calendar", () => {
    // 30 wall-clock hours into a 24h target that began on a Friday: the weekend
    // absorbs it, so the breach is not real yet.
    const overWeekend = baseline([
      ...baseline().events.slice(0, 7),
      ev(E, "ob_kit_issued", "started", "2024-10-17T02:00:00Z"),
    ]);
    const a = runCase({ employee: overWeekend.employee, events: overWeekend.events, consents: withConsents() });
    const tl01 = hasSignal(a, "TL-01").length;
    const tl06 = hasSignal(a, "TL-06").length;
    expect(tl01).toBeGreaterThan(0);
    expect(tl06).toBe(0);

    const overWorked = baseline([
      ...baseline().events.slice(0, 7),
      ev(E, "ob_kit_issued", "started", daysAgo(10)),
    ]);
    const b = runCase({ employee: overWorked.employee, events: overWorked.events, consents: withConsents() });
    expect(hasSignal(b, "TL-06").length).toBeGreaterThan(0);
  });

  test("TL-07 completion before its prerequisite", () => {
    const outOfOrder = baseline([
      ev(E, "ob_offer_signed", "completed", daysAgo(4)),
      ev(E, "ob_passport_upload", "completed", daysAgo(4)),
      ev(E, "ob_relocation_allowance", "completed", daysAgo(3)),
      ev(E, "ob_visa_application", "completed", daysAgo(3)),
      ev(E, "ob_visa_approval", "completed", daysAgo(2)),
      ev(E, "ob_flight_booked", "completed", daysAgo(2)),
      ev(E, "ob_housing_arranged", "completed", daysAgo(2)),
      ev(E, "ob_badge_issued", "completed", daysAgo(1)),
      // laptop issued five days BEFORE the visa approval it depends on
      ev(E, "ob_kit_issued", "completed", daysAgo(5)),
    ]);
    const a = runCase({ employee: outOfOrder.employee, events: outOfOrder.events, consents: withConsents() });
    expect(hasSignal(a, "TL-07").length).toBeGreaterThan(0);

    const inOrder = baseline();
    const b = runCase({ employee: inOrder.employee, events: inOrder.events, consents: withConsents() });
    expect(hasSignal(b, "TL-07").length).toBe(0);
  });

  test("TL-08 a step with no target time is a map defect, not lateness", () => {
    const untimedCase = baseline();
    const a = runCase({ employee: untimedCase.employee, events: untimedCase.events, consents: withConsents() });
    expect(hasSignal(a, "TL-08").length).toBe(0);

    // Every step in the map has a target, so the signal is silent. Prove it
    // speaks when a target is removed from the configuration.
    const stepsWithoutTarget = MAP.steps.map((s) => (s.key === "ob_buddy_assigned" ? { ...s, targetHours: 0 } : s));
    const b = assess(untimedCase.employee, new Date("2024-10-19T10:00:00Z"), {
      ...packData(),
      steps: stepsWithoutTarget,
      events: [
        ev(E, "ob_offer_signed", "completed", daysAgo(4)),
        ev(E, "ob_passport_upload", "completed", daysAgo(4)),
        ev(E, "ob_relocation_allowance", "completed", daysAgo(3)),
        ev(E, "ob_visa_application", "completed", daysAgo(3)),
        ev(E, "ob_visa_approval", "completed", daysAgo(2)),
        ev(E, "ob_kit_issued", "completed", daysAgo(1)),
        ev(E, "ob_badge_issued", "completed", daysAgo(1)),
        ev(E, "ob_induction_complete", "completed", hoursAgo(10)),
        ev(E, "ob_buddy_assigned", "started", hoursAgo(10)),
      ],
    });
    expect(hasSignal(b, "TL-08").length).toBeGreaterThan(0);
    expect(b.signals.find((s) => s.code === "TL-08")?.dataQuality).toBe(true);
    // An untimed step must never be reported as a breach (PRD §3-053).
    expect(b.signals.find((s) => s.code === "TL-01" && s.evidenceRefs.includes("step:ob_buddy_assigned"))).toBeUndefined();
  });
});

describe("DP family", () => {
  test("DP-01 a started step holding up two or more", () => {
    const holdsUp = baseline([
      ...baseline().events.slice(0, 4),
      ev(E, "ob_visa_approval", "started", daysAgo(3)),
    ]);
    const a = runCase({ employee: holdsUp.employee, events: holdsUp.events, consents: withConsents() });
    expect(hasSignal(a, "DP-01").length).toBeGreaterThan(0);

    // Not yet begun: normal sequencing, not friction.
    const notBegun = baseline([...baseline().events.slice(0, 4)]);
    const b = runCase({ employee: notBegun.employee, events: notBegun.events, consents: withConsents() });
    expect(hasSignal(b, "DP-01").length).toBe(0);
  });

  test("DP-02 visa stalled a day over the seven-day line", () => {
    const stalled = baseline([...baseline().events.slice(0, 4), ev(E, "ob_visa_approval", "started", daysAgo(8))]);
    const a = runCase({ employee: stalled.employee, events: stalled.events, consents: withConsents() });
    expect(hasSignal(a, "DP-02").length).toBeGreaterThan(0);
    expect(a.band).toBe("blocked");
    expect(a.forcedBlocked).toBe(true);

    const sixDays = baseline([...baseline().events.slice(0, 4), ev(E, "ob_visa_approval", "started", daysAgo(6))]);
    const b = runCase({ employee: sixDays.employee, events: sixDays.events, consents: withConsents() });
    expect(hasSignal(b, "DP-02").length).toBe(0);
    expect(b.band).not.toBe("blocked");
  });

  test("DP-03 provisioning started then stopped on a missing asset", () => {
    const stopped = baseline([
      ...baseline().events.slice(0, 8),
      ev(E, "ob_access_provisioned", "started", daysAgo(2)),
      ev(E, "ob_access_provisioned", "blocked", daysAgo(1)),
    ]);
    const a = runCase({ employee: stopped.employee, events: stopped.events, consents: withConsents() });
    expect(hasSignal(a, "DP-03").length).toBeGreaterThan(0);

    const neverStarted = baseline([...baseline().events.slice(0, 8)]);
    const b = runCase({ employee: neverStarted.employee, events: neverStarted.events, consents: withConsents() });
    expect(hasSignal(b, "DP-03").length).toBe(0);
  });

  test("DP-04 training booked while access is missing", () => {
    const booked = baseline([...baseline().events.slice(0, 8), ev(E, "ob_training_booked", "started", hoursAgo(10))]);
    const a = runCase({ employee: booked.employee, events: booked.events, consents: withConsents() });
    expect(hasSignal(a, "DP-04").length).toBeGreaterThan(0);

    const withAccess = baseline([...baseline().events.slice(0, 9), ev(E, "ob_training_booked", "started", hoursAgo(10))]);
    const b = runCase({ employee: withAccess.employee, events: withAccess.events, consents: withConsents() });
    expect(hasSignal(b, "DP-04").length).toBe(0);
  });

  test("DP-05 handover absent six days after an approved transfer", () => {
    const mover = baseEmployee({ journeyType: "mobility", stage: "handover", effectiveDate: daysAgo(2), startDate: daysAgo(60) });
    const events = [
      ev(mover.id, "mb_transfer_signed", "completed", daysAgo(12)),
      ev(mover.id, "mb_release_handover", "started", daysAgo(6)),
    ];
    const a = runCase({ employee: mover, events, consents: withConsents() });
    expect(hasSignal(a, "DP-05").length).toBeGreaterThan(0);

    const fresh = runCase({
      employee: mover,
      events: [ev(mover.id, "mb_transfer_signed", "completed", daysAgo(12)), ev(mover.id, "mb_release_handover", "started", daysAgo(3))],
      consents: withConsents(),
    });
    expect(hasSignal(fresh, "DP-05").length).toBe(0);
  });

  test("DP-06 allowance pending inside a 14-day housing deadline", () => {
    const open = [
      ev(E, "ob_offer_signed", "completed", daysAgo(4)),
      ev(E, "ob_passport_upload", "completed", daysAgo(4)),
      ev(E, "ob_visa_application", "completed", daysAgo(3)),
      ev(E, "ob_visa_approval", "completed", daysAgo(2)),
    ];
    const a = runCase({
      employee: baseEmployee({ startDate: daysAgo(4), arrivalDate: daysAhead(6) }),
      events: open,
      consents: withConsents(),
    });
    expect(hasSignal(a, "DP-06").length).toBeGreaterThan(0);

    const distant = runCase({
      employee: baseEmployee({ startDate: daysAgo(4), arrivalDate: daysAhead(40) }),
      events: open,
      consents: withConsents(),
    });
    expect(hasSignal(distant, "DP-06").length).toBe(0);
  });
});

describe("RQ family", () => {
  test("RQ-01 open beyond its type SLA", () => {
    const late = runCase({ ...baseline(), requests: [request(E, { openedAt: hoursAgo(30), slaHours: 24 })], consents: withConsents() });
    expect(hasSignal(late, "RQ-01").length).toBeGreaterThan(0);

    const inside = runCase({ ...baseline(), requests: [request(E, { openedAt: hoursAgo(20), slaHours: 24 })], consents: withConsents() });
    expect(hasSignal(inside, "RQ-01").length).toBe(0);
  });

  test("RQ-02 three reassignments, not two", () => {
    const pingPong = runCase({ ...baseline(), requests: [request(E, { reassignCount: 3 })], consents: withConsents() });
    expect(hasSignal(pingPong, "RQ-02").length).toBeGreaterThan(0);

    const twice = runCase({ ...baseline(), requests: [request(E, { reassignCount: 2 })], consents: withConsents() });
    expect(hasSignal(twice, "RQ-02").length).toBe(0);
  });

  test("RQ-03 returned as incomplete twice", () => {
    const returned = runCase({ ...baseline(), requests: [request(E, { returnCount: 2 })], consents: withConsents() });
    expect(hasSignal(returned, "RQ-03").length).toBeGreaterThan(0);
    const once = runCase({ ...baseline(), requests: [request(E, { returnCount: 1 })], consents: withConsents() });
    expect(hasSignal(once, "RQ-03").length).toBe(0);
  });

  test("RQ-04 same intent twice inside 72 hours", () => {
    const dupes = runCase({
      ...baseline(),
      requests: [request(E, { openedAt: hoursAgo(60) }), request(E, { openedAt: hoursAgo(20) })],
      consents: withConsents(),
    });
    expect(hasSignal(dupes, "RQ-04").length).toBeGreaterThan(0);

    const apart = runCase({
      ...baseline(),
      requests: [request(E, { openedAt: hoursAgo(200) }), request(E, { openedAt: hoursAgo(20) })],
      consents: withConsents(),
    });
    expect(hasSignal(apart, "RQ-04").length).toBe(0);
  });

  test("RQ-05 an assignee the directory cannot resolve", () => {
    const ghost = runCase({ ...baseline(), requests: [request(E, { assignee: "O-LEFT-9" })], consents: withConsents() });
    expect(hasSignal(ghost, "RQ-05").length).toBeGreaterThan(0);

    const real = runCase({ ...baseline(), requests: [request(E, { assignee: "O-IT-1" })], consents: withConsents() });
    expect(hasSignal(real, "RQ-05").length).toBe(0);
  });

  test("RQ-06 closed then reopened", () => {
    const reopened = runCase({ ...baseline(), requests: [request(E, { status: "reopened" })], consents: withConsents() });
    expect(hasSignal(reopened, "RQ-06").length).toBeGreaterThan(0);
    const closed = runCase({ ...baseline(), requests: [request(E, { status: "closed" })], consents: withConsents() });
    expect(hasSignal(closed, "RQ-06").length).toBe(0);
  });

  test("RQ-07 waiting on the employee six days, and it stays a nudge", () => {
    const onEmployee = runCase({ ...baseline(), requests: [request(E, { status: "waiting_employee", openedAt: daysAgo(6) })], consents: withConsents() });
    const sig = hasSignal(onEmployee, "RQ-07");
    expect(sig.length).toBeGreaterThan(0);
    expect(sig[0].nudgeOnly).toBe(true);
    expect(sig[0].weight).toBe(SIGNAL_CATALOGUE["RQ-07"].weight);

    const fresh = runCase({ ...baseline(), requests: [request(E, { status: "waiting_employee", openedAt: daysAgo(3) })], consents: withConsents() });
    expect(hasSignal(fresh, "RQ-07").length).toBe(0);
  });
});

describe("EN family", () => {
  test("EN-01 three abstentions inside 24 hours", () => {
    const abstaining = runCase({
      ...baseline(),
      answers: [
        answer(E, { kind: "abstain", askedAt: hoursAgo(20) }),
        answer(E, { kind: "abstain", askedAt: hoursAgo(10) }),
        answer(E, { kind: "abstain", askedAt: hoursAgo(2) }),
      ],
      consents: withConsents(),
    });
    expect(hasSignal(abstaining, "EN-01").length).toBeGreaterThan(0);

    const two = runCase({
      ...baseline(),
      answers: [answer(E, { kind: "abstain", askedAt: hoursAgo(20) }), answer(E, { kind: "abstain", askedAt: hoursAgo(10) })],
      consents: withConsents(),
    });
    expect(hasSignal(two, "EN-01").length).toBe(0);
  });

  test("EN-02 the same topic three times in a week", () => {
    const repeated = runCase({
      ...baseline(),
      answers: [
        answer(E, { topicKey: "relocation:allowance", askedAt: daysAgo(6) }),
        answer(E, { topicKey: "relocation:allowance", askedAt: daysAgo(3) }),
        answer(E, { topicKey: "relocation:allowance", askedAt: daysAgo(1) }),
      ],
      consents: withConsents(),
    });
    expect(hasSignal(repeated, "EN-02").length).toBeGreaterThan(0);

    const distinct = runCase({
      ...baseline(),
      answers: [
        answer(E, { topicKey: "a" }), answer(E, { topicKey: "b" }), answer(E, { topicKey: "c" }),
      ],
      consents: withConsents(),
    });
    expect(hasSignal(distinct, "EN-02").length).toBe(0);
  });

  test("EN-03 five days idle while something is the employee's to do", () => {
    const idle = runCase({
      ...baseline(),
      events: [
        ev(E, "ob_offer_signed", "completed", daysAgo(10)),
        ev(E, "ob_passport_upload", "completed", daysAgo(9)),
        ev(E, "ob_relocation_allowance", "completed", daysAgo(8)),
        ev(E, "ob_visa_application", "completed", daysAgo(7)),
        ev(E, "ob_visa_approval", "completed", daysAgo(6)),
        ev(E, "ob_kit_issued", "completed", daysAgo(5)),
        ev(E, "ob_access_provisioned", "completed", daysAgo(4)),
        ev(E, "ob_badge_issued", "completed", daysAgo(3)),
        // induction is the employee's, and it has not been touched in 6 days
        ev(E, "ob_induction_complete", "started", daysAgo(6)),
      ],
      consents: withConsents(),
    });
    expect(hasSignal(idle, "EN-03").length).toBeGreaterThan(0);

    const baselineCase = baseline();
    const busy = runCase({ employee: baselineCase.employee, events: baselineCase.events, consents: withConsents() });
    expect(hasSignal(busy, "EN-03").length).toBe(0);
  });

  test("EN-04 two requests for a human", () => {
    const asking = runCase({
      ...baseline(),
      answers: [
        answer(E, { intent: "help_seeking", askedAt: daysAgo(2) }),
        answer(E, { intent: "help_seeking", askedAt: hoursAgo(3) }),
      ],
      consents: withConsents(),
    });
    expect(hasSignal(asking, "EN-04").length).toBeGreaterThan(0);

    const oneOnly = runCase({ ...baseline(), answers: [answer(E, { intent: "help_seeking" })], consents: withConsents() });
    expect(hasSignal(oneOnly, "EN-04").length).toBe(0);
  });

  test("EN-05 the same form abandoned twice", () => {
    const abandoned = runCase({
      ...baseline(),
      drafts: [draft(E, { type: "visa" }), draft(E, { type: "visa" })],
      consents: withConsents(),
    });
    expect(hasSignal(abandoned, "EN-05").length).toBeGreaterThan(0);

    const once = runCase({ ...baseline(), drafts: [draft(E, { type: "visa" })], consents: withConsents() });
    expect(hasSignal(once, "EN-05").length).toBe(0);
  });
});

describe("PS family", () => {
  const pulseOn = [consent(E, "journey_assistance", true), consent(E, "pulse_capture", true), consent(E, "comment_retention", true)];

  test("PS-01 confidence at or below 2, not at 3", () => {
    const low = runCase({ ...baseline(), pulse: [pulse(E, 2, hoursAgo(5))], consents: pulseOn });
    expect(hasSignal(low, "PS-01").length).toBeGreaterThan(0);

    const ok = runCase({ ...baseline(), pulse: [pulse(E, 3, hoursAgo(5))], consents: pulseOn });
    expect(hasSignal(ok, "PS-01").length).toBe(0);
  });

  test("PS-02 two consecutive declines", () => {
    const falling = runCase({
      ...baseline(),
      pulse: [pulse(E, 5, daysAgo(6)), pulse(E, 4, daysAgo(3)), pulse(E, 2, daysAgo(1))],
      consents: pulseOn,
    });
    expect(hasSignal(falling, "PS-02").length).toBeGreaterThan(0);

    const flat = runCase({
      ...baseline(),
      pulse: [pulse(E, 5, daysAgo(6)), pulse(E, 5, daysAgo(3)), pulse(E, 4, daysAgo(1))],
      consents: pulseOn,
    });
    expect(hasSignal(flat, "PS-02").length).toBe(0);
  });

  test("PS-03 is a lexicon match, and only with comment consent", () => {
    const withComment = runCase({
      ...baseline(),
      pulse: [pulse(E, 4, hoursAgo(5), { commentText: "I asked twice and nobody replied.", commentRef: "PC-X" })],
      consents: pulseOn,
    });
    expect(hasSignal(withComment, "PS-03").length).toBeGreaterThan(0);

    const noCommentConsent = runCase({
      ...baseline(),
      pulse: [pulse(E, 4, hoursAgo(5), { commentText: "I asked twice and nobody replied.", commentRef: "PC-X" })],
      consents: [consent(E, "journey_assistance", true), consent(E, "pulse_capture", true), consent(E, "comment_retention", false)],
    });
    expect(hasSignal(noCommentConsent, "PS-03").length).toBe(0);
  });

  test("PS-04 discloses suppression with zero weight", () => {
    const off = runCase({ ...baseline(), pulse: [pulse(E, 1, hoursAgo(5))], consents: [consent(E, "journey_assistance", true), consent(E, "pulse_capture", false)] });
    const sig = hasSignal(off, "PS-04");
    expect(sig.length).toBeGreaterThan(0);
    expect(sig[0].weight).toBe(0);
    expect(off.suppressedFamilies).toContain("PS");
    expect(off.score).toBe(0);
  });

  test("PS-05 an explicit plea forces Blocked", () => {
    const plea = runCase({
      ...baseline(),
      pulse: [pulse(E, 4, hoursAgo(5), { commentText: "I need help now, please.", commentRef: "PC-Y" })],
      consents: pulseOn,
    });
    expect(hasSignal(plea, "PS-05").length).toBeGreaterThan(0);
    expect(plea.band).toBe("blocked");
  });
});

describe("MB family", () => {
  function mover(effectiveDaysAgo: number, events: ReturnType<typeof ev>[]) {
    const employee = baseEmployee({
      id: "T-MOB",
      journeyType: "mobility",
      stage: "effective_date",
      startDate: daysAgo(60),
      effectiveDate: daysAgo(effectiveDaysAgo),
    });
    return { employee, events: events.map((e) => ({ ...e, employeeId: employee.id })) };
  }

  test("MB-01 access profile unchanged four days after the effective date", () => {
    const w = mover(4, [
      ev("x", "mb_transfer_signed", "completed", daysAgo(20)),
      ev("x", "mb_role_access", "started", daysAgo(4)),
    ]);
    const a = runCase({ ...w, consents: withConsents() });
    expect(hasSignal(a, "MB-01").length).toBeGreaterThan(0);

    const fresh = mover(2, [
      ev("x", "mb_transfer_signed", "completed", daysAgo(20)),
      ev("x", "mb_role_access", "started", daysAgo(2)),
    ]);
    const b = runCase({ ...fresh, consents: withConsents() });
    expect(hasSignal(b, "MB-01").length).toBe(0);
  });

  test("MB-02 moved cities with no relocation case", () => {
    const employee = baseEmployee({
      id: "T-MOB2",
      journeyType: "mobility",
      stage: "effective_date",
      startDate: daysAgo(60),
      effectiveDate: daysAgo(4),
      previousLocation: "DXB",
      location: "AUH",
    });
    const events = [
      ev(employee.id, "mb_transfer_signed", "completed", daysAgo(20)),
      ev(employee.id, "mb_role_access", "completed", daysAgo(4)),
      ev(employee.id, "mb_payroll_change", "completed", daysAgo(4)),
    ];
    const a = runCase({ employee, events, consents: withConsents() });
    expect(hasSignal(a, "MB-02").length).toBeGreaterThan(0);

    const withCase = runCase({
      employee,
      events,
      requests: [request(employee.id, { type: "relocation", ownerGroup: "Mobility", assignee: "O-HR-2" })],
      consents: withConsents(),
    });
    expect(hasSignal(withCase, "MB-02").length).toBe(0);
  });

  test("MB-03 dual reporting eight days after the effective date", () => {
    const w = mover(8, [
      ev("x", "mb_transfer_signed", "completed", daysAgo(20)),
      ev("x", "mb_dual_reporting", "waiting_owner", daysAgo(8)),
    ]);
    const a = runCase({ ...w, consents: withConsents() });
    expect(hasSignal(a, "MB-03").length).toBeGreaterThan(0);
  });

  test("MB-04 unconfirmed pay inside the cutoff forces Blocked", () => {
    // asOf is the 19th; the cutoff is the 25th, six days out.
    const w = mover(9, [
      ev("x", "mb_transfer_signed", "completed", daysAgo(20)),
      ev("x", "mb_payroll_change", "started", daysAgo(9)),
    ]);
    const a = runCase({ ...w, consents: withConsents() });
    const sig = hasSignal(a, "MB-04");
    expect(sig.length).toBeGreaterThan(0);
    expect(sig[0].hardTrip).toBe(true);
    expect(a.band).toBe("blocked");
  });

  test("MB-05 equipment eleven days past its due date", () => {
    const w = mover(20, [
      ev("x", "mb_transfer_signed", "completed", daysAgo(40)),
      ev("x", "mb_asset_return", "started", daysAgo(30)),
      ev("x", "mb_role_access", "completed", daysAgo(10)),
      ev("x", "mb_payroll_change", "completed", daysAgo(10)),
    ]);
    const a = runCase({ ...w, consents: withConsents() });
    expect(hasSignal(a, "MB-05").length).toBeGreaterThan(0);

    const recent = mover(20, [
      ev("x", "mb_transfer_signed", "completed", daysAgo(40)),
      ev("x", "mb_asset_return", "started", daysAgo(6)),
      ev("x", "mb_role_access", "completed", daysAgo(10)),
      ev("x", "mb_payroll_change", "completed", daysAgo(10)),
    ]);
    const b = runCase({ ...recent, consents: withConsents() });
    expect(hasSignal(b, "MB-05").length).toBe(0);
  });

  test("MB-06 mandatory training still unbooked six days in", () => {
    const w = mover(6, [
      ev("x", "mb_transfer_signed", "completed", daysAgo(20)),
      ev("x", "mb_role_access", "completed", daysAgo(4)),
      ev("x", "mb_payroll_change", "completed", daysAgo(4)),
    ]);
    const a = runCase({ ...w, consents: withConsents() });
    expect(hasSignal(a, "MB-06").length).toBeGreaterThan(0);

    const booked = mover(6, [
      ...w.events,
      ev("x", "mb_training_booked", "started", daysAgo(1)),
    ]);
    const b = runCase({ employee: booked.employee, events: booked.events, consents: withConsents() });
    expect(hasSignal(b, "MB-06").length).toBe(0);
  });
});

describe("DQ family", () => {
  test("DQ-01 a record with no HR partner", () => {
    const orphan = baseline([], { hrbpId: "" });
    const a = runCase({ employee: orphan.employee, events: orphan.events, consents: withConsents() });
    expect(hasSignal(a, "DQ-01").length).toBeGreaterThan(0);
    expect(a.signals.find((s) => s.code === "DQ-01")?.dataQuality).toBe(true);
  });

  test("DQ-02 finished then reopened with no reason recorded", () => {
    const reopened = baseline([
      ...baseline().events.slice(0, 11),
      ev(E, "ob_induction_complete", "completed", daysAgo(3)),
      ev(E, "ob_induction_complete", "started", daysAgo(1)),
    ]);
    const a = runCase({ employee: reopened.employee, events: reopened.events, consents: withConsents() });
    expect(hasSignal(a, "DQ-02").length).toBeGreaterThan(0);
  });

  test("DQ-03 excludes a future-dated event from state and says so", () => {
    const skewed = baseline([...baseline().events, ev(E, "ob_30day_checkin", "completed", daysAhead(2))]);
    const a = runCase({ employee: skewed.employee, events: skewed.events, consents: withConsents() });
    const sig = hasSignal(a, "DQ-03");
    expect(sig.length).toBeGreaterThan(0);
    expect(sig[0].evidenceRefs.some((r) => r.startsWith("event:"))).toBe(true);
    // The future completion must not have advanced the journey.
    expect(codes(a)).not.toContain("TL-07");
  });

  test("DQ-04 active in two journeys at once", () => {
    const both = baseline([...baseline().events.slice(0, 8), ev(E, "mb_transfer_signed", "started", daysAgo(3))]);
    const a = runCase({ employee: both.employee, events: both.events, consents: withConsents() });
    expect(hasSignal(a, "DQ-04").length).toBeGreaterThan(0);
  });

  test("DQ-05 surfaces unmapped activity instead of dropping it", () => {
    const weird = baseline([...baseline().events, ev(E, "ob_time_machine", "completed", daysAgo(1))]);
    const a = runCase({ employee: weird.employee, events: weird.events, consents: withConsents() });
    expect(hasSignal(a, "DQ-05").length).toBeGreaterThan(0);
    expect(a.unmappedActivity.map((u) => u.stepKey)).toContain("ob_time_machine");
    expect(a.unmappedActivity[0].eventIds.length).toBeGreaterThan(0);
  });
});

describe("catalogue integrity", () => {
  test("exactly 42 signals in 7 families with the PRD weights", () => {
    expect(Object.keys(SIGNAL_CATALOGUE).length).toBe(42);
    const families = new Set(Object.values(SIGNAL_CATALOGUE).map((s) => s.family));
    expect([...families].sort()).toEqual(["DP", "DQ", "EN", "MB", "PS", "RQ", "TL"]);
    expect(SIGNAL_CATALOGUE["DP-02"].weight).toBe(7);
    expect(SIGNAL_CATALOGUE["PS-05"].weight).toBe(6);
    expect(SIGNAL_CATALOGUE["MB-04"].weight).toBe(6);
    expect(SIGNAL_CATALOGUE["PS-04"].weight).toBe(0);
    expect(SIGNAL_CATALOGUE["RQ-07"].weight).toBe(1);
  });

  test("every weight matches the PRD §11 table verbatim", () => {
    const specified: Record<string, number> = {
      "TL-01": 3, "TL-02": 6, "TL-03": 5, "TL-04": 4, "TL-05": 3, "TL-06": 2, "TL-07": 3, "TL-08": 1,
      "DP-01": 5, "DP-02": 7, "DP-03": 4, "DP-04": 3, "DP-05": 4, "DP-06": 5,
      "RQ-01": 3, "RQ-02": 4, "RQ-03": 4, "RQ-04": 2, "RQ-05": 5, "RQ-06": 3, "RQ-07": 1,
      "EN-01": 3, "EN-02": 2, "EN-03": 2, "EN-04": 3, "EN-05": 2,
      "PS-01": 4, "PS-02": 4, "PS-03": 3, "PS-04": 0, "PS-05": 6,
      "MB-01": 4, "MB-02": 5, "MB-03": 3, "MB-04": 6, "MB-05": 2, "MB-06": 3,
      "DQ-01": 4, "DQ-02": 2, "DQ-03": 1, "DQ-04": 3, "DQ-05": 2,
    };
    expect(Object.keys(specified).length).toBe(42);
    const drift = Object.entries(specified)
      .filter(([code, weight]) => SIGNAL_CATALOGUE[code]?.weight !== weight)
      .map(([code, weight]) => `${code} expects ${weight}, catalogue has ${SIGNAL_CATALOGUE[code]?.weight}`);
    expect(drift).toEqual([]);
    expect(Object.keys(SIGNAL_CATALOGUE).sort()).toEqual(Object.keys(specified).sort());
  });

  test("the band thresholds are the PRD fusion table", () => {
    expect(BAND_THRESHOLDS.steady).toEqual({ min: 0, max: 5 });
    expect(BAND_THRESHOLDS.watch).toEqual({ min: 6, max: 11 });
    expect(BAND_THRESHOLDS.friction).toEqual({ min: 12, max: 19 });
    expect(BAND_THRESHOLDS.blocked.min).toBe(20);
  });

  test("exactly three codes force the Blocked band", () => {
    const forced = Object.values(SIGNAL_CATALOGUE).filter((s) => s.forceBlocked).map((s) => s.code).sort();
    expect(forced).toEqual(["DP-02", "MB-04", "PS-05"]);
  });

  test("every fired code exists in the versioned catalogue", () => {
    const { employee, events } = baseline();
    const a = runCase({ employee, events, consents: withConsents() });
    for (const s of a.signals) {
      expect(SIGNAL_CATALOGUE[s.code]).toBeDefined();
      expect(s.weight).toBe(SIGNAL_CATALOGUE[s.code].weight);
      expect(s.asOf).toBe(new Date("2024-10-19T10:00:00Z").toISOString());
    }
  });

  test("no signal fires without evidence", () => {
    const { employee, events } = baseline([
      ...baseline().events.slice(0, 4),
      ev(E, "ob_visa_approval", "started", daysAgo(9)),
    ]);
    const a = runCase({ employee, events, consents: withConsents() });
    expect(a.signals.length).toBeGreaterThan(0);
    for (const s of a.signals) expect(s.evidenceRefs.length).toBeGreaterThan(0);
  });
});
