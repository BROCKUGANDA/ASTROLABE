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
import { format, formatDistanceStrict, differenceInCalendarDays } from "date-fns";
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
  BellRing,
  BellOff,
  History,
  AlarmClock,
  AlarmClockOff,
  X,
  Clock3,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Mail,
  Calendar,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { StatusChip } from "@/components/astrolabe/widgets";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { NOW as PACK_NOW } from "@/lib/data/pack";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type BreachLevel = "none" | "due_soon" | "breached" | "hard";

interface OwnedStep {
  stepKey: string;
  label: string;
  status: StepStatus;
  dueAt?: string;
  /** PRD §11-205 — surfaced by the cohort API so the manager screen can
   * detect late steps without re-running the engine on the client. */
  breachLevel?: BreachLevel;
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
  // Per-manager nudge history (PRD §11-205). Seeded with 5 historical
  // entries so the bar chart demonstrates that nudges convert.
  const [nudgeHistory, setNudgeHistory] = useState<NudgeHistoryEntry[]>(SEED_NUDGE_HISTORY);

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

  // Late steps = waiting_owner AND (dueAt < NOW OR breachLevel breached/hard).
  // Used by the late-step nudge banner + per-step nudge icon.
  const lateSteps = useMemo(() => {
    return allObligations
      .filter(({ step }) => isStepLate(step))
      .map(({ employee, step }) => ({
        employee,
        step,
        daysLate: daysLateFor(step.dueAt),
      }));
  }, [allObligations]);

  const handleNudgeDaily = useCallback(() => {
    toast.success(
      locale === "ar"
        ? "جُدول التنبيه اليومي"
        : "Daily nudge scheduled",
      {
        description: locale === "ar"
          ? "سنُذكّرك كل صباح حتى تنتهي هذه الخطوات."
          : "We'll remind you every morning until these are done.",
      }
    );
  }, [locale]);

  const handleSnoozeToday = useCallback(() => {
    setNudgeHistory((prev) => [
      {
        id: `nh-live-${Date.now()}`,
        date: new Date(PACK_NOW.getTime() - 0).toISOString(),
        stepLabel: locale === "ar" ? "كل الخطوات المتأخرة" : "All late steps",
        employeeName: locale === "ar" ? "أنت" : "You",
        action: "snoozed" as NudgeAction,
      },
      ...prev,
    ]);
    toast.success(
      locale === "ar"
        ? "أُجّل حتى الغد 09:00"
        : "Snoozed until tomorrow 09:00",
      {
        description: locale === "ar"
          ? "سنُذكّرك عندها."
          : "We'll remind you then.",
      }
    );
  }, [locale]);

  const handleNudge = useCallback(
    (schedule: NudgeSchedule, step: OwnedStep, employee: CohortItem) => {
      const labels: Record<NudgeSchedule, { en: string; ar: string }> = {
        "1h":       { en: "in 1 hour",       ar: "بعد ساعة" },
        "4h":       { en: "in 4 hours",      ar: "بعد 4 ساعات" },
        tomorrow:   { en: "tomorrow at 09:00", ar: "غداً 09:00" },
        never:      { en: "Never",            ar: "أبدًا" },
      };
      const lbl = labels[schedule];
      if (schedule === "never") {
        setNudgeHistory((prev) => [
          {
            id: `nh-live-${Date.now()}`,
            date: new Date(PACK_NOW.getTime()).toISOString(),
            stepLabel: step.label,
            employeeName: employee.employeeName,
            action: "ignored" as NudgeAction,
          },
          ...prev,
        ]);
        toast.warning(
          locale === "ar" ? "لن نُذكّرك بهذه الخطوة" : "We won't nudge you about this step",
          { description: `${step.label} · ${employee.employeeName}` }
        );
      } else {
        setNudgeHistory((prev) => [
          {
            id: `nh-live-${Date.now()}`,
            date: new Date(PACK_NOW.getTime()).toISOString(),
            stepLabel: step.label,
            employeeName: employee.employeeName,
            action: "snoozed" as NudgeAction,
          },
          ...prev,
        ]);
        toast.success(
          locale === "ar" ? "جُدول التنبيه" : "Nudge scheduled",
          {
            description: `${step.label} · ${employee.employeeName} · ${locale === "ar" ? lbl.ar : lbl.en}`,
          }
        );
      }
    },
    [locale]
  );

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
        <div className="flex items-center gap-2">
          <ManagerWeeklySummaryButton items={items} locale={locale} />
          <ManagerTabs />
        </div>
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

              {/* Late-step nudge banner (PRD §11-205) — only when ≥1
                  owned step is late. Sand-gold accent = "your next move". */}
              <AnimatePresence>
                {lateSteps.length > 0 && (
                  <LateStepsBanner
                    lateSteps={lateSteps}
                    onNudgeDaily={handleNudgeDaily}
                    onSnoozeToday={handleSnoozeToday}
                    locale={locale}
                  />
                )}
              </AnimatePresence>

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
                  {allObligations.map(({ employee, step }) => {
                    const late = isStepLate(step);
                    return (
                      <ObligationRow
                        key={`${employee.employeeId}-${step.stepKey}`}
                        employee={employee}
                        step={step}
                        late={late}
                        onNudge={handleNudge}
                      />
                    );
                  })}
                </ul>
              )}

              {/* Nudge history (PRD §11-205) — collapsible, last 5 + chart */}
              <NudgeHistory history={nudgeHistory} locale={locale} />
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

/* ---------- Late step detection (PRD §11-205) ---------- */

/** A step is "late" when ANY of:
 *  1. status is waiting_owner AND its dueAt is in the past, OR
 *  2. breachLevel is breached/hard (regardless of status — covers
 *     in_progress steps that have blown past their SLA target too).
 *
 * Per PRD §11-205: "(status=waiting_owner AND dueAt < NOW,
 * OR breachLevel=breached/hard)". */
function isStepLate(step: OwnedStep): boolean {
  // (2) breachLevel breach/hard → always late.
  if (step.breachLevel === "breached" || step.breachLevel === "hard") return true;
  // (1) waiting_owner + past dueAt.
  if (step.status !== "waiting_owner") return false;
  if (step.dueAt) {
    try {
      const due = new Date(step.dueAt);
      if (due.getTime() < PACK_NOW.getTime()) return true;
    } catch {
      /* ignore parse errors */
    }
  }
  return false;
}

function daysLateFor(dueAt?: string): number {
  if (!dueAt) return 0;
  try {
    const due = new Date(dueAt);
    return Math.max(0, differenceInCalendarDays(PACK_NOW, due));
  } catch {
    return 0;
  }
}

/* ---------- Nudge history (PRD §11-205) ---------- */

type NudgeAction = "resolved" | "snoozed" | "ignored";
type NudgeSchedule = "1h" | "4h" | "tomorrow" | "never";

interface NudgeHistoryEntry {
  id: string;
  date: string; // ISO
  stepLabel: string;
  employeeName: string;
  action: NudgeAction;
}

/** Seed the last 5 historical nudges so the chart demonstrates that
 *  nudges actually convert to resolution. Synthetic pack times only. */
const SEED_NUDGE_HISTORY: NudgeHistoryEntry[] = [
  { id: "nh-001", date: "2024-10-14T08:00:00Z", stepLabel: "Buddy assignment",        employeeName: "Daniel Okonkwo", action: "resolved" },
  { id: "nh-002", date: "2024-10-15T09:00:00Z", stepLabel: "HR induction confirmation", employeeName: "Sara Kovač",     action: "snoozed" },
  { id: "nh-003", date: "2024-10-16T09:00:00Z", stepLabel: "Probation check-in",      employeeName: "Daniel Okonkwo", action: "resolved" },
  { id: "nh-004", date: "2024-10-17T09:00:00Z", stepLabel: "Visa support letter",     employeeName: "James Park",     action: "ignored" },
  { id: "nh-005", date: "2024-10-18T09:00:00Z", stepLabel: "Workstation readiness",   employeeName: "Maria Santos",   action: "resolved" },
];

/* ---------- Late steps nudge banner ---------- */

function LateStepsBanner({
  lateSteps,
  onNudgeDaily,
  onSnoozeToday,
  locale,
}: {
  lateSteps: { employee: CohortItem; step: OwnedStep; daysLate: number }[];
  onNudgeDaily: () => void;
  onSnoozeToday: () => void;
  locale: "en" | "ar";
}) {
  if (lateSteps.length === 0) return null;
  const t = lateSteps.length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="ast-card p-5 relative overflow-hidden"
      style={{
        borderColor: "rgba(201,162,39,0.50)",
        background: "linear-gradient(135deg, rgba(201,162,39,0.10) 0%, var(--surface-1) 65%)",
      }}
      role="status"
      aria-live="polite"
    >
      {/* Sand-gold accent rule — "your next move" trigger */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: "var(--accent-500)" }}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
            style={{ background: "rgba(201,162,39,0.14)", color: "var(--accent-500)", border: "1px solid rgba(201,162,39,0.36)" }}
          >
            <BellRing className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-semibold ast-brass" style={{ color: "var(--accent-500)" }}>
              {t === 1
                ? (locale === "ar" ? "خطوة واحدة بانتظارك" : "1 step is waiting on you")
                : (locale === "ar" ? `${t} خطوات بانتظارك` : `${t} steps are waiting on you`)}
            </p>
            <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? "لا يمكن لمُنضمّيك التقدّم قبل إكمالها. كلما بادرت أسرع، قلّ الاحتكاك المصاحب."
                : "Your joiners can't move forward until these are done. The earlier you act, the less downstream friction."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onNudgeDaily}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-medium transition-colors"
            style={{
              background: "var(--accent-500)",
              color: "var(--surface-0)",
              border: "1px solid var(--accent-500)",
            }}
          >
            <AlarmClock className="w-3.5 h-3.5" strokeWidth={1.75} />
            {locale === "ar" ? "نبّهني يومياً" : "Nudge me daily"}
          </button>
          <button
            onClick={onSnoozeToday}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[12px] font-medium transition-colors"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-hi)",
              border: "1px solid var(--border)",
            }}
          >
            <AlarmClockOff className="w-3.5 h-3.5" strokeWidth={1.75} />
            {locale === "ar" ? "أجّل لليوم" : "Snooze for today"}
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {lateSteps.map(({ employee, step, daysLate: dl }) => {
          const due = step.dueAt ? new Date(step.dueAt) : null;
          const dueInPast = !!due && due.getTime() < PACK_NOW.getTime();
          return (
            <li
              key={`${employee.employeeId}-${step.stepKey}`}
              className="flex items-center gap-2 text-[12px] flex-wrap"
              style={{ color: "var(--text-mid)" }}
            >
              <BellRing className="w-3 h-3 shrink-0" strokeWidth={1.75} style={{ color: "var(--accent-500)" }} />
              <span className="font-medium" style={{ color: "var(--text-hi)" }}>{step.label}</span>
              <span style={{ color: "var(--text-lo)" }}>·</span>
              <span>{employee.employeeName}</span>
              {dueInPast ? (
                <>
                  <span style={{ color: "var(--text-lo)" }}>·</span>
                  <span className="tabular" dir="ltr">
                    {locale === "ar" ? `كان مستحقاً ${format(due!, "EEEE d MMM")}` : `was due ${format(due!, "EEEE d MMM")}`}
                  </span>
                  <span style={{ color: "var(--text-lo)" }}>·</span>
                  <span className="tabular" style={{ color: "var(--status-friction)" }}>
                    {dl === 0
                      ? (locale === "ar" ? "متأخر اليوم" : "late today")
                      : dl === 1
                      ? (locale === "ar" ? "متأخر بيوم" : "1 day late")
                      : (locale === "ar" ? `متأخر ${dl} أيام` : `${dl} days late`)}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ color: "var(--text-lo)" }}>·</span>
                  <span className="tabular inline-flex items-center gap-1" style={{ color: "var(--status-friction)" }}>
                    <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                    {locale === "ar" ? "اختراق SLA" : "SLA breached"}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}

/* ---------- Nudge history panel ---------- */

function ActionChip({ action, locale }: { action: NudgeAction; locale: "en" | "ar" }) {
  const cfg = {
    resolved: { color: "var(--status-steady)", bg: "rgba(14,159,110,0.10)", border: "rgba(14,159,110,0.30)", label: "Resolved", labelAr: "حُلّ", Icon: CheckCircle2 },
    snoozed:  { color: "var(--status-watch)",  bg: "rgba(217,119,6,0.10)",  border: "rgba(217,119,6,0.30)",  label: "Snoozed",  labelAr: "مؤجّل", Icon: Clock3 },
    ignored:  { color: "var(--text-lo)",        bg: "var(--surface-2)",      border: "var(--border)",         label: "Ignored",  labelAr: "مُتجاهل", Icon: X },
  }[action];
  const Icon = cfg.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={2} />
      {locale === "ar" ? cfg.labelAr : cfg.label}
    </span>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.round((value / Math.max(1, max)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[12px]" style={{ color: "var(--text-mid)" }}>{label}</span>
        <span className="text-[15px] font-semibold tabular" style={{ color: "var(--text-hi)" }} dir="ltr">{value}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <motion.div
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}

function NudgeHistory({
  history,
  locale,
}: {
  history: NudgeHistoryEntry[];
  locale: "en" | "ar";
}) {
  const [open, setOpen] = useState(false);
  const recent = history.slice(0, 5);
  const nudgesSent = history.length;
  const resolvedAfterNudge = history.filter((h) => h.action === "resolved").length;
  const snoozedCount = history.filter((h) => h.action === "snoozed").length;
  const ignoredCount = history.filter((h) => h.action === "ignored").length;
  const maxBar = Math.max(nudgesSent, resolvedAfterNudge, 1);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="ast-card p-5 sm:p-6 ast-fade-rise mt-6">
        <CollapsibleTrigger asChild>
          <button
            className="ast-focus w-full flex items-center justify-between gap-2 text-left"
            aria-expanded={open}
            aria-controls="nudge-history-content"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
              >
                <History className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "سجل التنبيهات" : "Nudge history"}
                </h2>
                <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar"
                    ? `آخر ${recent.length} تنبيهات — وما الذي حدث بعدها.`
                    : `Last ${recent.length} nudges — and what happened after.`}
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn("w-4 h-4 shrink-0 transition-transform", open && "rotate-180")}
              style={{ color: "var(--text-mid)" }}
              strokeWidth={1.75}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div id="nudge-history-content" className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* History list */}
            <ol className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {recent.map((h) => (
                <li
                  key={h.id}
                  className="ast-card-2 p-2.5 flex items-center justify-between gap-2 flex-wrap text-[12px]"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
                      {format(new Date(h.date), "d MMM · HH:mm")}
                    </span>
                    <span className="font-medium truncate" style={{ color: "var(--text-hi)" }}>{h.stepLabel}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ color: "var(--text-mid)" }}>{h.employeeName}</span>
                    <ActionChip action={h.action} locale={locale} />
                  </div>
                </li>
              ))}
              {recent.length === 0 && (
                <li className="ast-card-2 p-3 text-[12px] text-center" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "لا تنبيهات بعد." : "No nudges yet."}
                </li>
              )}
            </ol>

            {/* Bar chart */}
            <div className="ast-card-2 p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "التنبيهات تعمل" : "Nudges work"}
                </p>
              </div>
              <p className="text-[12px] mb-3" style={{ color: "var(--text-mid)" }}>
                {locale === "ar"
                  ? "نعرض عدد التنبيهات المُرسلة وكم خطوة حُلّت بعدها. الأرقام تُحدّث ليفياً عند اتخاذك إجراءً."
                  : "We track how many nudges we sent and how many steps resolved after. Numbers update live as you take action."}
              </p>
              <div className="space-y-3">
                <BarRow
                  label={locale === "ar" ? "تنبيهات أُرسلت" : "Nudges sent"}
                  value={nudgesSent}
                  max={maxBar}
                  color="var(--brand-400)"
                />
                <BarRow
                  label={locale === "ar" ? "خطوات حُلّت بعدها" : "Steps resolved after nudge"}
                  value={resolvedAfterNudge}
                  max={maxBar}
                  color="var(--status-steady)"
                />
              </div>
              <div className="mt-4 pt-3 flex items-center justify-between text-[11px] tabular" style={{ borderTop: "1px solid var(--border-soft)", color: "var(--text-lo)" }}>
                <span>
                  {locale === "ar" ? `${snoozedCount} مؤجّل` : `${snoozedCount} snoozed`}
                </span>
                <span>
                  {locale === "ar" ? `${ignoredCount} مُتجاهل` : `${ignoredCount} ignored`}
                </span>
                <span style={{ color: resolvedAfterNudge > 0 ? "var(--status-steady)" : "var(--text-lo)" }}>
                  {locale === "ar"
                    ? `${nudgesSent > 0 ? Math.round((resolvedAfterNudge / nudgesSent) * 100) : 0}% نجاح`
                    : `${nudgesSent > 0 ? Math.round((resolvedAfterNudge / nudgesSent) * 100) : 0}% success`}
                </span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/* ---------- Obligation row ---------- */
function ObligationRow({
  employee,
  step,
  late,
  onNudge,
}: {
  employee: CohortItem;
  step: OwnedStep;
  late: boolean;
  onNudge: (schedule: NudgeSchedule, step: OwnedStep, employee: CohortItem) => void;
}) {
  const locale = useAppStore((s) => s.locale);
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const isWaitingOwner = step.status === "waiting_owner";
  const due = step.dueAt ? new Date(step.dueAt) : null;
  const dueDistance = due ? formatDistanceStrict(due, PACK_NOW, { addSuffix: false }) : null;
  const overdue = due ? due.getTime() < PACK_NOW.getTime() : false;

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
        borderColor: late && !completed
          ? "rgba(220,38,38,0.32)"
          : isWaitingOwner && !completed
          ? "rgba(201,162,39,0.32)"
          : "var(--border)",
      }}
    >
      {/* Status glyph */}
      <div
        className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
        style={{
          background: completed
            ? "rgba(14,159,110,0.12)"
            : late
            ? "rgba(220,38,38,0.12)"
            : isWaitingOwner
            ? "rgba(201,162,39,0.12)"
            : "var(--surface-2)",
          color: completed
            ? "var(--status-steady)"
            : late
            ? "var(--status-friction)"
            : isWaitingOwner
            ? "var(--accent-500)"
            : "var(--text-mid)",
        }}
      >
        {completed ? (
          <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} />
        ) : late ? (
          <AlertTriangle className="w-4 h-4" strokeWidth={1.75} />
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

      {/* Status chip + per-step nudge + action */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <StatusChip status={completed ? "done" : step.status} locale={locale} />

        {/* Per-step nudge dropdown — only on late, uncompleted steps */}
        {late && !completed && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="ast-focus inline-flex items-center justify-center w-9 h-9 rounded-full shrink-0 transition-colors"
                style={{
                  background: "rgba(201,162,39,0.12)",
                  border: "1px solid rgba(201,162,39,0.36)",
                  color: "var(--accent-500)",
                }}
                aria-label={locale === "ar" ? "جدولة تذكير" : "Schedule a nudge"}
                title={locale === "ar" ? "جدولة تذكير" : "Schedule a nudge"}
              >
                <BellRing className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-[180px]"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
            >
              <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "ذكّرني في" : "Remind me in"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator style={{ background: "var(--border-soft)" }} />
              <DropdownMenuItem
                onClick={() => onNudge("1h", step, employee)}
                className="text-[12px] ast-focus"
                style={{ color: "var(--text-hi)" }}
              >
                <AlarmClock className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                {locale === "ar" ? "بعد ساعة" : "1 hour"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onNudge("4h", step, employee)}
                className="text-[12px] ast-focus"
                style={{ color: "var(--text-hi)" }}
              >
                <AlarmClock className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                {locale === "ar" ? "بعد 4 ساعات" : "4 hours"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onNudge("tomorrow", step, employee)}
                className="text-[12px] ast-focus"
                style={{ color: "var(--text-hi)" }}
              >
                <Clock3 className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                {locale === "ar" ? "غداً" : "Tomorrow"}
              </DropdownMenuItem>
              <DropdownMenuSeparator style={{ background: "var(--border-soft)" }} />
              <DropdownMenuItem
                onClick={() => onNudge("never", step, employee)}
                className="text-[12px] ast-focus"
                style={{ color: "var(--text-lo)" }}
              >
                <BellOff className="w-3.5 h-3.5" strokeWidth={1.75} />
                {locale === "ar" ? "أبدًا" : "Never"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

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
   Trend sparkline (PRD §16) — completion % trend per joiner
   ------------------------------------------------------------
   Deterministic 7-point synthetic trend seeded by a hash of the
   employeeId. Ends at the current aggregateCompletion %. Renders a
   smooth teal line with sand-gold dots and a hover tooltip showing
   "Day -7: X% → Day 0: Y%". Trend label (improving/declining/steady)
   is derived from the slope.
   ============================================================ */

/* Simple deterministic hash → uint32 (FNV-1a) */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* Mulberry32 PRNG — deterministic, fast */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a 7-point completion % trend ending at `endValue`.
 * The trend is monotonically plausible (not strictly increasing —
 * real journeys plateau and dip) and stays in [0, 100].
 */
function generateTrend(employeeId: string, endValue: number, points = 7): number[] {
  const rand = mulberry32(hashId(employeeId));
  // Start 10–35 pp below the end value, clamped to [0, 100]
  const startDrop = 10 + Math.floor(rand() * 26); // 10..35
  let start = Math.max(0, Math.min(100, endValue - startDrop));
  // Generate intermediate points with small noise around the linear path
  const values: number[] = [];
  for (let i = 0; i < points - 1; i++) {
    const t = i / (points - 1);
    const linear = start + (endValue - start) * t;
    // ±4 pp noise, decaying toward the end so we always land on endValue
    const noise = (rand() - 0.5) * 8 * (1 - t * 0.6);
    const v = Math.max(0, Math.min(100, Math.round(linear + noise)));
    values.push(v);
  }
  values.push(Math.round(endValue));
  return values;
}

function trendDirection(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const delta = values[values.length - 1] - values[0];
  if (delta > 5) return "up";
  if (delta < -5) return "down";
  return "flat";
}

function trendSlope(values: number[]): number {
  if (values.length < 2) return 0;
  return values[values.length - 1] - values[0];
}

/* ---------- The sparkline SVG ---------- */
function TrendSparkline({
  values,
  width = 180,
  height = 32,
  showDots = true,
  showArea = false,
  uniqueId,
}: {
  values: number[];
  width?: number;
  height?: number;
  showDots?: boolean;
  showArea?: boolean;
  uniqueId: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const pad = 4;
  const max = 100;
  const min = 0;
  const stepX = (width - pad * 2) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / (max - min)) * (height - pad * 2);
  const x = (i: number) => pad + i * stepX;

  // Smooth path — Catmull-Rom to Bezier conversion for a soft curve
  const linePath = values
    .map((v, i) => {
      if (i === 0) return `M ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      const prev = values[i - 1];
      const cx1 = x(i - 1) + stepX / 2;
      const cx2 = x(i) - stepX / 2;
      return `C ${cx1.toFixed(1)} ${y(prev).toFixed(1)}, ${cx2.toFixed(1)} ${y(v).toFixed(1)}, ${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${linePath} L ${x(values.length - 1).toFixed(1)} ${height - pad} L ${x(0).toFixed(1)} ${height - pad} Z`;

  const dir = trendDirection(values);
  const dirColor =
    dir === "up" ? "var(--brand-400)" : dir === "down" ? "var(--status-watch)" : "var(--text-lo)";

  const gradId = `trend-grad-${uniqueId}`;
  const areaGradId = `trend-area-${uniqueId}`;

  return (
    <TooltipProvider delayDuration={0}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", maxWidth: width, height }}
          role="img"
          aria-label={`7-day completion trend: Day -7 ${values[0]}% → Day 0 ${values[values.length - 1]}%`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-400)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={1} />
            </linearGradient>
            <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-500)" stopOpacity={0.30} />
              <stop offset="100%" stopColor="var(--brand-500)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {showArea && <path d={areaPath} fill={`url(#${areaGradId})`} />}
          <motion.path
            d={linePath}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          />
          {showDots &&
            values.map((v, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <circle
                    cx={x(i)}
                    cy={y(v)}
                    r={hoverIdx === i ? 3.5 : 2.5}
                    fill="var(--accent-500)"
                    stroke="var(--surface-1)"
                    strokeWidth={1}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    style={{ cursor: "pointer", transition: "r 120ms var(--ease-standard)" }}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="font-mono text-[11px] tabular"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-hi)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {i === 0 ? "Day -7" : i === values.length - 1 ? "Day 0" : `Day -${values.length - 1 - i}`} · {v}%
                </TooltipContent>
              </Tooltip>
            ))}
        </svg>
      </div>
    </TooltipProvider>
  );
}

/* ---------- Trend label badge ---------- */
function TrendLabel({ values, locale }: { values: number[]; locale: "en" | "ar" }) {
  const ar = locale === "ar";
  const dir = trendDirection(values);
  if (dir === "up") {
    return (
      <span
        className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium"
        style={{
          background: "rgba(22,154,165,0.10)",
          color: "var(--brand-400)",
          border: "1px solid rgba(22,154,165,0.32)",
        }}
      >
        <TrendingUp className="w-3 h-3" strokeWidth={2} />
        {ar ? "يتحسن" : "improving"}
      </span>
    );
  }
  if (dir === "down") {
    return (
      <span
        className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium"
        style={{
          background: "rgba(217,119,6,0.10)",
          color: "var(--status-watch)",
          border: "1px solid rgba(217,119,6,0.32)",
        }}
      >
        <TrendingDown className="w-3 h-3" strokeWidth={2} />
        {ar ? "يتدهور" : "declining"}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium"
      style={{
        background: "var(--surface-3)",
        color: "var(--text-lo)",
        border: "1px solid var(--border)",
      }}
    >
      <Minus className="w-3 h-3" strokeWidth={2} />
      {ar ? "مستقر" : "steady"}
    </span>
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

  // Sort a copy of items — never mutate the source. items may be null/empty;
  // all hooks below are unconditional so rules-of-hooks holds.
  const sorted = useMemo(() => {
    if (!items || items.length === 0) return [] as CohortItem[];
    const copy = [...items];
    copy.sort((a, b) => {
      if (sortBy === "completion") return b.aggregateCompletion - a.aggregateCompletion;
      if (sortBy === "dayInStage") return b.dayInStage - a.dayInStage;
      const aw = a.ownedSteps.filter((s) => s.status === "waiting_owner").length;
      const bw = b.ownedSteps.filter((s) => s.status === "waiting_owner").length;
      return bw - aw;
    });
    return copy;
  }, [items, sortBy]);

  // Per-joiner 7-day completion % trend (deterministic, seeded by employeeId).
  // PRD §16 — sparkline below the large completion number in each column.
  const trendsByEmployee = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const it of sorted) {
      map[it.employeeId] = generateTrend(it.employeeId, it.aggregateCompletion, 7);
    }
    return map;
  }, [sorted]);

  // Cohort-average trend — average of all per-joiner trends at each day.
  const cohortTrend = useMemo(() => {
    if (sorted.length === 0) return [0, 0, 0, 0, 0, 0, 0];
    const out: number[] = [];
    for (let i = 0; i < 7; i++) {
      let sum = 0;
      for (const it of sorted) {
        sum += trendsByEmployee[it.employeeId]?.[i] ?? 0;
      }
      out.push(Math.round(sum / sorted.length));
    }
    return out;
  }, [sorted, trendsByEmployee]);

  // Fastest improver + needs-attention — by slope of the trend.
  const { fastest, slowest } = useMemo(() => {
    if (sorted.length === 0) return { fastest: null as CohortItem | null, slowest: null as CohortItem | null };
    let fast: CohortItem | null = null;
    let fastSlope = -Infinity;
    let slow: CohortItem | null = null;
    let slowSlope = Infinity;
    for (const it of sorted) {
      const slope = trendSlope(trendsByEmployee[it.employeeId] ?? []);
      if (slope > fastSlope) { fastSlope = slope; fast = it; }
      if (slope < slowSlope) { slowSlope = slope; slow = it; }
    }
    return { fastest: fast, slowest: slow };
  }, [sorted, trendsByEmployee]);

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

        {/* Cohort trend sparkline — larger, full-width */}
        <div
          className="mt-4 pt-4 flex flex-col sm:flex-row sm:items-center gap-3"
          style={{ borderTop: "1px solid var(--border-soft)" }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            <span
              className="text-[10px] uppercase tracking-[0.14em] font-medium"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "اتجاه المجموعة (7 أيام)" : "Cohort trend (7 days)"}
            </span>
            <TrendLabel values={cohortTrend} locale={locale} />
          </div>
          <div className="flex-1 min-w-0 max-w-[280px]">
            <TrendSparkline
              values={cohortTrend}
              width={240}
              height={40}
              showDots
              showArea
              uniqueId="cohort-avg"
            />
          </div>
          <span className="text-[11px] tabular shrink-0" style={{ color: "var(--text-lo)" }} dir="ltr">
            {locale === "ar"
              ? `اليوم -7: ${cohortTrend[0]}% → اليوم 0: ${cohortTrend[6]}%`
              : `Day -7: ${cohortTrend[0]}% → Day 0: ${cohortTrend[6]}%`}
          </span>
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
              trend={trendsByEmployee[it.employeeId] ?? []}
              isFastest={fastest?.employeeId === it.employeeId}
              isSlowest={slowest?.employeeId === it.employeeId}
            />
          ))}
        </div>
      </div>

      {/* Trend comparison — fastest improver + needs attention (PRD §16) */}
      {(fastest || slowest) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fastest && (
            <div
              className="ast-card-2 p-3.5 flex items-center gap-3"
              style={{
                borderColor: "rgba(22,154,165,0.32)",
                background: "rgba(22,154,165,0.06)",
              }}
            >
              <div
                className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
                style={{ background: "rgba(22,154,165,0.12)", color: "var(--brand-400)" }}
              >
                <Zap className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "الأسرع تحسناً" : "Who's improving fastest?"}
                </p>
                <p className="text-[14px] font-medium mt-0.5 truncate" style={{ color: "var(--text-hi)" }}>
                  {fastest.employeeName}
                </p>
                <p className="text-[11px] tabular mt-0.5" style={{ color: "var(--text-mid)" }} dir="ltr">
                  {locale === "ar"
                    ? `اليوم -7: ${(trendsByEmployee[fastest.employeeId] ?? [0])[0]}% → اليوم 0: ${fastest.aggregateCompletion}%`
                    : `Day -7: ${(trendsByEmployee[fastest.employeeId] ?? [0])[0]}% → Day 0: ${fastest.aggregateCompletion}%`}
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-medium shrink-0"
                style={{
                  background: "rgba(22,154,165,0.12)",
                  color: "var(--brand-400)",
                  border: "1px solid rgba(22,154,165,0.40)",
                }}
              >
                <TrendingUp className="w-3 h-3" strokeWidth={2} />
                {locale === "ar" ? "الأسرع" : "Fastest improver"}
              </span>
            </div>
          )}
          {slowest && slowest.employeeId !== fastest?.employeeId && (
            <div
              className="ast-card-2 p-3.5 flex items-center gap-3"
              style={{
                borderColor: "rgba(217,119,6,0.32)",
                background: "rgba(217,119,6,0.06)",
              }}
            >
              <div
                className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
                style={{ background: "rgba(217,119,6,0.12)", color: "var(--status-watch)" }}
              >
                <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] font-medium" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "بحاجة لانتباه" : "Who needs attention?"}
                </p>
                <p className="text-[14px] font-medium mt-0.5 truncate" style={{ color: "var(--text-hi)" }}>
                  {slowest.employeeName}
                </p>
                <p className="text-[11px] tabular mt-0.5" style={{ color: "var(--text-mid)" }} dir="ltr">
                  {locale === "ar"
                    ? `اليوم -7: ${(trendsByEmployee[slowest.employeeId] ?? [0])[0]}% → اليوم 0: ${slowest.aggregateCompletion}%`
                    : `Day -7: ${(trendsByEmployee[slowest.employeeId] ?? [0])[0]}% → Day 0: ${slowest.aggregateCompletion}%`}
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-medium shrink-0"
                style={{
                  background: "rgba(217,119,6,0.12)",
                  color: "var(--status-watch)",
                  border: "1px solid rgba(217,119,6,0.40)",
                }}
              >
                <TrendingDown className="w-3 h-3" strokeWidth={2} />
                {locale === "ar" ? "بحاجة لانتباه" : "Needs attention"}
              </span>
            </div>
          )}
        </div>
      )}

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
  trend,
  isFastest,
  isSlowest,
}: {
  item: CohortItem;
  locale: "en" | "ar";
  index: number;
  trend: number[];
  isFastest?: boolean;
  isSlowest?: boolean;
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
      style={{
        width: 220,
        minWidth: 220,
        borderColor: isFastest
          ? "rgba(22,154,165,0.40)"
          : isSlowest
          ? "rgba(217,119,6,0.40)"
          : "var(--border)",
        background: isFastest
          ? "rgba(22,154,165,0.04)"
          : isSlowest
          ? "rgba(217,119,6,0.04)"
          : "var(--surface-1)",
      }}
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

      {/* Per-joiner 7-day trend sparkline (PRD §16) */}
      {trend.length > 0 && (
        <div className="mt-2">
          <TrendSparkline
            values={trend}
            width={180}
            height={32}
            showDots
            uniqueId={`joiner-${item.employeeId}`}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
              {locale === "ar" ? `اليوم -7: ${trend[0]}%` : `Day -7: ${trend[0]}%`}
            </span>
            <TrendLabel values={trend} locale={locale} />
          </div>
        </div>
      )}

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

/* ---------- Manager Weekly Summary Email Preview ---------- */

function ManagerWeeklySummaryButton({ items, locale }: { items: CohortItem[] | null; locale: "en" | "ar" }) {
  const [open, setOpen] = useState(false);
  const ar = locale === "ar";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium transition-colors"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-hi)",
        }}
        aria-label={ar ? "ملخص أسبوعي" : "Weekly summary"}
      >
        <Mail className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <span className="hidden sm:inline">{ar ? "ملخص أسبوعي" : "Weekly summary"}</span>
      </button>
      {open && <ManagerWeeklySummaryModal items={items} locale={locale} onClose={() => setOpen(false)} />}
    </>
  );
}

function ManagerWeeklySummaryModal({ items, locale, onClose }: { items: CohortItem[] | null; locale: "en" | "ar"; onClose: () => void }) {
  const ar = locale === "ar";
  const dir = ar ? "rtl" : "ltr";
  const [sent, setSent] = useState(false);

  // Build email content from cohort data
  const joiners = items ?? [];
  const totalJoiners = joiners.length;
  const waitingOnMe = joiners.reduce((sum, j) => sum + j.ownedSteps.filter(s => s.status === "waiting_owner").length, 0);
  const avgCompletion = totalJoiners > 0 ? Math.round(joiners.reduce((sum, j) => sum + j.aggregateCompletion, 0) / totalJoiners) : 0;
  const lateSteps = joiners.flatMap(j => j.ownedSteps.filter(s => s.breachLevel === "breached" || s.breachLevel === "hard"));

  const emailSubject = ar ? `ملخصك الأسبوعي — ${totalJoiners} موظف، ${waitingOnMe} بانتظارك` : `Your weekly summary — ${totalJoiners} joiners, ${waitingOnMe} waiting on you`;
  const dateRange = "13–19 Oct 2024";

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[820px] p-0 overflow-hidden" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
        <DialogHeader className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            <DialogTitle className="text-[18px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {ar ? "معاينة الملخص الأسبوعي" : "Weekly summary email preview"}
            </DialogTitle>
          </div>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-mid)" }}>
            {ar ? "هذا ما سيستلمه مديرو آخرون كل صباح إثنين." : "This is what you'll receive every Monday morning."}
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4" dir={dir} style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {/* Email metadata */}
          <div className="ast-card-2 p-3 space-y-1.5 text-[12px]" style={{ color: "var(--text-mid)" }}>
            <div className="flex justify-between">
              <span>{ar ? "إلى" : "To"}</span>
              <span className="tabular" style={{ color: "var(--text-hi)" }}>ahmed.mgr@astrolabe.internal</span>
            </div>
            <div className="flex justify-between">
              <span>{ar ? "الموضوع" : "Subject"}</span>
              <span style={{ color: "var(--text-hi)" }}>{emailSubject}</span>
            </div>
            <div className="flex justify-between">
              <span>{ar ? "الفترة" : "Period"}</span>
              <span className="tabular" style={{ color: "var(--text-hi)" }}>{dateRange}</span>
            </div>
          </div>

          {/* Email body */}
          <div className="space-y-4">
            <p className="text-[14px]" style={{ color: "var(--text-hi)" }}>
              {ar ? "مرحباً أحمد،" : "Hi Ahmed,"}
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
              {ar
                ? `إليك ملخص هذا الأسبوع لفريقك من الانضمام. لديك ${totalJoiners} موظف، ${waitingOnMe} خطوة بانتظارك، ومتوسط الإنجاز ${avgCompletion}%.`
                : `Here's your weekly summary for your onboarding cohort. You have ${totalJoiners} joiners, ${waitingOnMe} steps waiting on you, and average completion is at ${avgCompletion}%.`}
            </p>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3">
              <EmailStatCard label={ar ? "الموظفون" : "Joiners"} value={totalJoiners} color="var(--brand-400)" />
              <EmailStatCard label={ar ? "بانتظارك" : "Waiting on you"} value={waitingOnMe} color="var(--accent-500)" />
              <EmailStatCard label={ar ? "متوسط الإنجاز" : "Avg completion"} value={`${avgCompletion}%`} color="var(--brand-400)" />
            </div>

            {/* Late steps */}
            {lateSteps.length > 0 && (
              <div>
                <h4 className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: "var(--text-lo)" }}>
                  {ar ? "خطوات متأخرة تحتاج إليك" : "Late steps that need you"}
                </h4>
                <div className="space-y-1.5">
                  {lateSteps.slice(0, 5).map((s, i) => (
                    <div key={i} className="flex items-center justify-between ast-card-2 px-3 py-2 text-[12px]">
                      <span style={{ color: "var(--text-hi)" }}>{s.label}</span>
                      <span className="tabular" style={{ color: "var(--status-friction)" }}>{s.breachLevel === "hard" ? "Hard breach" : "Breached"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Joiners summary */}
            <div>
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: "var(--text-lo)" }}>
                {ar ? "ملخص الموظفين" : "Joiner summary"}
              </h4>
              <div className="space-y-1.5">
                {joiners.slice(0, 5).map((j) => (
                  <div key={j.employeeId} className="flex items-center justify-between ast-card-2 px-3 py-2 text-[12px]">
                    <span style={{ color: "var(--text-hi)" }}>{j.employeeName}</span>
                    <span className="tabular" style={{ color: "var(--brand-400)" }}>{j.aggregateCompletion}%</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
              {ar
                ? "افتح ASTROLABE لاتخاذ إجراء. لا يمكننا عرض المشاعر أو التعليقات لكل شخص — فقط التزاماتك والإجماليات."
                : "Open ASTROLABE to take action. We can't show sentiment or comments per person — only your obligations and aggregates."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between gap-3" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-lo)" }}>
            {ar ? "يُرسل كل إثنين 09:00 Asia/Dubai" : "Sent every Monday 09:00 Asia/Dubai"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="ast-focus h-9 px-4 rounded-full text-[12px] font-medium" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}>
              {ar ? "إغلاق" : "Close"}
            </button>
            <button
              onClick={() => { setSent(true); toast.success(ar ? "أُرسل الملخص" : "Summary sent"); setTimeout(onClose, 1500); }}
              disabled={sent}
              className="ast-focus inline-flex items-center gap-2 h-9 px-4 rounded-full text-[12px] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              style={{ background: "var(--brand-500)", color: "var(--surface-0)" }}
            >
              {sent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
              {sent ? (ar ? "أُرسل" : "Sent") : (ar ? "أرسل الآن" : "Send now")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmailStatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="ast-card-2 p-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>{label}</p>
      <p className="text-[20px] font-bold tabular mt-1" style={{ color }}>{value}</p>
    </div>
  );
}
