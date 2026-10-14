"use client";

/* ============================================================
   ASTROLABE — Global Cross-Corpus Search (PRD §18-347)
   Searches across THREE corpora in a single request:
     1. Policies  — top 5 chunks (BM25-ish, same scorer as the
                    policy-only search route)
     2. Steps     — the journey steps for the current employee
                    (label, stepKey, stage, ownerGroup)
     3. Requests  — the service requests for the current employee
                    (ref, type, status, ownerGroup)

   Surfaced as a modal from:
     - the ⌘K command palette ("Search everything")
     - the Ask screen header ("Search" button)

   The policy-only search modal (policy-search.tsx) is kept for
   parity; this is now the default entry point.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Search,
  X,
  FileText,
  Map,
  Inbox,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ArrowRight,
  CornerUpRight,
  Sparkles,
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
import { NOW as PACK_NOW, stages, type Locale } from "@/lib/data/pack";

/* ---------- Types (mirror the API envelope) ---------- */

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
  requestType: string;
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

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string };
  error: { code: string; message: string; hint?: string } | null;
}

interface PolicySection {
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: Locale;
  text: string;
}

interface PolicyDoc {
  docSlug: string;
  title: string;
  titleAr: string;
  sections: PolicySection[];
}

/* ---------- Type-filter chips ---------- */

type FilterId = "all" | "policies" | "steps" | "requests";

const FILTERS: {
  id: FilterId;
  label: string;
  labelAr: string;
  Icon: typeof FileText;
}[] = [
  { id: "all", label: "All", labelAr: "الكل", Icon: Sparkles },
  { id: "policies", label: "Policies", labelAr: "السياسات", Icon: FileText },
  { id: "steps", label: "Steps", labelAr: "الخطوات", Icon: Map },
  { id: "requests", label: "Requests", labelAr: "الطلبات", Icon: Inbox },
];

/* ---------- Helpers ---------- */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a sentence into segments so matched terms render with a teal
 * highlight (0.2 opacity background per spec) and the rest renders as
 * plain text. Match is case-insensitive but preserves the original
 * text casing.
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
            background: "rgba(22,154,165,0.20)",
            color: "inherit",
            borderBottom: "1px solid rgba(22,154,165,0.45)",
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

function stageLabel(stageKey: string, locale: Locale): string {
  const s = stages.find((x) => x.key === stageKey);
  if (!s) return stageKey;
  return locale === "ar" ? s.labelAr : s.label;
}

/** Map a step status to a small chip color (no indigo, no blue). */
function stepStatusChip(status: string): { bg: string; fg: string; border: string } {
  switch (status) {
    case "done":
      return { bg: "rgba(14,159,110,0.12)", fg: "var(--status-steady)", border: "rgba(14,159,110,0.30)" };
    case "in_progress":
      return { bg: "rgba(22,154,165,0.12)", fg: "var(--brand-400)", border: "rgba(22,154,165,0.32)" };
    case "waiting_employee":
    case "waiting_owner":
      return { bg: "rgba(217,119,6,0.12)", fg: "var(--status-watch)", border: "rgba(217,119,6,0.32)" };
    case "blocked":
      return { bg: "rgba(220,38,38,0.12)", fg: "var(--status-friction)", border: "rgba(220,38,38,0.32)" };
    case "skipped":
      return { bg: "rgba(159,18,57,0.12)", fg: "var(--status-blocked)", border: "rgba(159,18,57,0.30)" };
    case "not_started":
    default:
      return { bg: "var(--surface-2)", fg: "var(--text-lo)", border: "var(--border)" };
  }
}

/** Map a request status to a small chip color (mirrors requests-screen depth layering). */
function requestStatusChip(status: string): { bg: string; fg: string; border: string } {
  switch (status) {
    case "submitted":
    case "acknowledged":
      return { bg: "rgba(22,154,165,0.10)", fg: "var(--brand-400)", border: "rgba(22,154,165,0.28)" };
    case "in_progress":
      return { bg: "rgba(22,154,165,0.14)", fg: "var(--brand-400)", border: "rgba(22,154,165,0.36)" };
    case "returned":
      return { bg: "rgba(201,162,39,0.12)", fg: "var(--accent-500)", border: "rgba(201,162,39,0.34)" };
    case "resolved":
    case "closed":
      return { bg: "rgba(14,159,110,0.10)", fg: "var(--status-steady)", border: "rgba(14,159,110,0.28)" };
    case "draft":
    default:
      return { bg: "var(--surface-2)", fg: "var(--text-lo)", border: "var(--border)" };
  }
}

function prettyStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* ============================================================
   GlobalSearchModal — controlled by Zustand `globalSearchOpen`
   ============================================================ */

export function GlobalSearchModal() {
  const open = useAppStore((s) => s.globalSearchOpen);
  const initialQuery = useAppStore((s) => s.globalSearchQuery);
  const setOpen = useAppStore((s) => s.setGlobalSearchOpen);
  const locale = useAppStore((s) => s.locale);

  return (
    <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
      <DialogContent
        className="sm:max-w-[720px] max-h-[88vh] overflow-hidden flex flex-col"
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
            {locale === "ar" ? "ابحث في كل شيء" : "Search everything"}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "أبحث في سياساتك، خطوات رحلتك، وطلباتك المفتوحة في وقت واحد."
              : "I search your policies, your journey steps, and your open requests — all at once."}
          </DialogDescription>
        </DialogHeader>
        <GlobalSearchBody
          initialQuery={initialQuery}
          onAskInstead={(q) => {
            setOpen(false);
            useAppStore.getState().setAskPrefill(q);
            useAppStore.getState().setRole("employee");
            useAppStore.getState().setView("ask");
          }}
          onGoToJourney={() => {
            setOpen(false);
            useAppStore.getState().setRole("employee");
            useAppStore.getState().setView("journey");
          }}
          onGoToRequests={() => {
            setOpen(false);
            useAppStore.getState().setRole("employee");
            useAppStore.getState().setView("requests");
          }}
          locale={locale}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   GlobalSearchBody — the actual search UI
   ============================================================ */

function GlobalSearchBody({
  initialQuery,
  onAskInstead,
  onGoToJourney,
  onGoToRequests,
  locale,
}: {
  initialQuery?: string;
  onAskInstead: (q: string) => void;
  onGoToJourney: () => void;
  onGoToRequests: () => void;
  locale: Locale;
}) {
  const employeeId = useAppStore((s) => s.currentEmployeeId);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [filter, setFilter] = useState<FilterId>("all");
  const [data, setData] = useState<SearchData | null>(null);
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

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, employeeId });
      const res = await fetch(`/api/v1/search?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Search failed (${res.status})`);
      }
      const json: ApiEnvelope<SearchData> = await res.json();
      if (!json.ok || !json.data) {
        throw new Error(json.error?.message ?? "Search failed");
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setData({ policies: [], steps: [], requests: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [query, employeeId]);

  // 320ms debounce — fire after the user stops typing.
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
  const policies = data?.policies ?? [];
  const steps = data?.steps ?? [];
  const requests = data?.requests ?? [];

  // Apply the active type filter to the visible sections.
  const showPolicies = filter === "all" || filter === "policies";
  const showSteps = filter === "all" || filter === "steps";
  const showRequests = filter === "all" || filter === "requests";

  const visibleTotal =
    (showPolicies ? policies.length : 0) +
    (showSteps ? steps.length : 0) +
    (showRequests ? requests.length : 0);

  const showEmptyState =
    hasQuery && !loading && !error && data !== null && visibleTotal === 0;

  const sections = useMemo(
    () =>
      [
        { id: "policies" as const, visible: showPolicies, items: policies },
        { id: "steps" as const, visible: showSteps, items: steps },
        { id: "requests" as const, visible: showRequests, items: requests },
      ].filter((s) => s.visible),
    [showPolicies, showSteps, showRequests, policies, steps, requests]
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Search input — 44px touch target */}
      <div
        className="flex items-center gap-2 px-3 h-11 rounded-md"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <Search className="w-4 h-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label={locale === "ar" ? "ابحث في كل شيء" : "Search everything"}
          placeholder={
            locale === "ar"
              ? "ابحث عن سياسة، خطوة، طلب…"
              : "Search for a policy, step, request…"
          }
          className="flex-1 bg-transparent outline-none text-[14px] placeholder:opacity-50"
          style={{ color: "var(--text-hi)" }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setData(null);
            }}
            aria-label={locale === "ar" ? "مسح" : "Clear"}
            className="ast-focus inline-flex items-center justify-center w-6 h-6 rounded-md"
            style={{ color: "var(--text-lo)" }}
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Type filter chips — All / Policies / Steps / Requests */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <span
          className="text-[10px] uppercase tracking-[0.14em] mr-1 shrink-0"
          style={{ color: "var(--text-lo)" }}
        >
          {locale === "ar" ? "النوع" : "Type"}
        </span>
        <div
          className="inline-flex items-center gap-1 p-1 rounded-full overflow-x-auto max-w-full"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count =
              f.id === "all"
                ? data?.total ?? 0
                : f.id === "policies"
                  ? policies.length
                  : f.id === "steps"
                    ? steps.length
                    : requests.length;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={active}
                className="ast-focus inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors"
                style={{
                  background: active ? "var(--brand-500)" : "transparent",
                  color: active ? "var(--surface-0)" : "var(--text-mid)",
                }}
              >
                <f.Icon className="w-3 h-3" strokeWidth={1.75} />
                {locale === "ar" ? f.labelAr : f.label}
                {data !== null && (
                  <span className="tabular opacity-70">{count}</span>
                )}
              </button>
            );
          })}
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
          <div className="flex items-center justify-center py-10 gap-2 text-[13px]" style={{ color: "var(--text-mid)" }}>
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            {locale === "ar" ? "أبحث في كل شيء…" : "Searching everything…"}
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
                ? `لا نتائج لـ «${query.trim()}». جرّب كلمات أخرى، أو اسألني مباشرة.`
                : `No results for '${query.trim()}'. Try different words, or ask me directly.`}
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

        {/* Grouped results */}
        {!loading && !error && data !== null && visibleTotal > 0 && (
          <div className="space-y-4">
            {sections.map((section) => {
              if (section.items.length === 0) return null;
              return (
                <section key={section.id} aria-label={section.id}>
                  <SectionHeader id={section.id} count={section.items.length} locale={locale} />
                  <ul className="space-y-2 mt-1.5">
                    <AnimatePresence initial={false}>
                      {section.id === "policies" &&
                        (section.items as PolicyHit[]).map((hit, i) => (
                          <motion.li
                            key={`p-${hit.chunkId}`}
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
                      {section.id === "steps" &&
                        (section.items as StepHit[]).map((hit, i) => (
                          <motion.li
                            key={`s-${hit.stepKey}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.16, delay: Math.min(i * 0.03, 0.18) }}
                          >
                            <StepHitCard hit={hit} onGoToJourney={onGoToJourney} locale={locale} />
                          </motion.li>
                        ))}
                      {section.id === "requests" &&
                        (section.items as RequestHit[]).map((hit, i) => (
                          <motion.li
                            key={`r-${hit.ref}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.16, delay: Math.min(i * 0.03, 0.18) }}
                          >
                            <RequestHitCard hit={hit} onGoToRequests={onGoToRequests} locale={locale} />
                          </motion.li>
                        ))}
                    </AnimatePresence>
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {/* Initial state — no query yet */}
        {!hasQuery && !loading && (
          <div className="py-10 px-4 text-center">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
              style={{ background: "rgba(22,154,165,0.08)", color: "var(--brand-400)" }}
            >
              <Search className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
              {locale === "ar"
                ? "ابدأ الكتابة لأبحث في سياساتك، خطواتك، وطلباتك."
                : "Start typing to search across your policies, steps, and requests."}
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-lo)" }}>
              {locale === "ar"
                ? "بدل، فيزا، وصول تقنية، رحلة، طلب، SLA…"
                : "Relocation, visa, IT access, journey, request, SLA…"}
            </p>
          </div>
        )}
      </div>

      {/* Open-policy modal (nested) — mirrors the policy-search modal */}
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
   Section header — teal icon + count
   ============================================================ */

function SectionHeader({
  id,
  count,
  locale,
}: {
  id: "policies" | "steps" | "requests";
  count: number;
  locale: Locale;
}) {
  const meta = {
    policies: {
      Icon: FileText,
      label: locale === "ar" ? "السياسات" : "Policies",
    },
    steps: {
      Icon: Map,
      label: locale === "ar" ? "الخطوات" : "Steps",
    },
    requests: {
      Icon: Inbox,
      label: locale === "ar" ? "الطلبات" : "Requests",
    },
  }[id];

  return (
    <div className="flex items-center gap-2 px-1">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-md"
        style={{
          background: "rgba(22,154,165,0.10)",
          color: "var(--brand-400)",
          border: "1px solid rgba(22,154,165,0.22)",
        }}
      >
        <meta.Icon className="w-3 h-3" strokeWidth={1.75} />
      </span>
      <h3
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: "var(--text-mid)" }}
      >
        {meta.label}
      </h3>
      <span
        className="text-[11px] font-mono tabular px-1.5 py-0.5 rounded-md"
        style={{
          color: "var(--text-lo)",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        {count}
      </span>
    </div>
  );
}

/* ============================================================
   Single hit cards
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
  locale: Locale;
}) {
  const stale = isStale(hit.reviewDate);
  return (
    <article className="ast-card-2 p-3.5">
      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[12px] font-semibold truncate"
            style={{ color: "var(--text-hi)" }}
          >
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
          <p
            className="text-[9px] uppercase tracking-[0.12em]"
            style={{ color: "var(--text-lo)" }}
          >
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

function StepHitCard({
  hit,
  onGoToJourney,
  locale,
}: {
  hit: StepHit;
  onGoToJourney: () => void;
  locale: Locale;
}) {
  const chip = stepStatusChip(hit.status);
  return (
    <article className="ast-card-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--text-hi)" }}
          >
            {highlightMatches(locale === "ar" ? hit.labelAr : hit.label, hit.matchedTerms)}
          </p>
          <div className="mt-1 flex items-center flex-wrap gap-2 text-[10px]">
            <span
              className="inline-flex items-center gap-1 tabular font-mono"
              style={{ color: "var(--text-lo)" }}
              dir="ltr"
            >
              {hit.stepKey}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
              style={{
                color: "var(--text-mid)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <Map className="w-2.5 h-2.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
              {stageLabel(hit.stage, locale)}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
              style={{
                color: "var(--text-lo)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              {hit.ownerGroup}
            </span>
          </div>
        </div>
        {/* Score */}
        <div className="shrink-0 text-right">
          <p
            className="text-[9px] uppercase tracking-[0.12em]"
            style={{ color: "var(--text-lo)" }}
          >
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

      {/* Status chip + Go to journey CTA */}
      <div
        className="mt-3 pt-2.5 flex items-center justify-between gap-2 flex-wrap"
        style={{ borderTop: "1px solid var(--border-soft)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
          style={{
            color: chip.fg,
            background: chip.bg,
            border: `1px solid ${chip.border}`,
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: chip.fg }}
          />
          {prettyStatus(hit.status)}
        </span>
        <button
          type="button"
          onClick={onGoToJourney}
          className="ast-focus inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12px] font-medium transition-colors"
          style={{
            color: "var(--brand-400)",
            background: "rgba(22,154,165,0.08)",
            border: "1px solid rgba(22,154,165,0.25)",
          }}
        >
          <Map className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "اذهب إلى الرحلة" : "Go to journey"}
          <ArrowRight className="w-3 h-3" strokeWidth={1.75} />
        </button>
      </div>
    </article>
  );
}

function RequestHitCard({
  hit,
  onGoToRequests,
  locale,
}: {
  hit: RequestHit;
  onGoToRequests: () => void;
  locale: Locale;
}) {
  const chip = requestStatusChip(hit.status);
  return (
    <article className="ast-card-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--text-hi)" }}
          >
            {highlightMatches(
              `${hit.ref} · ${locale === "ar" ? hit.typeLabelAr : hit.typeLabel}`,
              hit.matchedTerms
            )}
          </p>
          <div className="mt-1 flex items-center flex-wrap gap-2 text-[10px]">
            <span
              className="inline-flex items-center gap-1 tabular font-mono"
              style={{ color: "var(--text-lo)" }}
              dir="ltr"
            >
              {hit.ref}
            </span>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
              style={{
                color: "var(--text-mid)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              <Inbox className="w-2.5 h-2.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
              {hit.ownerGroup}
            </span>
            <span
              className="inline-flex items-center gap-1 tabular"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "فُتح" : "Opened"}{" "}
              {format(new Date(hit.openedAt), "d MMM yyyy")}
            </span>
          </div>
        </div>
        {/* Score */}
        <div className="shrink-0 text-right">
          <p
            className="text-[9px] uppercase tracking-[0.12em]"
            style={{ color: "var(--text-lo)" }}
          >
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

      {/* Status chip + Go to request CTA */}
      <div
        className="mt-3 pt-2.5 flex items-center justify-between gap-2 flex-wrap"
        style={{ borderTop: "1px solid var(--border-soft)" }}
      >
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium"
          style={{
            color: chip.fg,
            background: chip.bg,
            border: `1px solid ${chip.border}`,
          }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: chip.fg }}
          />
          {prettyStatus(hit.status)}
        </span>
        <button
          type="button"
          onClick={onGoToRequests}
          className="ast-focus inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12px] font-medium transition-colors"
          style={{
            color: "var(--brand-400)",
            background: "rgba(22,154,165,0.08)",
            border: "1px solid rgba(22,154,165,0.25)",
          }}
        >
          <Inbox className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "اذهب إلى الطلب" : "Go to request"}
          <ArrowRight className="w-3 h-3" strokeWidth={1.75} />
        </button>
      </div>
    </article>
  );
}

/* ============================================================
   Trigger button — for embedding in other screens (Ask header)
   ============================================================ */

export function GlobalSearchTriggerButton({
  locale,
  variant = "ghost",
}: {
  locale: Locale;
  variant?: "ghost" | "solid";
}) {
  const setOpen = useAppStore((s) => s.setGlobalSearchOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={locale === "ar" ? "ابحث في كل شيء" : "Search"}
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
      <span>{locale === "ar" ? "ابحث" : "Search"}</span>
    </button>
  );
}
