/**
 * Contract test — the stall heatmap must report only what the pack supports.
 *
 * The grid used to compute median time-to-complete from step states, but the
 * pack records a step as done with no matching start event, so all 73
 * completions measured zero hours and every visible cell rendered a confident
 * "0.0 days". Age is now reported for the subset that has a clock, and a cell
 * with no clock says so instead of claiming zero.
 */

import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

const BASE = "http://localhost:3100";
const signInRoute = await import("../../src/app/api/v1/auth/sign-in/route");
const stallsRoute = await import("../../src/app/api/v1/insights/stalls/route");

async function hrbpCookie(): Promise<string> {
  const res = await signInRoute.POST(
    new NextRequest(`${BASE}/api/v1/auth/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ employeeId: "E-1042", actingAs: "hrbp" }),
    }),
  );
  expect(res.status).toBe(200);
  const setCookies: string[] =
    typeof (res.headers as Headers).getSetCookie === "function"
      ? (res.headers as Headers).getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  const token = setCookies.join(";").match(/astrolabe_session=([^;]+)/)?.[1];
  return `astrolabe_session=${token}`;
}

interface Cell {
  stage: string;
  ownerGroup: string;
  suppressed: boolean;
  reason?: string;
  n?: number;
  employeeCount?: number;
  stalledShare?: number;
  medianDaysOpen?: number | null;
  clockedCount?: number;
  breachRate?: number | null;
}

describe("stall heatmap", () => {
  test("cells report open steps and stall share, and never a false zero age", async () => {
    const res = await stallsRoute.GET(
      new NextRequest(`${BASE}/api/v1/insights/stalls`, {
        headers: { cookie: await hrbpCookie(), "x-purpose": "aggregate_analytics" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    const cells = body.data.cells as Cell[];
    expect(cells.length).toBeGreaterThan(0);

    const shown = cells.filter((c) => !c.suppressed);
    expect(shown.length).toBeGreaterThan(0);
    let anyClocked = 0;
    for (const cell of shown) {
      // Suppression is on distinct contributing employees, not step count.
      expect(cell.employeeCount ?? 0).toBeGreaterThanOrEqual(5);
      expect(cell.n ?? 0).toBeGreaterThan(0);
      expect(cell.stalledShare).toBeGreaterThanOrEqual(0);
      expect(cell.stalledShare).toBeLessThanOrEqual(1);
      if (cell.medianDaysOpen !== null) {
        anyClocked++;
        expect(cell.medianDaysOpen ?? 0).toBeGreaterThan(0);
        expect(cell.clockedCount ?? 0).toBeGreaterThan(0);
      } else {
        expect(cell.breachRate).toBeNull();
      }
    }
    // At least one cell must actually have a measurable age, or the metric is
    // as dead as the one it replaced.
    expect(anyClocked).toBeGreaterThan(0);

    for (const cell of cells.filter((c) => c.suppressed)) {
      expect(cell.reason).toContain("n<5");
      expect(cell.n).toBeUndefined();
    }
  });
});
