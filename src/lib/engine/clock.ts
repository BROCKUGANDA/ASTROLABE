/**
 * ASTROLABE authoritative clock (PRD §20-49 "one authoritative clock source",
 * PRD §3-052 "make now injectable for replay and tests").
 *
 * The synthetic pack is frozen at a fixed as-of instant, so every read that
 * falls back to wall clock would report a two-year-old journey as catastrophically
 * breached. The engine therefore has exactly one time source:
 *
 *   - default: the frozen pack clock, so demo and replay state agree;
 *   - ASTROLABE_LIVE_CLOCK=1: real wall clock, for a deployment against live data;
 *   - an explicit asOf: always wins (replay, judge mode, tests).
 */

import { NOW } from "../data/pack";

export function liveClockEnabled(): boolean {
  return process.env.ASTROLABE_LIVE_CLOCK === "1";
}

/** The frozen as-of instant the synthetic pack describes. */
export function frozenNow(): Date {
  return new Date(NOW.getTime());
}

/** Authoritative "now" when no as-of is supplied. */
export function engineNow(): Date {
  return liveClockEnabled() ? new Date() : frozenNow();
}

/** Resolve the clock for a read: explicit as-of, else the authoritative now. */
export function resolveAsOf(asOf?: string | Date | null): Date {
  if (asOf instanceof Date) return new Date(asOf.getTime());
  if (typeof asOf === "string" && asOf.length > 0) return new Date(asOf);
  return engineNow();
}

/**
 * Elapsed whole days between two instants, floored at zero. Used by every
 * "stalled > N days" predicate so no signal computes a negative age.
 */
export function daysBetween(fromIso: string, to: Date): number {
  const ms = to.getTime() - new Date(fromIso).getTime();
  return ms > 0 ? ms / 86400000 : 0;
}

export function hoursBetween(fromIso: string, to: Date): number {
  const ms = to.getTime() - new Date(fromIso).getTime();
  return ms > 0 ? ms / 3600000 : 0;
}
