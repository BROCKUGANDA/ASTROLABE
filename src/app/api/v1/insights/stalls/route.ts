/**
 * ASTROLABE API — /api/v1/insights/stalls (GET)
 * Stall heatmap: per (stage × ownerGroup) cell, compute median
 * time-to-complete, breach rate, and reassignment rate.
 *
 * k≥5 suppression: cells with fewer than 5 contributing employees
 * are returned as `suppressed: true` so the UI can grey them out
 * rather than show noisy medians.
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
import { computeStepState } from "@/lib/engine/engine";

export const dynamic = "force-dynamic";

interface Completion {
  timeToCompleteHours: number;
  breached: boolean;
  employeeId: string;
}

interface HeatmapCell {
  stage: string;
  ownerGroup: Owner["group"];
  suppressed: boolean;
  reason?: string;
  n?: number;
  employeeCount?: number;
  medianTimeToCompleteHours?: number;
  breachRate?: number;
  reassignmentRate?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function GET(_req: NextRequest) {
  const start = Date.now();
  const asOf = new Date();

  // Build the (stage × ownerGroup) grid from the step definitions.
  const cellKeys = new Set<string>();
  for (const step of ALL_STEPS) {
    cellKeys.add(`${step.stage}|${step.ownerGroup}`);
  }

  const cells: HeatmapCell[] = [];

  for (const key of cellKeys) {
    const [stage, ownerGroup] = key.split("|") as [string, Owner["group"]];
    const cellSteps = ALL_STEPS.filter(
      (s) => s.stage === stage && s.ownerGroup === ownerGroup
    );

    const completions: Completion[] = [];
    const contributors = new Set<string>();

    for (const employee of employees) {
      // Skip employees whose journeyType doesn't include this stage.
      const employeeJourneySteps = cellSteps.filter(
        (s) => s.journeyType === employee.journeyType
      );
      if (employeeJourneySteps.length === 0) continue;

      const employeeEvents = ALL_EVENTS.filter(
        (e) => e.employeeId === employee.id
      );

      for (const step of employeeJourneySteps) {
        const state = computeStepState(employee, step, employeeEvents, asOf);
        if (
          state.status === "done" &&
          state.startedAt &&
          state.completedAt
        ) {
          const timeToCompleteHours =
            (new Date(state.completedAt).getTime() -
              new Date(state.startedAt).getTime()) /
            3600000;
          completions.push({
            timeToCompleteHours,
            breached: timeToCompleteHours > step.targetHours,
            employeeId: employee.id,
          });
          contributors.add(employee.id);
        }
      }
    }

    // Reassignment rate: fraction of service requests in this ownerGroup
    // that have been reassigned at least once.
    const groupRequests = ALL_REQUESTS.filter((r) => r.ownerGroup === ownerGroup);
    const reassigned = groupRequests.filter((r) => r.reassignCount > 0).length;
    const reassignmentRate =
      groupRequests.length > 0 ? reassigned / groupRequests.length : 0;

    if (contributors.size < 5) {
      cells.push({
        stage,
        ownerGroup,
        suppressed: true,
        reason: "Not enough data to show safely (n<5)",
      });
      continue;
    }

    const times = completions.map((c) => c.timeToCompleteHours);
    const breachRate =
      completions.length > 0
        ? completions.filter((c) => c.breached).length / completions.length
        : 0;

    cells.push({
      stage,
      ownerGroup,
      suppressed: false,
      n: completions.length,
      employeeCount: contributors.size,
      medianTimeToCompleteHours: Math.round(median(times) * 10) / 10,
      breachRate: Math.round(breachRate * 100) / 100,
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
      a.ownerGroup.localeCompare(b.ownerGroup)
  );

  return success(
    { cells },
    {
      servedFrom: "live",
      asOf: asOf.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
