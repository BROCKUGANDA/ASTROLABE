/**
 * Route-side authority helpers. Every guarded route calls `guard()` first, so the
 * actor comes from a verified session rather than a query parameter, and every
 * cross-person read lands in the audit chain.
 */

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { error } from "../api/envelope";
import {
  SESSION_COOKIE,
  canAccessEmployee,
  isAllowed,
  isPulsePurpose,
  judgeKeyExpected,
  verifySession,
  type Resource,
  type Session,
} from "./access";
import { appendAudit, type LawfulBasis } from "./audit";
import { isRevoked } from "./session-store";

export type Guard = { ok: true; session: Session } | { ok: false; response: NextResponse };

/** Read the session cookie from either a request or the framework cookie jar. */
export async function readSession(req?: NextRequest): Promise<Session | null> {
  let token: string | undefined;
  if (req) token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    try {
      token = (await cookies()).get(SESSION_COOKIE)?.value;
    } catch {
      token = undefined;
    }
  }
  return verifySession(token).then((session) => (session && !isRevoked(session) ? session : null));
}

/**
 * Judge-mode access uses a separate, revocable key rather than a long-lived
 * human session (PRD §14-278). It is never a role in the browser.
 */
function judgeKeyPresent(req?: NextRequest): boolean {
  const expected = judgeKeyExpected();
  if (!expected) return false;
  const supplied = req?.headers.get("x-judge-key");
  return Boolean(supplied) && supplied === expected;
}

export async function guard(req: NextRequest | undefined, resource: Resource): Promise<Guard> {
  const session = await readSession(req);
  if (!session) {
    return {
      ok: false,
      response: error("E_AUTH", "A signed session is required for this route.", 401, {
        hint: "POST /api/v1/auth/sign-in with an employeeId, managerId, hrbpId or serviceOwnerId.",
        retryable: false,
      }),
    };
  }
  if (!isAllowed(session.role, resource) && !judgeKeyPresent(req)) {
    return {
      ok: false,
      response: error("E_FORBIDDEN", `Role ${session.role} may not access ${resource}.`, 403, {
        hint: "This surface is role-gated server-side, not hidden in the interface.",
        retryable: false,
      }),
    };
  }
  if (!session.scope && session.role !== "employee") {
    // A role principal without a scope can see nothing belonging to a person.
    return {
      ok: false,
      response: error("E_FORBIDDEN", "This session has no data scope.", 403, { retryable: false }),
    };
  }
  return { ok: true, session };
}

/**
 * Row-level check plus the audit entry for a read of someone's data. Returns a
 * 403 rather than leaking whether the subject exists.
 */
export function subjectGuard(
  session: Session,
  employeeId: string,
  action: string,
  opts: { lawfulBasis?: LawfulBasis; purpose?: string; requestId?: string } = {},
): { ok: true } | { ok: false; response: NextResponse } {
  if (!canAccessEmployee(session, employeeId)) {
    appendAudit({
      actor: session.sub,
      actorRole: session.role,
      action: `${action}.denied`,
      subject: employeeId,
      lawfulBasis: "legitimate_interests",
      requestId: opts.requestId,
    });
    return {
      ok: false,
      response: error("E_FORBIDDEN", "That record is outside this session's scope.", 403, {
        hint: "An employee reads only their own journey; a manager reads only their own cohort.",
        retryable: false,
      }),
    };
  }
  appendAudit({
    actor: session.sub,
    actorRole: session.role,
    action,
    subject: employeeId,
    lawfulBasis:
      opts.lawfulBasis ??
      (session.role === "employee" ? "contract_necessary" : "legitimate_interests"),
    purpose: opts.purpose,
    requestId: opts.requestId,
  });
  return { ok: true };
}

/**
 * Pulse and free-text comment reads additionally need a declared purpose, and an
 * employee reading their own data needs a recently re-authenticated session
 * (PRD §14-263, §29 205/207).
 */
export function pulseGuard(
  session: Session,
  employeeId: string,
  purpose: string | null | undefined,
  opts: { requestId?: string; requireReauth?: boolean; reauthWithinSeconds?: number } = {},
): { ok: true } | { ok: false; response: NextResponse } {
  if (!isPulsePurpose(purpose)) {
    return {
      ok: false,
      response: error("E_FORBIDDEN", "Reading pulse data requires a declared purpose.", 403, {
        hint: `X-Purpose must be one of early_warning, escalation_packet, aggregate_analytics, employee_self_view.`,
        retryable: false,
      }),
    };
  }
  if (opts.requireReauth) {
    const window = opts.reauthWithinSeconds ?? 300;
    if (Date.now() / 1000 - session.reauthAt > window) {
      return {
        ok: false,
        response: error("E_AUTH", "This action needs a fresh sign-in.", 401, {
          hint: "Re-authenticate at /api/v1/auth/sign-in before exporting or changing consent.",
          retryable: true,
        }),
      };
    }
  }
  return subjectGuard(session, employeeId, `pulse.read:${purpose}`, {
    lawfulBasis: "consent",
    purpose,
    requestId: opts.requestId,
  });
}

export function purposeHeader(req?: NextRequest): string | null {
  return req?.headers.get("x-purpose") ?? null;
}

export function sessionIdentity(session: Session): { id: string; name: string; role: string } {
  return { id: session.sub, name: session.name, role: session.role };
}
