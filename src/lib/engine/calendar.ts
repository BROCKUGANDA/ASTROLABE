/**
 * Working calendars and SLA clock arithmetic (PRD §10 SLA clock, §3-041..060).
 *
 * Every calculation walks the timeline one day at a time and charges only
 * working minutes: weekends and public holidays for the location are skipped,
 * approved leave windows pause the clock, and a step that is waiting on the
 * employee pauses it too. All arithmetic is rounded to whole minutes so the
 * same inputs always produce byte-identical output (PRD §19-378).
 */

import type { Employee } from "../data/pack";

export interface WorkingCalendar {
  /** 0 = Sunday. UAE government weekend is Friday/Saturday. */
  weekendDays: number[];
  /** ISO dates (YYYY-MM-DD) that are public holidays in this location. */
  holidays: string[];
  /** Working hours charged per working day. */
  workHoursPerDay: number;
}

export interface PauseWindow {
  from: string;
  to?: string | null;
  reason: string;
}

/**
 * Holiday sets cover the frozen pack clock (Oct 2024) and a full year beyond
 * it, because a live deployment reads the real clock (see clock.ts).
 * Source: UAE public holidays as published for 2024–2025; maintained by
 * Workplace Operations (PRD §3-060).
 */
export const CALENDARS: Record<string, WorkingCalendar> = {
  DXB: {
    weekendDays: [6, 5],
    holidays: [
      "2024-06-17", "2024-06-18", "2024-06-19", "2024-09-01",
      "2024-11-15", "2024-12-01", "2024-12-02", "2024-12-03",
      "2025-01-01", "2025-03-30", "2025-03-31", "2025-04-01", "2025-04-02",
      "2025-05-31", "2025-06-01", "2025-06-02", "2025-06-03", "2025-12-01",
      "2025-12-02", "2025-12-03",
    ],
    workHoursPerDay: 8,
  },
  AUH: {
    weekendDays: [6, 5],
    holidays: [
      "2024-06-17", "2024-06-18", "2024-06-19", "2024-09-01",
      "2024-11-15", "2024-12-01", "2024-12-02", "2024-12-03",
      "2025-01-01", "2025-03-30", "2025-03-31", "2025-04-01", "2025-04-02",
      "2025-05-31", "2025-06-01", "2025-06-02", "2025-06-03", "2025-12-01",
      "2025-12-02", "2025-12-03",
    ],
    workHoursPerDay: 8,
  },
  SHJ: {
    weekendDays: [0, 6],
    holidays: [
      "2024-09-01", "2024-12-02", "2024-12-03", "2025-01-01",
      "2025-03-30", "2025-03-31", "2025-05-31", "2025-12-01",
    ],
    workHoursPerDay: 8,
  },
  REMOTE: { weekendDays: [0, 6], holidays: [], workHoursPerDay: 8 },
};

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export function calendarFor(location: string): WorkingCalendar {
  return CALENDARS[location] ?? CALENDARS.DXB;
}

function roundMinutes(ms: number): number {
  return Math.round(ms / MINUTE) * MINUTE;
}

/** A calendar day is chargeable when it is neither a weekend nor a holiday. */
export function isWorkingDay(cal: WorkingCalendar, at: Date): boolean {
  if (cal.weekendDays.includes(at.getUTCDay())) return false;
  return !cal.holidays.includes(at.toISOString().slice(0, 10));
}

/**
 * Leave windows come from the employee record (PRD §3-042); a missing window
 * endpoint means the pause is still running at `asOf`.
 */
export function pauseWindowsFor(employee: Employee, waits: PauseWindow[], asOf: Date): PauseWindow[] {
  const leaves = (employee.leaveWindows ?? []).map((l) => ({ from: l.from, to: l.to, reason: l.reason }));
  return [...leaves, ...waits].filter((w) => new Date(w.from) <= asOf);
}

function overlaps(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && bFrom < aTo;
}

/** Milliseconds of `pauses` that fall inside [from, to]. */
export function pausedMsBetween(from: number, to: number, pauses: PauseWindow[], asOf: Date): number {
  if (to <= from) return 0;
  let total = 0;
  for (const p of pauses) {
    const pFrom = new Date(p.from).getTime();
    const pTo = p.to ? new Date(p.to).getTime() : asOf.getTime();
    if (!overlaps(from, to, pFrom, pTo)) continue;
    total += Math.min(to, pTo) - Math.max(from, pFrom);
  }
  return roundMinutes(Math.max(0, total));
}

/**
 * Working time inside [from, to], charging only working-day hours and
 * excluding pause windows. This is the honest denominator for a breach: a
 * delay that survives it cannot be blamed on a weekend or on approved leave.
 */
export function workingHoursBetween(
  from: number,
  to: number,
  cal: WorkingCalendar,
  pauses: PauseWindow[],
  asOf: Date
): { workingMs: number; pausedMs: number } {
  if (to <= from) return { workingMs: 0, pausedMs: 0 };
  let workingMs = 0;
  let cursor = from;
  let guard = 0;
  while (cursor < to && guard < 3650) {
    guard++;
    const day = new Date(cursor);
    const endOfDay = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
    const sliceTo = Math.min(endOfDay, to);
    if (isWorkingDay(cal, day)) {
      const paused = pausedMsBetween(cursor, sliceTo, pauses, asOf);
      const capacityMs = Math.min(cal.workHoursPerDay * 3600000, sliceTo - cursor);
      workingMs += Math.max(0, capacityMs - Math.min(paused, capacityMs));
    }
    cursor = endOfDay;
  }
  return { workingMs: roundMinutes(workingMs), pausedMs: pausedMsBetween(from, to, pauses, asOf) };
}

/**
 * due_at = start + target hours charged through the working calendar with the
 * pause windows skipped (PRD §10). A target of zero or absent is untimed: the
 * caller must not claim a breach for it (PRD §3-053).
 */
export function addWorkingHours(
  startIso: string,
  targetHours: number,
  cal: WorkingCalendar,
  pauses: PauseWindow[],
  asOf: Date
): string {
  if (!targetHours || targetHours <= 0) return startIso;
  let remaining = targetHours * 3600000;
  let cursor = new Date(startIso).getTime();
  let guard = 0;
  while (remaining > 0 && guard < 3650) {
    guard++;
    const day = new Date(cursor);
    const endOfDay = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
    if (isWorkingDay(cal, day)) {
      const paused = pausedMsBetween(cursor, endOfDay, pauses, asOf);
      const capacity = Math.min(cal.workHoursPerDay * 3600000, endOfDay - cursor) - paused;
      if (capacity >= remaining) {
        // Walk forward minute by minute inside the day so pauses are honoured.
        let step = cursor;
        let spent = 0;
        while (spent < remaining && step < endOfDay) {
          const inPause = pauses.some((p) => {
            const pTo = p.to ? new Date(p.to).getTime() : asOf.getTime();
            return step >= new Date(p.from).getTime() && step < pTo;
          });
          if (!inPause) spent += MINUTE;
          step += MINUTE;
        }
        return new Date(roundMinutes(step)).toISOString();
      }
      remaining -= Math.max(0, capacity);
    }
    cursor = endOfDay;
  }
  return new Date(roundMinutes(cursor)).toISOString();
}

export function formatWorkingHours(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / MINUTE);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
