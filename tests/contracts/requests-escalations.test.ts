/**
 * Contract tests — requests intake, transitions, and escalation persistence.
 *
 * These call the REAL route handlers (and the real store entry points) and
 * assert on what comes back plus what is in the shared in-memory data pack.
 * Nothing here re-implements the intake/escalation logic: if the wiring is
 * removed, these tests fail.
 *
 * Session note: the routes now expect a signed-in caller, so every call is
 * preceded by a real POST /api/v1/auth/sign-in and carries its cookie, the
 * same way tests/privacy/authority.test.ts does. (The three routes are not
 * themselves guarded yet — auth on them is owned by src/lib/privacy, not here.)
 *
 * Isolation note: tests/contracts runs BEFORE tests/engine and tests/privacy
 * in `bun test`, and the data pack is module-level shared state. Everything
 * this file mutates (serviceRequests rows, the escalation store) is rolled
 * back in afterAll so the engine snapshot suite sees the pristine pack.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { serviceRequests } from "../../src/lib/data/pack";
import { engineNow } from "../../src/lib/engine/engine";
import { duplicatesForEmployee } from "../../src/lib/requests/intake";
import {
  allEscalations,
  clearEscalations,
  escalationById,
  escalationsForEmployee,
  rerouteExpiredAcknowledgements,
} from "../../src/lib/escalations/store";

const signInRoute = await import("../../src/app/api/v1/auth/sign-in/route");
const requestsRoute = await import("../../src/app/api/v1/requests/route");
const transitionRoute = await import(
  "../../src/app/api/v1/requests/[id]/transition/route"
);
const escalationsRoute = await import("../../src/app/api/v1/escalations/route");

const BASE = "http://localhost:3100";

/* ------------------------------------------------------------------
   Helpers — real handlers, real cookies, no re-implementations.
   ------------------------------------------------------------------ */

async function cookieFor(body: Record<string, unknown>): Promise<string> {
  const res = await signInRoute.POST(
    new NextRequest(`${BASE}/api/v1/auth/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  expect(res.status).toBe(200);
  const setCookies: string[] =
    typeof (res.headers as Headers).getSetCookie === "function"
      ? (res.headers as Headers).getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  const token = setCookies
    .join(";")
    .match(/astrolabe_session=([^;]+)/)?.[1];
  expect(token, "sign-in must set the session cookie").not.toBeNull();
  expect((token ?? "").length > 10).toBe(true);
  return `astrolabe_session=${token}`;
}

const createdRequestIds: string[] = [];

function itKitPayload(overrides: Record<string, unknown> = {}) {
  return {
    kit_type: "standard_laptop",
    delivery_location: "DXB",
    stage: "first_day",
    start_date: "2024-10-20",
    ...overrides,
  };
}

async function postCreate(
  cookie: string,
  employeeId: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
) {
  const res = await requestsRoute.POST(
    new NextRequest(`${BASE}/api/v1/requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        "x-request-id": `create-${employeeId}`,
        ...headers,
      },
      body: JSON.stringify({ employeeId, type: "it_kit", payload }),
    })
  );
  const body = await res.json();
  if (res.status === 200 && body.data?.id && !body.data.duplicate) {
    createdRequestIds.push(body.data.id);
  }
  return { status: res.status, body };
}

let txSeq = 0;
async function postTransition(
  cookie: string,
  id: string,
  to: string,
  extra: Record<string, unknown> = {}
) {
  const res = await transitionRoute.POST(
    new NextRequest(`${BASE}/api/v1/requests/${id}/transition`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
        "x-request-id": `tx-${id}-${to}-${++txSeq}`,
      },
      body: JSON.stringify({ to, idempotencyKey: `tx-key-${id}-${++txSeq}`, ...extra }),
    }),
    { params: Promise.resolve({ id }) }
  );
  return { status: res.status, body: await res.json() };
}

async function postEscalation(cookie: string, body: Record<string, unknown>) {
  const res = await escalationsRoute.POST(
    new NextRequest(`${BASE}/api/v1/escalations`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, "x-request-id": "escalation-test" },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: await res.json() };
}

const storedRequest = (id: string) => serviceRequests.find((r) => r.id === id);

/* ------------------------------------------------------------------
   Sessions (real sign-in route first, per the contract)
   ------------------------------------------------------------------ */

const cookies: Record<string, string> = {};
const [
  c1043,
  c1044,
  c1045,
  c1046,
  c1047,
  cHrbp1,
] = await Promise.all([
  cookieFor({ employeeId: "E-1043" }),
  cookieFor({ employeeId: "E-1044" }),
  cookieFor({ employeeId: "E-1045" }),
  cookieFor({ employeeId: "E-1046" }),
  cookieFor({ employeeId: "E-1047" }),
  cookieFor({ hrbpId: "HRBP-1" }),
]);
cookies["E-1043"] = c1043;
cookies["E-1044"] = c1044;
cookies["E-1045"] = c1045;
cookies["E-1046"] = c1046;
cookies["E-1047"] = c1047;
cookies["HRBP-1"] = cHrbp1;

describe("requests POST — server-derived dedup", () => {
  test("the same request twice → 200, duplicate: true, exactly one new record", async () => {
    const payload = itKitPayload();
    // No idempotency key at all: a create is valid without one now.
    const first = await postCreate(cookies["E-1043"], "E-1043", payload);
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.data.duplicate).toBe(false);
    expect(first.body.data.id).toStartWith("SR-");
    expect(first.body.data.expectedBy, "expectedBy must come back from the working calendar").toStartWith("20");
    const createdId = first.body.data.id as string;

    const second = await postCreate(cookies["E-1043"], "E-1043", payload);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.ref).toBe(createdId);
    expect(second.body.data.id).toBe(createdId);
    expect(second.body.data.expectedBy).toStartWith("20");

    const rows = serviceRequests.filter(
      (r) => r.employeeId === "E-1043" && r.type === "it_kit" && r.payloadHash === first.body.data.payloadHash
    );
    expect(rows.length, "a double-submit must create exactly one record").toBe(1);

    // The HRBP view sees the repeat.
    const dupEvents = duplicatesForEmployee("E-1043");
    expect(dupEvents.length).toBe(1);
    expect(dupEvents[0].via).toBe("payload");
    expect(dupEvents[0].existingId).toBe(createdId);
  });

  test("10 identical creates fired concurrently → exactly one record", async () => {
    const payload = itKitPayload({ delivery_location: "AUH" });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => postCreate(cookies["E-1044"], "E-1044", payload))
    );
    const fresh = results.filter((r) => r.status === 200 && r.body.data?.duplicate === false);
    const dupes = results.filter((r) => r.status === 200 && r.body.data?.duplicate === true);
    expect(fresh.length, "exactly one concurrent create may commit").toBe(1);
    expect(dupes.length).toBe(9);
    const refs = new Set(results.map((r) => r.body.data.ref));
    expect(refs.size, "all ten calls return the same ref").toBe(1);

    const rows = serviceRequests.filter(
      (r) => r.employeeId === "E-1044" && r.type === "it_kit" && r.payloadHash === fresh[0].body.data.payloadHash
    );
    expect(rows.length).toBe(1);
  });

  test("same idempotency key, different payload → 409 E_CONFLICT", async () => {
    const key = "caller-key-e1045";
    const a = await postCreate(cookies["E-1045"], "E-1045", itKitPayload(), { "x-idempotency-key": key });
    expect(a.status).toBe(200);
    expect(a.body.data.duplicate).toBe(false);

    const b = await postCreate(
      cookies["E-1045"],
      "E-1045",
      itKitPayload({ kit_type: "cabin_crew" }),
      { "x-idempotency-key": key }
    );
    expect(b.status).toBe(409);
    expect(b.body.error.code).toBe("E_CONFLICT");

    // The same key with the SAME payload still replays the original ticket.
    const c = await postCreate(cookies["E-1045"], "E-1045", itKitPayload(), { "x-idempotency-key": key });
    expect(c.status).toBe(200);
    expect(c.body.data.duplicate).toBe(true);
    expect(c.body.data.id).toBe(a.body.data.id);
  });
});

describe("requests transition — reopened, rejections, server-side counts", () => {
  let reopenedId: string | null = null;

  test("reopened is a valid target status and reachable via legal edges", async () => {
    const created = await postCreate(cookies["E-1046"], "E-1046", itKitPayload());
    expect(created.status).toBe(200);
    reopenedId = created.body.data.id as string;

    // (a) before the wiring, 'reopened' 422s at the VALID_STATUSES gate.
    for (const to of ["acknowledged", "in_progress", "resolved", "reopened"]) {
      const step = await postTransition(cookies["E-1046"], reopenedId, to);
      expect(step.status, `submitted→…→${to} must be legal`).toBe(200);
      expect(step.body.data.status).toBe(to);
    }

    const row = storedRequest(reopenedId);
    expect(row?.status).toBe("reopened");
  });

  test("illegal edges return 409 (and are logged by the route)", async () => {
    // This request is now 'reopened'; reopened→closed is not in the machine.
    const illegal = await postTransition(cookies["E-1046"], reopenedId as string, "closed");
    expect(illegal.status).toBe(409);
    expect(illegal.body.error.code).toBe("E_CONFLICT");

    const fresh = await postCreate(cookies["E-1046"], "E-1046", itKitPayload({ kit_type: "replacement" }));
    expect(fresh.status).toBe(200);
    const bad = await postTransition(cookies["E-1046"], fresh.body.data.id, "closed");
    expect(bad.status).toBe(409);
  });

  test("reassigned/returned increment reassignCount/returnCount on the server", async () => {
    const created = await postCreate(cookies["E-1047"], "E-1047", itKitPayload());
    const id = created.body.data.id as string;
    expect(created.body.data.reassignCount).toBe(0);

    await postTransition(cookies["E-1047"], id, "acknowledged");
    await postTransition(cookies["E-1047"], id, "in_progress");

    const firstReassign = await postTransition(cookies["E-1047"], id, "reassigned");
    expect(firstReassign.status).toBe(200);
    expect(firstReassign.body.data.reassignCount, "API response carries the new count").toBe(1);

    await postTransition(cookies["E-1047"], id, "in_progress");
    const secondReassign = await postTransition(cookies["E-1047"], id, "reassigned");
    expect(secondReassign.body.data.reassignCount).toBe(2);

    await postTransition(cookies["E-1047"], id, "in_progress");
    const returned = await postTransition(cookies["E-1047"], id, "returned", {
      returnQuestion: {
        question: "Which desk floor are you on?",
        returnedBy: "O-IT-1",
      },
    });
    expect(returned.status).toBe(200);
    expect(returned.body.data.returnCount).toBe(1);

    const row = storedRequest(id);
    expect(row?.reassignCount, "two reassigned transitions → reassignCount == 2 stored").toBe(2);
    expect(row?.returnCount, "a returned transition increments returnCount").toBe(1);
  });
});

describe("escalations POST — packet persistence, dedup, ack clock, re-route", () => {
  const escalationBody = {
    employeeId: "E-1042",
    decisionRequested: "Unblock the stalled visa step",
    namedOwnerId: "HRBP-1",
  };
  let escalationId: string | null = null;

  test("the first escalation is stored, not just built", async () => {
    const res = await postEscalation(cookies["HRBP-1"], escalationBody);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.duplicate).toBe(false);
    expect(res.body.data.escalationId).toStartWith("ESC-");
    expect(res.body.data.stored).toBe(true);
    escalationId = res.body.data.escalationId as string;

    const stored = escalationById(escalationId);
    expect(stored, "the packet must live in the escalation store").not.toBeNull();
    expect(stored?.rootCause).toBe(res.body.data.rootCause);
    expect(res.body.data.namedOwner.name).toBeString();
    expect(res.body.data.backupOwner?.id, "a named backup owner must be exposed").toBeString();
    expect(res.body.data.employeeNote.en).toContain("free-text comments were NOT included");
    expect(res.body.data.freeTextExcluded).toBe(true);
  });

  test("second escalation, same employee + root cause → duplicate: true, one record", async () => {
    const res = await postEscalation(cookies["HRBP-1"], escalationBody);
    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(res.body.data.escalationId).toBe(escalationId);

    const forEmployee = escalationsForEmployee("E-1042");
    expect(forEmployee.length, "the second call must not file another packet").toBe(1);
    expect(forEmployee[0].duplicateCount).toBe(1);
    expect(forEmployee[0].audit.some((a) => a.action === "duplicate_suppressed")).toBe(true);
  });

  test("ack deadline is present and in the future; expiry re-routes to the backup", async () => {
    const stored = escalationById(escalationId as string);
    expect(stored).not.toBeNull();
    const deadline = new Date(stored!.ackDeadlineAt).getTime();
    expect(deadline, "4-working-hour ack deadline must be computed").toBeGreaterThan(engineNow().getTime());
    expect(stored!.acknowledgedAt).toBeNull();

    // Snapshot the humans BEFORE the reroute: the store mutates the packet in
    // place, so namedOwner/backupOwner swap on re-route.
    const originalOwnerId = stored!.packet.namedOwner.id;
    const backupOwnerId = stored!.packet.backupOwner!.id;
    expect(backupOwnerId).not.toBe(originalOwnerId);

    // Inject a clock well past the deadline — the real store entry point.
    const past = new Date(deadline + 14 * 24 * 60 * 60 * 1000);
    const result = rerouteExpiredAcknowledgements(past);
    const moved = result.rerouted.find((r) => r.packetId === escalationId);
    expect(moved, "an unacknowledged packet past its deadline must reroute").not.toBeUndefined();
    expect(moved!.fromOwnerId).toBe(originalOwnerId);
    expect(moved!.toOwnerId).toBe(backupOwnerId);

    const after = escalationById(escalationId as string)!;
    expect(after.packet.namedOwner.id).toBe(backupOwnerId);
    expect(after.reroutedAt).not.toBeNull();
    const auditEntry = after.audit.find((a) => a.action === "rerouted_to_backup");
    expect(auditEntry, "the re-route appends an audit entry").toBeDefined();
    expect(auditEntry!.detail).toContain("did not acknowledge");
  });

  test("escalation count is exactly the one stored packet for this employee", () => {
    expect(allEscalations().filter((e) => e.packet.employeeId === "E-1042").length).toBe(1);
  });
});

/* ------------------------------------------------------------------
   Roll back every mutation so tests/engine sees the pristine pack.
   ------------------------------------------------------------------ */
afterAll(() => {
  for (const id of createdRequestIds) {
    const idx = serviceRequests.findIndex((r) => r.id === id);
    if (idx >= 0) serviceRequests.splice(idx, 1);
  }
  clearEscalations();
});
