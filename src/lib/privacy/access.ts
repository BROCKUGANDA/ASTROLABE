/**
 * Sessions, role gating and row-level scoping (PRD §29 261–272, §15, M8).
 *
 * Before this module the role was a client-side click and every route trusted a
 * `?employeeId=` query parameter, which meant any caller could read any
 * employee's whole data-held payload. Here the actor comes from a signed,
 * httpOnly session cookie; routes deny by default; and every read of another
 * person's data is scoped by the session's role rather than by a parameter the
 * caller chose.
 *
 * Sessions are HMAC-SHA256 over a compact JSON payload using Web Crypto, so the
 * same code runs in a route handler and in middleware. The secret is server-side
 * only and never appears in the client bundle.
 */

import type { ActorRole } from "./audit";

export interface Session {
  /** Subject id: an employee id, a manager id, an HRBP id, or a role principal. */
  sub: string;
  role: ActorRole;
  name: string;
  issuedAt: number;
  expiresAt: number;
  /** When this session last re-authenticated; sensitive actions check it. */
  reauthAt: number;
  /** HRBP portfolio / manager cohort, when the role needs one. */
  scope: string[];
}

export const SESSION_COOKIE = "astrolabe_session";
export const SESSION_MAX_AGE_SECONDS = 12 * 3600;

const encoder = new TextEncoder();

function secretBytes(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production and must be at least 16 characters");
    }
    // Development only: a fixed key so a fresh clone runs. Never ships as a real secret.
    return encoder.encode("astrolabe-development-session-key-not-for-production");
  }
  return encoder.encode(secret);
}

function base64url(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(secretBytes()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/**
 * Web Crypto wants a plain ArrayBuffer-backed view; TextEncoder output is typed
 * as possibly-shared, so copy into a definite buffer before handing it over.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

/** Issue a session token. Returns the signed string to put in the cookie. */
export async function signSession(session: Session): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify(session)));
  const mac = await crypto.subtle.sign("HMAC", await key(), toArrayBuffer(encoder.encode(payload)));
  return `${payload}.${base64url(mac)}`;
}

/** Verify a token. Returns null on any tampering, expiry or malformed input. */
export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify("HMAC", await key(), toArrayBuffer(fromBase64url(mac)), toArrayBuffer(encoder.encode(payload)));
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as Session;
    if (typeof session.sub !== "string" || typeof session.role !== "string") return null;
    if (session.expiresAt * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function newSession(input: {
  sub: string;
  role: ActorRole;
  name: string;
  scope?: string[];
  now?: number;
}): Session {
  const now = input.now ?? Date.now();
  return {
    sub: input.sub,
    role: input.role,
    name: input.name,
    issuedAt: Math.floor(now / 1000),
    expiresAt: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS,
    reauthAt: Math.floor(now / 1000),
    scope: input.scope ?? [],
  };
}

/* ============================================================
   AUTHORITY — one table, checked per route, deny by default
   ============================================================ */

export type Resource =
  | "journey.me"
  | "journey.assessment"
  | "ask"
  | "policies.read"
  | "requests.create"
  | "requests.read"
  | "requests.transition"
  | "pulse.write"
  | "consent.write"
  | "me.data"
  | "me.export"
  | "escalations.create"
  | "escalations.read"
  | "hrbp.queue"
  | "insights.stalls"
  | "manager.cohort"
  | "service_owner.inbox"
  | "admin";

/**
 * The permission matrix (PRD §29 279). Anything not listed here is denied, so
 * adding a route cannot accidentally inherit access.
 */
export const PERMISSIONS: Record<Resource, ActorRole[]> = {
  "journey.me": ["employee", "hrbp", "manager", "service_owner", "admin", "judge"],
  "journey.assessment": ["hrbp", "admin", "judge", "service_owner"],
  ask: ["employee", "hrbp", "manager", "service_owner", "admin", "judge"],
  "policies.read": ["employee", "hrbp", "manager", "service_owner", "admin", "judge"],
  "requests.create": ["employee", "hrbp", "judge"],
  "requests.read": ["employee", "hrbp", "manager", "service_owner", "admin", "judge"],
  "requests.transition": ["service_owner", "hrbp", "admin"],
  "pulse.write": ["employee"],
  "consent.write": ["employee"],
  "me.data": ["employee"],
  "me.export": ["employee"],
  "escalations.create": ["hrbp", "employee", "judge"],
  "escalations.read": ["hrbp", "employee", "admin", "judge", "service_owner"],
  "hrbp.queue": ["hrbp", "admin", "judge"],
  "insights.stalls": ["hrbp", "admin", "judge"],
  "manager.cohort": ["manager", "admin", "judge"],
  "service_owner.inbox": ["service_owner", "admin", "judge"],
  admin: ["admin", "judge"],
};

export function isAllowed(role: ActorRole, resource: Resource): boolean {
  return PERMISSIONS[resource]?.includes(role) ?? false;
}

/**
 * Row-level scope: which employee records this session may touch. Enforced in
 * the data layer, not the component tree (PRD §13-206, §23-449).
 */
export function canAccessEmployee(session: Session, employeeId: string): boolean {
  switch (session.role) {
    case "employee":
      return session.sub === employeeId;
    case "manager":
      // Only the cohort this session manages — never the whole pack.
      return session.scope.includes(employeeId);
    case "hrbp":
      return session.scope.length === 0 ? true : session.scope.includes(employeeId);
    case "service_owner":
      // Open tickets routed to their queue, resolved by the caller's filter.
      return true;
    case "admin":
    case "judge":
      return true;
    default:
      return false;
  }
}

/**
 * Pulse and comment data needs a purpose claim naming why the read happens
 * (PRD §15). The claim is checked against the resource, and the read is audited.
 */
export const PULSE_PURPOSES = [
  "early_warning",
  "escalation_packet",
  "aggregate_analytics",
  "employee_self_view",
] as const;

export type PulsePurpose = (typeof PULSE_PURPOSES)[number];

export function isPulsePurpose(value: string | null | undefined): value is PulsePurpose {
  return typeof value === "string" && (PULSE_PURPOSES as readonly string[]).includes(value);
}

/**
 * Admin and judge access are separate, revocable keys rather than a clickable
 * role (PRD §14-278). Outside production they default to a documented dev value
 * so a fresh clone can demo both consoles; in production an unset key means the
 * console is closed, not open.
 */
export function adminTokenExpected(): string {
  if (process.env.ASTROLABE_ADMIN_TOKEN) return process.env.ASTROLABE_ADMIN_TOKEN;
  return process.env.NODE_ENV === "production" ? "" : "astrolabe-dev-admin";
}

export function judgeKeyExpected(): string {
  if (process.env.ASTROLABE_JUDGE_KEY) return process.env.ASTROLABE_JUDGE_KEY;
  return process.env.NODE_ENV === "production" ? "" : "astrolabe-dev-judge";
}

/**
 * The non-use rule, expressed as a constant the serialisation layer can assert
 * rather than a policy document nobody reads (PRD M8, §29 220).
 */
export const PERFORMANCE_USE = "forbidden" as const;

export function assertNotUsedForPerformance(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (/"(performance|disciplinary|promotion|visa_decision)(Use|Decision|Score)"/i.test(text)) {
    throw new Error("purpose limitation: this payload must not carry a performance or disciplinary use");
  }
}
