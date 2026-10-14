/**
 * ASTROLABE API — /api/v1/policies/search (GET)
 * Global policy chunk search (PRD §18-347).
 *
 * Query params:
 *   q    — the search term (required, min 2 chars)
 *   lang — "en" | "ar" | "all" (default: all)
 *   doc  — limit to a specific doc slug (default: all)
 *
 * Reuses the deterministic tokenizer from @/lib/policy/retrieval so the
 * scoring matches the engine's retrieve() path. Returns top 10 chunks with:
 *   { chunkId, docSlug, title, titleAr, section, effectiveDate, reviewDate,
 *     lang, snippet (matching sentence), score (0-100), matchedTerms[] }
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import { policies, NOW, type Locale } from "@/lib/data/pack";
import { tokenize } from "@/lib/policy/retrieval";

export const dynamic = "force-dynamic";

const MAX_RESULTS = 10;
const MIN_QUERY = 2;

interface SearchHit {
  chunkId: string;
  docSlug: string;
  title: string;
  titleAr: string;
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: Locale;
  snippet: string;
  score: number;
  matchedTerms: string[];
}

function pickBestSentence(text: string, qTokens: string[]): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return text;
  let best = sentences[0];
  let bestScore = -1;
  for (const s of sentences) {
    const sTokens = new Set(tokenize(s));
    const overlap = qTokens.filter((t) => sTokens.has(t)).length;
    // Slight boost for normative content (numbers, durations).
    const normative =
      /\b(\d+|aed|days?|hours?|weeks?|months?|years?|must|shall|required|eligible)\b/i.test(s)
        ? 0.5
        : 0;
    const score = overlap + normative;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

function isStale(reviewDate: string): boolean {
  return new Date(reviewDate) < NOW;
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const lang = (req.nextUrl.searchParams.get("lang") ?? "all").toLowerCase();
  const doc = (req.nextUrl.searchParams.get("doc") ?? "").trim();

  if (q.length < MIN_QUERY) {
    return error("E_VALIDATION", `Query must be at least ${MIN_QUERY} characters`, 422, {
      hint: "Try a longer search term.",
    });
  }

  const validLangs = new Set(["en", "ar", "all"]);
  if (!validLangs.has(lang)) {
    return error("E_VALIDATION", `'lang' must be one of: en, ar, all`, 422);
  }

  const qTokens = tokenize(q);
  if (qTokens.length === 0) {
    return success(
      { items: [] as SearchHit[], total: 0 },
      {
        servedFrom: "live",
        asOf: new Date().toISOString(),
        latencyMs: Date.now() - start,
      },
    );
  }

  // Filter pool by lang + doc.
  const pool = policies.filter((p) => {
    if (lang !== "all" && p.lang !== lang) return false;
    if (doc && p.docSlug !== doc) return false;
    return true;
  });

  // Compute BM25-ish score per chunk, reusing the same tokenizer the engine
  // uses so the score stays consistent with retrieve().
  const avgLen =
    pool.reduce((a, c) => a + tokenize(c.text + " " + c.title + " " + c.section).length, 0) /
    Math.max(1, pool.length);
  const k1 = 1.5;
  const b = 0.75;

  const hits: SearchHit[] = [];
  for (const chunk of pool) {
    const chunkTokens = tokenize(chunk.text + " " + chunk.title + " " + chunk.section);
    const chunkSet = new Set(chunkTokens);
    const matchedTerms = Array.from(new Set(qTokens.filter((t) => chunkSet.has(t))));
    if (matchedTerms.length === 0) continue;
    const tf = matchedTerms.length;
    const tfNorm =
      (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (chunkTokens.length / Math.max(1, avgLen))));
    const sectionMatch = qTokens.some((t) => chunk.section.toLowerCase().includes(t));
    const titleMatch = qTokens.some((t) => chunk.title.toLowerCase().includes(t));
    const raw = tfNorm + (sectionMatch ? 1.5 : 0) + (titleMatch ? 1.0 : 0);

    // Snippet — the best-matching sentence.
    const snippet = pickBestSentence(chunk.text, qTokens);

    // Normalise to a 0-100 score. We use a soft saturating function so very
    // high-overlap chunks don't blow past 100 and a single-term match still
    // registers on the scale.
    const scorePct = Math.max(8, Math.min(100, Math.round(raw * 28)));

    hits.push({
      chunkId: chunk.id,
      docSlug: chunk.docSlug,
      title: chunk.title,
      titleAr: chunk.titleAr,
      section: chunk.section,
      effectiveDate: chunk.effectiveDate,
      reviewDate: chunk.reviewDate,
      lang: chunk.lang,
      snippet,
      score: scorePct,
      matchedTerms,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, MAX_RESULTS);

  return success(
    {
      items: top,
      total: hits.length,
      stale: top.some((h) => isStale(h.reviewDate)),
    },
    {
      servedFrom: "live",
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    },
  );
}
