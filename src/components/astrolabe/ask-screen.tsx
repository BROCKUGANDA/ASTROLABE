"use client";

/* ============================================================
   ASTROLABE — Ask Screen (cited-answers, PRD §13)
   Instrument-style policy answering with three-stage progress,
   simulated streaming, abstention handoff, follow-ups, and
   last-5 history. Plain-language copy kit throughout.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { NOW as PACK_NOW } from "@/lib/data/pack";
import ReactMarkdown from "react-markdown";
import {
  Send,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  Compass,
  ChevronDown,
  ChevronUp,
  Mail,
  ShieldAlert,
  Star,
  ArrowRight,
  Clock,
  ThumbsDown,
  Share2,
  FileText,
  Ban,
  Hash,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { CitationChip } from "@/components/astrolabe/widgets";
import {
  CitationHover,
  NumberTicker,
} from "@/components/astrolabe/micro-interactions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ---------- Types (mirror the API envelope) ---------- */

interface Citation {
  docSlug: string;
  title: string;
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: string;
  chunkId: string;
  snippet: string;
}

interface PolicyAnswer {
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
  abstainReasonEn?: string;
  abstainReasonAr?: string;
  ownerHint?: { name: string; role: string; email: string };
  groundingScore: number;
  servedFrom: string;
  degraded: string[];
  corpusVersion: string;
  usedEmployeeFields: string[];
}

interface AskResponse {
  stages: string[];
  answer: PolicyAnswer;
  employeeId: string | null;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string; latencyMs: number };
  error: { code: string; message: string; hint?: string } | null;
}

interface Turn {
  id: string;
  question: string;
  answer?: PolicyAnswer;
  loading: boolean;
  error?: string;
  startedAt: number;
}

/* ---------- Starters (PRD §13) ---------- */

const STARTERS_EN = [
  "How many days of relocation allowance do I get?",
  "When is my flight booked?",
  "What training must I complete?",
  "How long does visa processing take?",
  "What happens if my laptop is delayed?",
  "Who is my HRBP?",
];

const STARTERS_AR = [
  "كم يوماً من بدل الانتقال أحصل عليه؟",
  "متى يُحجز طيراني؟",
  "ما التدريب الذي يجب أن أكمله؟",
  "كم تستغرق معالجة التأشيرة؟",
  "ماذا يحدث إذا تأخر حاسوبي؟",
  "من هو شريك الموارد البشرية الخاص بي؟",
];

/* ---------- Helpers ---------- */

/** Strip inline [^n] refs and footnote definitions; return clean markdown. */
function stripCitations(md: string): string {
  return md
    // Strip footnote definition lines FIRST (before removing the [^n] markers they start with)
    .replace(/^\[\^\d+\]:.*$/gm, "")
    // Then strip inline [^n] references
    .replace(/\[\^\d+\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract the first "decisive" sentence from a markdown answer.
 * Used by the "Say it simply" toggle (PRD §01-016) so an employee can
 * collapse a long answer to just the headline + citations.
 *
 * Strategy: walk the text looking for the first sentence-ending
 * punctuation (`.`, `!`, `?`) that is followed by whitespace or end of
 * string. If none found, return the whole text. Markdown emphasis
 * markers (`*`, `_`, `**`) are preserved so ReactMarkdown still renders
 * them — we only slice on punctuation.
 */
function firstSentence(md: string): string {
  const text = md.trim();
  if (!text) return "";
  // Match up to and including the first . ! or ? that is followed by
  // whitespace, end-of-string, or a newline.
  const match = text.match(/^[^.!?\n]*[.!?](?=\s|$)/);
  if (match) return match[0].trim();
  // Fallback: first line, no terminal punctuation.
  const firstLine = text.split(/\n/)[0];
  return firstLine.trim();
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/* ============================================================
   Main screen
   ============================================================ */

export function AskScreen() {
  const locale = useAppStore((s) => s.locale);
  const currentEmployeeId = useAppStore((s) => s.currentEmployeeId);
  const setView = useAppStore((s) => s.setView);
  const setActiveRequestType = useAppStore((s) => s.setActiveRequestType);

  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeStage, setActiveStage] = useState<number>(-1);
  const [stageElapsed, setStageElapsed] = useState<number[]>([0, 0, 0]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll history to bottom on new turn
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTo({ top: historyRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [turns]);

  // Clear turns when employee changes (deterministic reset)
  useEffect(() => {
    setTurns([]);
    setQuestion("");
    setActiveStage(-1);
  }, [currentEmployeeId]);

  const sendQuestion = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      if (!currentEmployeeId) return;
      if (trimmed.length > 1000) {
        toast.error(locale === "ar" ? "السؤال طويل جداً (1000 حرف كحد أقصى)" : "Question too long (max 1000 chars)");
        return;
      }

      const turnId = `turn-${Date.now().toString(36)}`;
      const newTurn: Turn = {
        id: turnId,
        question: trimmed,
        loading: true,
        startedAt: Date.now(),
      };
      // Keep last 5 turns
      setTurns((prev) => [...prev.slice(-4), newTurn]);
      setQuestion("");
      setActiveStage(0);
      setStageElapsed([0, 0, 0]);

      // Animate stage 1
      const stageTimers: ReturnType<typeof setTimeout>[] = [];
      const stageIntervals: ReturnType<typeof setInterval>[] = [];

      const startStage = (idx: number, durMs: number) => {
        const start = Date.now();
        const interval = setInterval(() => {
          const elapsed = Date.now() - start;
          setStageElapsed((prev) => {
            const next = [...prev];
            next[idx] = elapsed;
            return next;
          });
        }, 80);
        stageIntervals.push(interval);
        const timer = setTimeout(() => {
          clearInterval(interval);
          if (idx < 2) {
            setActiveStage(idx + 1);
            startStage(idx + 1, idx === 0 ? 600 : 400);
          }
        }, durMs);
        stageTimers.push(timer);
      };
      startStage(0, 400);

      try {
        const res = await fetch("/api/v1/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, locale, employeeId: currentEmployeeId }),
        });
        const json: ApiEnvelope<AskResponse> = await res.json();
        if (!json.ok || !json.data) {
          throw new Error(json.error?.message ?? "Failed to get answer");
        }
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? { ...t, answer: json.data!.answer, loading: false }
              : t,
          ),
        );
      } catch (err) {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === turnId
              ? {
                  ...t,
                  loading: false,
                  error: err instanceof Error ? err.message : "Unknown error",
                }
              : t,
          ),
        );
        toast.error(locale === "ar" ? "تعذّر الوصول إلى السياسة" : "Couldn't reach the policy service");
      } finally {
        // Stop animations after fetch resolves (regardless of stage reached)
        stageTimers.forEach(clearTimeout);
        stageIntervals.forEach(clearInterval);
        setActiveStage(-1);
      }
    },
    [currentEmployeeId, locale],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(question);
    }
  };

  const starters = locale === "ar" ? STARTERS_AR : STARTERS_EN;

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
          style={{ background: "var(--g-veil)", color: "var(--brand-400)" }}
          aria-hidden="true"
        >
          <Compass className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h1
            className="text-[20px] sm:text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-hi)" }}
          >
            {locale === "ar" ? "اسأل عن السياسة" : "Ask about policy"}
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "أسألني أي شيء عن رحلتك أو سياساتنا. أُجيب من الوثائق الرسمية فقط — وإذا لم أكن متأكداً، أحيلك إلى الشخص المناسب."
              : "Ask me anything about your journey or our policies. I answer from official documents only — and if I'm not sure, I hand you to the right person."}
          </p>
        </div>
      </div>

      {/* History (last 5 turns) — scrollable */}
      {turns.length > 0 && (
        <section
          className="ast-card p-3 sm:p-4 mb-4"
          aria-label={locale === "ar" ? "آخر الأسئلة" : "Recent questions"}
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "آخر 5 أسئلة" : "Last 5 questions"}
            </span>
            <button
              onClick={() => setTurns([])}
              className="ast-focus text-[11px] font-medium h-7 px-2 rounded-md transition-colors"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "مسح" : "Clear"}
            </button>
          </div>
          <div
            ref={historyRef}
            className="max-h-32 overflow-y-auto pr-1 space-y-1.5"
          >
            {turns.map((t) => (
              <button
                key={t.id}
                onClick={() => sendQuestion(t.question)}
                className="ast-focus w-full text-left flex items-center gap-2 h-8 px-2.5 rounded-md text-[12px] transition-colors hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-mid)" }}
                title={t.question}
              >
                <Sparkles
                  className="w-3 h-3 shrink-0"
                  strokeWidth={1.75}
                  style={{ color: "var(--brand-400)" }}
                />
                <span className="truncate">{t.question}</span>
                {t.loading && (
                  <span
                    className="ml-auto shrink-0 tabular text-[10px]"
                    style={{ color: "var(--brand-400)" }}
                  >
                    {locale === "ar" ? "قيد التفكير…" : "thinking…"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Three-stage progress (only while loading) */}
      <AnimatePresence>
        {activeStage >= 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="ast-card p-4 sm:p-5 mb-4"
            aria-live="polite"
            aria-label={locale === "ar" ? "مراحل التفكير" : "Thinking stages"}
          >
            <ThreeStageProgress
              activeStage={activeStage}
              stageElapsed={stageElapsed}
              locale={locale}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Answers / abstentions / errors */}
      <div className="space-y-4 mb-4">
        {turns.length === 0 && (
          <StartersRow starters={starters} onPick={sendQuestion} locale={locale} />
        )}
        <AnimatePresence initial={false}>
          {[...turns].reverse().map((turn) => (
            <TurnCard
              key={turn.id}
              turn={turn}
              locale={locale}
              onFollowUp={(q) => sendQuestion(q)}
              onStartRequest={(type) => {
                setActiveRequestType(type);
                setView("requests");
              }}
              onViewJourney={() => setView("today")}
              onViewRequests={() => setView("requests")}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Sticky ask input area */}
      <div
        className="sticky bottom-0 z-30 -mx-4 sm:mx-0 px-4 sm:px-0 pb-4 pt-2"
        style={{
          background: "linear-gradient(180deg, transparent 0%, var(--surface-0) 30%)",
        }}
      >
        <div
          className="ast-card p-3 sm:p-4"
          style={{ boxShadow: "var(--e2)" }}
        >
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                aria-label={locale === "ar" ? "اكتب سؤالك عن السياسة" : "Ask a policy question"}
                placeholder={
                  locale === "ar"
                    ? "اسأل عن السياسة… (Enter للإرسال · Shift+Enter لسطر جديد)"
                    : "Ask a policy question… (Enter to send · Shift+Enter for a new line)"
                }
                className="ast-focus w-full resize-none bg-transparent px-1 py-1.5 text-[15px] leading-relaxed outline-none placeholder:text-[var(--text-lo)]"
                style={{ color: "var(--text-hi)" }}
                maxLength={1000}
              />
              <div className="flex items-center justify-between px-1">
                <span
                  className="text-[10px] font-mono tabular"
                  style={{ color: "var(--text-lo)" }}
                >
                  {question.length}/1000
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--text-lo)" }}
                >
                  {locale === "ar" ? "Enter للإرسال" : "Enter to send"}
                </span>
              </div>
            </div>
            <button
              onClick={() => sendQuestion(question)}
              disabled={!question.trim()}
              aria-label={locale === "ar" ? "إرسال السؤال" : "Send question"}
              className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[10px] text-[14px] font-semibold shrink-0 transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
              style={{
                background: "var(--brand-500)",
                color: "var(--surface-0)",
                boxShadow: "0 4px 14px rgba(22,154,165,0.28)",
              }}
            >
              <Send className="w-4 h-4" strokeWidth={2} />
              <span className="hidden sm:inline">
                {locale === "ar" ? "اسأل" : "Ask"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Three-stage progress — instrument style with pulse dots
   connected by hairlines.
   ============================================================ */

function ThreeStageProgress({
  activeStage,
  stageElapsed,
  locale,
}: {
  activeStage: number;
  stageElapsed: number[];
  locale: "en" | "ar";
}) {
  const labels =
    locale === "ar"
      ? ["يفحص رحلتك", "يقرأ السياسة", "يصيغ الإجابة"]
      : ["checking your journey", "reading policy", "drafting"];
  return (
    <div>
      <ol className="flex items-center gap-2">
        {labels.map((label, i) => {
          const isPast = i < activeStage;
          const isActive = i === activeStage;
          const isPending = i > activeStage;
          return (
            <li key={label} className="flex items-center gap-2 flex-1 min-w-0">
              <span
                className={cn(
                  "inline-flex items-center justify-center w-3 h-3 rounded-full shrink-0",
                  isActive && "ast-pulse-ring",
                )}
                style={{
                  background: isPast
                    ? "var(--brand-500)"
                    : isActive
                      ? "var(--brand-400)"
                      : "var(--surface-3)",
                  border: `1px solid ${
                    isPast || isActive ? "var(--brand-500)" : "var(--border)"
                  }`,
                }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <p
                  className="text-[12px] font-medium leading-tight truncate"
                  style={{
                    color: isPast
                      ? "var(--brand-400)"
                      : isActive
                        ? "var(--text-hi)"
                        : "var(--text-lo)",
                  }}
                >
                  {label}
                </p>
                {(isActive || isPast) && (
                  <p
                    className="text-[10px] tabular mt-0.5"
                    style={{ color: "var(--text-lo)" }}
                  >
                    {fmtMs(stageElapsed[i] || 0)}
                  </p>
                )}
              </div>
              {i < labels.length - 1 && (
                <span
                  aria-hidden="true"
                  className="hidden sm:block h-[1px] w-8 shrink-0"
                  style={{
                    background:
                      isPast || isActive
                        ? "var(--brand-500)"
                        : "var(--border)",
                  }}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p
        className="text-[11px] mt-3"
        style={{ color: "var(--text-lo)" }}
      >
        {locale === "ar"
          ? "أبحث في سياساتك الرسمية فقط — لا تخمين."
          : "I'm searching your official policies only — no guessing."}
      </p>
    </div>
  );
}

/* ============================================================
   Starters row
   ============================================================ */

function StartersRow({
  starters,
  onPick,
  locale,
}: {
  starters: string[];
  onPick: (q: string) => void;
  locale: "en" | "ar";
}) {
  return (
    <section aria-label={locale === "ar" ? "أسئلة مقترحة" : "Suggested questions"}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles
          className="w-4 h-4"
          strokeWidth={1.75}
          style={{ color: "var(--brand-400)" }}
        />
        <h2
          className="text-[13px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--text-hi)" }}
        >
          {locale === "ar" ? "جرّب أحد هذه" : "Try one of these"}
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {starters.map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: i * 0.04 }}
            onClick={() => onPick(s)}
            className="ast-focus ast-card-2 p-3 text-left text-[13px] leading-snug transition-all hover:-translate-y-0.5 hover:border-[var(--brand-500)]"
            style={{ color: "var(--text-mid)" }}
          >
            {s}
          </motion.button>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Turn card — renders question + answer/abstain/error
   ============================================================ */

function TurnCard({
  turn,
  locale,
  onFollowUp,
  onStartRequest,
  onViewJourney,
  onViewRequests,
}: {
  turn: Turn;
  locale: "en" | "ar";
  onFollowUp: (q: string) => void;
  onStartRequest: (type: string) => void;
  onViewJourney: () => void;
  onViewRequests: () => void;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22 }}
      className="space-y-3"
    >
      {/* Question bubble */}
      <div className="flex justify-end">
        <div
          className="max-w-[85%] sm:max-w-[75%] px-4 py-2.5 rounded-[14px] rounded-tr-md"
          style={{
            background: "rgba(22,154,165,0.10)",
            border: "1px solid rgba(22,154,165,0.25)",
            color: "var(--text-hi)",
          }}
        >
          <p className="text-[14px] leading-relaxed">{turn.question}</p>
        </div>
      </div>

      {/* Loading skeleton while waiting */}
      {turn.loading && (
        <div className="ast-card p-4" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-3 w-3/4 ast-shimmer rounded" />
            <div className="h-3 w-1/2 ast-shimmer rounded" />
            <div className="h-3 w-2/3 ast-shimmer rounded" />
          </div>
        </div>
      )}

      {/* Error */}
      {!turn.loading && turn.error && (
        <ErrorCard
          message={turn.error}
          locale={locale}
          onRetry={() => onFollowUp(turn.question)}
        />
      )}

      {/* Answer */}
      {!turn.loading && turn.answer && turn.answer.kind === "answer" && (
        <AnswerCard
          answer={turn.answer}
          locale={locale}
          onFollowUp={onFollowUp}
          onStartRequest={onStartRequest}
        />
      )}

      {/* Abstain / handoff */}
      {!turn.loading && turn.answer && turn.answer.kind === "abstain" && (
        <AbstainCard
          answer={turn.answer}
          question={turn.question}
          locale={locale}
          onFollowUp={onFollowUp}
          onViewJourney={onViewJourney}
          onViewRequests={onViewRequests}
        />
      )}
    </motion.article>
  );
}

/* ============================================================
   Answer card (kind: "answer")
   - Simulated streaming reveal
   - Sources row (collapsible)
   - answerId copy + last checked time
   - Feedback buttons
   ============================================================ */

function AnswerCard({
  answer,
  locale,
  onFollowUp,
  onStartRequest,
}: {
  answer: PolicyAnswer;
  locale: "en" | "ar";
  onFollowUp: (q: string) => void;
  onStartRequest: (type: string) => void;
}) {
  const [revealed, setRevealed] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wrongReported, setWrongReported] = useState(false);
  // "Say it simply" preference — per-question (local state, no persistence
  // needed beyond the life of this card which is keyed by turn.id).
  const [simple, setSimple] = useState(false);

  const cleanMd = useMemo(
    () => (answer.answerMarkdown ? stripCitations(answer.answerMarkdown) : ""),
    [answer.answerMarkdown],
  );

  // Pre-compute the "simple" form once: just the first decisive sentence.
  const simpleMd = useMemo(() => firstSentence(cleanMd), [cleanMd]);

  // Derived: streaming is done once revealed covers the full markdown.
  const done = revealed >= cleanMd.length;

  // Simulate token streaming — 4 chars every 16ms.
  // AnswerCard is keyed by turn.id, so it remounts per answer and
  // `revealed` always starts at 0 — no reset needed.
  useEffect(() => {
    if (!cleanMd) return;
    const interval = setInterval(() => {
      setRevealed((prev) => {
        const next = prev + 4;
        if (next >= cleanMd.length) {
          clearInterval(interval);
          return cleanMd.length;
        }
        return next;
      });
    }, 16);
    return () => clearInterval(interval);
  }, [cleanMd]);

  const streamed = cleanMd.slice(0, revealed);

  // When simple mode is on, show the pre-computed first sentence in full
  // (no streaming animation — it should feel instant).
  const displayMd = simple ? simpleMd : streamed;

  const handleCopyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(cleanMd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success(locale === "ar" ? "تم نسخ الإجابة" : "Answer copied");
    } catch {
      toast.error(locale === "ar" ? "تعذّر النسخ" : "Couldn't copy");
    }
  };

  const handleCopyAnswerId = async () => {
    try {
      await navigator.clipboard.writeText(answer.answerId);
      toast.success(locale === "ar" ? "تم نسخ مُعرّف الإجابة" : "Answer ID copied");
    } catch {
      toast.error(locale === "ar" ? "تعذّر النسخ" : "Couldn't copy");
    }
  };

  const handleShareOwner = () => {
    if (!answer.ownerHint) {
      toast.info(
        locale === "ar"
          ? "لا يوجد مالك محدد لهذه الإجابة"
          : "No named owner for this answer",
      );
      return;
    }
    const subject = encodeURIComponent(
      locale === "ar"
        ? `سؤال عن السياسة: ${cleanMd.slice(0, 60)}…`
        : `Policy question: ${cleanMd.slice(0, 60)}…`,
    );
    const body = encodeURIComponent(
      `${locale === "ar" ? "السؤال" : "Question"}:\n${cleanMd}\n\n${locale === "ar" ? "مُعرّف الإجابة" : "Answer ID"}: ${answer.answerId}`,
    );
    window.location.href = `mailto:${answer.ownerHint.email}?subject=${subject}&body=${body}`;
  };

  const handleWrong = () => {
    setWrongReported(true);
    toast.success(
      locale === "ar"
        ? "شكراً — سيراجع الفريق هذه الإجابة"
        : "Thanks — the team will review this answer",
    );
  };

  const isStale = answer.degraded.includes("policy_stale");

  return (
    <div
      className="ast-card p-4 sm:p-5"
      style={isStale ? { borderColor: "rgba(217,119,6,0.40)" } : undefined}
    >
      {/* Stale banner */}
      {isStale && (
        <div
          className="flex items-start gap-2 mb-3 p-3 rounded-md text-[12px]"
          style={{
            background: "rgba(217,119,6,0.08)",
            border: "1px solid rgba(217,119,6,0.25)",
            color: "var(--status-watch)",
          }}
          role="status"
        >
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} />
          <span>
            {locale === "ar"
              ? "بحث السياسة أعاد وثيقة قديمة — يرجى التأكيد مع المالك."
              : "Policy search returned a stale document — please confirm with the owner."}
          </span>
        </div>
      )}

      {/* "Say it simply" toggle (PRD §01-016) — pill button + Simple badge */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setSimple((v) => !v)}
          aria-pressed={simple}
          aria-label={locale === "ar" ? "ببساطة" : "Say it simply"}
          className="ast-focus inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium transition-colors"
          style={{
            background: simple ? "rgba(22,154,165,0.12)" : "var(--surface-2)",
            border: `1px solid ${simple ? "rgba(22,154,165,0.40)" : "var(--border)"}`,
            color: simple ? "var(--brand-400)" : "var(--text-mid)",
          }}
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "ببساطة" : "Say it simply"}
        </button>
        <AnimatePresence initial={false}>
          {simple && (
            <motion.span
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.14 }}
              className="ast-chip"
              style={{
                color: "var(--brand-400)",
                background: "rgba(22,154,165,0.06)",
                borderColor: "rgba(22,154,165,0.30)",
              }}
            >
              {locale === "ar" ? "مبسّط" : "Simple"}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Answer body (streamed, or first-sentence-only when simple is on) */}
      <div
        className="text-[15px] leading-relaxed"
        style={{ color: "var(--text-hi)" }}
      >
        {displayMd ? (
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              em: ({ children }) => (
                <em style={{ color: "var(--text-mid)" }}>{children}</em>
              ),
              strong: ({ children }) => (
                <strong style={{ color: "var(--text-hi)" }}>{children}</strong>
              ),
            }}
          >
            {displayMd}
          </ReactMarkdown>
        ) : (
          <span style={{ color: "var(--text-lo)" }}>…</span>
        )}
        {!done && !simple && (
          <span
            aria-hidden="true"
            className="inline-block w-[2px] h-4 ml-0.5 align-middle ast-pulse-ring"
            style={{ background: "var(--brand-400)" }}
          />
        )}
      </div>

      {/* Sources row — collapsed to chips by default */}
      {answer.citations.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border-soft)]">
          <button
            onClick={() => setSourcesOpen((v) => !v)}
            className="ast-focus inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--brand-400)" }}
            aria-expanded={sourcesOpen}
          >
            <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
            {locale === "ar" ? "المصادر" : "Sources"}
            <span className="tabular">({answer.citations.length})</span>
            {sourcesOpen ? (
              <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.75} />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
          </button>

          {/* Chips row — always visible (collapsed) */}
          {!sourcesOpen && (
            <div className="mt-2 flex flex-wrap gap-2">
              {answer.citations.map((c) => (
                <CitationHover key={c.chunkId}>
                  <CitationChip citation={c} locale={locale} />
                </CitationHover>
              ))}
            </div>
          )}

          {/* Expanded snippets */}
          <AnimatePresence initial={false}>
            {sourcesOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-3 space-y-2 overflow-hidden"
              >
                {answer.citations.map((c, i) => (
                  <div
                    key={c.chunkId}
                    className="ast-card-2 p-3"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <CitationHover>
                        <CitationChip citation={c} locale={locale} />
                      </CitationHover>
                      <span
                        className="text-[10px] tabular font-mono shrink-0"
                        style={{ color: "var(--text-lo)" }}
                      >
                        [{i + 1}]
                      </span>
                    </div>
                    <p
                      className="text-[12px] leading-relaxed"
                      style={{ color: "var(--text-mid)" }}
                    >
                      “{c.snippet}”
                    </p>
                    <p
                      className="text-[10px] mt-2 tabular"
                      style={{ color: "var(--text-lo)" }}
                    >
                      {locale === "ar" ? "ساري منذ" : "Effective"}{" "}
                      {format(new Date(c.effectiveDate), "d MMM yyyy")}
                      {" · "}
                      {locale === "ar" ? "يُراجع في" : "review"}{" "}
                      {format(new Date(c.reviewDate), "d MMM yyyy")}
                    </p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Footer: answer id + last checked + actions */}
      <div className="mt-4 pt-4 border-t border-[var(--border-soft)] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <button
          onClick={handleCopyAnswerId}
          className="ast-focus inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[10px] font-mono tabular shrink-0 transition-colors hover:bg-[var(--surface-2)]"
          style={{ color: "var(--text-lo)" }}
          title={locale === "ar" ? "نسخ مُعرّف الإجابة" : "Copy answer ID"}
        >
          <Hash className="w-3 h-3" strokeWidth={1.75} />
          {answer.answerId}
        </button>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] tabular shrink-0"
          style={{ color: "var(--text-lo)" }}
        >
          <Clock className="w-3 h-3" strokeWidth={1.75} />
          {locale === "ar" ? "آخر فحص" : "Last checked"}{" "}
          {format(PACK_NOW, "d MMM yyyy HH:mm")}
        </span>
        {/* Grounding score — animated ticker */}
        <span
          className="inline-flex items-center gap-1.5 text-[10px] tabular shrink-0"
          style={{ color: "var(--text-lo)" }}
          title={locale === "ar" ? "درجة التحقق من المصدر" : "How well the answer is backed by cited sources"}
        >
          <ShieldAlert className="w-3 h-3" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          {locale === "ar" ? "تثبيت" : "Grounding"}{" "}
          <span style={{ color: "var(--brand-400)" }}>
            <NumberTicker
              value={Math.round(answer.groundingScore * 100)}
              suffix="%"
            />
          </span>
        </span>

        <div className="sm:ml-auto flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleCopyAnswer}
            className="ast-focus inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-medium transition-colors hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text-mid)" }}
          >
            {copied ? (
              <Check
                className="w-3.5 h-3.5"
                strokeWidth={1.75}
                style={{ color: "var(--status-steady)" }}
              />
            ) : (
              <Copy className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {locale === "ar" ? "نسخ" : "Copy"}
          </button>
          {answer.ownerHint && (
            <button
              onClick={handleShareOwner}
              className="ast-focus inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-medium transition-colors hover:bg-[var(--surface-2)]"
              style={{ color: "var(--text-mid)" }}
            >
              <Share2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              {locale === "ar" ? "إرسال للمالك" : "Share to owner"}
            </button>
          )}
          <button
            onClick={handleWrong}
            disabled={wrongReported}
            className="ast-focus inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] font-medium transition-colors hover:bg-[var(--surface-2)] disabled:opacity-50"
            style={
              wrongReported
                ? { color: "var(--status-steady)" }
                : { color: "var(--text-mid)" }
            }
          >
            {wrongReported ? (
              <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
            ) : (
              <ThumbsDown className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {wrongReported
              ? locale === "ar"
                ? "تم الإبلاغ"
                : "Reported"
              : locale === "ar"
                ? "هذا خطأ"
                : "This was wrong"}
          </button>
        </div>
      </div>

      {/* Follow-ups */}
      {answer.followUps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {answer.followUps.map((f) => (
            <button
              key={f}
              onClick={() => onFollowUp(f)}
              className="ast-focus ast-chip transition-all hover:-translate-y-0.5 hover:border-[var(--brand-500)]"
              style={{
                color: "var(--brand-400)",
                background: "rgba(22,154,165,0.06)",
                borderColor: "rgba(22,154,165,0.22)",
                cursor: "pointer",
                height: 28,
                paddingInline: 10,
              }}
            >
              <Sparkles className="w-3 h-3" strokeWidth={1.75} />
              <span className="max-w-[260px] truncate">{f}</span>
            </button>
          ))}
        </div>
      )}

      {/* Start this request CTA — only if answer has an actionable next step */}
      {answer.citations.length > 0 && (
        <div className="mt-3">
          <StartRequestInline
            locale={locale}
            onStart={onStartRequest}
          />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Abstain / handoff card (kind: "abstain")
   - Plain-language EN/AR copy
   - Named owner with role + email
   - Editable prefilled question + Send to {owner} button
   - "What I won't do: guess" line
   - out_of_scope + journey/action intent → route to Today / Requests
   ============================================================ */

function AbstainCard({
  answer,
  question,
  locale,
  onFollowUp,
  onViewJourney,
  onViewRequests,
}: {
  answer: PolicyAnswer;
  question: string;
  locale: "en" | "ar";
  onFollowUp: (q: string) => void;
  onViewJourney: () => void;
  onViewRequests: () => void;
}) {
  const [editQ, setEditQ] = useState(question);
  const [sending, setSending] = useState(false);

  const reasonEn = answer.abstainReasonEn ?? "I'm not sure, and I won't guess.";
  const reasonAr = answer.abstainReasonAr ?? "لست متأكداً، ولن أخمن.";
  const reason = locale === "ar" ? reasonAr : reasonEn;
  const owner = answer.ownerHint;

  const isOosRoute =
    answer.abstainReasonCode === "out_of_scope" &&
    /journey|action/i.test(answer.abstainReasonEn ?? "");

  const handleSendToOwner = () => {
    if (!owner) return;
    setSending(true);
    const subject = encodeURIComponent(
      locale === "ar" ? "سؤال من موظف عبر ASTROLABE" : "Employee question via ASTROLABE",
    );
    const body = encodeURIComponent(
      `${locale === "ar" ? "السؤال" : "Question"}:\n${editQ}\n\n${locale === "ar" ? "مُعرّف الإجابة" : "Answer ID"}: ${answer.answerId}`,
    );
    window.location.href = `mailto:${owner.email}?subject=${subject}&body=${body}`;
    setTimeout(() => setSending(false), 600);
  };

  return (
    <div
      className="ast-card p-4 sm:p-5"
      style={{ borderColor: "rgba(201,162,39,0.30)" }}
      aria-label={locale === "ar" ? "إحالة إلى مالك" : "Handoff to owner"}
    >
      {/* Header — handoff, not failure */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{
            background: "rgba(201,162,39,0.12)",
            color: "var(--accent-500)",
          }}
          aria-hidden="true"
        >
          <Compass className="w-4.5 h-4.5" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: "var(--text-hi)" }}
          >
            {locale === "ar"
              ? "أُحيلك إلى من يعرف هذه."
              : "I'll hand you to someone who knows this one."}
          </h3>
          <p
            className="text-[13px] mt-1 leading-relaxed"
            style={{ color: "var(--text-mid)" }}
          >
            {reason}
          </p>
        </div>
      </div>

      {/* "What I won't do: guess" — explicit boundary */}
      <div
        className="mb-3 p-3 rounded-md flex items-start gap-2"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <Ban
          className="w-3.5 h-3.5 shrink-0 mt-0.5"
          strokeWidth={1.75}
          style={{ color: "var(--status-friction)" }}
        />
        <p
          className="text-[12px] leading-relaxed"
          style={{ color: "var(--text-mid)" }}
        >
          {locale === "ar"
            ? "ما لن أفعله: التخمين. لم أصنع إجابة من لا شيء."
            : "What I won't do: guess. I didn't fabricate an answer from nothing."}
        </p>
      </div>

      {/* Named owner with role + email */}
      {owner && (
        <div
          className="ast-card-2 p-3.5 mb-3 flex items-center gap-3"
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{
              background: "rgba(22,154,165,0.10)",
              color: "var(--brand-400)",
            }}
            aria-hidden="true"
          >
            <Mail className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-[14px] font-semibold leading-tight truncate"
              style={{ color: "var(--text-hi)" }}
            >
              {owner.name}
            </p>
            <p
              className="text-[12px] truncate"
              style={{ color: "var(--text-mid)" }}
            >
              {owner.role}
            </p>
            <p
              className="text-[11px] font-mono tabular truncate"
              style={{ color: "var(--text-lo)" }}
            >
              {owner.email}
            </p>
          </div>
        </div>
      )}

      {/* Out-of-scope journey/action route — buttons instead of mailto */}
      {isOosRoute ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={onViewJourney}
            className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-semibold transition-transform hover:-translate-y-0.5"
            style={{
              background: "var(--brand-500)",
              color: "var(--surface-0)",
              boxShadow: "0 4px 14px rgba(22,154,165,0.28)",
            }}
          >
            <Compass className="w-4 h-4" strokeWidth={1.75} />
            {locale === "ar" ? "اذهب إلى اليوم" : "Go to Today"}
          </button>
          <button
            onClick={onViewRequests}
            className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-semibold transition-colors"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-hi)",
              border: "1px solid var(--border)",
            }}
          >
            {locale === "ar" ? "اذهب إلى الطلبات" : "Go to Requests"}
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : owner ? (
        <div className="space-y-2">
          <label
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--text-lo)" }}
          >
            {locale === "ar" ? "راسلهم بهذا السؤال" : "Send them this question"}
          </label>
          <textarea
            value={editQ}
            onChange={(e) => setEditQ(e.target.value)}
            rows={2}
            className="ast-focus w-full resize-none rounded-md px-3 py-2 text-[14px] leading-relaxed bg-[var(--surface-2)] outline-none"
            style={{
              color: "var(--text-hi)",
              border: "1px solid var(--border)",
            }}
          />
          <button
            onClick={handleSendToOwner}
            disabled={sending || !editQ.trim()}
            className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[10px] text-[13px] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            style={{
              background: "var(--accent-500)",
              color: "var(--surface-0)",
              boxShadow: "0 4px 14px rgba(201,162,39,0.28)",
            }}
          >
            <Send className="w-4 h-4" strokeWidth={2} />
            {sending
              ? locale === "ar"
                ? "جارٍ الفتح…"
                : "Opening…"
              : locale === "ar"
                ? `أرسل إلى ${owner.name}`
                : `Send to ${owner.name}`}
          </button>
        </div>
      ) : null}

      {/* Follow-ups even on abstain */}
      {answer.followUps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--border-soft)] flex flex-wrap gap-1.5">
          {answer.followUps.map((f) => (
            <button
              key={f}
              onClick={() => onFollowUp(f)}
              className="ast-focus ast-chip transition-all hover:-translate-y-0.5 hover:border-[var(--brand-500)]"
              style={{
                color: "var(--brand-400)",
                background: "rgba(22,154,165,0.06)",
                borderColor: "rgba(22,154,165,0.22)",
                cursor: "pointer",
                height: 28,
                paddingInline: 10,
              }}
            >
              <Sparkles className="w-3 h-3" strokeWidth={1.75} />
              <span className="max-w-[260px] truncate">{f}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   "Start this request" inline CTA — sand-gold accent
   ============================================================ */

function StartRequestInline({
  locale,
  onStart,
}: {
  locale: "en" | "ar";
  onStart: (type: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const types: { value: string; labelEn: string; labelAr: string }[] = [
    { value: "it_kit", labelEn: "IT kit", labelAr: "جهاز تقنية" },
    { value: "system_access", labelEn: "System access", labelAr: "وصول للأنظمة" },
    { value: "relocation", labelEn: "Relocation", labelAr: "انتقال" },
    { value: "training", labelEn: "Training", labelAr: "تدريب" },
  ];
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="ast-focus inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--accent-500)" }}
        aria-expanded={open}
      >
        <Star className="w-3.5 h-3.5" strokeWidth={1.75} />
        {locale === "ar" ? "ابدأ طلباً ذا صلة" : "Start a related request"}
        {open ? (
          <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.75} />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.75} />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-2 overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => (
                <button
                  key={t.value}
                  onClick={() => onStart(t.value)}
                  className="ast-focus ast-chip transition-all hover:-translate-y-0.5"
                  style={{
                    color: "var(--accent-500)",
                    background: "rgba(201,162,39,0.06)",
                    borderColor: "rgba(201,162,39,0.30)",
                    cursor: "pointer",
                    height: 28,
                    paddingInline: 10,
                  }}
                >
                  <ArrowRight className="w-3 h-3" strokeWidth={1.75} />
                  {locale === "ar" ? t.labelAr : t.labelEn}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
   Error card with retry
   ============================================================ */

function ErrorCard({
  message,
  locale,
  onRetry,
}: {
  message: string;
  locale: "en" | "ar";
  onRetry: () => void;
}) {
  return (
    <div
      className="ast-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
      role="alert"
      style={{ borderColor: "rgba(220,38,38,0.40)" }}
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
        style={{ background: "rgba(220,38,38,0.12)", color: "var(--status-friction)" }}
      >
        <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] font-medium"
          style={{ color: "var(--text-hi)" }}
        >
          {locale === "ar"
            ? "تعذّر الوصول إلى خدمة السياسة."
            : "Couldn't reach the policy service."}
        </p>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-mid)" }}>
          {message}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-medium shrink-0"
        style={{
          background: "var(--surface-2)",
          color: "var(--text-hi)",
          border: "1px solid var(--border)",
        }}
      >
        <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
        {locale === "ar" ? "إعادة" : "Retry"}
      </button>
    </div>
  );
}
