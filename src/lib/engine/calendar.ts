/**
 * Working calendars and SLA clock arithmetic (PRD §10 SLA clock, §29 041–060).
 *
 * The model: a step accrues time only on its location's working days. A weekend
 * or a public holiday is a full-day pause, not an 8-hour capacity budget — the
 * targets in the map are calendar hours (168h is one week), so discounting whole
 * days keeps "3 days late" readable by an HR person while still refusing to blame
 * anyone for a Friday. Approved leave and a step waiting on the employee pause the
 * clock the same way, and both are shown to the employee as paused time rather
 * than silently subtracted.
 *
 * Arithmetic is rounded to whole minutes so two runs produce identical bytes.
 */

import type { Employee } from "../data/pack";

export interface WorkingCalendar {
  /** 0 = Sunday. The UAE government weekend is Friday/Saturday. */
  weekendDays: number[];
  /** ISO dates (YYYY-MM-DD) that are public holidays in this location. */
  holidays: string[];
}

export interface PauseWindow {
  from: string;
  to?: string | null;
  reason: string;
}

export interface ElapsedSplit {
  /** Wall-clock milliseconds between the two instants. */
  wallMs: number;
  /** Wall time that counts against the target (weekends, holidays and pauses removed). */
  chargeableMs: number;
  /** Time the clock was legitimately stopped, with the reason owned by the caller. */
  pausedMs: number;
}

/**
 * Holiday sets cover the frozen pack clock and a year beyond it, because a live
 * deployment reads the real clock (see clock.ts). Source: published UAE public
 * holidays 2024–2025; maintained by Workplace Operations (PRD §3-060).
 */
const UAE_HOLIDAYS = [
  "2024-06-17", "2024-06-18", "2024-06-19", "2024-09-01", "2024-11-15",
  "2024-12-01", "2024-12-02", "2024-12-03",
  "2025-01-01", "2025-03-30", "2025-03-31", "2025-04-01", "2025-04-02",
  "2025-05-31", "2025-06-01", "2025-06-02", "2025-06-03",
  "2025-12-01", "2025-12-02", "2025-12-03",
];

export const CALENDARS: Record<string, WorkingCalendar> = {
  DXB: { weekendDays: [5, 6], holidays: UAE_HOLIDAYS },
  AUH: { weekendDays: [5, 6], holidays: UAE_HOLIDAYS },
  SHJ: { weekendDays: [0, 5, 6], holidays: UAE_HOLIDAYS },
  REMOTE: { weekendDays: [0, 6], holidays: [] },
};

const MINUTE = 60 * 1000;
const DAY_MS = 86400000;

export function calendarFor(location: string): WorkingCalendar {
  return CALENDARS[location] ?? CALENDARS.DXB;
}

function roundMinutes(ms: number): number {
  return Math.round(ms / MINUTE) * MINUTE;
}

export function isWorkingDay(cal: WorkingCalendar, at: Date): boolean {
  if (cal.weekendDays.includes(at.getUTCDay())) return false;
  return !cal.holidays.includes(at.toISOString().slice(0, 10));
}

/** Leave windows come from the employee record (PRD §3-042). */
export function pauseWindowsFor(employee: Employee, waits: PauseWindow[]): PauseWindow[] {
  const leaves = (employee.leaveWindows ?? []).map((l) => ({ from: l.from, to: l.to, reason: l.reason }));
  return [...leaves, ...waits];
}

function overlap(from: number, to: number, aFrom: number, aTo: number): number {
  const o = Math.min(to, aTo) - Math.max(from, aFrom);
  return o > 0 ? o : 0;
}

function pausedInSlice(from: number, to: number, pauses: PauseWindow[], asOf: Date): number {
  let total = 0;
  for (const p of pauses) {
    const pFrom = new Date(p.from).getTime();
    const pTo = p.to ? new Date(p.to).getTime() : asOf.getTime();
    total += overlap(from, to, pFrom, pTo);
  }
  return Math.max(0, Math.min(total, to - from));
}

/**
 * Split a span into wall time, chargeable time and paused time. Walking one day
 * at a time keeps the cost proportional to the journey length, not its resolution.
 */
export function elapsedSplit(from: number, to: number, cal: WorkingCalendar, pauses: PauseWindow[], asOf: Date): ElapsedSplit {
  if (to <= from) return { wallMs: 0, chargeableMs: 0, pausedMs: 0 };
  let chargeableMs = 0;
  let pausedMs = 0;
  let cursor = from;
  let guard = 0;
  while (cursor < to && guard < 4000) {
    guard++;
    const day = new Date(cursor);
    const endOfDay = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
    const sliceTo = Math.min(endOfDay, to);
    const paused = pausedInSlice(cursor, sliceTo, pauses, asOf);
    if (isWorkingDay(cal, day)) chargeableMs += Math.max(0, sliceTo - cursor - paused);
    pausedMs += paused;
    cursor = endOfDay;
  }
  return {
    wallMs: roundMinutes(to - from),
    chargeableMs: roundMinutes(chargeableMs),
    pausedMs: roundMinutes(pausedMs),
  };
}

/** Total time spent inside the pause windows before `asOf`. */
export function pausedMsBetween(from: number, to: number, pauses: PauseWindow[], asOf: Date): number {
  return pausedInSlice(from, to, pauses, asOf);
}

/**
 * due_at = start + target hours of chargeable time (PRD §3-043). A target that is
 * absent or zero is untimed: the caller must not claim a breach for it
 * (PRD §3-053), so the start instant is returned unchanged and flagged upstream.
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
  while (remaining > 0 && guard < 4000) {
    guard++;
    const day = new Date(cursor);
    const endOfDay = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
    if (isWorkingDay(cal, day)) {
      const paused = pausedInSlice(cursor, endOfDay, pauses, asOf);
      const capacity = Math.max(0, endOfDay - cursor - paused);
      if (capacity >= remaining) {
        return new Date(roundMinutes(cursor + remaining + paused)).toISOString();
      }
      remaining -= capacity;
    }
    cursor = endOfDay;
  }
  return new Date(roundMinutes(cursor)).toISOString();
}

/** "3 days late", not "72h SLA breach" (PRD §29 010). */
export function humanDuration(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(ms / MINUTE)}m`;
}
