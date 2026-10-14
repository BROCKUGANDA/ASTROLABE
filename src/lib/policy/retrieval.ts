/**
 * ASTROLABE Policy Retrieval + Grounding Validator
 * ------------------------------------------------
 * Hybrid BM25 (FTS) + simple vector-like scoring.
 * For prototype we use a deterministic token-overlap scorer that
 * behaves like a small BM25 — no external embeddings needed,
 * and it stays pure and replayable.
 *
 * Contract (PRD §13):
 *  - Top-k 8 retrieved chunks
 *  - Normative claims (amount/duration/eligibility/requirement) must map to a cited chunk
 *  - Abstain on: low grounding, low top-chunk, equal-authority conflict,
 *    compensation/legal/medical/disciplinary, about another employee,
 *    corpus unavailable
 */

import { policies, PolicyChunk, Locale, NOW } from "../data/pack";
import { CORPUS_VERSION } from "../data/pack";

export interface RetrievedChunk {
  chunk: PolicyChunk;
  score: number;
  matchedTerms: string[];
}

export interface Citation {
  docSlug: string;
  title: string;
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: Locale;
  chunkId: string;
  snippet: string;
}

export interface PolicyAnswer {
  answerId: string;
  kind: "answer" | "abstain";
  answerMarkdown?: string;
  citations: Citation[];
  followUps: string[];
  abstainReasonCode?:
    | "low_grounding"
    | "low_top_chunk"
    | "equal_authority_conflict"
    | "compensation_legal_medical_disciplinary"
    | "about_another_employee"
    | "corpus_unavailable"
    | "out_of_scope";
  abstainReasonAr?: string;
  abstainReasonEn?: string;
  ownerHint?: { name: string; role: string; email: string };
  groundingScore: number;
  servedFrom: "live" | "extractive" | "cache";
  degraded: string[];
  corpusVersion: string;
  usedEmployeeFields: string[];
}

/* ============================================================
   TOKENIZER
   ============================================================ */
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "in", "on", "for", "and", "or",
  "what", "how", "many", "do", "i", "get", "my", "me", "with", "by", "at",
  "be", "will", "can", "you", "please", "tell", "about", "when", "where",
  "if", "so", "it", "this", "that", "from", "as", "have", "has", "was",
  "were", "they", "them", "their", "we", "us", "our", "your",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/* ============================================================
   HYBRID RETRIEVAL — BM25-like + section boost
   ============================================================ */
export function retrieve(question: string, locale: Locale, topK = 8): RetrievedChunk[] {
  const qTokens = tokenize(question);
  const matchingLocale = policies.filter((p) => p.lang === locale);
  const pool = matchingLocale.length > 0 ? matchingLocale : policies;

  const scored: RetrievedChunk[] = pool.map((chunk) => {
    const chunkTokens = tokenize(chunk.text + " " + chunk.title + " " + chunk.section);
    const chunkSet = new Set(chunkTokens);
    const matchedTerms = qTokens.filter((t) => chunkSet.has(t));
    // BM25-ish: matched term frequency × idf-like weight
    const tf = matchedTerms.length;
    const chunkLen = chunkTokens.length;
    const avgLen = pool.reduce((a, c) => a + tokenize(c.text + c.title + c.section).length, 0) / pool.length;
    const k1 = 1.5;
    const b = 0.75;
    const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (chunkLen / avgLen)));
    // Section boost — if question mentions the section
    const sectionMatch = qTokens.some((t) => chunk.section.toLowerCase().includes(t));
    const titleMatch = qTokens.some((t) => chunk.title.toLowerCase().includes(t));
    const score = tfNorm + (sectionMatch ? 1.5 : 0) + (titleMatch ? 1.0 : 0);
    return {
      chunk,
      score,
      matchedTerms: Array.from(new Set(matchedTerms)),
    };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/* ============================================================
   INTENT CLASSIFIER — deterministic
   ============================================================ */
export type Intent = "policy" | "journey" | "action" | "smalltalk" | "out_of_scope";

export function classifyIntent(question: string): Intent {
  const q = question.toLowerCase();
  // Out of scope: compensation disputes, legal, medical, disciplinary, another employee
  if (/\b(salary\s+dispute|sue|lawsuit|medical|sick\s+leave\s+dispute|disciplin|warned|fired|about\s+(?:my\s+)?colleague|about\s+(?:mr|mrs|ms)\b)/.test(q)) {
    return "out_of_scope";
  }
  // PRD §22 adversarial: "What's John's salary?" — asking about a named
  // colleague's pay is `about_another_employee`, not a policy question.
  if (/\b\w+'s\s+(salary|pay|compensation|raise|bonus)\b/i.test(q)) {
    return "out_of_scope";
  }
  if (/\b(salary|raise|increase\s+pay|pay\s+dispute|compensation\s+dispute)\b/.test(q) && /dispute|unfair|wrong|incorrect/.test(q)) {
    return "out_of_scope";
  }
  // Action intent
  if (/\b(start|submit|request|apply\s+for|book|cancel|update|change)\b/.test(q)) {
    if (/\b(request|application|ticket|booking)\b/.test(q)) {
      return "action";
    }
  }
  // Journey intent
  if (/\b(where am i|what.{0,5}next|status|progress|stage|day|step|late|stuck|blocked|waiting)\b/.test(q)) {
    return "journey";
  }
  if (/\b(hello|hi|thanks|bye|good\s+(?:morning|afternoon|evening))\b/.test(q)) {
    return "smalltalk";
  }
  return "policy";
}

/* ============================================================
   EXTRACTIVE COMPOSER — quoted-only, no synthesis
   ============================================================ */
export function composeExtractive(
  question: string,
  chunks: RetrievedChunk[],
  locale: Locale
): { markdown: string; citations: Citation[]; claimsGrounded: number; claimsDropped: number } {
  if (chunks.length === 0) {
    return { markdown: "", citations: [], claimsGrounded: 0, claimsDropped: 0 };
  }
  // Pick the top 1-2 most relevant sentences across the top chunks
  const qTokens = new Set(tokenize(question));
  type CandidateSentence = { text: string; chunk: PolicyChunk; score: number };
  const candidates: CandidateSentence[] = [];
  for (const r of chunks.slice(0, 3)) {
    const sentences = r.chunk.text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
    for (const s of sentences) {
      const sTokens = tokenize(s);
      const overlap = sTokens.filter((t) => qTokens.has(t)).length;
      // Boost sentences with normative content (numbers, durations, amounts)
      const hasNormative = /\b(\d+|aed|days?|hours?|weeks?|months?|years?|must|shall|required|eligible)\b/i.test(s);
      const score = overlap + (hasNormative ? 0.5 : 0);
      // PRD §22 adversarial — only pick sentences that share at least one
      // content token with the question. Without this, "What's the policy
      // on quantum computing?" would fall back to quoting relocation text
      // (only the title token "policy" matched), which is a hallucination.
      if (overlap > 0) candidates.push({ text: s, chunk: r.chunk, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // Take the top 1-2 sentences, deduplicated by chunk
  const picked: CandidateSentence[] = [];
  const usedChunks = new Set<string>();
  for (const c of candidates) {
    if (picked.length >= 2) break;
    if (usedChunks.has(c.chunk.id)) continue;
    picked.push(c);
    usedChunks.add(c.chunk.id);
  }
  // Fallback removed: if no sentence shared a token with the question, we
  // abstain upstream rather than quote an unrelated sentence.

  const citations: Citation[] = picked.map((p, i) => ({
    docSlug: p.chunk.docSlug,
    title: locale === "ar" ? p.chunk.titleAr : p.chunk.title,
    section: p.chunk.section,
    effectiveDate: p.chunk.effectiveDate,
    reviewDate: p.chunk.reviewDate,
    lang: p.chunk.lang,
    chunkId: p.chunk.id,
    snippet: p.text,
  }));

  // Build markdown with inline citation markers — marker goes IMMEDIATELY after
  // the final punctuation (no space) so the grounding validator's sentence-splitter
  // keeps the marker attached to its claim sentence.
  const parts = picked.map((p, i) => {
    const trimmed = p.text.trim();
    // Insert [^n] right after the final punctuation if present
    const match = trimmed.match(/^(.*?)([.!?]+)$/);
    if (match) {
      return `${match[1]}${match[2]}[^${i + 1}]`;
    }
    return `${trimmed}[^${i + 1}]`;
  });
  const footnoteLines = citations.map((c, i) =>
    `[^${i + 1}]: ${c.title} · §${c.section} · effective ${c.effectiveDate}`
  );
  const markdown = parts.join("\n\n") + "\n\n" + footnoteLines.join("\n");
  return { markdown, citations, claimsGrounded: picked.length, claimsDropped: 0 };
}

/* ============================================================
   GROUNDING VALIDATOR
   ============================================================ */
export function validateGrounding(
  markdown: string,
  citations: Citation[]
): { score: number; passed: boolean; droppedClaims: number } {
  // For prototype: grounding score = (cited claims / total claims)
  // Normative claim = sentence containing numbers, durations, amounts, eligibility
  // Footnote lines (starting with [^) are NOT counted as claims — they ARE the citations
  const sentences = markdown.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  let normative = 0;
  let grounded = 0;
  for (const s of sentences) {
    // Skip footnote lines — they are citations, not claims
    if (s.startsWith("[^")) continue;
    // Normative if contains number/amount/duration
    if (/\b(\d+|aed|days?|hours?|weeks?|months?|years?|must|shall|required|eligible)\b/i.test(s)) {
      normative++;
      // Grounded if has a citation marker [^n]
      if (/\[\^\d+\]/.test(s)) {
        grounded++;
      }
    }
  }
  const score = normative > 0 ? grounded / normative : 1;
  return { score, passed: score >= 0.95, droppedClaims: normative - grounded };
}

/* ============================================================
   ABSTAIN HELPERS
   ============================================================ */
const OUT_OF_SCOPE_HINTS: Record<string, { name: string; role: string; email: string }> = {
  default: { name: "Fatima Al-Mansouri", role: "HRBP — Cabin Crew", email: "fatima.hrbp@astrolabe.internal" },
  compensation: { name: "Mona Said", role: "Payroll Specialist", email: "payroll@astrolabe.internal" },
  legal: { name: "Saeed Al-Marri", role: "Immigration Officer", email: "immigration@astrolabe.internal" },
  medical: { name: "Fatima Al-Mansouri", role: "HRBP — Cabin Crew", email: "fatima.hrbp@astrolabe.internal" },
};

/* ============================================================
   TOP-LEVEL ANSWER
   ============================================================ */
export function answer(
  question: string,
  locale: Locale = "en"
): PolicyAnswer {
  const intent = classifyIntent(question);
  const answerId = `ans-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // Out of scope → abstain
  if (intent === "out_of_scope") {
    const q = question.toLowerCase();
    let reasonCode: PolicyAnswer["abstainReasonCode"] = "compensation_legal_medical_disciplinary";
    let ownerKey = "default";
    // PRD §22 adversarial — "What's John's salary?" is about another
    // employee, not a compensation dispute. Detect the possessive+
    // pay pattern first so we route to about_another_employee.
    if (/\b\w+'s\s+(salary|pay|compensation|raise|bonus)\b/i.test(q)) {
      reasonCode = "about_another_employee";
      ownerKey = "default";
    } else if (/medical|sick/.test(q)) { reasonCode = "compensation_legal_medical_disciplinary"; ownerKey = "medical"; }
    else if (/salary|pay|compensation/.test(q)) { reasonCode = "compensation_legal_medical_disciplinary"; ownerKey = "compensation"; }
    else if (/visa|immigration/.test(q)) { reasonCode = "compensation_legal_medical_disciplinary"; ownerKey = "legal"; }
    else if (/colleague|mr|mrs|ms/.test(q)) { reasonCode = "about_another_employee"; }

    return {
      answerId,
      kind: "abstain",
      citations: [],
      followUps: [],
      abstainReasonCode: reasonCode,
      abstainReasonEn: reasonCode === "about_another_employee"
        ? "I can't answer questions about another employee's pay or terms — that's private. Fatima in HR can help if you have a concern about a colleague."
        : "I'm not certain, and I won't guess. This question needs a human who knows your case.",
      abstainReasonAr: reasonCode === "about_another_employee"
        ? "لا أستطيع الإجابة على أسئلة عن راتب أو شروط زميل — هذا أمر خاص. فاطمة في الموارد البشرية يمكنها المساعدة إذا كان لديك قلق بشأن زميل."
        : "لست متأكداً، ولن أخمن. هذا السؤال يحتاج إلى شخص يعرف حالتك.",
      ownerHint: OUT_OF_SCOPE_HINTS[ownerKey] ?? OUT_OF_SCOPE_HINTS.default,
      groundingScore: 0,
      servedFrom: "extractive",
      degraded: [],
      corpusVersion: CORPUS_VERSION,
      usedEmployeeFields: [],
    };
  }

  // Non-policy intents: route to journey or action
  if (intent === "journey" || intent === "action" || intent === "smalltalk") {
    return {
      answerId,
      kind: "abstain",
      citations: [],
      followUps: intent === "journey" ? ["What is my next step?", "What is late?"] : [],
      abstainReasonCode: "out_of_scope",
      abstainReasonEn: intent === "journey"
        ? "This is a journey question — head to the Today or Journey tab for a precise answer with your own record."
        : intent === "action"
        ? "This looks like a request — head to the Requests tab and I'll prefill it from your journey."
        : "Hi — I'm here to help with policy questions and your journey. What would you like to know?",
      abstainReasonAr: intent === "journey"
        ? "هذا سؤال عن الرحلة — انتقل إلى تبويب اليوم أو الرحلة لإجابة دقيقة من سجلك."
        : intent === "action"
        ? "يبدو هذا طلباً — انتقل إلى تبويب الطلبات وسأعبئه من رحلتك."
        : "مرحباً — أنا هنا لمساعدتك في أسئلة السياسات ورحلتك. ماذا تريد أن تعرف؟",
      ownerHint: undefined,
      groundingScore: 0,
      servedFrom: "extractive",
      degraded: [],
      corpusVersion: CORPUS_VERSION,
      usedEmployeeFields: [],
    };
  }

  // Policy retrieval
  const retrieved = retrieve(question, locale, 8);
  if (retrieved.length === 0) {
    return {
      answerId,
      kind: "abstain",
      citations: [],
      followUps: [],
      abstainReasonCode: "corpus_unavailable",
      abstainReasonEn: "I couldn't find any policy document matching your question. Rania in Mobility can help.",
      abstainReasonAr: "لم أجد أي وثيقة سياسة تطابق سؤالك. رانيا في التنقل يمكنها المساعدة.",
      ownerHint: OUT_OF_SCOPE_HINTS.default,
      groundingScore: 0,
      servedFrom: "extractive",
      degraded: [],
      corpusVersion: CORPUS_VERSION,
      usedEmployeeFields: [],
    };
  }

  // Check top chunk similarity floor
  const topScore = retrieved[0].score;
  if (topScore < 0.5) {
    return {
      answerId,
      kind: "abstain",
      citations: [],
      followUps: [],
      abstainReasonCode: "low_top_chunk",
      abstainReasonEn: "I'm not certain I found the right policy. Let me hand you to someone who knows.",
      abstainReasonAr: "لست متأكداً أنني وجدت السياسة الصحيحة. دعني أحيلك إلى من يعرف.",
      ownerHint: OUT_OF_SCOPE_HINTS.default,
      groundingScore: topScore,
      servedFrom: "extractive",
      degraded: [],
      corpusVersion: CORPUS_VERSION,
      usedEmployeeFields: [],
    };
  }

  // Check equal-authority conflict (two top chunks from different docs with same topic)
  // For prototype we skip this — our corpus is small

  // Compose extractive answer
  const composed = composeExtractive(question, retrieved, locale);

  // PRD §22 adversarial — if retrieval matched only on generic tokens
  // (e.g. "policy" in every title) and no sentence shared a content
  // token with the question, we abstain rather than quote an unrelated
  // sentence. This is what makes "What's the policy on quantum computing?"
  // handoff to a human instead of quoting the relocation allowance.
  if (composed.citations.length === 0) {
    return {
      answerId,
      kind: "abstain",
      citations: [],
      followUps: [],
      abstainReasonCode: "low_top_chunk",
      abstainReasonEn: "I'm not certain I found the right policy. Let me hand you to someone who knows.",
      abstainReasonAr: "لست متأكداً أنني وجدت السياسة الصحيحة. دعني أحيلك إلى من يعرف.",
      ownerHint: OUT_OF_SCOPE_HINTS.default,
      groundingScore: topScore,
      servedFrom: "extractive",
      degraded: [],
      corpusVersion: CORPUS_VERSION,
      usedEmployeeFields: [],
    };
  }

  const grounding = validateGrounding(composed.markdown, composed.citations);

  if (grounding.score < 0.95) {
    return {
      answerId,
      kind: "abstain",
      citations: composed.citations,
      followUps: [],
      abstainReasonCode: "low_grounding",
      abstainReasonEn: "I found related policy text but couldn't verify every claim. I'll hand you to the policy owner rather than guess.",
      abstainReasonAr: "وجدت نص سياسة ذا صلة لكنني لم أتمكن من التحقق من كل ادعاء. سأحيلك إلى مسؤول السياسة بدلاً من التخمين.",
      ownerHint: OUT_OF_SCOPE_HINTS.default,
      groundingScore: grounding.score,
      servedFrom: "extractive",
      degraded: [`claims_dropped:${grounding.droppedClaims}`],
      corpusVersion: CORPUS_VERSION,
      usedEmployeeFields: [],
    };
  }

  // Staleness check — use synthetic NOW for prototype determinism
  const isStale = new Date(composed.citations[0].reviewDate) < NOW;

  const followUps = generateFollowUps(question, retrieved, locale);

  return {
    answerId,
    kind: "answer",
    answerMarkdown: composed.markdown + (isStale ? "\n\n*Note: this policy is past its review date — please confirm with the owner.*" : ""),
    citations: composed.citations,
    followUps,
    groundingScore: grounding.score,
    servedFrom: "extractive",
    degraded: isStale ? ["policy_stale"] : [],
    corpusVersion: CORPUS_VERSION,
    usedEmployeeFields: [],
  };
}

function generateFollowUps(question: string, retrieved: RetrievedChunk[], locale: Locale): string[] {
  const followUps: string[] = [];
  // Suggest the next chunk as a follow-up
  if (retrieved[1]) {
    followUps.push(locale === "ar"
      ? `أخبرني المزيد عن: ${retrieved[1].chunk.section}`
      : `Tell me more about: ${retrieved[1].chunk.section}`);
  }
  // Suggest a related action
  followUps.push(locale === "ar" ? "كيف أبدأ طلباً؟" : "How do I start a request?");
  return followUps.slice(0, 3);
}
