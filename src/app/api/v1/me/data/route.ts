/**
 * ASTROLABE API — /api/v1/me/data (GET)
 * "Everything we hold about me" — privacy SAR-style export.
 * PII minimised; pulse responses only surfaced when consent granted.
 */
import { NextRequest } from "next/server";
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

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const start = Date.now();
  const employeeId = req.nextUrl.searchParams.get("employeeId");

  if (!employeeId) {
    return error("E_VALIDATION", "`employeeId` query parameter is required", 422, {
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
  const myPulseResponses = pulseConsent
    ? pulseResponses.filter((p) => p.employeeId === employeeId)
    : [];

  const myConsentRecords = consentRecords.filter((c) => c.employeeId === employeeId);

  const auditEvents: unknown[] = [];

  const viewLog = [
    {
      actor: "Fatima Al-Mansouri",
      action: "read_record",
      at: "2024-10-19T08:00:00Z",
      purpose: "hrbp_review",
    },
  ];

  const data = {
    employee: employeeRecord,
    journeyEvents,
    serviceRequests: myServiceRequests,
    pulseResponses: myPulseResponses,
    pulseConsentGranted: pulseConsent,
    consentRecords: myConsentRecords,
    auditEvents,
    viewLog,
    exportLink: `/api/v1/me/data?format=json&employeeId=${encodeURIComponent(employeeId)}`,
    generatedAt: new Date().toISOString(),
    snapshotAt: NOW.toISOString(),
  };

  return success(data, {
    servedFrom: "live",
    asOf: new Date().toISOString(),
    latencyMs: Date.now() - start,
  });
}
