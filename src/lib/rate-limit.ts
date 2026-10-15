/**
 * ASTROLABE Rate Limiter
 * ----------------------
 * A tiny in-memory sliding-window rate limiter (PRD §19).
 *
 * The prototype is single-process, so an in-memory Map is sufficient.
 * A real production deployment would swap this for Redis (e.g. a token
 * bucket or sorted-set sliding window) without changing the call sites.
 *
 * Three default ceilings per PRD §19:
 *   Ask         — 30 / 5 min   per user
 *   Requests    — 10 / hour    per user
 *   Escalations — 5  / day     per user
 *   General API — 300 / min    per IP
 */

import type { NextRequest } from "next/server";

export interface RateLimitResult {
  /** true when the caller is within the budget, false when exceeded */
  success: boolean;
  /** how many more calls are permitted in the current window */
  remaining: number;
  /** epoch-ms timestamp at which the window fully resets */
  resetAt: number;
}

interface RateBucket {
  /** timestamps (ms) of every accepted hit within the active window */
  hits: number[];
}

/**
 * The global bucket map. Keyed by the caller-supplied identifier
 * (typically `${scope}:${ip}:${userId?}`). Never expires whole buckets —
 * stale hits are pruned lazily on each call, which keeps the working set
 * small under realistic prototype traffic.
 */
const BUCKETS = new Map<string, RateBucket>();

/**
 * Apply a sliding-window rate limit.
 *
 * @param identifier  stable key for the caller (scope + ip + optional user)
 * @param limit        max number of hits permitted in the window
 * @param windowMs    size of the sliding window in milliseconds
 */
export function rateLimit(identifier: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const since = now - windowMs;

  let bucket = BUCKETS.get(identifier);
  if (!bucket) {
    bucket = { hits: [] };
    BUCKETS.set(identifier, bucket);
  }

  // Prune hits that fell out of the window.
  bucket.hits = bucket.hits.filter((t) => t > since);

  if (bucket.hits.length >= limit) {
    // The window resets when the oldest surviving hit ages out.
    const oldest = bucket.hits.length > 0 ? Math.min(...bucket.hits) : now;
    return {
      success: false,
      remaining: 0,
      resetAt: oldest + windowMs,
    };
  }

  bucket.hits.push(now);
  const remaining = Math.max(0, limit - bucket.hits.length);
  const oldest = Math.min(...bucket.hits);
  return {
    success: true,
    remaining,
    resetAt: oldest + windowMs,
  };
}

/**
 * The client identity the limiter keys on.
 *
 * This used to take the LEFTMOST `X-Forwarded-For` entry, which is the one value
 * a caller writes themselves: `curl -H 'X-Forwarded-For: 1.2.3.4'` bought a fresh
 * budget on every request and the rate limits were decorative.
 *
 * Trust order, for a topology where Caddy is the only way in:
 *   1. `X-Real-IP`, which the edge sets from the true peer and overwrites.
 *   2. the RIGHTMOST `X-Forwarded-For` entry — the hop the trusted proxy appended
 *      last, not anything the client claimed.
 *   3. the socket address, when there is no proxy in front (a local run).
 * A deployment behind a second proxy must extend this list rather than loosen it.
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }

  const ipFromConn = (req as unknown as { ip?: string }).ip;
  if (ipFromConn) return ipFromConn;
  return "unknown";
}

/**
 * Default ceilings per PRD §19. Call sites pick a preset and pass the
 * matching `identifier` to `rateLimit`.
 */
export const RATE_LIMITS = {
  /** 30 questions per 5 minutes per user (PRD §19) */
  ask: { limit: 30, windowMs: 5 * 60 * 1000 },
  /** 10 service requests per hour per user (PRD §19) */
  requests: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** 5 escalations per day per user (PRD §19) */
  escalations: { limit: 5, windowMs: 24 * 60 * 60 * 1000 },
  /** 300 general API calls per minute per IP (PRD §19) */
  general: { limit: 300, windowMs: 60 * 1000 },
} as const;

/**
 * Build a stable identifier for an authenticated-style endpoint that
 * combines the IP and the (optional) employee id, so the limit follows
 * the user across NAT'd devices but still degrades to per-IP when no
 * employee is supplied.
 */
export function buildIdentifier(scope: string, ip: string, userId?: string | null): string {
  return userId ? `${scope}:${ip}:${userId}` : `${scope}:${ip}`;
}

/**
 * Human-readable "retry in X seconds" copy used by both the API hint and
 * (potentially) the client UI.
 */
export function formatRetrySeconds(resetAt: number, now: number = Date.now()): number {
  const secs = Math.ceil((resetAt - now) / 1000);
  return Math.max(1, secs);
}
