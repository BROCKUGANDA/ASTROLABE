/**
 * ASTROLABE API — /api/v1/search (GET)
 * Global cross-corpus search (PRD §18-347).
 *
 * Searches across THREE corpora in a single request:
 *   1. Policies  — top 5 chunks, scored via the same BM25-ish scorer the
 *                  policy search route uses (token overlap + section/title
 *                  boost). Returns a matching-sentence snippet.
 *   2. Steps     — the journey steps for THIS employee (label, stepKey,
 *                  stage, ownerGroup). Score = token overlap.
 *   3. Requests  — the service requests for THIS employee (ref, type,
 *                  status, ownerGroup). Score = token overlap.
 *
 * Query params:
 *   q            — the search term (required, min 2 chars)
 *   employeeId   — defaults to E-1042 (required for steps + requests)
 *
 * Envelope: { ok, data: { policies: [], steps: [], requests: [], total: N },
 *             meta, error }
 */
import { NextRequest } from "next/server";
import { success, error } from "@/lib/api/envelope";
import {
  policies,
  employees,
  serviceRequests,
  steps as ALL_STEPS,
  NOW,
  type Locale,
  type RequestType,
} from "@/lib/data/pack";
import { tokenize } from "@/lib/policy/retrieval";
import { INTAKE_SCHEMAS } from "@/lib/actions/actions";
import { computeStepState, eventsForEmployee } from "@/lib/engine/engine";

export const dynamic = "force-dynamic";

const MAX_POLICY_HITS = 5;
const MAX_STEP_HITS = 8;
const MAX_REQUEST_HITS = 8;
const MIN_QUERY = 2;

/* ---------- Shared types ---------- */

interface PolicyHit {
  type: "policy";
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

interface StepHit {
  type: "step";
  stepKey: string;
  label: string;
  labelAr: string;
  stage: string;
  status: string;
  ownerGroup: string;
  journeyType: string;
  score: number;
  matchedTerms: string[];
}

interface RequestHit {
  type: "request";
  ref: string;
  typeLabel: string;
  typeLabelAr: string;
  requestType: RequestType;
  status: string;
  ownerGroup: string;
  openedAt: string;
  score: number;
  matchedTerms: string[];
}

interface SearchData {
  policies: PolicyHit[];
  steps: StepHit[];
  requests: RequestHit[];
  total: number;
}

/* ---------- Helpers (mirrored from /policies/search) ---------- */

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
    const normative = /\b(\d+|aed|days?|hours?|weeks?|months?|years?|must|shall|required|eligible)\b/i.test(s) ? 0.5 : 0;
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

/* ---------- Corpus 1: Policies ---------- */

function searchPolicies(qTokens: string[]): PolicyHit[] {
  if (qTokens.length === 0) return [];
  const pool = policies;
  const avgLen =
    pool.reduce(
      (a, c) => a + tokenize(c.text + " " + c.title + " " + c.section).length,
      0,
    ) / Math.max(1, pool.length);
  const k1 = 1.5;
  const b = 0.75;

  const hits: PolicyHit[] = [];
  for (const chunk of pool) {
    const chunkTokens = tokenize(chunk.text + " " + chunk.title + " " + chunk.section);
    const chunkSet = new Set(chunkTokens);
    const matchedTerms = Array.from(new Set(qTokens.filter((t) => chunkSet.has(t))));
    if (matchedTerms.length === 0) continue;
    const tf = matchedTerms.length;
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (chunkTokens.length / Math.max(1, avgLen))));
    const sectionMatch = qTokens.some((t) => chunk.section.toLowerCase().includes(t));
    const titleMatch = qTokens.some((t) => chunk.title.toLowerCase().includes(t));
    const raw = tfNorm + (sectionMatch ? 1.5 : 0) + (titleMatch ? 1.0 : 0);
    const snippet = pickBestSentence(chunk.text, qTokens);
    const scorePct = Math.max(8, Math.min(100, Math.round(raw * 28)));
    hits.push({
      type: "policy",
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
  return hits.slice(0, MAX_POLICY_HITS);
}

/* ---------- Corpus 2: Steps (token overlap on label + stepKey + stage + ownerGroup) ---------- */

function searchSteps(qTokens: string[], stepRows: StepRow[]): StepHit[] {
  if (qTokens.length === 0) return [];
  const hits: StepHit[] = [];
  for (const s of stepRows) {
    const haystack = `${s.label} ${s.labelAr} ${s.stepKey} ${s.stage} ${s.ownerGroup}`;
    const hayTokens = new Set(tokenize(haystack));
    const matchedTerms = Array.from(new Set(qTokens.filter((t) => hayTokens.has(t))));
    if (matchedTerms.length === 0) continue;
    // Score = matched term ratio (0-1) × 100, with a floor of 12 so single
    // token hits still register.
    const ratio = matchedTerms.length / Math.max(1, qTokens.length);
    const scorePct = Math.max(12, Math.min(100, Math.round(ratio * 100)));
    hits.push({
      type: "step",
      stepKey: s.stepKey,
      label: s.label,
      labelAr: s.labelAr,
      stage: s.stage,
      status: s.status,
      ownerGroup: s.ownerGroup,
      journeyType: s.journeyType,
      score: scorePct,
      matchedTerms,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, MAX_STEP_HITS);
}

/* ---------- Corpus 3: Requests (token overlap on ref + type + status + ownerGroup) ---------- */

function searchRequests(qTokens: string[], reqRows: RequestRow[]): RequestHit[] {
  if (qTokens.length === 0) return [];
  const hits: RequestHit[] = [];
  for (const r of reqRows) {
    const schema = INTAKE_SCHEMAS[r.type as RequestType];
    const typeLabel = schema?.label ?? r.type;
    const typeLabelAr = schema?.labelAr ?? r.type;
    // Refs (e.g. "SR-2024-abc") include a hyphen — the engine tokenizer
    // strips punctuation, so we also tokenize the raw ref to give "2024"
    // and "sr" a chance to match.
    const refTokens = tokenize(r.ref);
    const haystack = `${typeLabel} ${typeLabelAr} ${r.status} ${r.ownerGroup} ${r.ref} ${refTokens.join(" ")}`;
    const hayTokens = new Set(tokenize(haystack));
    const matchedTerms = Array.from(new Set(qTokens.filter((t) => hayTokens.has(t))));
    if (matchedTerms.length === 0) continue;
    const ratio = matchedTerms.length / Math.max(1, qTokens.length);
    const scorePct = Math.max(12, Math.min(100, Math.round(ratio * 100)));
    hits.push({
      type: "request",
      ref: r.ref,
      typeLabel,
      typeLabelAr,
      requestType: r.type as RequestType,
      status: r.status,
      ownerGroup: r.ownerGroup,
      openedAt: r.openedAt,
      score: scorePct,
      matchedTerms,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, MAX_REQUEST_HITS);
}

/* ---------- Row shapes (extracted from the engine + pack) ---------- */

interface StepRow {
  stepKey: string;
  label: string;
  labelAr: string;
  stage: string;
  status: string;
  ownerGroup: string;
  journeyType: string;
}

interface RequestRow {
  ref: string;
  type: string;
  status: string;
  ownerGroup: string;
  openedAt: string;
}

function buildStepRows(employeeId: string): StepRow[] {
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) return [];
  const asOf = new Date();
  const employeeEvents = eventsForEmployee(employee.id);
  const journeySteps = ALL_STEPS.filter((s) => s.journeyType === employee.journeyType);
  const stepStates = journeySteps.map((s) => computeStepState(employee, s, employeeEvents, asOf));
  return stepStates.map((s) => ({
    stepKey: s.stepKey,
    label: s.label,
    labelAr: s.labelAr,
    stage: s.stage,
    status: s.status,
    ownerGroup: s.ownerGroup,
    journeyType: s.journeyType,
  }));
}

function buildRequestRows(employeeId: string): RequestRow[] {
  return serviceRequests
    .filter((r) => r.employeeId === employeeId)
    .map((r) => ({
      ref: r.ref,
      type: r.type,
      status: r.status,
      ownerGroup: r.ownerGroup,
      openedAt: r.openedAt,
    }));
}

/* ---------- Route handler ---------- */

export async function GET(req: NextRequest) {
  const start = Date.now();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const employeeId = (req.nextUrl.searchParams.get("employeeId") ?? "E-1042").trim();

  if (q.length < MIN_QUERY) {
    return error(
      "E_VALIDATION",
      `Query must be at least ${MIN_QUERY} characters`,
      422,
      { hint: "Try a longer search term." }
    );
  }

  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) {
    return error("E_NOT_FOUND", `Employee ${employeeId} not found`, 404, {
      hint: "Try one of E-1042, E-1043, E-1044, E-1045, E-1046",
    });
  }

  const qTokens = tokenize(q);
  if (qTokens.length === 0) {
    return success(
      {
        policies: [] as PolicyHit[],
        steps: [] as StepHit[],
        requests: [] as RequestHit[],
        total: 0,
      } satisfies SearchData,
      {
        servedFrom: "live",
        asOf: new Date().toISOString(),
        latencyMs: Date.now() - start,
      }
    );
  }

  const policyHits = searchPolicies(qTokens);
  const stepRows = buildStepRows(employeeId);
  const stepHits = searchSteps(qTokens, stepRows);
  const requestRows = buildRequestRows(employeeId);
  const requestHits = searchRequests(qTokens, requestRows);

  const data: SearchData = {
    policies: policyHits,
    steps: stepHits,
    requests: requestHits,
    total: policyHits.length + stepHits.length + requestHits.length,
  };

  // Surface any stale policy hit so the UI can flag it.
  const anyStale = policyHits.some((h) => isStale(h.reviewDate));

  return success(data, {
    servedFrom: "live",
    asOf: new Date().toISOString(),
    latencyMs: Date.now() - start,
    degraded: anyStale ? ["policy_stale"] : [],
  });
}
