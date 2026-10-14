/**
 * POST /api/v1/auth/sign-in — the prototype's identity stub (PRD §29 261, 029).
 *
 * A real deployment hands this to Emirates' SSO; the contract that matters is
 * unchanged: the server decides the role and the data scope, issues a short-lived
 * signed httpOnly session, and the browser never picks its own identity. In the
 * prototype a caller asks for a named synthetic person, and the only thing they
 * get back is exactly what that person is allowed to see.
 */

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { employees, hrbps, managers, owners } from "@/lib/data/pack";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  adminTokenExpected,
  judgeKeyExpected,
  newSession,
  signSession,
} from "@/lib/privacy/access";
import { appendAudit } from "@/lib/privacy/audit";
import { logger } from "@/lib/logger";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface SignInBody {
  employeeId?: string;
  /**
   * Demo convenience for the SSO stub: sign in as the HRBP, manager or service
   * owner linked to this employee. The server resolves who that is from the
   * record — the client never names a role it wants granted outside the link.
   */
  actingAs?: "hrbp" | "manager" | "service_owner";
  managerId?: string;
  hrbpId?: string;
  serviceOwnerId?: string;
  adminToken?: string;
}

function cookieOptions(token: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const ip = getClientIp(req);
  const limited = rateLimit(`sign-in:${ip}`, 20, 60_000);
  if (!limited.success) {
    logger.warn("auth failure", { reason: "rate_limited", ip });
    return error("E_RATE_LIMIT", "Too many sign-in attempts.", 429, {
      hint: "Try again shortly.",
      retryable: true,
    });
  }

  let body: SignInBody;
  try {
    body = (await req.json()) as SignInBody;
  } catch {
    return error("E_VALIDATION", "Body must be JSON naming one principal.", 400, {
      hint: "{ employeeId | managerId | hrbpId | serviceOwnerId | adminToken }",
    });
  }

  const principals = [
    body.employeeId,
    body.managerId,
    body.hrbpId,
    body.serviceOwnerId,
    body.adminToken,
  ].filter(Boolean);
  if (principals.length !== 1) {
    logger.warn("auth failure", { reason: "ambiguous_principal", ip });
    return error("E_VALIDATION", "Name exactly one principal to sign in as.", 400, {
      retryable: false,
    });
  }

  // Resolve an acting-as request against the record, server-side.
  if (body.employeeId && body.actingAs) {
    const linked = employees.find((e) => e.id === body.employeeId);
    if (!linked)
      return error("E_NOT_FOUND", "No such employee in this data pack.", 404, { retryable: false });
    const sessionFor = (
      sub: string,
      role: "hrbp" | "manager" | "service_owner",
      name: string,
      scope: string[],
    ) => {
      const session = newSession({ sub, role, name, scope });
      return { session };
    };
    let resolved: { session: ReturnType<typeof newSession> } | null = null;
    if (body.actingAs === "hrbp") {
      const hrbp = hrbps.find((h) => h.id === linked.hrbpId);
      if (hrbp)
        resolved = sessionFor(
          hrbp.id,
          "hrbp",
          hrbp.name,
          employees.filter((e) => e.hrbpId === hrbp.id).map((e) => e.id),
        );
    } else if (body.actingAs === "manager") {
      const manager = managers.find((m) => m.id === linked.managerId);
      if (manager)
        resolved = sessionFor(
          manager.id,
          "manager",
          manager.name,
          employees.filter((e) => e.managerId === manager.id).map((e) => e.id),
        );
    } else {
      const owner = owners.find((o) => o.group === "IT");
      if (owner) resolved = sessionFor(owner.id, "service_owner", owner.name, [owner.group]);
    }
    if (!resolved)
      return error("E_NOT_FOUND", "That employee has no linked owner for this role.", 404, {
        retryable: false,
      });
    const { session } = resolved;
    const response = success(
      {
        signedInAs: {
          id: session.sub,
          role: session.role,
          name: session.name,
          scope: session.scope,
        },
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      },
      { latencyMs: Date.now() - started },
    );
    response.cookies.set(SESSION_COOKIE, await signSession(session), cookieOptions(""));
    appendAudit({
      actor: session.sub,
      actorRole: "system",
      action: `auth.sign_in.as_${session.role}`,
      subject: session.sub,
      lawfulBasis: "legitimate_interests",
    });
    return response;
  }

  if (body.employeeId) {
    const employee = employees.find((e) => e.id === body.employeeId);
    if (!employee) {
      logger.warn("auth failure", { reason: "unknown_subject", subject: body.employeeId });
      return error("E_NOT_FOUND", "No such employee in this data pack.", 404, { retryable: false });
    }
    const session = newSession({
      sub: employee.id,
      role: "employee",
      name: employee.displayName,
      scope: [employee.id],
    });
    const response = success(
      {
        signedInAs: {
          id: session.sub,
          role: session.role,
          name: session.name,
          scope: session.scope,
        },
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      },
      { latencyMs: Date.now() - started },
    );
    response.cookies.set(SESSION_COOKIE, await signSession(session), cookieOptions(""));
    appendAudit({
      actor: employee.id,
      actorRole: "system",
      action: "auth.sign_in",
      subject: employee.id,
      lawfulBasis: "contract_necessary",
    });
    return response;
  }

  if (body.managerId) {
    const manager = managers.find((m) => m.id === body.managerId);
    if (!manager) return error("E_NOT_FOUND", "No such manager.", 404, { retryable: false });
    // The cohort is computed server-side from the reporting line, not requested.
    const cohort = employees.filter((e) => e.managerId === manager.id).map((e) => e.id);
    const session = newSession({
      sub: manager.id,
      role: "manager",
      name: manager.name,
      scope: cohort,
    });
    const response = success(
      {
        signedInAs: {
          id: session.sub,
          role: session.role,
          name: session.name,
          scope: session.scope,
        },
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      },
      { latencyMs: Date.now() - started },
    );
    response.cookies.set(SESSION_COOKIE, await signSession(session), cookieOptions(""));
    appendAudit({
      actor: manager.id,
      actorRole: "system",
      action: "auth.sign_in",
      subject: manager.id,
      lawfulBasis: "legitimate_interests",
    });
    return response;
  }

  if (body.hrbpId) {
    const hrbp = hrbps.find((h) => h.id === body.hrbpId);
    if (!hrbp)
      return error("E_NOT_FOUND", "No such HR business partner.", 404, { retryable: false });
    const portfolio = employees.filter((e) => e.hrbpId === hrbp.id).map((e) => e.id);
    const session = newSession({ sub: hrbp.id, role: "hrbp", name: hrbp.name, scope: portfolio });
    const response = success(
      {
        signedInAs: {
          id: session.sub,
          role: session.role,
          name: session.name,
          scope: session.scope,
        },
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      },
      { latencyMs: Date.now() - started },
    );
    response.cookies.set(SESSION_COOKIE, await signSession(session), cookieOptions(""));
    appendAudit({
      actor: hrbp.id,
      actorRole: "system",
      action: "auth.sign_in",
      subject: hrbp.id,
      lawfulBasis: "legitimate_interests",
    });
    return response;
  }

  if (body.serviceOwnerId) {
    const owner = owners.find((o) => o.id === body.serviceOwnerId);
    if (!owner) return error("E_NOT_FOUND", "No such service owner.", 404, { retryable: false });
    const session = newSession({
      sub: owner.id,
      role: "service_owner",
      name: owner.name,
      scope: [owner.group],
    });
    const response = success(
      {
        signedInAs: {
          id: session.sub,
          role: session.role,
          name: session.name,
          scope: session.scope,
        },
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      },
      { latencyMs: Date.now() - started },
    );
    response.cookies.set(SESSION_COOKIE, await signSession(session), cookieOptions(""));
    appendAudit({
      actor: owner.id,
      actorRole: "system",
      action: "auth.sign_in",
      subject: owner.id,
      lawfulBasis: "legitimate_interests",
    });
    return response;
  }

  // Admin and judge are separate, revocable keys — not a clickable role.
  const adminExpected = adminTokenExpected();
  if (body.adminToken) {
    if (!adminExpected || body.adminToken !== adminExpected) {
      logger.warn("auth failure", { reason: "bad_admin_token" });
      return error("E_AUTH", "Admin token rejected.", 401, { retryable: false });
    }
    const isJudge = req.headers.get("x-judge-key") === judgeKeyExpected();
    const session = newSession({
      sub: isJudge ? "judge-mode" : "admin-console",
      role: isJudge ? "judge" : "admin",
      name: isJudge ? "Judge mode" : "Administrator",
      scope: employees.map((e) => e.id),
    });
    const response = success(
      {
        signedInAs: {
          id: session.sub,
          role: session.role,
          name: session.name,
          scope: "all (synthetic pack)",
        },
        expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      },
      { latencyMs: Date.now() - started },
    );
    response.cookies.set(SESSION_COOKIE, await signSession(session), cookieOptions(""));
    appendAudit({
      actor: session.sub,
      actorRole: "system",
      action: "auth.sign_in",
      subject: session.sub,
      lawfulBasis: "legitimate_interests",
    });
    return response;
  }

  return error("E_VALIDATION", "Unrecognised principal.", 400, { retryable: false });
}
