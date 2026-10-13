/**
 * ASTROLABE API — /api/v1/policies/[slug] (GET)
 * Returns all chunks for a given policy doc slug.
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { policies } from "@/lib/data/pack";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const start = Date.now();
  const { slug } = await params;

  const chunks = policies.filter((p) => p.docSlug === slug);
  if (chunks.length === 0) {
    return error("E_NOT_FOUND", `Policy document '${slug}' not found`, 404, {
      hint: "Try one of: relocation-policy, immigration-policy, it-policy, onboarding-policy, learning-policy, mobility-policy, payroll-policy, facilities-policy",
    });
  }

  const sections = chunks
    .map((c) => ({
      section: c.section,
      effectiveDate: c.effectiveDate,
      reviewDate: c.reviewDate,
      lang: c.lang,
      text: c.text,
    }))
    .sort((a, b) => a.section.localeCompare(b.section));

  const data = {
    docSlug: slug,
    title: chunks[0].title,
    titleAr: chunks[0].titleAr,
    sections,
  };

  return success(data, {
    servedFrom: "live",
    asOf: new Date().toISOString(),
    latencyMs: Date.now() - start,
  });
}
