"use client";

/* ============================================================
   ASTROLABE — Manager Screen (aggregate-only, PRD §16)
   CRITICAL PRIVACY BOUNDARY:
   This view MUST NOT show sentiment, pulse scores, transcripts,
   friction scores per person, or comments. The schema boundary
   is enforced server-side — the cohort API returns only
   {employeeId, employeeName, journeyType, stage, dayInStage,
   aggregateCompletion, ownedSteps[]}. Nothing else.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, formatDistanceStrict } from "date-fns";
import {
  ShieldCheck,
  Users,
  ClipboardList,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  Hourglass,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Inbox,
  Lock,
  ArrowLeftRight,
  BarChart3,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { StatusChip } from "@/components/astrolabe/widgets";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

type StepStatus =
  | "not_started"
  | "in_progress"
  | "waiting_employee"
  | "waiting_owner"
  | "blocked"
  | "done"
  | "skipped";

interface OwnedStep {
  stepKey: string;
  label: string;
  status: StepStatus;
  dueAt?: string;
}

interface CohortItem {
  employeeId: string;
  employeeName: string;
  journeyType: "onboarding" | "mobility";
  stage: string;
  dayInStage: number;
  aggregateCompletion: number;
  ownedSteps: OwnedStep[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string };
  error: { code: string; message: string; hint?: string } | null;
}

/* ---------- Stage labels ---------- */
const STAGE_LABELS: Record<string, { en: string; ar: string }> = {
  pre_boarding: { en: "Pre-boarding", ar: "ما قبل الالتحاق" },
  visa_processing: { en: "Visa Processing", ar: "معالجة التأشيرة" },
  first_day: { en: "First Day", ar: "اليوم الأول" },
  first_week: { en: "First Week", ar: "الأسبوع الأول" },
  first_90: { en: "First 90 Days", ar: "أول 90 يوماً" },
  transfer_approved: { en: "Transfer Approved", ar: "تمت الموافقة على النقل" },
  handover: { en: "Handover", ar: "التسليم" },
  effective_date: { en: "Effective Date", ar: "تاريخ السريان" },
  settle_new_role: { en: "Settling In", ar: "الاستقرار" },
};

function stageLabel(key: string, locale: "en" | "ar"): string {
  const e = STAGE_LABELS[key];
  if (!e) return key;
  return locale === "ar" ? e.ar : e.en;
}

/* ---------- 30-60-90 outline defaults (PRD §11-207) ---------- */

interface Outline3090 {
  day30: string[];
  day60: string[];
  day90: string[];
  buddy: string;
}

const DEFAULTS_ONBOARDING: Outline3090 = {
  day30: ["Complete induction", "First buddy catch-up", "Shadow 2 shifts"],
  day60: ["Solo first shift", "First feedback round", "Training module 2"],
  day90: ["90-day review", "Confirm probation", "Set Q1 goals"],
  buddy: "",
};

const DEFAULTS_MOBILITY: Outline3090 = {
  day30: ["New role induction", "Releasing manager handover", "Stakeholder intros"],
  day60: ["First project delivery", "New team 1:1s", "Skills gap assessment"],
  day90: ["90-day review", "Confirm new role fit", "Set next-quarter goals"],
  buddy: "",
};

/** Build a fresh outline (deep copy of defaults) based on journey type. */
function defaultOutline(journeyType: "onboarding" | "mobility"): Outline3090 {
  const src = journeyType === "onboarding" ? DEFAULTS_ONBOARDING : DEFAULTS_MOBILITY;
  return {
    day30: [...src.day30],
    day60: [...src.day60],
    day90: [...src.day90],
    buddy: "",
  };
}

/* ---------- Skeleton ---------- */
function ManagerSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="ast-card h-24 ast-shimmer rounded-[14px]" />
      <div className="ast-card p-6 h-72 ast-shimmer rounded-[14px]" />
      <div className="ast-card p-6 h-72 ast-shimmer rounded-[14px]" />
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="ast-card p-5 flex flex-col sm:flex-row sm:items-center gap-4"
      role="alert"
      style={{ borderColor: "rgba(220,38,38,0.4)" }}
    >
      <div
        className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
        style={{ background: "rgba(220,38,38,0.12)", color: "var(--status-friction)" }}
      >
        <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
          We can&apos;t reach your cohort right now.
        </p>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium shrink-0"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
      >
        <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
        Retry
      </button>
    </div>
  );
}

/* ---------- Privacy banner ---------- */
function PrivacyBanner({ locale }: { locale: "en" | "ar" }) {
  return (
    <motion.section
      initial={false}
      animate={{ opacity: 1 }}
      className="ast-card p-4 sm:p-5 mb-5 flex items-start gap-3"
      style={{ borderColor: "rgba(22,154,165,0.28)", background: "rgba(22,154,165,0.04)" }}
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
        style={{ background: "rgba(22,154,165,0.12)", color: "var(--brand-400)" }}
      >
        <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
          {locale === "ar"
            ? "هذه ليست أداة مراقبة."
            : "This is not a monitoring tool."}
        </p>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-mid)" }}>
          {locale === "ar"
            ? "ترى فقط التزاماتك ونسبة الإنجاز الكلية. لا نُظهر نبضات أو درجات احتكاك أو تعليقات لأي فرد."
            : "You see only your own obligations and aggregate completion. We do not show sentiment, pulse scores, transcripts, friction scores per person, or comments for anyone."}
        </p>
      </div>
    </motion.section>
  );
}

/* ---------- Sub-view tabs ---------- */
function ManagerTabs() {
  const locale = useAppStore((s) => s.locale);
  const view = useAppStore((s) => s.managerView);
  const setView = useAppStore((s) => s.setManagerView);
  const TABS: { id: typeof view; label: string; labelAr: string; Icon: typeof Users }[] = [
    { id: "cohort", label: "My joiners", labelAr: "من الانضمام", Icon: Users },
    { id: "my_steps", label: "My obligations", labelAr: "التزاماتي", Icon: ClipboardList },
    { id: "compare", label: "Compare", labelAr: "قارن", Icon: ArrowLeftRight },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-full"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      role="tablist"
    >
      {TABS.map((t) => {
        const Icon = t.Icon;
        const isActive = view === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            aria-selected={isActive}
            role="tab"
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-full text-[12px] font-medium transition-colors"
            style={{
              background: isActive ? "var(--brand-500)" : "transparent",
              color: isActive ? "var(--surface-0)" : "var(--text-mid)",
            }}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">{locale === "ar" ? t.labelAr : t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   Component
   ============================================================ */
export function ManagerScreen() {
  const locale = useAppStore((s) => s.locale);
  const view = useAppStore((s) => s.managerView);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const [items, setItems] = useState<CohortItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCohort = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/v1/manager/cohort?managerId=MGR-1", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<{ managerId: string; items: CohortItem[] }> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      setItems(json.data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCohort(); }, [fetchCohort]);

  // Aggregate metrics
  const stats = useMemo(() => {
    if (!items) return { joiners: 0, waitingOnMe: 0, avgCompletion: 0 };
    const joiners = items.length;
    let waiting = 0;
    let sumCompletion = 0;
    for (const it of items) {
      sumCompletion += it.aggregateCompletion;
      for (const s of it.ownedSteps) {
        if (s.status === "waiting_owner") waiting += 1;
      }
    }
    return {
      joiners,
      waitingOnMe: waiting,
      avgCompletion: joiners > 0 ? Math.round(sumCompletion / joiners) : 0,
    };
  }, [items]);

  // Flatten owned steps across cohort (for "my obligations")
  const allObligations = useMemo(() => {
    if (!items) return [] as { employee: CohortItem; step: OwnedStep }[];
    const out: { employee: CohortItem; step: OwnedStep }[] = [];
    for (const it of items) {
      for (const s of it.ownedSteps) {
        out.push({ employee: it, step: s });
      }
    }
    // Sort: waiting_owner first, then by dueAt asc
    out.sort((a, b) => {
      const aWait = a.step.status === "waiting_owner" ? 0 : 1;
      const bWait = b.step.status === "waiting_owner" ? 0 : 1;
      if (aWait !== bWait) return aWait - bWait;
      const aDue = a.step.dueAt ? new Date(a.step.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.step.dueAt ? new Date(b.step.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aDue - bDue;
    });
    return out;
  }, [items]);

  return (
    <div
      dir={dir}
      className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10"
    >
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--brand-400)" }}>
            <Users className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{locale === "ar" ? "وحدة المدير" : "Manager console"}</span>
          </div>
          <h1 className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-tight" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "التزاماتك تجاه فريقك" : "Your obligations to your team"}
          </h1>
        </div>
        <ManagerTabs />
      </header>

      <PrivacyBanner locale={locale} />

      {loading ? (
        <ManagerSkeleton />
      ) : err ? (
        <ErrorBanner message={err} onRetry={fetchCohort} />
      ) : !items ? null : items.length === 0 ? (
        <div className="ast-card p-10 flex flex-col items-center text-center">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full mb-4"
            style={{ background: "var(--surface-2)", color: "var(--text-mid)" }}
          >
            <Inbox className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "لا شيء بانتظارك." : "Nothing waiting on you."}
          </p>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "عندما يصل موظف جديد أو ينتقل أحد، ستظهر التزاماتك هنا."
              : "When a joiner or mover lands on your team, your obligations will appear here."}
          </p>
        </div>
      ) : (
        <>
          {/* Hero numbers */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {/* Waiting on me — sand-gold (primary) */}
            <div
              className="ast-card p-5 relative overflow-hidden"
              style={{
                borderColor: "rgba(201,162,39,0.40)",
                background: "linear-gradient(135deg, rgba(201,162,39,0.10) 0%, var(--surface-1) 60%)",
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[3px]"
                style={{ background: "var(--accent-500)" }}
              />
              <p className="text-[11px] uppercase tracking-[0.14em] font-medium" style={{ color: "var(--accent-500)" }}>
                {locale === "ar" ? "بانتظارك" : "Waiting on you"}
              </p>
              <p className="text-[44px] leading-none font-semibold mt-2 tabular ast-brass">
                {stats.waitingOnMe}
              </p>
              <p className="text-[12px] mt-2" style={{ color: "var(--text-mid)" }}>
                {locale === "ar"
                  ? `خطوة تنتظر إكمالك عبر ${stats.joiners} موظف`
                  : `step${stats.waitingOnMe === 1 ? "" : "s"} you own across ${stats.joiners} joiner${stats.joiners === 1 ? "" : "s"}`}
              </p>
            </div>

            {/* Joiners count */}
            <div className="ast-card p-5">
              <p className="text-[11px] uppercase tracking-[0.14em] font-medium" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "المنضمّون" : "Joiners"}
              </p>
              <p className="text-[44px] leading-none font-semibold mt-2 tabular" style={{ color: "var(--text-hi)" }}>
                {stats.joiners}
              </p>
              <p className="text-[12px] mt-2" style={{ color: "var(--text-mid)" }}>
                {locale === "ar" ? "في رحلتك الحالية" : "in your current cohort"}
              </p>
            </div>

            {/* Aggregate completion */}
            <div className="ast-card p-5">
              <p className="text-[11px] uppercase tracking-[0.14em] font-medium" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "نسبة الإنجاز" : "Avg completion"}
              </p>
              <p className="text-[44px] leading-none font-semibold mt-2 tabular" style={{ color: "var(--text-hi)" }}>
                {stats.avgCompletion}<span className="text-[24px] font-normal" style={{ color: "var(--text-mid)" }}>%</span>
              </p>
              <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
                <motion.div
                  initial={false}
                  animate={{ width: `${stats.avgCompletion}%` }}
                  transition={{ duration: 0.4 }}
                  className="h-full rounded-full"
                  style={{ background: "var(--brand-500)" }}
                />
              </div>
            </div>
          </section>

          {/* Cohort / Joiners view */}
          {view === "cohort" && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "المنضمّون لديك" : "My joiners"}
                </h2>
              </div>
              <ul className="space-y-3">
                {items.map((item) => {
                  const waitingCount = item.ownedSteps.filter((s) => s.status === "waiting_owner").length;
                  return (
                    <motion.li
                      key={item.employeeId}
                      initial={false}
                      className="ast-card p-4 sm:p-5"
                    >
                      <div className="flex items-start gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
                            {item.employeeName}
                          </p>
                          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
                            {item.journeyType === "onboarding" ? (locale === "ar" ? "التحاق" : "Onboarding") : (locale === "ar" ? "تنقل" : "Mobility")}
                            <span className="mx-1.5">·</span>
                            {stageLabel(item.stage, locale)}
                            <span className="mx-1.5">·</span>
                            <span className="tabular">
                              {locale === "ar" ? `يوم ${item.dayInStage}` : `Day ${item.dayInStage}`}
                            </span>
                          </p>

                          {/* Aggregate completion bar */}
                          <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
                              <motion.div
                                initial={false}
                                animate={{ width: `${item.aggregateCompletion}%` }}
                                transition={{ duration: 0.4 }}
                                className="h-full rounded-full"
                                style={{
                                  background: item.aggregateCompletion >= 80
                                    ? "var(--status-steady)"
                                    : item.aggregateCompletion >= 40
                                    ? "var(--brand-500)"
                                    : "var(--status-watch)",
                                }}
                              />
                            </div>
                            <span className="text-[12px] tabular font-medium shrink-0" style={{ color: "var(--text-hi)" }}>
                              {item.aggregateCompletion}%
                            </span>
                          </div>
                        </div>

                        {/* Waiting-on-me badge */}
                        <div className="shrink-0 ml-auto text-right">
                          <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                            {locale === "ar" ? "بانتظارك" : "Waiting on you"}
                          </p>
                          <p
                            className="text-[24px] font-semibold tabular mt-0.5"
                            style={{
                              color: waitingCount > 0 ? "var(--accent-500)" : "var(--text-lo)",
                            }}
                          >
                            {waitingCount}
                          </p>
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* My obligations view */}
          {view === "my_steps" && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "التزاماتي" : "My obligations"}
                </h2>
                <span className="text-[12px] tabular" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? `${allObligations.length} خطوة` : `${allObligations.length} step${allObligations.length === 1 ? "" : "s"}`}
                </span>
              </div>

              {allObligations.length === 0 ? (
                <div className="ast-card p-10 flex flex-col items-center text-center">
                  <div
                    className="flex items-center justify-center w-14 h-14 rounded-full mb-4"
                    style={{ background: "rgba(14,159,110,0.10)", color: "var(--status-steady)" }}
                  >
                    <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} />
                  </div>
                  <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
                    {locale === "ar" ? "لا شيء بانتظارك." : "Nothing waiting on you."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {allObligations.map(({ employee, step }) => (
                    <ObligationRow
                      key={`${employee.employeeId}-${step.stepKey}`}
                      employee={employee}
                      step={step}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Compare view (PRD §16) — side-by-side columns of every joiner.
              Privacy boundary: same schema as the cohort API — aggregate
              completion + owned steps only. NO sentiment, pulse, or friction
              per person. */}
          {view === "compare" && (
            <CompareView items={items} locale={locale} />
          )}

          {/* 30-60-90 outline (PRD §11-207) — below "My obligations".
              For each joiner in the cohort, a collapsible card with three
              editable goal columns (30 / 60 / 90 days) + buddy assignment +
              Save button. State is local only — no backend writes. */}
          {view === "my_steps" && items && items.length > 0 && (
            <section className="mt-6">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "مخطط 30-60-90" : "30-60-90 outline"}
                </h2>
                <span className="text-[12px] tabular" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar"
                    ? `${items.length} موظف`
                    : `${items.length} joiner${items.length === 1 ? "" : "s"}`}
                </span>
              </div>
              <p className="text-[12px] mb-3" style={{ color: "var(--text-lo)" }}>
                {locale === "ar"
                  ? "خطط لأول 90 يوماً لكل منضمّ. خصّص الأهداف وعيّن الرفيق — يُحفظ محلياً للنموذج الأولي."
                  : "Plan each joiner's first 90 days. Personalize the goals and assign a buddy — saved locally for the prototype."}
              </p>
              <ul className="space-y-3">
                {items.map((item) => (
                  <Outline3090Card key={item.employeeId} item={item} locale={locale} />
                ))}
              </ul>
            </section>
          )}

          {/* Schema-boundary footer */}
          <p className="mt-6 text-[11px] flex items-center justify-center gap-1.5" style={{ color: "var(--text-lo)" }}>
            <Lock className="w-3 h-3" strokeWidth={1.75} />
            {locale === "ar"
              ? "هذا العرض مقيّد بنمط البيانات. لا تُرسل النبضات أو التعليقات لأي موظف."
              : "Schema-bound view: pulse, comments, friction scores, and transcripts are never returned to this surface."}
          </p>
        </>
      )}
    </div>
  );
}

/* ---------- Obligation row ---------- */
function ObligationRow({
  employee,
  step,
}: {
  employee: CohortItem;
  step: OwnedStep;
}) {
  const locale = useAppStore((s) => s.locale);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const isWaitingOwner = step.status === "waiting_owner";
  const due = step.dueAt ? new Date(step.dueAt) : null;
  const dueDistance = due ? formatDistanceStrict(due, new Date("2024-10-19T10:00:00Z"), { addSuffix: false }) : null;
  const overdue = due ? due.getTime() < Date.now() : false;

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    // No related request ref is returned by the cohort API (privacy boundary),
    // so for the prototype we simulate completion with a success toast.
    await new Promise((r) => setTimeout(r, 380));
    setCompleting(false);
    setCompleted(true);
    toast.success("Step complete", {
      description: `${step.label} · ${employee.employeeName}`,
    });
  }, [employee.employeeName, step.label]);

  return (
    <motion.li
      initial={false}
      className={cn("ast-card p-4 flex items-center gap-3 flex-wrap", completed && "opacity-70")}
      style={{
        borderColor: isWaitingOwner && !completed ? "rgba(201,162,39,0.32)" : "var(--border)",
      }}
    >
      {/* Status glyph */}
      <div
        className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
        style={{
          background: completed
            ? "rgba(14,159,110,0.12)"
            : isWaitingOwner
            ? "rgba(201,162,39,0.12)"
            : "var(--surface-2)",
          color: completed
            ? "var(--status-steady)"
            : isWaitingOwner
            ? "var(--accent-500)"
            : "var(--text-mid)",
        }}
      >
        {completed ? (
          <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
        ) : isWaitingOwner ? (
          <Hourglass className="w-4 h-4" strokeWidth={1.75} />
        ) : (
          <Clock className="w-4 h-4" strokeWidth={1.75} />
        )}
      </div>

      {/* Step + employee */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
          {step.label}
          {completed && (
            <span className="ml-2 text-[11px] font-medium" style={{ color: "var(--status-steady)" }}>
              {locale === "ar" ? "تم" : "done"}
            </span>
          )}
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
          {locale === "ar" ? "لـ" : "for"} <span className="font-medium" style={{ color: "var(--text-hi)" }}>{employee.employeeName}</span>
          {due && !completed && (
            <>
              <span className="mx-1.5">·</span>
              <span
                className="tabular inline-flex items-center gap-1"
                style={{ color: overdue ? "var(--status-friction)" : "var(--text-lo)" }}
              >
                <Clock className="w-3 h-3" strokeWidth={1.75} />
                {format(due, "d MMM")}
                <span style={{ color: "var(--text-lo)" }}>·</span>
                {overdue
                  ? (locale === "ar" ? `متأخر ${dueDistance}` : `${dueDistance} overdue`)
                  : (locale === "ar" ? `بعد ${dueDistance}` : `in ${dueDistance}`)}
              </span>
            </>
          )}
        </p>
      </div>

      {/* Status chip + action */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <StatusChip status={completed ? "done" : step.status} locale={locale} />
        {isWaitingOwner && !completed && (
          <button
            onClick={handleComplete}
            disabled={completing}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--accent-500)",
              color: "var(--surface-0)",
              border: "1px solid var(--accent-500)",
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            {completing
              ? (locale === "ar" ? "..." : "Marking…")
              : (locale === "ar" ? "أكمل الخطوة" : "Complete")}
          </button>
        )}
      </div>
    </motion.li>
  );
}

/* ============================================================
   Compare view (PRD §16) — side-by-side comparison of every joiner
   in the manager's cohort. Each joiner is a column (min-width 220px,
   horizontally scrollable on mobile). Shows: name + journey type,
   stage + day-in-stage, aggregate completion %, mini stage rail,
   "waiting on me" count, top 3 owned steps. Privacy boundary: only
   the cohort API schema — no sentiment, pulse, or friction per person.
   ============================================================ */

type CompareSort = "completion" | "dayInStage" | "waitingOnMe";

function CompareView({
  items,
  locale,
}: {
  items: CohortItem[] | null;
  locale: "en" | "ar";
}) {
  const [sortBy, setSortBy] = useState<CompareSort>("completion");

  // Empty state — no joiners in the cohort yet.
  if (!items || items.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ArrowLeftRight className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "قارن" : "Compare"}
          </h2>
        </div>
        <div className="ast-card p-10 flex flex-col items-center text-center">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full mb-4"
            style={{ background: "var(--surface-2)", color: "var(--text-mid)" }}
          >
            <ArrowLeftRight className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "لا منضمّين للمقارنة بعد." : "No joiners to compare yet."}
          </p>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "عندما يصل موظف جديد أو ينتقل أحد إلى فريقك، ستظهر المقارنة هنا."
              : "When a joiner or mover lands on your team, the comparison will appear here."}
          </p>
        </div>
      </section>
    );
  }

  // Cohort aggregates for the summary row.
  const totalJoiners = items.length;
  const avgCompletion = Math.round(
    items.reduce((a, b) => a + b.aggregateCompletion, 0) / Math.max(1, totalJoiners),
  );
  const totalWaitingOnMe = items.reduce(
    (a, it) => a + it.ownedSteps.filter((s) => s.status === "waiting_owner").length,
    0,
  );

  // Sort a copy of items — never mutate the source.
  const sorted = [...items].sort((a, b) => {
    if (sortBy === "completion") return b.aggregateCompletion - a.aggregateCompletion;
    if (sortBy === "dayInStage") return b.dayInStage - a.dayInStage;
    const aw = a.ownedSteps.filter((s) => s.status === "waiting_owner").length;
    const bw = b.ownedSteps.filter((s) => s.status === "waiting_owner").length;
    return bw - aw;
  });

  const sortOptions: { id: CompareSort; label: string; labelAr: string }[] = [
    { id: "completion", label: "Completion %", labelAr: "نسبة الإنجاز" },
    { id: "dayInStage", label: "Day in stage", labelAr: "اليوم في المرحلة" },
    { id: "waitingOnMe", label: "Waiting on me", labelAr: "بانتظاري" },
  ];

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <ArrowLeftRight className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "قارن" : "Compare"}
        </h2>
        <span className="text-[12px] tabular" style={{ color: "var(--text-mid)" }}>
          {locale === "ar" ? `${totalJoiners} موظف` : `${totalJoiners} joiner${totalJoiners === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Summary row — cohort avg + total waiting + mini bar chart */}
      <div className="ast-card p-4 sm:p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.14em] font-medium"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "متوسط الإنجاز" : "Cohort avg completion"}
            </p>
            <p
              className="text-[34px] leading-none font-semibold tabular mt-1.5"
              style={{ color: "var(--text-hi)" }}
              dir="ltr"
            >
              {avgCompletion}
              <span className="text-[18px] font-normal" style={{ color: "var(--text-mid)" }}>%</span>
            </p>
          </div>
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.14em] font-medium"
              style={{ color: "var(--accent-500)" }}
            >
              {locale === "ar" ? "إجمالي بانتظاري" : "Total waiting on me"}
            </p>
            <p
              className="text-[34px] leading-none font-semibold tabular mt-1.5 ast-brass"
              dir="ltr"
            >
              {totalWaitingOnMe}
            </p>
          </div>
          <div>
            <p
              className="text-[10px] uppercase tracking-[0.14em] font-medium"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "المنضمّون" : "Joiners"}
            </p>
            <p
              className="text-[34px] leading-none font-semibold tabular mt-1.5"
              style={{ color: "var(--text-hi)" }}
              dir="ltr"
            >
              {totalJoiners}
            </p>
          </div>
        </div>

        {/* Mini bar chart — completion per joiner */}
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-soft)" }}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            <span
              className="text-[10px] uppercase tracking-[0.14em] font-medium"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "إنجاز كل منضمّ" : "Per-joiner completion"}
            </span>
          </div>
          <div className="flex items-end gap-2 h-20">
            {sorted.map((it) => {
              const height = Math.max(6, it.aggregateCompletion);
              const waiting = it.ownedSteps.filter((s) => s.status === "waiting_owner").length;
              return (
                <div
                  key={it.employeeId}
                  className="flex-1 min-w-0 group flex flex-col items-center gap-1"
                  title={`${it.employeeName} — ${it.aggregateCompletion}%`}
                >
                  <span
                    className="text-[10px] tabular"
                    style={{ color: "var(--text-lo)" }}
                    dir="ltr"
                  >
                    {it.aggregateCompletion}%
                  </span>
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${height}%`,
                      minHeight: 6,
                      background:
                        waiting > 0
                          ? "linear-gradient(180deg, var(--accent-500) 0%, var(--accent-500) 30%, var(--brand-500) 100%)"
                          : "linear-gradient(180deg, var(--brand-400) 0%, var(--brand-500) 100%)",
                      opacity: 0.85,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sort options */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span
          className="text-[11px] uppercase tracking-[0.14em] mr-1"
          style={{ color: "var(--text-lo)" }}
        >
          {locale === "ar" ? "ترتيب حسب" : "Sort by"}
        </span>
        <div
          className="inline-flex items-center gap-1 p-1 rounded-full"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          {sortOptions.map((opt) => {
            const active = sortBy === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSortBy(opt.id)}
                aria-pressed={active}
                className="ast-focus inline-flex items-center h-7 px-3 rounded-full text-[11px] font-medium transition-colors"
                style={{
                  background: active ? "var(--brand-500)" : "transparent",
                  color: active ? "var(--surface-0)" : "var(--text-mid)",
                }}
              >
                {locale === "ar" ? opt.labelAr : opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side-by-side columns — horizontally scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-2">
        <div
          className="flex gap-3"
          style={{ minWidth: "min-content" }}
        >
          {sorted.map((it, i) => (
            <CompareColumn
              key={it.employeeId}
              item={it}
              locale={locale}
              index={i}
            />
          ))}
        </div>
      </div>

      {/* Privacy reminder */}
      <p
        className="mt-4 text-[11px] flex items-center gap-1.5"
        style={{ color: "var(--text-lo)" }}
      >
        <Lock className="w-3 h-3" strokeWidth={1.75} />
        {locale === "ar"
          ? "هذه المقارنة مقيّدة بنمط بيانات المجموعة — لا نبضات أو احتكاك لكل فرد."
          : "This comparison is schema-bound — no pulse, friction, or sentiment per person."}
      </p>
    </section>
  );
}

/* ---------- Single compare column ---------- */

function CompareColumn({
  item,
  locale,
  index,
}: {
  item: CohortItem;
  locale: "en" | "ar";
  index: number;
}) {
  const waitingCount = item.ownedSteps.filter((s) => s.status === "waiting_owner").length;
  const hasBlocked = item.ownedSteps.some((s) => s.status === "blocked");

  // Build the 5-segment stage rail. Onboarding has 5 stages, mobility 4 —
  // we always render 5 segments and pad with a "—" placeholder for mobility.
  const journeyStages: string[] =
    item.journeyType === "onboarding"
      ? ["pre_boarding", "visa_processing", "first_day", "first_week", "first_90"]
      : ["transfer_approved", "handover", "effective_date", "settle_new_role", "—"];
  const currentIdx = Math.max(0, journeyStages.indexOf(item.stage));

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.05, 0.25) }}
      className="ast-card p-4 shrink-0 flex flex-col"
      style={{ width: 220, minWidth: 220 }}
    >
      {/* Name */}
      <p
        className="text-[14px] font-semibold leading-snug truncate"
        style={{ color: "var(--text-hi)" }}
      >
        {item.employeeName}
      </p>

      {/* Journey type badge */}
      <div className="mt-1.5">
        <span
          className="ast-chip"
          style={{
            color: item.journeyType === "onboarding" ? "var(--brand-400)" : "var(--accent-500)",
            background:
              item.journeyType === "onboarding"
                ? "rgba(22,154,165,0.08)"
                : "rgba(201,162,39,0.08)",
            borderColor:
              item.journeyType === "onboarding"
                ? "rgba(22,154,165,0.25)"
                : "rgba(201,162,39,0.30)",
            height: 22,
            fontSize: 10,
          }}
        >
          {item.journeyType === "onboarding"
            ? (locale === "ar" ? "التحاق" : "Onboarding")
            : (locale === "ar" ? "تنقل" : "Mobility")}
        </span>
      </div>

      {/* Stage + day-in-stage */}
      <p
        className="text-[11px] mt-2 leading-snug"
        style={{ color: "var(--text-mid)" }}
      >
        {stageLabel(item.stage, locale)}
        <span className="mx-1">·</span>
        <span className="tabular" dir="ltr">
          {locale === "ar" ? `يوم ${item.dayInStage}` : `Day ${item.dayInStage}`}
        </span>
      </p>

      {/* Aggregate completion % — large, tabular */}
      <div className="mt-3">
        <p
          className="text-[10px] uppercase tracking-[0.12em] font-medium"
          style={{ color: "var(--text-lo)" }}
        >
          {locale === "ar" ? "الإنجاز" : "Completion"}
        </p>
        <p
          className="text-[30px] leading-none font-semibold tabular mt-0.5"
          style={{
            color:
              item.aggregateCompletion >= 80
                ? "var(--status-steady)"
                : item.aggregateCompletion >= 40
                  ? "var(--brand-400)"
                  : "var(--status-watch)",
          }}
          dir="ltr"
        >
          {item.aggregateCompletion}
          <span className="text-[16px] font-normal" style={{ color: "var(--text-mid)" }}>%</span>
        </p>
      </div>

      {/* Mini stage rail — 5 segments */}
      <div className="mt-3">
        <div className="flex gap-1">
          {journeyStages.map((s, i) => {
            const isDone = i < currentIdx;
            const isActive = i === currentIdx;
            const isBlocked = isActive && hasBlocked;
            const state = isBlocked
              ? "blocked"
              : isDone
                ? "done"
                : isActive
                  ? "active"
                  : "pending";
            const bg = isBlocked
              ? "var(--status-blocked)"
              : isDone
                ? "var(--brand-500)"
                : isActive
                  ? "linear-gradient(90deg, var(--brand-500), var(--accent-500))"
                  : "var(--surface-3)";
            return (
              <div
                key={s + String(i)}
                className="flex-1 h-1.5 rounded-full transition-all"
                style={{
                  background: bg,
                  boxShadow: isActive && !isBlocked ? "0 0 6px rgba(22,154,165,0.4)" : undefined,
                }}
                title={s === "—" ? "" : stageLabel(s, locale)}
                aria-label={s === "—" ? undefined : stageLabel(s, locale)}
                data-state={state}
              />
            );
          })}
        </div>
      </div>

      {/* Waiting on me count — sand-gold, large */}
      <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <span
          className="text-[10px] uppercase tracking-[0.12em] font-medium"
          style={{ color: "var(--text-lo)" }}
        >
          {locale === "ar" ? "بانتظارك" : "Waiting on you"}
        </span>
        <span
          className="text-[22px] leading-none font-semibold tabular"
          style={{
            color: waitingCount > 0 ? "var(--accent-500)" : "var(--text-lo)",
          }}
          dir="ltr"
        >
          {waitingCount}
        </span>
      </div>

      {/* Top 3 owned steps with status chips */}
      <div className="mt-3">
        <p
          className="text-[10px] uppercase tracking-[0.12em] font-medium mb-1.5"
          style={{ color: "var(--text-lo)" }}
        >
          {locale === "ar" ? "خطواتك" : "Your steps"}
        </p>
        {item.ownedSteps.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "لا خطوات مملوكة." : "No owned steps."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {item.ownedSteps.slice(0, 3).map((s) => (
              <li
                key={s.stepKey}
                className="flex items-center justify-between gap-2 min-w-0"
              >
                <span
                  className="text-[11px] truncate"
                  style={{ color: "var(--text-mid)" }}
                  title={s.label}
                >
                  {s.label}
                </span>
                <StatusChip status={s.status} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.article>
  );
}

/* ============================================================
   30-60-90 outline card (PRD §11-207)
   - Collapsible per-joiner card titled "30-60-90: {name}"
   - Three columns: 30 / 60 / 90 days — each with editable goals
   - Buddy assignment text input
   - Save button → success toast (local state only, no backend)
   ============================================================ */

type OutlinePhase = "day30" | "day60" | "day90";

function Outline3090Card({
  item,
  locale,
}: {
  item: CohortItem;
  locale: "en" | "ar";
}) {
  const [open, setOpen] = useState(false);
  const [outline, setOutline] = useState<Outline3090>(() =>
    defaultOutline(item.journeyType),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateGoal = (phase: OutlinePhase, idx: number, value: string) => {
    setOutline((prev) => {
      const next: Outline3090 = { ...prev, [phase]: [...prev[phase]] };
      next[phase][idx] = value;
      return next;
    });
    // Mark as unsaved the moment any field is edited after a save.
    if (saved) setSaved(false);
  };

  const updateBuddy = (value: string) => {
    setOutline((prev) => ({ ...prev, buddy: value }));
    if (saved) setSaved(false);
  };

  const handleSave = () => {
    setSaving(true);
    // Simulate a save round-trip — local state only (no backend).
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      toast.success(
        locale === "ar" ? "تم حفظ المخطط" : "Outline saved",
        {
          description:
            locale === "ar"
              ? `مخطط 30-60-90 لـ ${item.employeeName}`
              : `30-60-90 outline for ${item.employeeName}`,
        },
      );
    }, 420);
  };

  const journeyLabel =
    item.journeyType === "onboarding"
      ? locale === "ar"
        ? "التحاق"
        : "Onboarding"
      : locale === "ar"
        ? "تنقل"
        : "Mobility";

  return (
    <li className="ast-card overflow-hidden">
      {/* Header — click to collapse / expand */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ast-focus w-full flex items-center gap-3 p-4 sm:p-5 text-left"
      >
        <div
          className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{
            background: "rgba(22,154,165,0.10)",
            color: "var(--brand-400)",
          }}
          aria-hidden="true"
        >
          <ClipboardList className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "مخطط 30-60-90: " : "30-60-90: "}
            {item.employeeName}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
            {journeyLabel}
            <span className="mx-1.5">·</span>
            {stageLabel(item.stage, locale)}
            <span className="mx-1.5">·</span>
            <span className="tabular">
              {locale === "ar" ? `يوم ${item.dayInStage}` : `Day ${item.dayInStage}`}
            </span>
          </p>
        </div>
        {saved && (
          <span
            className="ast-chip shrink-0"
            style={{
              color: "var(--status-steady)",
              background: "rgba(14,159,110,0.10)",
              borderColor: "rgba(14,159,110,0.30)",
            }}
          >
            <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />
            {locale === "ar" ? "محفوظ" : "Saved"}
          </span>
        )}
        {open ? (
          <ChevronUp className="w-4 h-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--text-lo)" }} />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--text-lo)" }} />
        )}
      </button>

      {/* Body — three columns + buddy + save */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 sm:p-5 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <OutlineColumn
                  title={locale === "ar" ? "30 يوماً" : "30 days"}
                  accent="var(--brand-400)"
                  goals={outline.day30}
                  onChange={(idx, v) => updateGoal("day30", idx, v)}
                  locale={locale}
                />
                <OutlineColumn
                  title={locale === "ar" ? "60 يوماً" : "60 days"}
                  accent="var(--brand-400)"
                  goals={outline.day60}
                  onChange={(idx, v) => updateGoal("day60", idx, v)}
                  locale={locale}
                />
                <OutlineColumn
                  title={locale === "ar" ? "90 يوماً" : "90 days"}
                  accent="var(--accent-500)"
                  goals={outline.day90}
                  onChange={(idx, v) => updateGoal("day90", idx, v)}
                  locale={locale}
                />
              </div>

              {/* Buddy assignment — named person selector (text input for prototype) */}
              <div>
                <label
                  htmlFor={`buddy-${item.employeeId}`}
                  className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-lo)" }}
                >
                  {locale === "ar" ? "تكليف الرفيق" : "Buddy assignment"}
                </label>
                <input
                  id={`buddy-${item.employeeId}`}
                  type="text"
                  value={outline.buddy}
                  onChange={(e) => updateBuddy(e.target.value)}
                  placeholder={
                    locale === "ar"
                      ? "اسم الشخص المكلف كرفيق"
                      : "Named person assigned as buddy"
                  }
                  className="ast-focus mt-1.5 w-full h-11 px-3 rounded-[10px] text-[14px] outline-none"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-hi)",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>

              {/* Save button */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[10px] text-[13px] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                  style={{
                    background: "var(--brand-500)",
                    color: "var(--surface-0)",
                    boxShadow: "0 4px 14px rgba(22,154,165,0.22)",
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
                  {saving
                    ? (locale === "ar" ? "جارٍ الحفظ..." : "Saving…")
                    : (locale === "ar" ? "حفظ المخطط" : "Save outline")}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* ---------- Single 30/60/90 column with editable goals ---------- */

function OutlineColumn({
  title,
  accent,
  goals,
  onChange,
  locale,
}: {
  title: string;
  accent: string;
  goals: string[];
  onChange: (idx: number, value: string) => void;
  locale: "en" | "ar";
}) {
  return (
    <div className="ast-card-2 p-3.5">
      <p
        className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-3"
        style={{ color: accent }}
      >
        {title}
      </p>
      <div className="space-y-2.5">
        {goals.map((g, idx) => (
          <div key={idx}>
            <label
              htmlFor={`${title}-${idx}`}
              className="text-[10px] uppercase tracking-[0.10em]"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? `هدف ${idx + 1}` : `Goal ${idx + 1}`}
            </label>
            <input
              id={`${title}-${idx}`}
              type="text"
              value={g}
              onChange={(e) => onChange(idx, e.target.value)}
              className="ast-focus mt-0.5 w-full h-9 px-2.5 rounded-md text-[13px] outline-none"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-hi)",
                border: "1px solid var(--border)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
