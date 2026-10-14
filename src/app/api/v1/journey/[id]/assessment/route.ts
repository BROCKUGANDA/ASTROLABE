/**
 * ASTROLABE API — /api/v1/journey/[id]/assessment (GET)
 * Run assess() for a given employee at an optional as-of timestamp.
 * Returns the assessment PLUS the engine trace so judge mode can render
 * the full reasoning path (stage inference, signals fired, fusion band).
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { employees } from "@/lib/data/pack";
import { assess, trace } from "@/lib/engine/engine";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const start = Date.now();
  const { id } = await params;
  const asOfParam = req.nextUrl.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(asOfParam) : new Date();

  if (asOfParam && Number.isNaN(asOf.getTime())) {
    return error("E_VALIDATION", "`asOf` is not a valid date", 422);
  }

  const employee = employees.find((e) => e.id === id);
  if (!employee) {
    return error("E_NOT_FOUND", `Employee ${id} not found`, 404, {
      hint: "Try one of E-1042, E-1043, E-1044, E-1045, E-1046",
    });
  }

  const assessment = assess(employee, asOf);
  const engineTrace = trace(employee, asOf);

  return success(
    { assessment, trace: engineTrace },
    {
      servedFrom: "deterministic",
      asOf: asOf.toISOString(),
      latencyMs: Date.now() - start,
    }
  );
}
