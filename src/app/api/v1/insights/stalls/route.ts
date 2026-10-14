/**
 * ASTROLABE API — /api/v1/insights/stalls (GET)
 * Stall heatmap: per (stage × ownerGroup) cell, the median number of days an
 * open step has been sitting, its breach rate, and the reassignment rate of
 * requests routed to that owner group. Not time-to-complete: the pack records
 * a step as done without a matching start, so every completion would measure
 * zero hours and the grid would report a confident, meaningless 0.0.
 *
 * PRD §29 item 22 / PRD §11-209 — Aggregates suppress below k threshold.
 * Cells with fewer than 5 contributing employees are returned as
 * `suppressed: true` (with a `reason: "Not enough data to show safely
 * (n<5)"`) so the UI greys them out rather than surfacing a noisy median
 * computed from 1–4 journeys. The threshold is `K = 5` (PRD §11-209:
 * "Aggregate across joiners only above the k threshold"). The check is on
 * `contributors.size` (distinct employees with an open step in this
 * cell), NOT on the step count, so one employee with many open steps in the
 * same cell cannot fool the suppression.
 */
import { NextRequest } from "next/server";
import { success } from "@/lib/api/envelope";
import {
  employees,
  steps as ALL_STEPS,
  events as ALL_EVENTS,
  serviceRequests as ALL_REQUESTS,
  type Owner,
} from "@/lib/data/pack";
import { computeStepState, engineNow } from "@/lib/engine/engine";
import { guard } from "@/lib/privacy/guard";
import { appendAudit } from "@/lib/privacy/audit";

export const dynamic = "force-dynamic";

interface OpenStep {
  /**
   * Working hours the step has been sitting open, or null when the step has no
   * recorded start — most blocked steps were never opened, and averaging them
   * in as zero would understate every cell.
   */
  hoursOpen: number | null;
  breached: boolean;
  /** Blocked or waiting on someone: the stall this heatmap exists to find. */
  stalled: boolean;
  employeeId: string;
}

interface HeatmapCell {
  stage: string;
  ownerGroup: Owner["group"];
  suppressed: boolean;
  reason?: string;
  n?: number;
  employeeCount?: number;
  /** Fraction of the open steps that are blocked or waiting on someone. */
  stalledShare?: number;
  /**
   * Median working days and breach rate, over the subset with a recorded start.
   * Null when no step in the cell has one — reported as unknown rather than 0.
   */
  medianDaysOpen?: number | null;
  clockedCount?: number;
  breachRate?: number | null;
  reassignmentRate?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  // Aggregates are an HRBP/platform surface, and the read is declared and logged
  // like any other access to people's data.
  const auth = await guard(req, "insights.stalls");
  if (!auth.ok) return auth.response;
  appendAudit({
    actor: auth.session.sub,
    actorRole: auth.session.role,
    action: "insights.stalls.read",
    subject: auth.session.sub,
    lawfulBasis: "legitimate_interests",
    purpose: "aggregate_analytics",
  });
  const asOf = engineNow();

  // Build the (stage × ownerGroup) grid from the step definitions.
  const cellKeys = new Set<string>();
  for (const step of ALL_STEPS) {
    cellKeys.add(`${step.stage}|${step.ownerGroup}`);
  }

  const cells: HeatmapCell[] = [];

  for (const key of cellKeys) {
    const [stage, ownerGroup] = key.split("|") as [string, Owner["group"]];
    const cellSteps = ALL_STEPS.filter((s) => s.stage === stage && s.ownerGroup === ownerGroup);

    const openSteps: OpenStep[] = [];
    const contributors = new Set<string>();

    for (const employee of employees) {
      // Skip employees whose journeyType doesn't include this stage.
      const employeeJourneySteps = cellSteps.filter((s) => s.journeyType === employee.journeyType);
      if (employeeJourneySteps.length === 0) continue;

      const employeeEvents = ALL_EVENTS.filter((e) => e.employeeId === employee.id);

      for (const step of employeeJourneySteps) {
        const state = computeStepState(employee, step, employeeEvents, asOf);
        // Time-to-complete is not measurable from this pack: a step is recorded
        // done with no matching start, so every completion would measure zero
        // hours and the heatmap would report a confident 0.0 days. What the
        // event log does support — and what an early-warning surface is for —
        // is how long an open step has been sitting against its target.
        if (state.status === "done" || state.status === "skipped") continue;
        openSteps.push({
          hoursOpen: state.startedAt && !state.untimed ? state.workingElapsedHours : null,
          breached: state.breachLevel === "breached" || state.breachLevel === "hard",
          stalled:
            state.status === "blocked" ||
            state.status === "waiting_owner" ||
            state.status === "waiting_employee",
          employeeId: employee.id,
        });
        contributors.add(employee.id);
      }
    }

    // Reassignment rate: fraction of service requests in this ownerGroup
    // that have been reassigned at least once.
    const groupRequests = ALL_REQUESTS.filter((r) => r.ownerGroup === ownerGroup);
    const reassigned = groupRequests.filter((r) => r.reassignCount > 0).length;
    const reassignmentRate = groupRequests.length > 0 ? reassigned / groupRequests.length : 0;

    if (contributors.size < 5) {
      // PRD §29 item 22 / PRD §11-209 — k=5 suppression.
      // Returns `suppressed: true` so the heatmap renders this cell as
      // grey rather than a misleading median computed from <5 journeys.
      cells.push({
        stage,
        ownerGroup,
        suppressed: true,
        reason: "Not enough data to show safely (n<5)",
      });
      continue;
    }

    const clocked = openSteps
      .map((c) => c.hoursOpen)
      .filter((v): v is number => typeof v === "number");
    const share = (list: OpenStep[]) => (openSteps.length > 0 ? list.length / openSteps.length : 0);
    const stalledShare = share(openSteps.filter((c) => c.stalled));
    const breachRate = clocked.length > 0 ? share(openSteps.filter((c) => c.breached)) : null;

    cells.push({
      stage,
      ownerGroup,
      suppressed: false,
      n: openSteps.length,
      employeeCount: contributors.size,
      stalledShare: Math.round(stalledShare * 100) / 100,
      clockedCount: clocked.length,
      medianDaysOpen: clocked.length > 0 ? Math.round((median(clocked) / 24) * 10) / 10 : null,
      breachRate: breachRate === null ? null : Math.round(breachRate * 100) / 100,
      reassignmentRate: Math.round(reassignmentRate * 100) / 100,
    });
  }

  // Stable ordering: by stage (in step.stage order of appearance), then ownerGroup.
  const stageOrder: string[] = [];
  for (const s of ALL_STEPS) {
    if (!stageOrder.includes(s.stage)) stageOrder.push(s.stage);
  }
  cells.sort(
    (a, b) =>
      stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) ||
      a.ownerGroup.localeCompare(b.ownerGroup),
  );

  return success(
    { cells },
    {
      servedFrom: "live",
      asOf: asOf.toISOString(),
      latencyMs: Date.now() - start,
    },
  );
}
