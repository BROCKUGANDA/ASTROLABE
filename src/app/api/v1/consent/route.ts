/**
 * ASTROLABE API — /api/v1/consent (POST)
 * Record a consent grant/revoke. Appends to in-memory consentRecords.
 * Returns a receipt so the employee can prove what they agreed to.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import {
  consentRecords,
  employees,
  type ConsentRecord,
} from "@/lib/data/pack";

export const dynamic = "force-dynamic";

const VALID_PURPOSES: ReadonlySet<ConsentRecord["purpose"]> = new Set([
  "journey_assistance",
  "pulse_capture",
  "share_pulse_summary",
  "comment_retention",
  "aggregate_analytics",
  "manager_visibility",
]);

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: {
    employeeId?: string;
    purpose?: string;
    granted?: boolean;
    version?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const employeeId = body.employeeId ?? "";
  const purpose = body.purpose as ConsentRecord["purpose"] | undefined;
  const granted = body.granted;
  const version = body.version ?? "";

  if (!employeeId) {
    return error("E_VALIDATION", "`employeeId` is required", 422);
  }
  if (!purpose || !VALID_PURPOSES.has(purpose)) {
    return error(
      "E_VALIDATION",
      "`purpose` is required and must be a known purpose",
      422,
      {
        hint: "One of: journey_assistance, pulse_capture, share_pulse_summary, comment_retention, aggregate_analytics, manager_visibility",
      }
    );
  }
  if (typeof granted !== "boolean") {
    return error("E_VALIDATION", "`granted` must be a boolean", 422);
  }
  if (!version) {
    return error("E_VALIDATION", "`version` is required", 422, {
      hint: "Use the current consent text version, e.g. 'v1'.",
    });
  }

  // Optional: warn (not fail) if employee unknown — still allow consent record.
  if (!employees.find((e) => e.id === employeeId)) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404);
  }

  const now = new Date();
  const receiptId = `RC-${now.getTime().toString(36)}`;
  const newRecord: ConsentRecord = {
    id: `CN-${now.getTime().toString(36)}`,
    employeeId,
    purpose,
    granted,
    grantedAt: now.toISOString(),
    version,
    textHash: `th-${purpose}-${version}`,
  };

  // In-memory mutation (prototype only).
  consentRecords.push(newRecord);

  return success(
    {
      receiptId,
      consentRecordId: newRecord.id,
      grantedAt: now.toISOString(),
      purpose,
      granted,
      version,
    },
    {
      servedFrom: "live",
      asOf: now.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
