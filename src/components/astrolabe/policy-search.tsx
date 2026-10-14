"use client";

/* ============================================================
   ASTROLABE — Global Policy Search (PRD §18-347)
   A cross-corpus search across all 30 policy chunks (15 EN + 15 AR
   across 8 docs). Tokenises the query with the engine's own
   tokenizer, scores by token overlap + section/title boost, and
   returns the top 10 with a matching-sentence snippet.

   Surfaced as a modal from:
     - the Ask screen header ("Search policies" button)
     - the ⌘K command palette ("Search policies" quick action)

   When zero results, offers an "Ask about this instead →" CTA that
   hands the query to the Ask tab as a prefilled question.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Search,
  X,
  FileText,
  AlertTriangle,
  CornerUpRight,
  Loader2,
  ChevronRight,
  Languages,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NOW as PACK_NOW } from "@/lib/data/pack";

/* ---------- Types (mirror the API envelope) ---------- */

interface PolicyHit {
  chunkId: string;
  docSlug: string;
  title: string;
  titleAr: string;
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: "en" | "ar";
  snippet: string;
  score: number;
  matchedTerms: string[];
}

interface PolicySection {
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: "en" | "ar";
  text: string;
}

interface PolicyDoc {
  docSlug: string;
  title: string;
  titleAr: string;
  sections: PolicySection[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string };
  error: { code: string; message: string; hint?: string } | null;
}

/* ---------- Constants ---------- */

const DOC_FILTERS: {
  id: string;
  label: string;
  labelAr: string;
  slug: string | null;
}[] = [
  { id: "all", label: "All", labelAr: "الكل", slug: null },
  { id: "relocation", label: "Relocation", labelAr: "الانتقال", slug: "relocation-policy" },
  { id: "immigration", label: "Immigration", labelAr: "الهجرة", slug: "immigration-policy" },
  { id: "it", label: "IT", labelAr: "تقنية", slug: "it-policy" },
  { id: "onboarding", label: "Onboarding", labelAr: "الالتحاق", slug: "onboarding-policy" },
  { id: "learning", label: "Learning", labelAr: "التعلم", slug: "learning-policy" },
  { id: "mobility", label: "Mobility", labelAr: "التنقل", slug: "mobility-policy" },
  { id: "payroll", label: "Payroll", labelAr: "الرواتب", slug: "payroll-policy" },
  { id: "facilities", label: "Facilities", labelAr: "المرافق", slug: "facilities-policy" },
];

const LANG_FILTERS: {
  id: "en" | "ar" | "all";
  label: string;
  labelAr: string;
}[] = [
  { id: "all", label: "Both", labelAr: "الإثنتان" },
  { id: "en", label: "EN", labelAr: "إنجليزي" },
  { id: "ar", label: "AR", labelAr: "عربي" },
];

/* ---------- Helpers ---------- */

/** Escape regex metachars in a term so we can build a literal matcher. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a sentence into segments so matched terms render with a teal
 * highlight (0.3 opacity background) and the rest renders as plain text.
 * Match is case-insensitive but preserves the original text casing.
 */
function highlightMatches(text: string, terms: string[]): React.ReactNode {
  if (terms.length === 0) return text;
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sorted.map(escapeRegex).join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return (
        <mark
          key={i}
          className="rounded-[3px] px-0.5"
          style={{
            background: "rgba(22,154,165,0.30)",
            color: "inherit",
            borderBottom: "1px solid rgba(22,154,165,0.50)",
          }}
        >
          {part}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function isStale(reviewDate: string): boolean {
  return new Date(reviewDate) < PACK_NOW;
}

/* ============================================================
   PolicySearchModal — controlled by Zustand `policySearchOpen`
   ============================================================ */

export function PolicySearchModal() {
  const open = useAppStore((s) => s.policySearchOpen);
  const initialQuery = useAppStore((s) => s.policySearchInitialQuery);
  const setOpen = useAppStore((s) => s.setPolicySearchOpen);
  const locale = useAppStore((s) => s.locale);

  return (
    <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
      <DialogContent
        className="sm:max-w-[760px] max-h-[88vh] overflow-hidden flex flex-col"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          color: "var(--text-hi)",
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle
            className="flex items-center gap-2 text-[16px] font-semibold"
            style={{ color: "var(--text-hi)" }}
          >
            <Search className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            {locale === "ar" ? "البحث في السياسات" : "Search policies"}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "أبحث في كل سياساتك الرسمية. كل نتيجة تستشهد بمدى مطابقتها."
              : "I search every official policy. Each result cites how strongly it matches."}
          </DialogDescription>
        </DialogHeader>
        <PolicySearchBody
          initialQuery={initialQuery}
          onAskInstead={(q) => {
            setOpen(false);
            useAppStore.getState().setAskPrefill(q);
            useAppStore.getState().setRole("employee");
            useAppStore.getState().setView("ask");
          }}
          locale={locale}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   PolicySearchBody — the actual search UI
   ============================================================ */

function PolicySearchBody({
  initialQuery,
  onAskInstead,
  locale,
}: {
  initialQuery?: string;
  onAskInstead: (q: string) => void;
  locale: "en" | "ar";
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [docFilter, setDocFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<"en" | "ar" | "all">("all");
  const [hits, setHits] = useState<PolicyHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<PolicyDoc | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  // Sync incoming initialQuery when the modal opens with a prefilled query.
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  const docSlug = useMemo(() => {
    const f = DOC_FILTERS.find((d) => d.id === docFilter);
    return f?.slug ?? null;
  }, [docFilter]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q,
        lang: langFilter,
      });
      if (docSlug) params.set("doc", docSlug);
      const res = await fetch(`/api/v1/policies/search?${params.toString()}`);
      const json: ApiEnvelope<{ items: PolicyHit[]; total: number }> = await res.json();
      if (!json.ok || !json.data) {
        throw new Error(json.error?.message ?? "Search failed");
      }
      setHits(json.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, [query, langFilter, docSlug]);

  // Debounced auto-search — fire 320ms after the user stops typing.
  useEffect(() => {
    const t = setTimeout(() => {
      runSearch();
    }, 320);
    return () => clearTimeout(t);
  }, [runSearch]);

  const handleOpenPolicy = useCallback(async (docSlugToOpen: string) => {
    setDocLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/policies/${docSlugToOpen}`);
      const json: ApiEnvelope<PolicyDoc> = await res.json();
      if (!json.ok || !json.data) {
        throw new Error(json.error?.message ?? "Couldn't open policy");
      }
      setOpenDoc(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDocLoading(false);
    }
  }, []);

  const hasQuery = query.trim().length >= 2;
  const showEmptyState = hasQuery && !loading && !error && hits !== null && hits.length === 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Search input */}
      <div
        className="flex items-center gap-2 px-3 h-12 rounded-md"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <Search
          className="w-4 h-4 shrink-0"
          strokeWidth={1.75}
          style={{ color: "var(--brand-400)" }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label={locale === "ar" ? "ابحث في السياسات" : "Search policies"}
          placeholder={
            locale === "ar"
              ? "ابحث عن بدل، فيزا، رواتب، تدريب…"
              : "Search for allowance, visa, payroll, training…"
          }
          className="flex-1 bg-transparent outline-none text-[14px] placeholder:opacity-50"
          style={{ color: "var(--text-hi)" }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setHits(null);
            }}
            aria-label={locale === "ar" ? "مسح" : "Clear"}
            className="ast-focus inline-flex items-center justify-center w-6 h-6 rounded-md"
            style={{ color: "var(--text-lo)" }}
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Filter strips */}
      <div className="mt-3 space-y-2">
        {/* Doc filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-[0.14em] mr-1 shrink-0"
            style={{ color: "var(--text-lo)" }}
          >
            {locale === "ar" ? "النوع" : "Type"}
          </span>
          <div
            className="flex items-center gap-1 p-1 rounded-full overflow-x-auto max-w-full"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            {DOC_FILTERS.map((d) => {
              const active = docFilter === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDocFilter(d.id)}
                  aria-pressed={active}
                  className="ast-focus inline-flex items-center h-7 px-2.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors"
                  style={{
                    background: active ? "var(--brand-500)" : "transparent",
                    color: active ? "var(--surface-0)" : "var(--text-mid)",
                  }}
                >
                  {locale === "ar" ? d.labelAr : d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lang filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-[0.14em] mr-1 shrink-0 inline-flex items-center gap-1"
            style={{ color: "var(--text-lo)" }}
          >
            <Languages className="w-3 h-3" strokeWidth={1.75} />
            {locale === "ar" ? "اللغة" : "Lang"}
          </span>
          <div
            className="inline-flex items-center gap-1 p-1 rounded-full"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            {LANG_FILTERS.map((l) => {
              const active = langFilter === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLangFilter(l.id)}
                  aria-pressed={active}
                  className="ast-focus inline-flex items-center h-7 px-2.5 rounded-full text-[11px] font-medium transition-colors"
                  style={{
                    background: active ? "var(--brand-500)" : "transparent",
                    color: active ? "var(--surface-0)" : "var(--text-mid)",
                  }}
                >
                  {locale === "ar" ? l.labelAr : l.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results list / empty state */}
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
        {/* Error */}
        {error && (
          <div
            className="p-3 rounded-md flex items-start gap-2 text-[12px]"
            style={{
              background: "rgba(220,38,38,0.08)",
              border: "1px solid rgba(220,38,38,0.30)",
              color: "var(--status-friction)",
            }}
            role="alert"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
            <span>{error}</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div
            className="flex items-center justify-center py-10 gap-2 text-[13px]"
            style={{ color: "var(--text-mid)" }}
          >
            <Loader2
              className="w-4 h-4 animate-spin"
              strokeWidth={1.75}
              style={{ color: "var(--brand-400)" }}
            />
            {locale === "ar" ? "أبحث في السياسات…" : "Searching policies…"}
          </div>
        )}

        {/* Empty state */}
        {showEmptyState && (
          <div className="py-8 px-4 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
              style={{ background: "rgba(22,154,165,0.08)", color: "var(--brand-400)" }}
            >
              <Search className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
              {locale === "ar"
                ? `لا تطابق أي سياسة «${query.trim()}». جرّب كلمات أخرى، أو اسألني مباشرة — سأجد الشخص المناسب.`
                : `No policies match '${query.trim()}'. Try different words, or ask me directly — I'll find the right person.`}
            </p>
            <button
              type="button"
              onClick={() => onAskInstead(query.trim())}
              className="ast-focus mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-[10px] text-[13px] font-semibold transition-transform hover:-translate-y-0.5"
              style={{
                background: "var(--accent-500)",
                color: "var(--surface-0)",
                boxShadow: "0 4px 14px rgba(201,162,39,0.28)",
              }}
            >
              <CornerUpRight className="w-4 h-4" strokeWidth={1.75} />
              {locale === "ar" ? "اسأل عن هذا بدلاً من ذلك" : "Ask about this instead"}
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && !error && hits !== null && hits.length > 0 && (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {hits.map((hit, i) => (
                <motion.li
                  key={hit.chunkId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, delay: Math.min(i * 0.03, 0.18) }}
                >
                  <PolicyHitCard
                    hit={hit}
                    onOpenPolicy={() => handleOpenPolicy(hit.docSlug)}
                    docLoading={docLoading}
                    locale={locale}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        {/* Initial state — no query yet */}
        {!hasQuery && !loading && (
          <div className="py-10 px-4 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
              style={{ background: "rgba(22,154,165,0.08)", color: "var(--brand-400)" }}
            >
              <FileText className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
              {locale === "ar"
                ? "ابدأ الكتابة لأبحث في 8 وثائق سياسة."
                : "Start typing to search across 8 policy documents."}
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-lo)" }}>
              {locale === "ar"
                ? "بدل، فيزا، توفير تقنية، وصول، تسليم، رواتب، مرافق، تدريب."
                : "Relocation, immigration, IT, access, handover, payroll, facilities, training."}
            </p>
          </div>
        )}
      </div>

      {/* Open-policy modal (nested) */}
      <AnimatePresence>
        {openDoc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0 z-10 flex items-center justify-center p-4"
            style={{ background: "rgba(11,17,28,0.78)", backdropFilter: "blur(8px)" }}
            onClick={() => setOpenDoc(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="ast-card w-full max-w-[640px] max-h-[80vh] flex flex-col"
              style={{ background: "var(--surface-1)" }}
            >
              <div
                className="flex items-center justify-between gap-3 p-4 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <p
                    className="text-[10px] uppercase tracking-[0.14em]"
                    style={{ color: "var(--brand-400)" }}
                  >
                    {locale === "ar" ? "وثيقة سياسة" : "Policy document"}
                  </p>
                  <h3
                    className="text-[16px] font-semibold truncate"
                    style={{ color: "var(--text-hi)" }}
                  >
                    {locale === "ar" ? openDoc.titleAr : openDoc.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenDoc(null)}
                  aria-label={locale === "ar" ? "إغلاق" : "Close"}
                  className="ast-focus inline-flex items-center justify-center w-8 h-8 rounded-full"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-mid)",
                  }}
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                {openDoc.sections.map((s, i) => (
                  <div key={i} className="ast-card-2 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p
                        className="text-[11px] font-mono tabular"
                        style={{ color: "var(--brand-400)" }}
                        dir="ltr"
                      >
                        §{s.section}
                      </p>
                      <span
                        className="text-[10px] uppercase tracking-[0.12em] tabular"
                        style={{ color: "var(--text-lo)" }}
                      >
                        {s.lang.toUpperCase()} · {format(new Date(s.effectiveDate), "d MMM yyyy")}
                      </span>
                    </div>
                    <p
                      className="text-[13px] leading-relaxed"
                      style={{ color: "var(--text-hi)" }}
                      dir={s.lang === "ar" ? "rtl" : "ltr"}
                    >
                      {s.text}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
   Single hit card
   ============================================================ */

function PolicyHitCard({
  hit,
  onOpenPolicy,
  docLoading,
  locale,
}: {
  hit: PolicyHit;
  onOpenPolicy: () => void;
  docLoading: boolean;
  locale: "en" | "ar";
}) {
  const stale = isStale(hit.reviewDate);
  return (
    <article className="ast-card-2 p-3.5">
      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? hit.titleAr : hit.title}
            <span className="opacity-60"> · </span>
            <span className="font-mono tabular" style={{ color: "var(--brand-400)" }}>
              §{hit.section}
            </span>
          </p>
          <div className="mt-1 flex items-center flex-wrap gap-2 text-[10px]">
            <span
              className="inline-flex items-center gap-1 tabular"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "ساري منذ" : "Effective"}{" "}
              {format(new Date(hit.effectiveDate), "d MMM yyyy")}
            </span>
            {stale && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md tabular"
                style={{
                  color: "var(--status-watch)",
                  background: "rgba(217,119,6,0.10)",
                  border: "1px solid rgba(217,119,6,0.30)",
                }}
                title={
                  locale === "ar"
                    ? "تجاوزت مراجعة هذه السياسة — يُرجى التأكيد مع المالك"
                    : "Past review date — confirm with the owner"
                }
              >
                <AlertTriangle className="w-2.5 h-2.5" strokeWidth={1.75} />
                {locale === "ar" ? "قديمة" : "stale"}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md tabular"
              style={{
                color: "var(--text-lo)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              {hit.lang.toUpperCase()}
            </span>
          </div>
        </div>
        {/* Score */}
        <div className="shrink-0 text-right">
          <p className="text-[9px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "تطابق" : "Match"}
          </p>
          <p
            className="text-[18px] font-semibold tabular leading-none mt-0.5"
            style={{
              color:
                hit.score >= 70
                  ? "var(--brand-400)"
                  : hit.score >= 40
                    ? "var(--accent-500)"
                    : "var(--text-mid)",
            }}
            dir="ltr"
          >
            {hit.score}%
          </p>
        </div>
      </div>

      {/* Snippet — highlighted matching sentence */}
      <p
        className="mt-2.5 text-[13px] leading-relaxed"
        style={{ color: "var(--text-mid)" }}
        dir={hit.lang === "ar" ? "rtl" : "ltr"}
      >
        “{highlightMatches(hit.snippet, hit.matchedTerms)}”
      </p>

      {/* Matched terms + open-policy CTA */}
      <div
        className="mt-3 pt-2.5 flex items-center justify-between gap-2 flex-wrap"
        style={{ borderTop: "1px solid var(--border-soft)" }}
      >
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {hit.matchedTerms.slice(0, 5).map((t) => (
            <span
              key={t}
              className="ast-chip"
              style={{
                color: "var(--brand-400)",
                background: "rgba(22,154,165,0.06)",
                borderColor: "rgba(22,154,165,0.22)",
                height: 20,
                fontSize: 10,
                paddingInline: 6,
              }}
            >
              {t}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={onOpenPolicy}
          disabled={docLoading}
          className="ast-focus inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12px] font-medium transition-colors disabled:opacity-50"
          style={{
            color: "var(--brand-400)",
            background: "rgba(22,154,165,0.08)",
            border: "1px solid rgba(22,154,165,0.25)",
          }}
        >
          <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "افتح السياسة" : "Open policy"}
          <ChevronRight className="w-3 h-3" strokeWidth={1.75} />
        </button>
      </div>
    </article>
  );
}

/* ============================================================
   Trigger button — for embedding in other screens
   ============================================================ */

export function PolicySearchTriggerButton({
  locale,
  variant = "ghost",
}: {
  locale: "en" | "ar";
  variant?: "ghost" | "solid";
}) {
  const setOpen = useAppStore((s) => s.setPolicySearchOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={locale === "ar" ? "ابحث في السياسات" : "Search policies"}
      className={cn(
        "ast-focus inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors",
      )}
      style={
        variant === "solid"
          ? {
              background: "var(--brand-500)",
              color: "var(--surface-0)",
              border: "1px solid var(--brand-500)",
            }
          : {
              background: "var(--surface-2)",
              color: "var(--text-mid)",
              border: "1px solid var(--border)",
            }
      }
    >
      <Search
        className="w-3.5 h-3.5"
        strokeWidth={1.75}
        style={{ color: variant === "solid" ? "var(--surface-0)" : "var(--brand-400)" }}
      />
      <span>{locale === "ar" ? "ابحث في السياسات" : "Search policies"}</span>
    </button>
  );
}
