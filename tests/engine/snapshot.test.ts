/**
 * GOLDEN SNAPSHOT GATE — the engine's whole output, frozen.
 *
 * The signal and property suites assert rules ("PS-05 fires when an employee
 * pleads"). They cannot catch the failure mode a deterministic engine actually
 * has: a weight, a cap, a tie-break or an evidence string drifting by one and
 * every rule test still passing because it only checks presence, never the
 * arithmetic. This file pins the *entire serialised Assessment* for a fixed set
 * of (employee, as-of) pairs, byte for byte.
 *
 * Why it can be byte-stable: an Assessment carries its own `asOf`, and nothing
 * in the engine reads the wall clock or Math.random when the caller supplies an
 * as-of instant (clock.ts: an explicit asOf always wins). There is no uptime,
 * no Date.now, no random id in here — so two runs must produce identical bytes,
 * which is asserted below rather than assumed.
 *
 * The case list is derived, never hand-written: every employee at the frozen
 * pack clock, plus the six lowest-id employees replayed three days earlier.
 * Sorted by employee id, so adding an employee to the pack changes the list in
 * a predictable way — and the gate then demands a deliberate re-baseline:
 *
 *   UPDATE_SNAPSHOTS=1 bun test tests/engine/snapshot.test.ts
 *
 * A red run here means the engine's verdict moved. Read the diff, decide
 * whether it was supposed to, and only then re-record.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { employees, type Employee } from "../../src/lib/data/pack";
import { assess, packData, type Assessment } from "../../src/lib/engine/engine";
import { CLOCK } from "./world";

/** The frozen pack clock — the "today" every demo and replay reads against. */
const PRIMARY_CLOCK = CLOCK;

/** Three days before it: the same journeys with their later events still unseen. */
const EARLIER_CLOCK = new Date("2024-10-16T10:00:00Z");

/** How many employees are replayed at the earlier clock (lowest ids win). */
const REPLAY_COUNT = 6;

/** The committed baseline. Delete it or set UPDATE_SNAPSHOTS=1 to re-record. */
const SNAPSHOT_PATH = join(import.meta.dir, "__snapshots__", "assessments.golden.json");

/**
 * One recorded verdict. `id` is the case key used in failure reports, so a
 * drift names the employee and the clock instead of "index 7 differs".
 */
export interface SnapshotCase {
  id: string;
  employeeId: string;
  asOf: string;
  assessment: Assessment;
}

/**
 * Canonical JSON: object keys sorted recursively, array order preserved.
 * The engine already builds its objects in a stable order, and its arrays are
 * sorted by explicit tie-breaks — but "already sorted" is a property of the
 * current code, not a contract. Sorting here makes key order a property of the
 * snapshot format instead, so a refactor that reorders a literal cannot fake a
 * behavioural change. Sets serialise as sorted arrays for the same reason.
 */
export function canonical(value: unknown): unknown {
  if (value instanceof Set) return [...value].map(canonical).sort(compareStrings);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort(compareStrings)) {
      const entry = canonical(source[key]);
      if (entry !== undefined) out[key] = entry;
    }
    return out;
  }
  return value;
}

function compareStrings(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b));
}

export function serialize(cases: SnapshotCase[]): string {
  return JSON.stringify({ cases: canonical(cases) }, null, 2) + "\n";
}

/**
 * The case list: every employee at the frozen clock, then the six lowest ids at
 * the earlier clock. Both halves sorted by employee id, so the order depends on
 * the data pack alone.
 */
export function buildCaseList(): SnapshotCase[] {
  const byId = [...employees].sort((a, b) => a.id.localeCompare(b.id));
  const replayIds = byId.slice(0, Math.min(REPLAY_COUNT, byId.length)).map((e) => e.id);

  const build = (employee: Employee, asOf: Date): SnapshotCase => ({
    id: `${employee.id}@${asOf.toISOString()}`,
    employeeId: employee.id,
    asOf: asOf.toISOString(),
    assessment: assess(employee, asOf, packData()),
  });

  return [
    ...byId.map((e) => build(e, PRIMARY_CLOCK)),
    ...byId.filter((e) => replayIds.includes(e.id)).map((e) => build(e, EARLIER_CLOCK)),
  ];
}

/**
 * The ids that moved, so a failure is a list of cases to read rather than a
 * blob of JSON to eyeball. Compares per case, after parsing both sides, but the
 * gate below only reaches this when the raw bytes already differ.
 */
export function driftedCaseIds(goldenText: string, currentText: string): string[] {
  const parse = (text: string): Map<string, string> => {
    const out = new Map<string, string>();
    let parsed: { cases?: SnapshotCase[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      return out;
    }
    for (const item of parsed.cases ?? []) out.set(item.id, JSON.stringify(canonical(item)));
    return out;
  };

  const golden = parse(goldenText);
  const current = parse(currentText);
  const drifted: string[] = [];

  for (const [id, payload] of current) {
    if (!golden.has(id)) drifted.push(`${id}  (new case, not in the golden file)`);
    else if (golden.get(id) !== payload) drifted.push(id);
  }
  for (const id of golden.keys()) {
    if (!current.has(id)) drifted.push(`${id}  (gone from the produced snapshot)`);
  }
  return drifted.sort();
}

/** Line endings are the one thing that is not a verdict: normalise CRLF to LF. */
function readSnapshot(): string {
  return readFileSync(SNAPSHOT_PATH, "utf8").replace(/\r\n/g, "\n");
}

function writeSnapshot(text: string): void {
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, text, "utf8");
}

const UPDATE = process.env.UPDATE_SNAPSHOTS === "1";

describe("golden snapshot — engine verdicts are frozen", () => {
  test("the case list is exactly 20: every employee plus six low-id replays", () => {
    expect(employees.length).toBe(14);
    const cases = buildCaseList();
    expect(cases.length).toBe(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(20);

    const atPrimary = cases.filter((c) => c.asOf === PRIMARY_CLOCK.toISOString());
    const atEarlier = cases.filter((c) => c.asOf === EARLIER_CLOCK.toISOString());
    expect(atPrimary.length).toBe(14);
    expect(atEarlier.length).toBe(6);
    expect(atEarlier.map((c) => c.employeeId)).toEqual([
      "E-1042", "E-1043", "E-1044", "E-1045", "E-1046", "E-1047",
    ]);

    // Every employee appears once at the primary clock and the earlier replays
    // are a subset of them — the list is a derivation, not a hand-picked set.
    for (const c of atEarlier) {
      expect(atPrimary.some((p) => p.employeeId === c.employeeId)).toBe(true);
    }
  });

  test("two consecutive runs are byte-identical (no clock, no randomness)", () => {
    const first = serialize(buildCaseList());
    const second = serialize(buildCaseList());
    expect(second.length).toBe(first.length);
    expect(second).toBe(first);

    // A third run after touching the live-clock switch must still agree: the
    // snapshot always passes an explicit as-of, so ASTROLABE_LIVE_CLOCK is
    // irrelevant here by construction.
    const before = process.env.ASTROLABE_LIVE_CLOCK;
    process.env.ASTROLABE_LIVE_CLOCK = "1";
    try {
      expect(serialize(buildCaseList())).toBe(first);
    } finally {
      if (before === undefined) delete process.env.ASTROLABE_LIVE_CLOCK;
      else process.env.ASTROLABE_LIVE_CLOCK = before;
    }
  });

  test("the produced assessments match the committed golden file byte for byte", () => {
    const current = serialize(buildCaseList());

    if (!existsSync(SNAPSHOT_PATH) || UPDATE) {
      const reason = UPDATE ? "UPDATE_SNAPSHOTS=1" : "the golden file does not exist yet";
      writeSnapshot(current);
      // Prove the recording is readable and re-serialisable, not just written.
      expect(readSnapshot()).toBe(current);
      const recorded = JSON.parse(current) as { cases: SnapshotCase[] };
      expect(recorded.cases.length).toBe(20);
      console.log(
        [
          "",
          "############################################################",
          `# GOLDEN SNAPSHOT RE-RECORDING — ${reason}`,
          `# wrote ${SNAPSHOT_PATH}`,
          `# ${recorded.cases.length} cases, ${current.length} bytes.`,
          "# This run PASSES BY DESIGN. Commit the file, then re-run",
          "#   bun test tests/engine/snapshot.test.ts",
          "# with no UPDATE_SNAPSHOTS to check the baseline holds.",
          "############################################################",
          "",
        ].join("\n")
      );
      return;
    }

    const golden = readSnapshot();
    if (golden !== current) {
      const drifted = driftedCaseIds(golden, current);
      const lines = drifted.map((d) => `  - ${d}`).join("\n");
      const driftBytes = Math.abs(golden.length - current.length);
      throw new Error(
        [
          `Golden snapshot drift: ${drifted.length} of 20 cases disagree with`,
          `${SNAPSHOT_PATH} (${driftBytes} bytes of length difference).`,
          "",
          "Drifted case ids:",
          lines,
          "",
          "Read the diff before you re-record — this gate exists because an",
          "engine verdict moved. If it was supposed to:",
          "  UPDATE_SNAPSHOTS=1 bun test tests/engine/snapshot.test.ts",
          "and commit the regenerated file with the change that caused it.",
        ].join("\n")
      );
    }

    // Same assertion in the readable form, so a failure output names the count.
    expect(golden).toBe(current);
  });
});
