/**
 * ASTROLABE API — /api/v1/admin/adv-test (POST)
 * Adversarial test runner — server-side handler for the Backtest tab.
 * PRD §22.
 *
 * Two test kinds:
 *   · `conflicting_policies` — calls retrieve() directly and checks for
 *     an equal-authority conflict (top-2 chunks from different docs
 *     with scores within 5%). Returns the chunks + conflict status +
 *     abstain reason + handoff owner. Does not mutate any state.
 *
 *   · `missing_consent` — temporarily pushes a revoked consent record
 *     (so PS family is suppressed) AND a future-dated event (so DQ-03
 *     fires). Runs assess() to capture the recomputed band, then
 *     cleans up: removes the future event and pushes a re-grant so
 *     consent is restored. All mutations are in-memory and reverted.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { retrieve, type RetrievedChunk } from "@/lib/policy/retrieval";
import { assess } from "@/lib/engine/engine";
import {
  employees,
  events,
  consentRecords,
  type ConsentRecord,
  type JourneyEvent,
  type Locale,
  NOW as PACK_NOW,
} from "@/lib/data/pack";

export const dynamic = "force-dynamic";

/* Handoff owner lookup by owner-group (PRD §13). The conflict handoff
   defaults to the top chunk's owning team. */
const HANDOFF_BY_GROUP: Record<string, { name: string; role: string; email: string }> = {
  Mobility: {
    name: "Rania Hassan",
    role: "Mobility Specialist",
    email: "mobility@astrolabe.internal",
  },
  Payroll: { name: "Mona Said", role: "Payroll Specialist", email: "payroll@astrolabe.internal" },
  HR: {
    name: "Fatima Al-Mansouri",
    role: "HRBP — Cabin Crew",
    email: "fatima.hrbp@astrolabe.internal",
  },
  IT: {
    name: "Ahmed Al-Rashid",
    role: "IT Provisioning Lead",
    email: "it-prov@astrolabe.internal",
  },
  Immigration: {
    name: "Saeed Al-Marri",
    role: "Immigration Officer",
    email: "immigration@astrolabe.internal",
  },
  Learning: {
    name: "Lina Khoury",
    role: "Learning Coordinator",
    email: "learning@astrolabe.internal",
  },
  Facilities: {
    name: "Omar Farouk",
    role: "Facilities Supervisor",
    email: "facilities@astrolabe.internal",
  },
};

/* Map docSlug → owner group for handoff resolution */
const DOC_TO_GROUP: Record<string, keyof typeof HANDOFF_BY_GROUP> = {
  "relocation-policy": "Mobility",
  "mobility-policy": "Mobility",
  "payroll-policy": "Payroll",
  "immigration-policy": "Immigration",
  "it-policy": "IT",
  "onboarding-policy": "HR",
  "learning-policy": "Learning",
  "facilities-policy": "Facilities",
};

const CONFLICT_THRESHOLD = 0.05; // 5% — scores within this ratio are "equal authority"

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: { test?: string; question?: string; employeeId?: string; futureEventId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const test = body.test ?? "";

  /* =====================================================
     (b) Conflicting policies
     ===================================================== */
  if (test === "conflicting_policies") {
    const question = (body.question ?? "What's the process for transfer?").trim();
    if (!question) {
      return error("E_VALIDATION", "`question` is required for conflicting_policies test", 422);
    }

    const retrieved: RetrievedChunk[] = retrieve(question, "en" as Locale, 8);
    const chunks = retrieved.slice(0, 5).map((r) => ({
      docSlug: r.chunk.docSlug,
      title: r.chunk.title,
      section: r.chunk.section,
      score: r.score,
      matchedTerms: r.matchedTerms,
    }));

    if (chunks.length < 2) {
      return success(
        {
          question,
          chunks,
          conflictDetected: false,
          scoreGap: 0,
          abstainReason: null,
          handoff: null,
        },
        {
          servedFrom: "deterministic",
          asOf: PACK_NOW.toISOString(),
          latencyMs: Date.now() - start,
        },
      );
    }

    const top = chunks[0];
    const second = chunks[1];
    const scoreGap = Math.abs(top.score - second.score);
    const differentDocs = top.docSlug !== second.docSlug;
    const withinThreshold = top.score > 0 && scoreGap / top.score <= CONFLICT_THRESHOLD;
    const conflictDetected = differentDocs && withinThreshold;

    let abstainReason: string | null = null;
    let handoff: { name: string; role: string; email: string } | null = null;

    if (conflictDetected) {
      abstainReason = "equal_authority_conflict";
      const group = DOC_TO_GROUP[top.docSlug] ?? "HR";
      handoff = HANDOFF_BY_GROUP[group] ?? HANDOFF_BY_GROUP.HR;
    }

    return success(
      {
        question,
        chunks,
        conflictDetected,
        scoreGap,
        abstainReason,
        handoff,
      },
      { servedFrom: "deterministic", asOf: PACK_NOW.toISOString(), latencyMs: Date.now() - start },
    );
  }

  /* =====================================================
     (c) Missing consent + out-of-order events
     ===================================================== */
  if (test === "missing_consent") {
    const employeeId = body.employeeId ?? "E-1042";
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) {
      return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404);
    }

    const futureEventId = body.futureEventId ?? `ADV-FUTURE-${Date.now().toString(36)}`;
    const futureEventAt = new Date(PACK_NOW.getTime() + 2 * 24 * 3600 * 1000).toISOString();
    const asOf = PACK_NOW;

    /* 1. Baseline assessment (before consent revoke + future event). */
    const beforeAssess = assess(employee, asOf);
    const before = {
      band: beforeAssess.band,
      score: beforeAssess.score,
      suppressedFamilies: beforeAssess.suppressedFamilies as string[],
      psContribution: beforeAssess.signals
        .filter((s) => s.family === "PS")
        .reduce((a, s) => a + s.weight, 0),
    };

    /* 2. Push a revoked consent record (latest = granted=false → PS family
          suppressed via getConsent). Use a grantedAt strictly later than
          any existing record so getConsent picks it up. */
    const revokeRecord: ConsentRecord = {
      id: `CN-ADV-REVOKE-${Date.now().toString(36)}`,
      employeeId,
      purpose: "pulse_capture",
      granted: false,
      grantedAt: new Date(PACK_NOW.getTime() + 1000).toISOString(),
      version: "v1",
      textHash: "th-adv-revoke",
    };
    consentRecords.push(revokeRecord);

    /* 3. Push a future-dated event so DQ-03 fires. */
    const futureEvent: JourneyEvent = {
      id: futureEventId,
      employeeId,
      stepKey: "ob_induction_complete",
      type: "completed",
      occurredAt: futureEventAt,
      recordedAt: PACK_NOW.toISOString(),
      source: "adv-test",
      payloadHash: "h-adv-future",
    };
    events.push(futureEvent);

    /* 4. Re-run assess() with the new state. */
    let afterAssess;
    try {
      afterAssess = assess(employee, asOf);
    } finally {
      /* 5. Clean up — always remove the future event, even on error. */
      const idx = events.findIndex((e) => e.id === futureEventId);
      if (idx >= 0) events.splice(idx, 1);
    }

    const after = {
      band: afterAssess.band,
      score: afterAssess.score,
      suppressedFamilies: afterAssess.suppressedFamilies as string[],
      psContribution: afterAssess.signals
        .filter((s) => s.family === "PS")
        .reduce((a, s) => a + s.weight, 0),
      signals: afterAssess.signals.map((s) => ({ code: s.code, family: s.family })),
    };

    const dq03Raised = afterAssess.signals.some((s) => s.code === "DQ-03");

    /* 6. Restore consent — push a re-grant so getConsent returns true. */
    const regrantRecord: ConsentRecord = {
      id: `CN-ADV-REGRANT-${Date.now().toString(36)}`,
      employeeId,
      purpose: "pulse_capture",
      granted: true,
      grantedAt: new Date(PACK_NOW.getTime() + 2000).toISOString(),
      version: "v1",
      textHash: "th-adv-regrant",
    };
    consentRecords.push(regrantRecord);

    /* 7. Verify restore by re-running assess(). */
    const restoredAssess = assess(employee, asOf);
    const restored = !restoredAssess.suppressedFamilies.includes("PS" as never);

    const disclosure = after.suppressedFamilies.includes("PS")
      ? "Pulse signals are off, so this view uses journey and request data only."
      : "All consent purposes granted — full signal set in use.";

    return success(
      {
        consentRevoked: true,
        futureEventId,
        futureEventAt,
        before,
        after,
        dq03Raised,
        disclosure,
        restored,
      },
      { servedFrom: "deterministic", asOf: asOf.toISOString(), latencyMs: Date.now() - start },
    );
  }

  return error(
    "E_VALIDATION",
    "`test` must be one of: conflicting_policies, missing_consent",
    422,
    { hint: "PRD §22 adversarial cases. Pass `test` and an optional `question` or `employeeId`." },
  );
}
