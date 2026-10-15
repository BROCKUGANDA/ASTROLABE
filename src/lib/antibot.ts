/**
 * Anti-bot layer
 * --------------
 * What this is: a cheap, first-pass filter that makes naive scripted access to
 * the credential endpoint cost more than doing nothing.
 *
 * What this is not: a wall. A User-Agent string is written by the caller, so any
 * determined bot sets one that passes. That is why the controls that actually
 * hold are elsewhere — the un-spoofable client key in `rate-limit.ts`, the
 * same-origin check below, the sign-in backoff, and the fact that every data
 * route needs a signed session cookie the script does not have.
 *
 * Headless browsers are deliberately classified as browsers. Playwright,
 * Puppeteer and the accessibility tooling that audits this app all announce
 * themselves in the UA, they are trivially spoofable anyway, and they execute
 * JavaScript — so they are not the population this filter is aimed at, and
 * refusing them would only break the project's own verification.
 */

export type ClientClass = "browser" | "automation" | "crawler";

/** Clients that do not execute JavaScript and cannot hold a browser session. */
const AUTOMATION_SIGNATURES: readonly RegExp[] = [
  /curl\//i,
  /wget\//i,
  /^\s*python-?(requests|urllib|httpx|aiohttp)/i,
  /go-http-client/i,
  /java\//i,
  /okhttp/i,
  /libwww-perl/i,
  /restsharp/i,
  /axios\//i,
  /node-fetch/i,
  /undici/i,
  /postmanruntime/i,
  /insomnia/i,
  /scrapy/i,
  /httpie/i,
  /^\s*$/, // no User-Agent at all: never a browser
];

/** Known assistants and indexers. Allowed to read, never to authenticate. */
const CRAWLER_SIGNATURES: readonly RegExp[] = [
  /googlebot/i,
  /bingbot/i,
  /duckduckbot/i,
  /applebot/i,
  /slurp/i,
  /yandexbot/i,
  /baiduspider/i,
  /gptbot/i,
  /oai-searchbot/i,
  /claudebot/i,
  /claude-web/i,
  /perplexitybot/i,
  /ccbot/i,
  /compatible;.*bot\//i,
];

export function classifyClient(userAgent: string | null): ClientClass {
  const ua = userAgent ?? "";
  if (CRAWLER_SIGNATURES.some((re) => re.test(ua))) return "crawler";
  if (AUTOMATION_SIGNATURES.some((re) => re.test(ua))) return "automation";
  return "browser";
}

/** The credential surface: sign-in, re-auth and session teardown. */
export function isCredentialPath(path: string): boolean {
  return path.startsWith("/api/v1/auth/");
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutating(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

/**
 * True when a write arrives with a browser origin that is not this host.
 *
 * A missing Origin/Referer is not treated as a violation: a browser always
 * sends Origin on a same-site fetch in current engines, but command-line and
 * server-to-server clients send neither, and this prototype documents its API for
 * both. Cross-origin is the case that is unambiguously wrong.
 *
 * The comparison uses the request's Host header, not `nextUrl.host`: the
 * standalone server reports its bind address there (`0.0.0.0:3200`), which no
 * browser Origin can ever match — every genuine same-origin POST was being
 * refused as cross-origin. A browser cannot spoof either side of this
 * comparison, which is what the check is for; scripted callers can lie, but
 * they can already omit Origin entirely, so nothing new is opened.
 */
export function sameOriginViolation(request: {
  method: string;
  headers: Headers;
  nextUrl: { host: string };
}): boolean {
  if (!isMutating(request.method)) return false;
  const origin = request.headers.get("origin");
  const source = origin ?? request.headers.get("referer");
  if (!source) return false;
  const expected = request.headers.get("host") ?? request.nextUrl.host;
  try {
    return new URL(source).host !== expected;
  } catch {
    return true; // unparseable Origin is not a same-origin request
  }
}

/* ------------------------------------------------------------------
   Sign-in backoff
   ------------------------------------------------------------------
   The flat per-IP rate limit lets an attacker spend 20 attempts a minute
   indefinitely. Repeated *failures* are what identify credential stuffing, so
   they are counted separately and punished exponentially: 5 misses unlock after
   a minute, the next tier after four, then sixteen, then sixty-four.
   ------------------------------------------------------------------ */

interface StrikeRecord {
  failures: number;
  /** epoch-ms before which the caller may not try again */
  lockedUntil: number;
}

const STRIKES = new Map<string, StrikeRecord>();
const WINDOW_MS = 15 * 60 * 1000;
const THRESHOLD = 5;
/** 1m, 4m, 16m, 64m … capped at an hour so a false positive cannot lock anyone out for a day. */
const LOCK_MS = 60_000;
const MAX_LOCK_MS = 60 * 60 * 1000;

/** Kept bounded: a long-lived process must not accumulate a record per spoofed key. */
let lastSweep = Date.now();
function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, rec] of STRIKES) {
    if (rec.lockedUntil < now && now - rec.lockedUntil > WINDOW_MS) STRIKES.delete(key);
  }
}

export interface LockState {
  locked: boolean;
  /** seconds until the caller may try again; 0 when not locked */
  retryAfterSeconds: number;
}

export function signInLockState(key: string, now = Date.now()): LockState {
  sweep(now);
  const rec = STRIKES.get(key);
  if (!rec) return { locked: false, retryAfterSeconds: 0 };
  if (rec.lockedUntil <= now) return { locked: false, retryAfterSeconds: 0 };
  return { locked: true, retryAfterSeconds: Math.ceil((rec.lockedUntil - now) / 1000) };
}

export function recordSignInFailure(key: string, now = Date.now()): void {
  sweep(now);
  const rec = STRIKES.get(key) ?? { failures: 0, lockedUntil: 0 };
  rec.failures += 1;
  if (rec.failures >= THRESHOLD) {
    const steps = Math.min(4, Math.floor((rec.failures - THRESHOLD) / THRESHOLD) + 1);
    const lock = Math.min(MAX_LOCK_MS, LOCK_MS * Math.pow(4, steps - 1));
    rec.lockedUntil = now + lock;
  }
  STRIKES.set(key, rec);
}

/** A success clears the record — this is about unauthorised guessing, not about
 * one person who mistyped a token four times. */
export function clearSignInFailures(key: string): void {
  STRIKES.delete(key);
}

/** Test hook: the backoff must be assertable without waiting a minute. */
export function __resetSignInStrikesForTesting(): void {
  STRIKES.clear();
  lastSweep = Date.now();
}
