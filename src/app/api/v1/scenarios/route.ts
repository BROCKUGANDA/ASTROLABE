/**
 * ASTROLABE API — /api/v1/scenarios (GET)
 * Returns the 5 seeded demo scenarios used by judge mode's switcher.
 */
import { NextRequest } from "next/server";
import { success } from "@/lib/api/envelope";

export const dynamic = "force-dynamic";

interface Scenario {
  id: string;
  employeeId: string;
  title: string;
  description: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "S1",
    employeeId: "E-1042",
    title: "Day-5 joiner, laptop late",
    description:
      "Maria Santos is on day 5 of first_week. Her IT kit was started 3 days ago but never completed — the laptop is late and her access provisioning is blocked downstream. Pulse score 2/5 with a help-seeking comment. Engine should land on Friction or Blocked.",
  },
  {
    id: "S2",
    employeeId: "E-1043",
    title: "Visa stalled mover",
    description:
      "Daniel Okonkwo's visa application was started 7 days ago with no approval yet. The DP-02 hard-trip signal should fire (visa stalled > 7 days), forcing the band to Blocked regardless of any other low scores.",
  },
  {
    id: "S3",
    employeeId: "E-1044",
    title: "Payroll cutoff approaching",
    description:
      "Aisha Rahman is 4 days past her effective date. Role access and payroll change are both in_progress, and dual reporting is waiting_owner. The MB-04 hard trip should fire if the payroll cutoff is within 7 days — forcing Blocked.",
  },
  {
    id: "S4",
    employeeId: "E-1045",
    title: "On track first-day",
    description:
      "James Park is on his first day. Most pre-boarding and visa steps are done, kit is issued, and access provisioning is started. Pulse score 4/5. Engine should land on Steady — a control case to verify the band floor works.",
  },
  {
    id: "S5",
    employeeId: "E-1046",
    title: "Handover pending",
    description:
      "Sara Kovač's transfer was signed 30 days ago, but the releasing manager handover has been in_progress for 6 days. DP-05 should fire (handover pending > 5 days). Effective date is 10 days away, so MB-04 has not yet tripped.",
  },
];

export async function GET(_req: NextRequest) {
  const start = Date.now();
  return success(
    { scenarios: SCENARIOS },
    {
      servedFrom: "live",
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    },
  );
}
