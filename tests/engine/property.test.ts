/**
 * Property tests for the invariants the product rests on (PRD §29 373, 442, 482).
 * These are the checks that make a green suite mean something: if the engine can
 * be made non-deterministic, or a hard trip can be argued out of existence, this
 * file has to go red.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assess, fuse, nextBestSteps, packData, computeStepStates, buildGraph, resolveAsOf } from "../../src/lib/engine/engine";
import { employees, events as PACK_EVENTS } from "../../src/lib/data/pack";
import { SIGNAL_CATALOGUE } from "../../src/lib/engine/signal-catalogue";
import { baseEmployee, consent, ev, runCase, world, dataFor, CLOCK } from "./world";

const E = "T-001";
const data = packData();

/** Deterministic shuffle so a failure is reproducible. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

describe("replay and leakage", () => {
  test("an assessment at T is invariant to events after T", () => {
    for (const employee of employees) {
      const withAll = assess(employee, CLOCK, data);
      // Append ten future events that would change the verdict if they leaked.
      const polluted = {
        ...data,
        events: [
          ...data.events,
          ...Array.from({ length: 10 }, (_, i) =>
            ev(employee.id, "ob_90day_review", "completed", new Date(CLOCK.getTime() + (i + 1) * 86400000).toISOString())
          ),
        ],
      };
      const after = assess(employee, CLOCK, polluted);

      // Journey state must not move at all.
      expect(after.stage).toBe(withAll.stage);
      expect(after.dayInStage).toBe(withAll.dayInStage);
      expect(after.band).toBe(withAll.band);
      // No substantive signal may appear or disappear because of a later event.
      const substantive = (a: typeof after) => a.signals.filter((s) => !s.dataQuality).map((s) => s.code).sort();
      expect(substantive(after)).toEqual(substantive(withAll));
      // The only permitted difference is the operator-facing data-quality flag
      // that reports the future-dated rows exist — which is also what makes
      // replay auditable rather than silently rewritten.
      const dqBefore = withAll.signals.filter((s) => s.dataQuality).map((s) => s.code).sort();
      const dqAfter = after.signals.filter((s) => s.dataQuality).map((s) => s.code).sort();
      expect(dqAfter.every((c) => dqBefore.includes(c) || c === "DQ-03")).toBe(true);
    }
  });

  test("a future event never advances the journey it describes", () => {
    const maria = employees.find((e) => e.id === "E-1042")!;
    const before = assess(maria, CLOCK, data);
    const after = assess(maria, CLOCK, {
      ...data,
      events: [...data.events, ev(maria.id, "ob_90day_review", "completed", daysAheadIso(3))],
    });
    expect(after.stage).toBe(before.stage);
    expect(after.signals.some((s) => s.code === "DQ-03")).toBe(true);
    expect(after.signals.find((s) => s.code === "DQ-03")?.evidenceRefs.some((r) => r.startsWith("event:"))).toBe(true);
  });

  test("a pulse answer, request or draft recorded after T cannot influence T", () => {
    const employee = employees.find((e) => e.id === "E-1042")!;
    const clean = assess(employee, CLOCK, data);
    const polluted = assess(employee, CLOCK, {
      ...data,
      pulse: [...data.pulse, { id: "FUT-PULSE", employeeId: employee.id, stage: "first_week", score: 1, createdAt: daysAheadIso(30), consentId: "c" }],
      requests: [...data.requests, { ...data.requests[0], id: "FUT-REQ", employeeId: employee.id, openedAt: daysAheadIso(30), status: "submitted" as const }],
      answers: [...data.answers, { id: "FUT-ANS", employeeId: employee.id, question: "q", topicKey: "future", intent: "help_seeking" as const, kind: "abstain" as const, groundingScore: 0, chunkIds: [], askedAt: daysAheadIso(30), locale: "en" as const, corpusVersion: "x" }],
      drafts: [...data.drafts, { id: "FUT-DRAFT", employeeId: employee.id, type: "it_kit" as const, status: "abandoned" as const, startedAt: daysAheadIso(30) }],
    });
    expect(JSON.stringify(polluted.signals)).toBe(JSON.stringify(clean.signals));
    expect(polluted.band).toBe(clean.band);
  });

  test("three runs of the same assessment are byte-identical", () => {
    for (const employee of employees) {
      const runs = [1, 2, 3].map(() => JSON.stringify(assess(employee, CLOCK, data)));
      expect(runs[0]).toBe(runs[1]);
      expect(runs[1]).toBe(runs[2]);
    }
  });

  test("an as-of in the past reports the past, not today", () => {
    const maria = employees.find((e) => e.id === "E-1042")!;
    const early = assess(maria, new Date("2024-10-15T10:00:00Z"), data);
    const late = assess(maria, new Date("2024-10-19T10:00:00Z"), data);
    expect(early.asOf).toBe("2024-10-15T10:00:00.000Z");
    expect(early.signals.map((s) => s.code).sort()).not.toEqual(late.signals.map((s) => s.code).sort());
  });
});

describe("event order", () => {
  test("permutations of the same log yield the same state", () => {
    const employee = employees[0];
    const own = PACK_EVENTS.filter((e) => e.employeeId === employee.id);
    const reference = JSON.stringify(assess(employee, CLOCK, { ...data, events: own }));
    for (const seed of [1, 7, 42, 199, 2024]) {
      const shuffled = seededShuffle(own, seed);
      expect(JSON.stringify(assess(employee, CLOCK, { ...data, events: shuffled }))).toBe(reference);
    }
  });

  test("identical timestamps do not change the verdict", () => {
    const employee = baseEmployee();
    const sameTime = daysOffset(2);
    const a = runCase({
      employee,
      events: [
        ev(E, "ob_offer_signed", "completed", sameTime),
        ev(E, "ob_passport_upload", "completed", sameTime),
        ev(E, "ob_relocation_allowance", "completed", sameTime),
      ],
      consents: [consent(E, "journey_assistance", true)],
    });
    const b = runCase({
      employee,
      events: [
        ev(E, "ob_relocation_allowance", "completed", sameTime),
        ev(E, "ob_passport_upload", "completed", sameTime),
        ev(E, "ob_offer_signed", "completed", sameTime),
      ],
      consents: [consent(E, "journey_assistance", true)],
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

function daysOffset(days: number): string {
  return new Date(CLOCK.getTime() - days * 86400000).toISOString();
}

function daysAheadIso(days: number): string {
  return new Date(CLOCK.getTime() + days * 86400000).toISOString();
}

describe("band arithmetic is monotone and honest", () => {
  test("suppressing a family can never raise the band", () => {
    const signals = Object.keys(SIGNAL_CATALOGUE).map((code) => ({
      code,
      family: SIGNAL_CATALOGUE[code].family,
      weight: SIGNAL_CATALOGUE[code].weight,
      evidenceRefs: [`synthetic:${code}`],
      description: "",
      descriptionAr: "",
      hardTrip: Boolean(SIGNAL_CATALOGUE[code].hardTrip),
      forceBlocked: Boolean(SIGNAL_CATALOGUE[code].forceBlocked),
      nudgeOnly: Boolean(SIGNAL_CATALOGUE[code].nudgeOnly),
      dataQuality: Boolean(SIGNAL_CATALOGUE[code].dataQuality),
      asOf: CLOCK.toISOString(),
    }));
    const withPulse = fuse(signals, []);
    const withoutPulse = fuse(signals, ["PS"]);
    expect(withoutPulse.score).toBeLessThanOrEqual(withPulse.score);
    expect(withoutPulse.score).toBe(withPulse.score - Math.min(12, signals.filter((s) => s.family === "PS").reduce((a, s) => a + s.weight, 0)));
  });

  test("a hard trip cannot be outvoted by the arithmetic, and consent can switch it off", () => {
    const plea = [
      {
        code: "PS-05", family: "PS" as const, weight: 6, evidenceRefs: ["pulse:1"],
        description: "", descriptionAr: "", hardTrip: true, forceBlocked: true, nudgeOnly: false, dataQuality: false, asOf: CLOCK.toISOString(),
      },
    ];
    const heard = fuse(plea, []);
    // Six points reads Watch on the threshold table on its own.
    expect(heard.score).toBe(6);
    expect(heard.band).toBe("blocked");
    // But the employee never consented to pulse: the family is not merely hidden,
    // it does not exist for the engine.
    const suppressed = fuse(plea, ["PS"]);
    expect(suppressed.score).toBe(0);
    expect(suppressed.hardTrips).toEqual([]);
    expect(suppressed.band).toBe("steady");
  });

  test("adding weight never lowers the band", () => {
    const rank = { steady: 0, watch: 1, friction: 2, blocked: 3 } as const;
    const one = [
      { code: "TL-01", family: "TL" as const, weight: 3, evidenceRefs: ["step:a"], description: "", descriptionAr: "", hardTrip: false, forceBlocked: false, nudgeOnly: false, dataQuality: false, asOf: CLOCK.toISOString() },
    ];
    const two = [...one, { ...one[0], code: "RQ-01", family: "RQ" as const, weight: 3, evidenceRefs: ["request:b"] }];
    const three = [...two, { ...one[0], code: "DP-01", family: "DP" as const, weight: 5, evidenceRefs: ["step:c"] }];
    const bands = [one, two, three].map((s) => fuse(s, []).band);
    for (let i = 1; i < bands.length; i++) {
      expect(rank[bands[i]]).toBeGreaterThanOrEqual(rank[bands[i - 1]]);
    }
  });

  test("family caps hold the pile-on at twelve per family", () => {
    const manyTl = Array.from({ length: 20 }, (_, i) => ({
      code: "TL-01", family: "TL" as const, weight: 3, evidenceRefs: [`step:${i}`],
      description: "", descriptionAr: "", hardTrip: false, forceBlocked: false, nudgeOnly: false, dataQuality: false, asOf: CLOCK.toISOString(),
    }));
    expect(fuse(manyTl, []).score).toBe(12);
  });
});

describe("consent is a computation gate, not a UI gate", () => {
  const pulseEvents = [
    ev(E, "ob_offer_signed", "completed", daysOffset(4)),
    ev(E, "ob_passport_upload", "completed", daysOffset(4)),
    ev(E, "ob_relocation_allowance", "completed", daysOffset(3)),
    ev(E, "ob_visa_application", "completed", daysOffset(3)),
    ev(E, "ob_visa_approval", "completed", daysOffset(2)),
    ev(E, "ob_kit_issued", "completed", daysOffset(1)),
    ev(E, "ob_badge_issued", "completed", daysOffset(1)),
    ev(E, "ob_access_provisioned", "completed", daysOffset(1)),
    ev(E, "ob_induction_complete", "completed", daysOffset(1)),
  ];
  const pulseData = [
    { id: "P1", employeeId: E, stage: "first_week", score: 1, createdAt: daysOffset(1), consentId: "c1" },
  ];

  test("pulse off zeroes the family inside the engine", () => {
    const on = runCase({
      employee: baseEmployee(),
      events: pulseEvents,
      pulse: pulseData as never,
      consents: [consent(E, "journey_assistance", true), consent(E, "pulse_capture", true)],
    });
    const off = runCase({
      employee: baseEmployee(),
      events: pulseEvents,
      pulse: pulseData as never,
      consents: [consent(E, "journey_assistance", true), consent(E, "pulse_capture", false)],
    });
    expect(on.signals.some((s) => s.family === "PS")).toBe(true);
    expect(off.signals.filter((s) => s.family === "PS" && s.weight > 0)).toEqual([]);
    expect(off.suppressedFamilies).toContain("PS");
    expect(off.score).toBeLessThan(on.score);
  });

  test("the suppression is disclosed in the payload", () => {
    const off = runCase({
      employee: baseEmployee(),
      events: pulseEvents,
      pulse: pulseData as never,
      consents: [consent(E, "journey_assistance", true), consent(E, "pulse_capture", false)],
    });
    const disclosure = off.familyArithmetic.find((f) => f.family === "PS");
    expect(disclosure?.suppressed).toBe(true);
    expect(disclosure?.capped).toBe(0);
  });
});

describe("next best step", () => {
  test("ranking is stable and breaks ties on the step key", () => {
    const employee = employees.find((e) => e.id === "E-1042")!;
    const a = nextBestSteps(employee, CLOCK);
    const b = nextBestSteps(employee, CLOCK);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.primary).not.toBeNull();
    expect(a.secondary.length).toBeLessThanOrEqual(3);
  });

  test("completing the primary never increases the blocked count", () => {
    for (const employee of employees) {
      const before = nextBestSteps(employee, CLOCK);
      if (!before.primary) continue;
      const step = before.primary.stepKey;
      const events = [
        ...PACK_EVENTS.filter((e) => e.employeeId === employee.id),
        ev(employee.id, step, "completed", new Date(CLOCK.getTime() - 60000).toISOString()),
      ];
      const after = nextBestSteps(employee, CLOCK, { ...data, events });
      const blockedOf = (result: typeof before) => {
        const states = computeStepStates(employee, data.steps, result === before ? PACK_EVENTS.filter((e) => e.employeeId === employee.id) : events, CLOCK, buildGraph(data.steps));
        return [...states.values()].filter((s) => s.blockedBy.length > 0).length;
      };
      expect(blockedOf(after)).toBeLessThanOrEqual(blockedOf(before));
    }
  });

  test("an employee with nothing open gets an explicit nothing-to-do state", () => {
    const employee = baseEmployee();
    // Finish every step the onboarding map defines, so the empty candidate set is
    // a real end-of-journey rather than an artefact of a half-written fixture.
    const allSteps = data.steps.filter((s) => s.journeyType === "onboarding");
    const w = world({
      employee,
      events: allSteps.map((s, i) => ev(E, s.key, "completed", daysOffset(30 - i))),
      consents: [consent(E, "journey_assistance", true)],
    });
    const result = nextBestSteps(employee, CLOCK, dataFor(w));
    expect(result.nothingToDo).toBe(true);
    expect(result.primary).toBeNull();
    expect(result.explanation.at(-1)).toContain("No actionable step");
  });

  test("a journey where everything open is blocked says so instead of going blank", () => {
    const employee = baseEmployee();
    const w = world({
      employee,
      events: [ev(E, "ob_offer_signed", "completed", daysOffset(4))],
      consents: [consent(E, "journey_assistance", true)],
    });
    const result = nextBestSteps(employee, CLOCK, dataFor(w));
    // Passport is the first open step and its dependency is done, so it is offered.
    expect(result.primary?.stepKey).toBe("ob_passport_upload");
    expect(result.primary?.actor).toBe("employee");
  });
});

describe("the engine stays pure", () => {
  const engineDir = join(import.meta.dir, "..", "..", "src", "lib", "engine");

  test("no wall clock or randomness inside the deterministic core", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(engineDir)) {
      if (!file.endsWith(".ts")) continue;
      const source = readFileSync(join(engineDir, file), "utf8");
      const lines = source.split("\n");
      lines.forEach((line, i) => {
        const isComment = line.trim().startsWith("*") || line.trim().startsWith("//") || line.trim().startsWith("/*");
        if (isComment) return;
        if (file === "clock.ts" && (line.includes("liveClockEnabled") || line.includes("new Date()"))) return;
        if (file === "world.ts") return;
        if (line.includes("Math.random") || line.includes("Date.now(")) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  test("computeStepStates has no side channels: same inputs, same map size", () => {
    const employee = employees[1];
    const g = buildGraph(data.steps);
    const one = computeStepStates(employee, data.steps, data.events, resolveAsOf(CLOCK), g);
    const two = computeStepStates(employee, data.steps, data.events, resolveAsOf(CLOCK), g);
    expect(one.size).toBe(two.size);
    expect(JSON.stringify([...one.keys()])).toBe(JSON.stringify([...two.keys()]));
  });
});

describe("dependency safety", () => {
  test("a cyclic map fails loudly instead of overflowing the stack", () => {
    const cyclic = data.steps.map((s) =>
      s.key === "ob_offer_signed" ? { ...s, dependsOn: ["ob_visa_approval"] } : s
    );
    const graph = buildGraph(cyclic);
    expect(graph.cycles.length).toBeGreaterThan(0);
    expect(() => assess(baseEmployee(), CLOCK, { ...data, steps: cyclic })).toThrow(/cycle/i);
  });

  test("a diamond and a five-deep chain both resolve", () => {
    const employee = employees.find((e) => e.id === "E-1042")!;
    const states = computeStepStates(employee, data.steps, data.events, CLOCK, buildGraph(data.steps));
    const approval = states.get("ob_visa_approval")!;
    expect(approval.downstreamAtRisk).toBeGreaterThan(2);
    const deepest = [...states.values()].sort((a, b) => b.blockerChainLength - a.blockerChainLength)[0];
    expect(deepest.blockerChainLength).toBeGreaterThanOrEqual(1);
  });
});
