/**
 * /api/v1/auth/session
 *   POST — sign out: clear the cookie and revoke every session issued until now.
 *   GET  — who the current session is, and what scope it carries.
 *   PUT  — re-authenticate, which consent changes and data exports require.
 *
 * The role and the data scope are decided here, on the server. The browser's
 * role picker only asks for one of these sessions; it cannot grant itself one.
 */

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { SESSION_COOKIE, newSession, signSession } from "@/lib/privacy/access";
import { appendAudit } from "@/lib/privacy/audit";
import { isRevoked, revokeSessionsFor } from "@/lib/privacy/session-store";
import { readSession } from "@/lib/privacy/guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await readSession(req);
  const response = success({ signedOut: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  if (session) {
    revokeSessionsFor(session.sub);
    appendAudit({ actor: session.sub, actorRole: session.role, action: "auth.sign_out", subject: session.sub, lawfulBasis: "contract_necessary" });
  }
  return response;
}

export async function GET(req: NextRequest) {
  const session = await readSession(req);
  if (!session) {
    return error("E_AUTH", "No active session.", 401, { hint: "POST /api/v1/auth/sign-in.", retryable: true });
  }
  return success({
    id: session.sub,
    role: session.role,
    name: session.name,
    scope: session.scope,
    expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    reauthAt: new Date(session.reauthAt * 1000).toISOString(),
  });
}

export async function PUT(req: NextRequest) {
  const existing = await readSession(req);
  if (!existing) {
    return error("E_AUTH", "Sign in before re-authenticating.", 401, { retryable: true });
  }
  const refreshed = newSession({ sub: existing.sub, role: existing.role, name: existing.name, scope: existing.scope });
  const response = success({ reauthenticatedAt: new Date(refreshed.reauthAt * 1000).toISOString(), role: refreshed.role });
  response.cookies.set(SESSION_COOKIE, await signSession(refreshed), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  appendAudit({ actor: refreshed.sub, actorRole: refreshed.role, action: "auth.reauth", subject: refreshed.sub, lawfulBasis: "contract_necessary" });
  return response;
}
