/**
 * ASTROLABE API — /api/v1/notifications/action (POST)
 * PRD §07 — Snooze or unsubscribe in every non-critical message. One tap
 * from notification to the exact step. One kill switch stops all outbound.
 *
 * Body: { id: string, action: "read"|"snooze"|"archive"|"kill_switch", hours?: number, enabled?: boolean }
 * Response data: { id: string, action: string, at: string }
 *
 * In-memory state — prototype only. Resets on server restart.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { NOW } from "@/lib/data/pack";
import {
  markRead,
  snooze,
  archive,
  setKillSwitch,
} from "@/lib/notifications/store";

export const dynamic = "force-dynamic";

const VALID_ACTIONS = new Set(["read", "snooze", "archive", "kill_switch"]);

export async function POST(req: NextRequest) {
  const start = Date.now();

  let body: {
    id?: string;
    action?: string;
    hours?: number;
    enabled?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("E_BAD_BODY", "Request body must be valid JSON", 400);
  }

  const action = body.action;
  const id = body.id;

  if (!action || !VALID_ACTIONS.has(action)) {
    return error("E_VALIDATION", "`action` is required and must be known", 422, {
      hint: "One of: read, snooze, archive, kill_switch",
    });
  }

  // kill_switch is global — no id required. enabled defaults to true
  // (turning the switch ON stops all outbound notifications).
  if (action === "kill_switch") {
    const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
    setKillSwitch(enabled);
    return success(
      { id: id ?? "global", action, at: NOW.toISOString(), enabled },
      {
        servedFrom: "live",
        asOf: NOW.toISOString(),
        latencyMs: Date.now() - start,
      }
    );
  }

  if (!id) {
    return error("E_VALIDATION", "`id` is required for this action", 422);
  }

  let at: string;
  switch (action) {
    case "read":
      at = markRead(id);
      break;
    case "snooze": {
      const hours =
        typeof body.hours === "number" && body.hours > 0 ? body.hours : 1;
      at = snooze(id, hours);
      break;
    }
    case "archive":
      at = archive(id);
      break;
    default:
      return error("E_VALIDATION", `Unknown action '${action}'`, 422);
  }

  return success(
    { id, action, at },
    {
      servedFrom: "live",
      asOf: NOW.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
