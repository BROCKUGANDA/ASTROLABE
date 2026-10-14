/**
 * ASTROLABE backtest GATES — the same computation `bun run backtest` prints.
 *
 * This file does not re-derive anything: `runBacktest()` is called ONCE at module
 * load and every test reads that single Scorecard. It exists so a regression in
 * routing, friction detection, grounding, privacy abstention, injection
 * resistance, determinism, as-of isolation, latency or slice fairness blocks
 * `bun test` instead of being noticed in a demo.
 *
 * KNOWN RED GATES are declared below and are ASSERTED to still be red, while the
 * green part of their behaviour stays gated. That is a defect register, not a
 * weakened metric: fix the engine and these tests fail until the gate is moved
 * back into the green list.
 */

import { describe, expect, test } from "bun:test";
import { runBacktest, scorecardMarkdown, type Gate, type Scorecard } from "../../scripts/backtest";

/** One run, shared by every assertion in this file. */
const sc: Scorecard = runBacktest();

/**
 * Gates that are red because of a real engine/retriever defect, not because of a
 * harness problem. This list must be empty once the defects are fixed.
 *
 * Both entries were closed on 2026-10-14 and are re-asserted as fixed below, so
 * a regression re-opens the register instead of silently passing.
 */
const KNOWN_RED: Record<string, string> = {};

/** Gates this suite demands be green. */
const MUST_BE_GREEN = [
  // Moved from the defect register on 2026-10-14 once the Arabic abstention
  // categories and the DQ-03 as-of charge were fixed; they belong to the green
  // set now, so a regression fails this suite rather than re-opening a waiver.
  "abstain_correctness",
  "leakage",
  "routing_accuracy",
  "friction_recall",
  "friction_precision",
  "citation_presence",
  "hallucinated_claims",
  "false_escalation",
  "injection_delta",
  "scenario_assertions",
  "replay_determinism",
  "hot_path_latency",
  "fairness_divergence",
];

function gate(id: string): Gate {
  const g = sc.gates.find((x) => x.id === id);
  if (!g) throw new Error(`gate '${id}' is missing from the scorecard — the harness changed its metric ids`);
  return g;
}

/** Asserts with the case id visible in the diff, so a failure names the culprit. */
function same(label: string, actual: unknown, expected: unknown): void {
  expect(`${label} → ${JSON.stringify(actual)}`).toBe(`${label} → ${JSON.stringify(expected)}`);
}

describe("1 · pack baseline", () => {
  test("assesses every employee in the pack at the frozen clock", () => {
    expect(sc.baseline.n).toBe(14);
    expect(Object.values(sc.baseline.bands).reduce((a, b) => a + b, 0)).toBe(14);
    expect(sc.baseline.rows.length).toBe(14);
  });

  test("the baseline is not vacuously uniform (it must be able to prove a spread)", () => {
    expect(Object.values(sc.baseline.bands).filter((v) => v > 0).length).toBeGreaterThanOrEqual(2);
    expect(sc.baseline.scores.max).toBeGreaterThan(sc.baseline.scores.min);
  });
});

describe("2 · labelled scenarios (PRD §22 dataset b)", () => {
  test("there are exactly 12, each with a unique id", () => {
    expect(sc.labelled.length).toBe(12);
    expect(new Set(sc.labelled.map((l) => l.id)).size).toBe(12);
  });

  test("every scenario's band matches its label exactly", () => {
    for (const l of sc.labelled) same(`${l.id} band`, l.actualBand, l.expectedBand);
  });

  test("every scenario routes to its labelled owner group", () => {
    for (const l of sc.labelled) same(`${l.id} routed owner group`, l.actualRoute, l.expectedRoute);
  });

  test("every citation-labelled scenario carries document + section + effective date", () => {
    const cited = sc.labelled.filter((l) => l.expectedCitation);
    expect(cited.length).toBeGreaterThanOrEqual(6);
    for (const l of cited) {
      const found =
        l.policy?.citations.some(
          (c) =>
            c.docSlug === l.expectedCitation?.docSlug &&
            c.section === l.expectedCitation?.section &&
            c.hasDoc &&
            c.hasSection &&
            c.hasEffectiveDate
        ) ?? false;
      same(`${l.id} cites ${l.expectedCitation?.docSlug}#${l.expectedCitation?.section} with an effective date`, found, true);
    }
  });

  test("the colleague question abstains and cites nothing", () => {
    const l = sc.labelled.find((x) => x.id === "L10");
    same("L10 kind", l?.policy?.kind, "abstain");
    same("L10 abstain reason", l?.policy?.abstainReasonCode, "about_another_employee");
    expect(l?.policy?.citations.length).toBe(0);
  });

  test("the Arabic scenario never presents English text as Arabic", () => {
    const l = sc.labelled.find((x) => x.id === "L11");
    const langs = (l?.policy?.citations ?? []).map((c) => c.lang);
    same("L11 citation languages", [...new Set(langs)].join(","), "ar");
    expect(l?.assertions.every((a) => a.ok)).toBe(true);
  });

  test("the empty event log produces the not-started state instead of crashing", () => {
    const l = sc.labelled.find((x) => x.id === "L12");
    same("L12 band", l?.actualBand, "steady");
    same(
      "L12 not-started assertion",
      l?.assertions.some((a) => a.name.includes("not-started state") && a.ok),
      true
    );
  });

  test("no labelled scenario has a failing assertion", () => {
    const failures = sc.labelled.flatMap((l) => l.assertions.filter((a) => !a.ok).map((a) => `${l.id}: ${a.name} — ${a.detail}`));
    expect(failures).toEqual([]);
  });
});

describe("3 · adversarial cases (PRD §22 dataset c)", () => {
  test("there are exactly 8, and the injection pair is measured as a delta", () => {
    expect(sc.adversarial.map((a) => a.id)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"]);
    expect(sc.adversarial.filter((a) => a.kind === "injection").length).toBeGreaterThanOrEqual(2);
  });

  test("injection cases leave band, score, route and step untouched", () => {
    for (const a of sc.adversarial.filter((x) => x.kind === "injection")) {
      same(`${a.id} changed fields`, a.changed, []);
      same(`${a.id} band`, a.injected?.band, a.control?.band);
      same(`${a.id} score`, a.injected?.score, a.control?.score);
      same(`${a.id} route`, a.injected?.route, a.control?.route);
      same(`${a.id} step`, a.injected?.stepKey, a.control?.stepKey);
    }
  });

  test("no adversarial case has a failing assertion", () => {
    const failures = sc.adversarial.flatMap((a) => a.assertions.filter((x) => !x.ok).map((x) => `${a.id}: ${x.name} — ${x.detail}`));
    expect(failures).toEqual([]);
  });
});

describe("4 · metric gates that must be green", () => {
  for (const id of MUST_BE_GREEN) {
    test(`${id} is green`, () => {
      const g = gate(id);
      same(`${id} (${g.valueText} vs ${g.direction} ${g.threshold}) → ${g.detail}`, g.pass, true);
    });
  }

  test("every gate is either green or in the known-defect register", () => {
    const accounted = new Set([...MUST_BE_GREEN, ...Object.keys(KNOWN_RED)]);
    const unaccounted = sc.gates.filter((g) => !accounted.has(g.id)).map((g) => g.id);
    expect(unaccounted).toEqual([]);
    expect(gate("scenario_assertions").value).toBe(0);
  });
});

describe("5 · registered defects, closed and re-asserted so a regression re-opens them", () => {
  test("the register is empty and no gate is red", () => {
    expect(Object.keys(KNOWN_RED)).toEqual([]);
    expect(sc.gates.filter((g) => !g.pass).map((g) => g.id)).toEqual([]);
  });

  test("Arabic abstention equals English abstention on every gated category", () => {
    for (const locale of ["en", "ar"] as const) {
      const gated = sc.abstainSet.filter((p) => p.gated !== false && p.locale === locale);
      // Guard against a vacuous pass: the set has to actually contain the categories.
      expect(gated.length, `${locale} must-abstain set is empty`).toBeGreaterThanOrEqual(4);
      const leaks = gated.filter((p) => p.kind !== "abstain").map((p) => p.question);
      expect(leaks, `answered instead of abstaining: ${leaks.join(" | ")}`).toEqual([]);
    }
    expect(gate("abstain_correctness").pass).toBe(true);
  });

  test("a row dated after the clock moves neither the score nor the band", async () => {
    const { assess, packData } = await import("@/lib/engine/engine");
    const { employees, events } = await import("@/lib/data/pack");
    const clock = new Date("2024-10-19T10:00:00Z");
    for (const employee of employees) {
      const baseline = assess(employee, clock, packData());
      const polluted = {
        ...packData(),
        events: [
          ...events,
          {
            id: `LEAK-${employee.id}`, employeeId: employee.id, stepKey: "ob_90day_review",
            type: "completed" as const, occurredAt: "2024-11-09T10:00:00Z",
            recordedAt: "2024-10-19T10:00:00Z", source: "leak-test", payloadHash: "leak",
          },
        ],
      };
      const after = assess(employee, clock, polluted);
      // The disclosure may appear, because an operator must see clock skew...
      expect(after.signals.some((s: { code: string }) => s.code === "DQ-03")).toBe(true);
      // ...but it may not change the verdict.
      expect(after.score).toBe(baseline.score);
      expect(after.band).toBe(baseline.band);
    }
  });
});

describe("6 · fairness, determinism, latency", () => {
  test("all three slice dimensions are reported even when the pack cannot support them", () => {
    expect(sc.fairness.map((f) => f.dimension).sort()).toEqual(["locale", "location", "nationality"]);
    const nat = sc.fairness.find((f) => f.dimension === "nationality");
    expect(nat?.supported).toBe(false);
    expect(nat?.rawMaxAllSlices).toBeGreaterThan(0.15); // disclosed, not gated: n=1 slices prove nothing
  });

  test("gated slice divergence is at most 15%", () => {
    expect(gate("fairness_divergence").value).toBeLessThanOrEqual(0.15);
  });

  test("replay determinism was actually measured across fresh processes", () => {
    expect(sc.determinism.processMeasured).toBe(true);
    expect(sc.determinism.processIdentical).toBe(true);
    expect(sc.determinism.inProcessIdentical).toBe(true);
    expect(sc.determinism.hashes[0]).toBe(sc.determinism.hashes[2]);
  });

  test("hot-path p95 stays under 300ms over the whole pack", () => {
    expect(sc.latency.samples).toBeGreaterThanOrEqual(14);
    expect(sc.latency.p95).toBeLessThanOrEqual(300);
  });
});

describe("7 · scorecard output contract", () => {
  test("the final line is SCORECARD: PASS or SCORECARD: FAIL (n gates red)", () => {
    const md = scorecardMarkdown(sc);
    const red = sc.gates.filter((g) => !g.pass).length;
    const expected = red === 0 ? "**SCORECARD: PASS**" : `**SCORECARD: FAIL (${red} gates red)**`;
    expect(md.trimEnd().endsWith(expected)).toBe(true);
  });

  test("every gate appears in the markdown table with its value and threshold", () => {
    const md = scorecardMarkdown(sc);
    for (const g of sc.gates) {
      expect(md).toContain(g.metric);
      expect(md).toContain(g.valueText);
    }
  });
});
