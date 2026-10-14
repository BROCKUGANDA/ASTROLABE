/**
 * ASTROLABE API — /api/v1/notifications (GET)
 * PRD §07 — In-app inbox mirrors every message sent. Defaults to the
 * fewest notifications that keep a journey moving. Quiet hours respected
 * in the employee's timezone. One kill switch stops all outbound.
 *
 * Returns the full inbox for an employee plus the quiet-hours window,
 * digest schedule, and kill-switch state.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { NOW } from "@/lib/data/pack";
import {
  getNotifications,
  isKillSwitchOn,
  type NotificationsEnvelope,
} from "@/lib/notifications/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const start = Date.now();
  const employeeId = req.nextUrl.searchParams.get("employeeId");

  if (!employeeId) {
    return error("E_VALIDATION", "`employeeId` is required", 422, {
      hint: "Pass ?employeeId=E-1042 to fetch the inbox.",
    });
  }

  const items = getNotifications(employeeId);

  const payload: NotificationsEnvelope = {
    items,
    quietHours: { start: "22:00", end: "07:00", tz: "Asia/Dubai" },
    killSwitch: isKillSwitchOn(),
    digest: { enabled: true, scheduledAt: "08:00" },
  };

  return success(payload, {
    servedFrom: "live",
    asOf: NOW.toISOString(),
    latencyMs: Date.now() - start,
  });
}
