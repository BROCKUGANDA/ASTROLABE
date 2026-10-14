/**
 * ASTROLABE API — /api/v1/me/data (GET)
 * "Everything we hold about me" — privacy SAR-style export.
 * PII minimised; pulse responses only surfaced when consent granted.
 */
import { NextRequest, NextResponse } from "next/server";
import { success, error } from "@/lib/api/envelope";
import {
  employees,
  events,
  serviceRequests,
  pulseResponses,
  consentRecords,
  getOwner,
  getConsent,
  NOW,
} from "@/lib/data/pack";
import { guard, pulseGuard, purposeHeader } from "@/lib/privacy/guard";
import { verifyChain, viewLogFor } from "@/lib/privacy/audit";
import { PERFORMANCE_USE } from "@/lib/privacy/access";

export const dynamic = "force-dynamic";

/**
 * Retention per record class (PRD §15). Stated here so the employee sees the
 * same numbers the retention job is written against, not a policy PDF.
 */
const RETENTION: Record<string, string> = {
  employeeRecord: "Duration of employment + 6 years",
  journeyEvents: "24 months from occurred_at",
  serviceRequests: "24 months from closed_at",
  pulseScores: "12 months from created_at",
  pulseComments: "90 days, or deleted on revocation",
  consentRecords: "7 years (legal obligation)",
  auditChain: "7 years (legal obligation)",
};

export async function GET(req: NextRequest) {
  const start = Date.now();
  // Only the employee, only about themselves, and a fresh sign-in for the export.
  const auth = await guard(req, "me.data");
  if (!auth.ok) return auth.response;
  const session = auth.session;

  const employeeId = req.nextUrl.searchParams.get("employeeId") ?? session.sub;
  const format = req.nextUrl.searchParams.get("format");

  const claimed = purposeHeader(req) ?? "employee_self_view";
  const permitted = pulseGuard(session, employeeId, claimed, {
    requireReauth: format === "json" || format === "pdf",
    reauthWithinSeconds: 300,
  });
  if (!permitted.ok) return permitted.response;

  if (!employeeId) {
    return error("E_VALIDATION", "An employee id is required.", 422, {
      hint: "?employeeId=E-1042",
    });
  }

  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404, {
      hint: "Try one of E-1042, E-1043, E-1044, E-1045, E-1046",
    });
  }

  // PII-minimised employee record.
  const employeeRecord = {
    id: employee.id,
    ref: employee.ref,
    displayName: employee.displayName,
    journeyType: employee.journeyType,
    stage: employee.stage,
    location: employee.location,
    role: employee.role,
    team: employee.team,
    locale: employee.locale,
    startDate: employee.startDate,
    effectiveDate: employee.effectiveDate,
    manager: (() => {
      const m = getOwner(employee.managerId);
      return m ? { id: m.id, name: m.name, role: m.role } : null;
    })(),
    hrbp: (() => {
      const h = getOwner(employee.hrbpId);
      return h ? { id: h.id, name: h.name, role: h.role } : null;
    })(),
  };

  const journeyEvents = events
    .filter((e) => e.employeeId === employeeId)
    .map((e) => ({
      id: e.id,
      stepKey: e.stepKey,
      type: e.type,
      occurredAt: e.occurredAt,
      recordedAt: e.recordedAt,
      source: e.source,
    }));

  const myServiceRequests = serviceRequests.filter((r) => r.employeeId === employeeId);

  const pulseConsent = getConsent(employeeId, "pulse_capture");
  const commentConsent = getConsent(employeeId, "comment_retention");
  // Scores and comments carry separate consents (PRD §15): the employee sees
  // their own comment text only while comment retention is granted.
  const myPulseResponses = pulseConsent
    ? pulseResponses
        .filter((p) => p.employeeId === employeeId)
        .map((p) =>
          commentConsent ? p : { ...p, commentText: undefined, commentRef: p.commentRef },
        )
    : [];

  const myConsentRecords = consentRecords.filter((c) => c.employeeId === employeeId);

  // The real chain: every read of this record, by whom, when, and under which
  // declared purpose. This is the "who has looked at me" answer (M7, PRD §15).
  const viewLog = viewLogFor(employeeId);
  const chain = verifyChain();

  const data = {
    employee: employeeRecord,
    journeyEvents,
    serviceRequests: myServiceRequests,
    pulseResponses: myPulseResponses,
    pulseConsentGranted: pulseConsent,
    consentRecords: myConsentRecords,
    retention: RETENTION,
    viewLog,
    // Who currently holds a copy of this data, in their own terms.
    sharedWith: [
      {
        party: employeeRecord.hrbp?.name ?? "HR business partner",
        reason: "early warning on stalled journeys",
        carries: "journey and request evidence only",
      },
      {
        party: "Line manager",
        reason: "steps they themselves own",
        carries: "owned steps and cohort aggregates; no sentiment, no scores",
      },
      {
        party: "Service owners",
        reason: "a routed request",
        carries: "the payload the employee confirmed",
      },
    ],
    chainLength: chain.length,
    auditChainVerified: chain.valid,
    exportLink: `/api/v1/me/data?format=json&employeeId=${encodeURIComponent(employeeId)}`,
    printableLink: `/api/v1/me/data?format=print&employeeId=${encodeURIComponent(employeeId)}`,
    generatedAt: new Date().toISOString(),
    snapshotAt: NOW.toISOString(),
    purposeLimitation: {
      performanceUse: PERFORMANCE_USE,
      disciplinaryUse: "forbidden",
      promotionUse: "forbidden",
      visaDecisionUse: "forbidden",
    },
  };

  if (format === "print") {
    // A print-ready document is the honest version of "PDF export" in a
    // prototype: the browser or any headless printer renders it to PDF.
    return new NextResponse(printableSubjectAccess(employeeRecord, data), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `inline; filename="astrolabe-${employeeId}-my-data.html"`,
      },
    });
  }

  if (format === "json") {
    return new NextResponse(
      JSON.stringify(
        { ok: true, data, meta: { requestId: `sar-${employeeId}`, exportedAt: data.generatedAt } },
        null,
        2,
      ),
      {
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="astrolabe-${employeeId}-my-data.json"`,
        },
      },
    );
  }

  return success(data, {
    servedFrom: "live",
    asOf: new Date().toISOString(),
    latencyMs: Date.now() - start,
  });
}

function printableSubjectAccess(
  employee: Record<string, unknown>,
  data: Record<string, unknown>,
): string {
  const rowsOf = (items: unknown[], label: string) =>
    `<h2>${label}</h2><table><tbody>${(items || [])
      .slice(0, 200)
      .map((item) => `<tr><td><code>${escapeHtml(JSON.stringify(item))}</code></td></tr>`)
      .join("")}</tbody></table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ASTROLABE — everything held about ${escapeHtml(String((employee as { displayName?: string }).displayName ?? ""))}</title>
<style>body{font:14px/1.5 system-ui;margin:32px;color:#0B1221}h1{font-size:20px}h2{font-size:15px;margin-top:24px;border-bottom:1px solid #22303F;padding-bottom:4px}table{border-collapse:collapse;width:100%}td{border:1px solid #d7dee7;padding:6px;word-break:break-all}code{font-family:ui-monospace,monospace;font-size:11px}@media print{body{margin:0}}</style>
</head><body>
<h1>Everything ASTROLABE holds about ${escapeHtml(String((employee as { displayName?: string }).displayName ?? ""))}</h1>
<p>Generated ${escapeHtml(String(data.generatedAt))} · journey snapshot at ${escapeHtml(String(data.snapshotAt))} · subject access record, employee copy.</p>
<p><strong>Not used for:</strong> performance, discipline, promotion or visa decisions. That limit is enforced in the API, not only stated here.</p>
${rowsOf((data as { journeyEvents?: unknown[] }).journeyEvents ?? [], "Journey events (retention: " + ((data as { retention?: Record<string, string> }).retention ?? {}).journeyEvents + ")")}
${rowsOf((data as { serviceRequests?: unknown[] }).serviceRequests ?? [], "Service requests")}
${rowsOf((data as { pulseResponses?: unknown[] }).pulseResponses ?? [], "Pulse responses (only with opt-in consent)")}
${rowsOf((data as { consentRecords?: unknown[] }).consentRecords ?? [], "Consent ledger (append-only)")}
${rowsOf((data as { viewLog?: unknown[] }).viewLog ?? [], "Who has viewed this record")}
</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
