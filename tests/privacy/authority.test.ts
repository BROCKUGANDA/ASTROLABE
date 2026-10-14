/**
 * Privacy and authority gates (PRD M7, M8, M12, §29 219/270/272/449/451).
 *
 * These are negative tests: they pass only if the server refuses. A privacy
 * claim that has no test behind it is a sentence in a slide, so each of the
 * guardrails the brief names gets an assertion here.
 */

import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  newSession,
  signSession,
  verifySession,
  canAccessEmployee,
  isAllowed,
  assertNotUsedForPerformance,
  PERMISSIONS,
  PERFORMANCE_USE,
} from "../../src/lib/privacy/access";
import {
  appendAudit,
  verifyChain,
  viewLogFor,
  __tamperForTesting,
  resetChainForTesting,
  readAuditChain,
} from "../../src/lib/privacy/audit";

function requestWith(cookie: string | null, path = "/api/v1/journey/me"): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://localhost:3100${path}`, { headers });
}

describe("sessions", () => {
  test("a signed session round-trips and an edited one is rejected", async () => {
    const session = newSession({
      sub: "E-1042",
      role: "employee",
      name: "Maria",
      scope: ["E-1042"],
    });
    const token = await signSession(session);
    const verified = await verifySession(token);
    expect(verified?.sub).toBe("E-1042");

    const [payload, mac] = token.split(".");
    const forged = `${btoa(JSON.stringify({ ...session, role: "admin" })).replace(/=+$/, "")}.${mac}`;
    expect(await verifySession(forged)).toBeNull();
    expect(await verifySession(`${payload}.AAAA`)).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
  });

  test("an expired session is refused", async () => {
    const stale = newSession({
      sub: "E-1042",
      role: "employee",
      name: "Maria",
      now: Date.now() - 13 * 3600 * 1000,
    });
    expect(await verifySession(await signSession(stale))).toBeNull();
  });
});

describe("authority table", () => {
  test("deny by default, allow by exception", () => {
    expect(isAllowed("employee", "hrbp.queue")).toBe(false);
    expect(isAllowed("employee", "admin")).toBe(false);
    expect(isAllowed("manager", "pulse.write")).toBe(false);
    // Raising a request is the employee's act (or the HRBP filing what the
    // employee asked for); a manager has no route to create one.
    expect(isAllowed("manager", "requests.create")).toBe(false);
    expect(isAllowed("service_owner", "me.data")).toBe(false);
    expect(isAllowed("employee", "consent.write")).toBe(true);
    expect(isAllowed("hrbp", "hrbp.queue")).toBe(true);
    expect(isAllowed("manager", "manager.cohort")).toBe(true);
  });

  test("every resource in the matrix is reachable by at least one role", () => {
    for (const [resource, roles] of Object.entries(PERMISSIONS)) {
      expect(roles.length, `${resource} has no role that may use it`).toBeGreaterThan(0);
    }
  });

  test("row-level scope: an employee sees only themselves", () => {
    const employee = newSession({
      sub: "E-1042",
      role: "employee",
      name: "Maria",
      scope: ["E-1042"],
    });
    expect(canAccessEmployee(employee, "E-1042")).toBe(true);
    expect(canAccessEmployee(employee, "E-1043")).toBe(false);

    const manager = newSession({
      sub: "MGR-1",
      role: "manager",
      name: "Ahmed",
      scope: ["E-1042", "E-1045"],
    });
    expect(canAccessEmployee(manager, "E-1042")).toBe(true);
    expect(canAccessEmployee(manager, "E-1044")).toBe(false);

    const stranger = newSession({ sub: "MGR-9", role: "manager", name: "Nobody", scope: [] });
    expect(canAccessEmployee(stranger, "E-1042")).toBe(false);
  });
});

describe("route enforcement (real handlers, real refusals)", () => {
  test("journey/me without a session is 401, another employee's journey is 403", async () => {
    const { GET } = await import("../../src/app/api/v1/journey/me/route");
    const anonymous = await GET(requestWith(null));
    expect(anonymous.status).toBe(401);

    const employee = newSession({
      sub: "E-1042",
      role: "employee",
      name: "Maria",
      scope: ["E-1042"],
    });
    const own = await GET(requestWith(`${"astrolabe_session"}=${await signSession(employee)}`));
    expect(own.status).toBe(200);

    const peeking = await GET(
      requestWith(
        `astrolabe_session=${await signSession(employee)}`,
        "/api/v1/journey/me?employeeId=E-1043",
      ),
    );
    expect(peeking.status).toBe(403);
    const body = await peeking.json();
    expect(body.error.code).toBe("E_FORBIDDEN");
  });

  test("a manager cannot open the HRBP queue and an employee cannot read cohort data", async () => {
    const hrbpQueue = await import("../../src/app/api/v1/hrbp/queue/route");
    const manager = newSession({ sub: "MGR-1", role: "manager", name: "Ahmed", scope: ["E-1042"] });
    const asManager = await hrbpQueue.GET(
      requestWith(`astrolabe_session=${await signSession(manager)}`, "/api/v1/hrbp/queue"),
    );
    expect(asManager.status).toBe(403);

    const employee = newSession({
      sub: "E-1042",
      role: "employee",
      name: "Maria",
      scope: ["E-1042"],
    });
    const cohort = await import("../../src/app/api/v1/manager/cohort/route");
    const asEmployee = await cohort.GET(
      requestWith(`astrolabe_session=${await signSession(employee)}`, "/api/v1/manager/cohort"),
    );
    expect(asEmployee.status).toBe(403);
  });

  test("a manager asking for someone else's cohort is refused", async () => {
    const cohort = await import("../../src/app/api/v1/manager/cohort/route");
    const mgr = newSession({ sub: "MGR-2", role: "manager", name: "Yusuf", scope: ["E-1044"] });
    const response = await cohort.GET(
      requestWith(
        `astrolabe_session=${await signSession(mgr)}`,
        "/api/v1/manager/cohort?managerId=MGR-1",
      ),
    );
    expect(response.status).toBe(403);
  });

  test("the subject-access route only answers for the signed-in employee", async () => {
    const sar = await import("../../src/app/api/v1/me/data/route");
    const maria = newSession({ sub: "E-1042", role: "employee", name: "Maria", scope: ["E-1042"] });
    const token = `astrolabe_session=${await signSession(maria)}`;
    const own = await sar.GET(requestWith(token, "/api/v1/me/data"));
    expect(own.status).toBe(200);
    const other = await sar.GET(requestWith(token, "/api/v1/me/data?employeeId=E-1047"));
    expect(other.status).toBe(403);
  });

  test("pulse needs a session, a purpose and the employee's own consent", async () => {
    const pulse = await import("../../src/app/api/v1/pulse/route");
    const anonymous = await pulse.POST(
      new NextRequest("http://localhost:3100/api/v1/pulse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: "E-1042",
          stage: "first_week",
          score: 4,
          consentId: "CN-001",
        }),
      }),
    );
    expect(anonymous.status).toBe(401);

    const maria = newSession({ sub: "E-1042", role: "employee", name: "Maria", scope: ["E-1042"] });
    const ownAnswer = await pulse.POST(
      new NextRequest("http://localhost:3100/api/v1/pulse", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `astrolabe_session=${await signSession(maria)}`,
        },
        body: JSON.stringify({
          employeeId: "E-1042",
          stage: "first_week",
          score: 4,
          consentId: "CN-001",
        }),
      }),
    );
    // 200 on a first answer, or the dedup branch on a same-day repeat — either
    // way it must not be an authority failure.
    expect([200, 201]).toContain(ownAnswer.status);

    const someoneElse = new NextRequest("http://localhost:3100/api/v1/pulse", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `astrolabe_session=${await signSession(maria)}`,
      },
      body: JSON.stringify({
        employeeId: "E-1045",
        stage: "first_week",
        score: 4,
        consentId: "CN-002",
      }),
    });
    expect((await pulse.POST(someoneElse)).status).toBe(403);
  });

  test("consent changes come back with the recomputed band", async () => {
    const consent = await import("../../src/app/api/v1/consent/route");
    const maria = newSession({ sub: "E-1042", role: "employee", name: "Maria", scope: ["E-1042"] });
    const response = await consent.POST(
      new NextRequest("http://localhost:3100/api/v1/consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `astrolabe_session=${await signSession(maria)}`,
        },
        body: JSON.stringify({
          employeeId: "E-1042",
          purpose: "pulse_capture",
          granted: false,
          version: "v1",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.receiptId).toStartWith("RC-");
    expect(payload.data.effect).toBeDefined();
    expect(payload.data.effect.suppressedFamilies).toContain("PS");

    // Restore the grant: this test writes to the shared ledger, and a later
    // snapshot run must not inherit somebody else's consent state.
    await consent.POST(
      new NextRequest("http://localhost:3100/api/v1/consent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `astrolabe_session=${await signSession(maria)}`,
        },
        body: JSON.stringify({
          employeeId: "E-1042",
          purpose: "pulse_capture",
          granted: true,
          version: "v1",
        }),
      }),
    );
  });
});

describe("audit chain", () => {
  test("a fresh chain is not treated as proof", () => {
    resetChainForTesting();
    const empty = verifyChain();
    expect(empty.valid).toBe(false);
    expect(empty.reason).toContain("empty");
  });

  test("appending verifies, tampering breaks it, and the break is located", () => {
    resetChainForTesting();
    appendAudit({
      actor: "HRBP-1",
      actorRole: "hrbp",
      action: "hrbp.record.open",
      subject: "E-1042",
      lawfulBasis: "legitimate_interests",
      purpose: "early_warning",
    });
    appendAudit({
      actor: "E-1042",
      actorRole: "employee",
      action: "me.data.read",
      subject: "E-1042",
      lawfulBasis: "contract_necessary",
      purpose: "employee_self_view",
    });
    appendAudit({
      actor: "MGR-1",
      actorRole: "manager",
      action: "manager.cohort.read",
      subject: "MGR-1",
      lawfulBasis: "legitimate_interests",
    });
    expect(verifyChain().valid).toBe(true);

    const log = viewLogFor("E-1042");
    expect(log.length).toBe(2);
    expect(log.map((r) => r.actor)).toContain("HRBP-1");

    // The employee's "who has looked at me" panel renders directly from this
    // projection, so its field names and nullability are the contract. The Me
    // screen read `at` and a non-nullable `purpose`, and threw on the first
    // row written without one — which is every engine and system write.
    appendAudit({
      actor: "SYSTEM",
      actorRole: "system",
      action: "engine.assess",
      subject: "E-1042",
      lawfulBasis: "legitimate_interests",
    });
    const [newest] = viewLogFor("E-1042");
    expect(newest.actorRole).toBe("system");
    expect(newest.purpose).toBeNull();
    expect(typeof newest.timestamp).toBe("string");
    expect(newest.lawfulBasis).toBe("legitimate_interests");

    // Editing a row in place must be detected, and the report must say where.
    const stillValid = __tamperForTesting(1, { action: "silently.changed" });
    expect(stillValid).toBe(false);
    const broken = verifyChain();
    expect(broken.brokenAt).toBe(1);
    expect(broken.valid).toBe(false);
  });

  test("deleting a row is detected as a broken link", () => {
    resetChainForTesting();
    for (let i = 0; i < 4; i++) {
      appendAudit({
        actor: "system",
        actorRole: "system",
        action: `tick:${i}`,
        subject: "E-1042",
        lawfulBasis: "legitimate_interests",
      });
    }
    expect(verifyChain().valid).toBe(true);
    const rows = readAuditChain();
    __tamperForTesting(rows[2].seq, { prevHash: "f".repeat(64) });
    expect(verifyChain().valid).toBe(false);
  });
});

describe("purpose limitation", () => {
  test("a payload carrying a performance or disciplinary field is refused", () => {
    expect(() =>
      assertNotUsedForPerformance({ employeeId: "E-1042", performanceScore: 3 }),
    ).toThrow();
    expect(() =>
      assertNotUsedForPerformance({ employeeId: "E-1042", disciplinaryUse: "yes" }),
    ).toThrow();
    expect(() =>
      assertNotUsedForPerformance({ employeeId: "E-1042", ownedSteps: [] }),
    ).not.toThrow();
    expect(PERFORMANCE_USE).toBe("forbidden");
  });
});
