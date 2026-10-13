"use client";

/* ============================================================
   ASTROLABE — Today Screen ("What now?")
   The primary surface. Above the fold answers the employee's
   main question: what should I do next, and what's late.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, formatDistance } from "date-fns";
import {
  Compass,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Hourglass,
  Ban,
  CheckCircle2,
  Star,
  HelpCircle,
  RotateCcw,
  Calendar,
  CalendarPlus,
  Printer,
  Lock,
  Send,
  AlertTriangle,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import {
  SlaChip,
  CitationChip,
  type Band as BandT,
} from "@/components/astrolabe/widgets";
import {
  PressScale,
  RevealOnScroll,
  Tilt3D,
} from "@/components/astrolabe/micro-interactions";
import { Astrolabe3D } from "@/components/three/astrolabe";
import { VerdictCard, type VerdictSignal } from "@/components/astrolabe/verdict-card";
import { stages as ALL_STAGES, owners as ALL_OWNERS, NOW as PACK_NOW } from "@/lib/data/pack";
import { generateIcs, type IcsEvent } from "@/lib/utils/ics";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ---------- Types (mirror the API envelope) ---------- */

interface Employee {
  id: string;
  ref: string;
  displayName: string;
  displayNameAr?: string;
  role: string;
  roleAr?: string;
  team: string;
  location: "DXB" | "AUH" | "REMOTE";
  locale: "en" | "ar";
  journeyType: "onboarding" | "mobility";
  startDate: string;
  effectiveDate?: string;
  manager: { id: string; name: string; role: string } | null;
  hrbp: { id: string; name: string; role: string } | null;
}

interface NextBestStep {
  stepKey: string;
  label: string;
  labelAr: string;
  ownerGroup: string;
  dueAt?: string;
  policyRefs: string[];
  actor: "employee" | "owner" | "system";
  reason: string;
  reasonAr: string;
  requestType?: string;
  primary: boolean;
}

type StepStatus =
  | "not_started"
  | "in_progress"
  | "waiting_employee"
  | "waiting_owner"
  | "blocked"
  | "done"
  | "skipped";
type BreachLevel = "none" | "due_soon" | "breached" | "hard";

interface Step {
  stepKey: string;
  label: string;
  labelAr: string;
  stage: string;
  status: StepStatus;
  ownerGroup: string;
  actor: "employee" | "owner" | "system";
  startedAt?: string;
  dueAt?: string;
  completedAt?: string;
  blockedBy: string[];
  breachLevel: BreachLevel;
  targetHours: number;
  elapsedHours: number;
  remainingHours: number;
  downstreamAtRisk: number;
  policyRefs: string[];
  requestType?: string;
  journeyType: "onboarding" | "mobility";
}

interface JourneyMeData {
  employee: Employee;
  stage: string;
  dayInStage: number;
  band: BandT;
  score: number;
  signals: VerdictSignal[];
  suppressedFamilies: string[];
  nextBestStep: NextBestStep | null;
  steps: Step[];
  engineVersion: string;
  mapVersion: string;
  corpusVersion: string;
}

interface MeData {
  employee: { id: string };
  pulseConsentGranted: boolean;
  consentRecords: { id: string; purpose: string; granted: boolean }[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string };
  error: { code: string; message: string; hint?: string; retryable?: boolean } | null;
}

/* ---------- Display helpers ---------- */

const OWNER_GROUP_LABEL: Record<string, { en: string; ar: string }> = {
  HR: { en: "the HR team", ar: "فريق الموارد البشرية" },
  IT: { en: "the IT team", ar: "فريق تقنية المعلومات" },
  Learning: { en: "the Learning team", ar: "فريق التعلم" },
  Facilities: { en: "the Facilities team", ar: "فريق المرافق" },
  Mobility: { en: "the Mobility team", ar: "فريق التنقل" },
  Payroll: { en: "the Payroll team", ar: "فريق الرواتب" },
  Immigration: { en: "the Immigration team", ar: "فريق الهجرة" },
};

function namedOwnerForGroup(group: string): { name: string; nameAr?: string; role: string; group: string } | null {
  const o = ALL_OWNERS.find((x) => x.group === group);
  if (!o) return null;
  return { name: o.name, nameAr: o.nameAr, role: o.role, group };
}

function stageLabel(stageKey: string, journeyType: string, locale: "en" | "ar"): string {
  const st = ALL_STAGES.find((s) => s.key === stageKey && s.journeyType === journeyType);
  if (!st) return stageKey;
  return locale === "ar" ? st.labelAr : st.label;
}

function stageShort(stageKey: string, journeyType: string, locale: "en" | "ar"): string {
  const full = stageLabel(stageKey, journeyType, locale);
  // Compact rail labels: take first 1–2 words
  if (locale === "ar") return full;
  const parts = full.split(" ");
  return parts.length > 2 ? parts.slice(0, 2).join(" ") : full;
}

function fmtDateAndDistance(iso: string | undefined, locale: "en" | "ar"): string {
  if (!iso) return locale === "ar" ? "في أي وقت" : "any time";
  const d = new Date(iso);
  const datePart = format(d, "EEEE d MMM");
  // Use synthetic NOW from pack for deterministic "in 3 days" copy
  const distance = formatDistance(d, PACK_NOW, { addSuffix: false });
  return locale === "ar" ? `${datePart} · ${distance}` : `${datePart} · ${distance}`;
}

function lateCopy(step: Step, locale: "en" | "ar"): string {
  if (step.breachLevel === "hard") {
    const days = Math.max(1, Math.floor((step.elapsedHours - step.targetHours) / 24));
    return locale === "ar"
      ? `متأخر بـ ${days} أيام — خرق جوهري`
      : `${days} day${days === 1 ? "" : "s"} late — hard breach`;
  }
  if (step.breachLevel === "breached") {
    const days = Math.max(1, Math.floor((step.elapsedHours - step.targetHours) / 24));
    return locale === "ar" ? `متأخر بـ ${days} أيام` : `${days} day${days === 1 ? "" : "s"} late`;
  }
  if (step.status === "blocked") {
    return locale === "ar"
      ? "محظور بانتظار خطوات أخرى"
      : "Held up — waiting on another step";
  }
  return "";
}

function ownerLine(step: Step, locale: "en" | "ar"): string {
  const grp = OWNER_GROUP_LABEL[step.ownerGroup];
  const named = namedOwnerForGroup(step.ownerGroup);
  if (!grp) return step.ownerGroup;
  if (named) {
    return locale === "ar" && named.nameAr
      ? `مع ${named.nameAr} في ${grp.ar}`
      : `with ${named.name} in ${grp.en}`;
  }
  return locale === "ar" ? `مع ${grp.ar}` : `with ${grp.en}`;
}

function upcomingTargetCopy(step: Step, locale: "en" | "ar"): string {
  // No startedAt yet — estimate based on stage order: "in about N days"
  const days = Math.max(1, Math.round(step.targetHours / 24));
  return locale === "ar"
    ? `يُتوقع خلال نحو ${days} يوم`
    : `about ${days} day${days === 1 ? "" : "s"} from start`;
}

/* Band → status shape icon (steady ○ watch ◔ friction ◆ blocked ■) */
// (defined for parity with journey-screen; not used directly here yet)


/* ---------- Skeleton ---------- */

function TodaySkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="ast-card p-6 h-32 ast-shimmer rounded-[14px]" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 ast-card p-6 h-72 ast-shimmer rounded-[14px]" />
        <div className="lg:col-span-5 ast-card p-6 h-72 ast-shimmer rounded-[14px]" />
      </div>
      <div className="ast-card p-6 h-16 ast-shimmer rounded-[14px]" />
      <div className="ast-card p-6 h-40 ast-shimmer rounded-[14px]" />
    </div>
  );
}

/* ---------- Error banner ---------- */

function ErrorBanner({ message, requestId, onRetry }: { message: string; requestId?: string; onRetry: () => void }) {
  return (
    <div
      className="ast-card p-6 flex flex-col sm:flex-row sm:items-center gap-4"
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
          The instrument can&apos;t reach your journey right now.
        </p>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
          {message}
          {requestId && (
            <span className="ml-2 font-mono text-[11px]" style={{ color: "var(--text-lo)" }}>
              · {requestId}
            </span>
          )}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-medium shrink-0"
        style={{ background: "var(--surface-2)", color: "var(--text-hi)", border: "1px solid var(--border)" }}
      >
        <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
        Retry
      </button>
    </div>
  );
}

/* ---------- Hero strip ---------- */

function HeroStrip({ data }: { data: JourneyMeData }) {
  const { locale } = useAppStore();
  const emp = data.employee;
  const name = locale === "ar" && emp.displayNameAr ? emp.displayNameAr : emp.displayName;
  const role = locale === "ar" && emp.roleAr ? emp.roleAr : emp.role;
  const stageLbl = stageLabel(data.stage, emp.journeyType, locale);

  return (
    <section
      className="ast-card relative overflow-hidden"
      aria-label="Employee hero"
    >
      {/* Right-edge vertical brass-band gradient accent strip */}
      <div
        aria-hidden="true"
        className="hidden sm:block absolute top-0 right-0 h-full w-[6px]"
        style={{ background: "var(--g-horizon)" }}
      />
      <div
        aria-hidden="true"
        className="block sm:hidden absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: "var(--g-horizon)" }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Sticky stage chip + day */}
          <div className="flex items-start flex-wrap gap-2">
            <span
              className="inline-flex items-center gap-2 h-8 px-3 rounded-full text-[12px] font-medium tabular shrink-0"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-hi)",
              }}
            >
              <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
              <span>
                {locale === "ar" ? `اليوم ${data.dayInStage} · ${stageLbl}` : `Day ${data.dayInStage} of ${stageLbl}`}
              </span>
            </span>
            <span
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] tabular"
              style={{
                background: "rgba(22,154,165,0.08)",
                border: "1px solid rgba(22,154,165,0.25)",
                color: "var(--brand-400)",
              }}
            >
              <Compass className="w-3.5 h-3.5" strokeWidth={1.75} />
              {emp.journeyType === "onboarding"
                ? locale === "ar" ? "رحلة الالتحاق" : "Onboarding journey"
                : locale === "ar" ? "رحلة تنقل" : "Mobility journey"}
            </span>
          </div>

          {/* Employee name + role + location */}
          <div className="min-w-0">
            <h1
              className="text-[24px] sm:text-[28px] leading-tight font-semibold tracking-tight truncate"
              style={{ color: "var(--text-hi)" }}
            >
              {name}
            </h1>
            <p className="text-[14px] mt-1 truncate" style={{ color: "var(--text-mid)" }}>
              {role}
              <span className="mx-2 opacity-50">·</span>
              {emp.team}
              <span className="mx-2 opacity-50">·</span>
              <span className="tabular">{emp.location}</span>
            </p>
          </div>
        </div>

        {/* 3D mini-astrolabe — desktop only */}
        <div
          className="hidden lg:block relative h-[200px] w-[200px] place-self-end"
          aria-hidden="true"
        >
          <Astrolabe3D size={0.7} spin />
        </div>
      </div>
    </section>
  );
}

/* ---------- Next Best Step card ---------- */

function NextBestStepCard({ data, onStart }: { data: JourneyMeData; onStart: (step: NextBestStep) => void }) {
  const { locale } = useAppStore();
  const nbs = data.nextBestStep;
  const emp = data.employee;

  if (!nbs) {
    return (
      <section
        className="ast-card ast-glow p-6 flex items-center gap-4"
        aria-label="Next best step"
      >
        <CheckCircle2 className="w-6 h-6 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-steady)" }} />
        <div>
          <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "لا يوجد شيء معلّق عليك الآن." : "Nothing is pending on you right now."}
          </p>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "كل خطواتك الحالية مكتملة أو بانتظار فريق آخر."
              : "Your current steps are complete or with another team."}
          </p>
        </div>
      </section>
    );
  }

  const label = locale === "ar" ? nbs.labelAr : nbs.label;
  const reason = locale === "ar" ? nbs.reasonAr : nbs.reason;
  const owner = namedOwnerForGroup(nbs.ownerGroup);
  const ownerText = owner
    ? locale === "ar" && owner.nameAr
      ? `مع ${owner.nameAr}`
      : `with ${owner.name}`
    : nbs.ownerGroup;
  const dueText = fmtDateAndDistance(nbs.dueAt, locale);
  const citation = nbs.policyRefs[0]
    ? parsePolicyRef(nbs.policyRefs[0])
    : null;
  const actorText =
    nbs.actor === "employee"
      ? locale === "ar" ? "خطوتك للقيام بها" : "Yours to do"
      : nbs.actor === "owner"
        ? locale === "ar" ? "بانتظار الفريق" : "With the team"
        : locale === "ar" ? "تلقائي" : "System";

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 26, duration: 0.32 }}
      className="ast-card ast-glow p-5 sm:p-6 relative overflow-hidden"
      aria-label="Your next move"
    >
      {/* Sand-gold inner accent — reserved for "your next move" */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 h-[3px] w-full"
        style={{ background: "linear-gradient(90deg, var(--accent-500), transparent 60%)" }}
      />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--accent-500)" }} />
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--accent-500)" }}
          >
            {locale === "ar" ? "خطوتك التالية" : "Your next move"}
          </span>
        </div>
        <span
          className="ast-chip tabular"
          style={{ color: "var(--accent-500)", background: "rgba(201,162,39,0.08)", borderColor: "rgba(201,162,39,0.30)" }}
        >
          {actorText}
        </span>
      </div>

      <h2 className="text-[20px] sm:text-[22px] font-semibold leading-snug" style={{ color: "var(--text-hi)" }}>
        {label}
      </h2>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]" style={{ color: "var(--text-mid)" }}>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          {ownerText}
        </span>
        <span aria-hidden="true" className="opacity-40">·</span>
        <span className="inline-flex items-center gap-1.5 tabular">
          <Hourglass className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--accent-400)" }} />
          {dueText}
        </span>
      </div>

      <p className="text-[14px] leading-relaxed mt-4" style={{ color: "var(--text-mid)" }}>
        {reason}
      </p>

      <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <PressScale>
          <button
            onClick={() => onStart(nbs)}
            className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[10px] text-[14px] font-semibold transition-transform hover:-translate-y-0.5"
            style={{
              background: "var(--accent-500)",
              color: "var(--surface-0)",
              boxShadow: "0 4px 14px rgba(201,162,39,0.28)",
            }}
          >
            {locale === "ar" ? "ابدأ هذه الخطوة" : "Start this step"}
            <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </button>
        </PressScale>
        {citation && <CitationChip citation={citation} locale={locale} />}
      </div>

      <p
        className="text-[11px] mt-4 font-mono tabular"
        style={{ color: "var(--text-lo)" }}
        aria-label="engine version"
      >
        {emp.journeyType === "onboarding" ? (locale === "ar" ? "رحلة الالتحاق" : "Onboarding") : (locale === "ar" ? "رحلة تنقل" : "Mobility")}
        {" · "}{data.engineVersion}
      </p>
    </motion.section>
  );
}

/* Parse "docSlug#section" → CitationChip shape */
function parsePolicyRef(ref: string): { docSlug: string; title: string; section: string; effectiveDate: string } {
  const [docSlug, section] = ref.split("#");
  const titleMap: Record<string, string> = {
    "relocation-policy": "Relocation Policy",
    "immigration-policy": "Immigration Policy",
    "it-policy": "IT Provisioning Policy",
    "onboarding-policy": "Onboarding Policy",
    "learning-policy": "Learning Policy",
    "mobility-policy": "Internal Mobility Policy",
    "payroll-policy": "Payroll Policy",
    "facilities-policy": "Facilities Policy",
  };
  return {
    docSlug,
    title: titleMap[docSlug] ?? docSlug,
    section: section ?? "—",
    effectiveDate: "2024-01-01",
  };
}

/* ---------- Late items panel ---------- */

function LateItemsPanel({ data }: { data: JourneyMeData }) {
  const { locale } = useAppStore();
  const late = useMemo(() => {
    return data.steps.filter(
      (s) =>
        s.status === "blocked" ||
        s.breachLevel === "breached" ||
        s.breachLevel === "hard"
    );
  }, [data.steps]);

  const nbs = data.nextBestStep;

  return (
    <section className="ast-card p-5 sm:p-6 lg:col-span-5" aria-label="Late items">
      <div className="flex items-center gap-2 mb-4">
        <Ban className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--status-friction)" }} />
        <h3 className="text-[14px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "العناصر المتأخرة" : "Running late"}
        </h3>
        {late.length > 0 && (
          <span
            className="ml-auto inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-[11px] font-semibold tabular"
            style={{ background: "rgba(220,38,38,0.12)", color: "var(--status-friction)" }}
          >
            {late.length}
          </span>
        )}
      </div>

      {late.length === 0 ? (
        <EmptyLateState nbsLabel={nbs ? (locale === "ar" ? nbs.labelAr : nbs.label) : null} dueAt={nbs?.dueAt} locale={locale} />
      ) : (
        <ul className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {late.map((step) => {
              const label = locale === "ar" ? step.labelAr : step.label;
              const owner = namedOwnerForGroup(step.ownerGroup);
              const ownerText = owner
                ? locale === "ar" && owner.nameAr
                  ? owner.nameAr
                  : owner.name
                : step.ownerGroup;
              return (
                <motion.li
                  key={step.stepKey}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                  className="ast-card-2 p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-medium leading-snug pr-2" style={{ color: "var(--text-hi)" }}>
                      {label}
                    </p>
                    <SlaChip
                      elapsedHours={step.elapsedHours}
                      targetHours={step.targetHours}
                      breachLevel={step.breachLevel}
                      locale={locale}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                    <span style={{ color: "var(--text-mid)" }}>{ownerText}</span>
                    <span className="tabular font-medium" style={{ color: "var(--status-friction)" }}>
                      {lateCopy(step, locale)}
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function EmptyLateState({
  nbsLabel,
  dueAt,
  locale,
}: {
  nbsLabel: string | null;
  dueAt?: string;
  locale: "en" | "ar";
}) {
  const copy = nbsLabel
    ? locale === "ar"
      ? `لا شيء متأخر. التالي: ${nbsLabel}${dueAt ? ` بحلول ${format(new Date(dueAt), "EEEE d MMM")}` : ""}.`
      : `Nothing is late. Next: ${nbsLabel}${dueAt ? ` by ${format(new Date(dueAt), "EEEE d MMM")}` : ""}.`
    : locale === "ar"
      ? "لا شيء متأخر. كل شيء يسير على وقته."
      : "Nothing is late. Everything is on time.";

  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full"
        style={{ background: "rgba(14,159,110,0.10)", color: "var(--status-steady)" }}
      >
        <CheckCircle2 className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
        {copy}
      </p>
    </div>
  );
}

/* ---------- Stage Rail ---------- */

function StageRail({ data }: { data: JourneyMeData }) {
  const { locale } = useAppStore();
  const journeyType = data.employee.journeyType;
  const journeyStages = useMemo(
    () => ALL_STAGES.filter((s) => s.journeyType === journeyType).sort((a, b) => a.order - b.order),
    [journeyType]
  );

  const segState = (stageKey: string): "done" | "active" | "blocked" | "pending" => {
    const stepsInStage = data.steps.filter((s) => s.stage === stageKey);
    if (stepsInStage.length === 0) return "pending";
    const allDone = stepsInStage.every((s) => s.status === "done" || s.status === "skipped");
    if (allDone) return "done";
    const anyBlocked = stepsInStage.some(
      (s) => s.status === "blocked" || s.breachLevel === "hard"
    );
    if (anyBlocked) return "blocked";
    if (stageKey === data.stage) return "active";
    // Stage before current — if not all done, mark done visually (history)
    const stageOrder = journeyStages.find((s) => s.key === stageKey)?.order ?? 0;
    const currentOrder = journeyStages.find((s) => s.key === data.stage)?.order ?? 0;
    if (stageOrder < currentOrder) return "done";
    return "pending";
  };

  return (
    <section className="ast-card p-5 sm:p-6" aria-label="Stage rail">
      <div className="flex items-center gap-2 mb-4">
        <Compass className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <h3 className="text-[14px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "مسار الرحلة" : "Journey rail"}
        </h3>
      </div>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${journeyStages.length}, minmax(0, 1fr))` }}>
        {journeyStages.map((st) => {
          const state = segState(st.key);
          const isActive = st.key === data.stage;
          const label = locale === "ar" ? st.labelAr : st.label;
          return (
            <li key={st.key} className="flex flex-col gap-2 min-w-0">
              <div
                className="ast-rail-seg"
                data-state={state === "pending" ? undefined : state}
                aria-label={`${label}: ${state}`}
                style={state === "pending" ? { background: "var(--surface-3)" } : undefined}
              />
              <div className="min-w-0">
                <p
                  className="text-[11px] sm:text-[12px] font-medium leading-tight truncate"
                  style={{
                    color: isActive ? "var(--accent-500)" : state === "done" ? "var(--brand-400)" : state === "blocked" ? "var(--status-blocked)" : "var(--text-lo)",
                  }}
                >
                  {stageShort(st.key, journeyType, locale)}
                </p>
                {isActive && (
                  <p className="text-[10px] tabular mt-0.5" style={{ color: "var(--text-lo)" }}>
                    {locale === "ar" ? `اليوم ${data.dayInStage}` : `Day ${data.dayInStage}`}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------- Coming up ---------- */

function ComingUp({ data }: { data: JourneyMeData }) {
  const { locale } = useAppStore();
  const employeeId = useAppStore((s) => s.currentEmployeeId);
  const upcoming = useMemo(() => {
    return data.steps
      .filter((s) => s.status === "not_started" || s.status === "waiting_employee")
      .filter((s) => s.status !== "blocked" && s.blockedBy.length === 0)
      .slice(0, 3);
  }, [data.steps]);

  // Late items — also surfaced in the LateItemsPanel, but we re-derive
  // them here so the printable checklist can include both buckets.
  const late = useMemo(() => {
    return data.steps.filter(
      (s) =>
        s.status === "blocked" ||
        s.breachLevel === "breached" ||
        s.breachLevel === "hard"
    );
  }, [data.steps]);

  // ICS events for the "Add to calendar" button — every upcoming dated
  // step (not just the top 3 shown on screen), so the whole journey lands
  // in the employee's calendar at once.
  const icsEvents = useMemo<IcsEvent[]>(() => {
    return data.steps
      .filter(
        (s) => s.status === "not_started" || s.status === "waiting_employee",
      )
      .filter((s) => s.status !== "blocked" && s.blockedBy.length === 0)
      .filter((s) => Boolean(s.dueAt))
      .map((s) => {
        const label = locale === "ar" ? s.labelAr : s.label;
        const owner = namedOwnerForGroup(s.ownerGroup);
        const ownerText = owner
          ? locale === "ar" && owner.nameAr
            ? owner.nameAr
            : owner.name
          : s.ownerGroup;
        const policyRef =
          s.policyRefs.length > 0 ? s.policyRefs.join(", ") : "";
        const desc =
          locale === "ar"
            ? `المالك: ${ownerText}${policyRef ? ` | مراجع: ${policyRef}` : ""}`
            : `Owner: ${ownerText}${policyRef ? ` | Refs: ${policyRef}` : ""}`;
        return {
          summary: label,
          dtStart: s.dueAt as string,
          description: desc,
        };
      });
  }, [data.steps, locale]);

  const handlePrint = useCallback(() => {
    if (typeof window !== "undefined") {
      window.print();
    }
  }, []);

  const handleAddToCalendar = useCallback(() => {
    if (icsEvents.length === 0) {
      toast.info(
        locale === "ar"
          ? "لا توجد خطوات قادمة مؤرخة لإضافتها إلى التقويم"
          : "No upcoming dated steps to add to your calendar",
      );
      return;
    }
    const ics = generateIcs(icsEvents);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `astrolabe-journey-${employeeId}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(
      locale === "ar"
        ? `تم تنزيل التقويم (${icsEvents.length} حدث)`
        : `Calendar downloaded (${icsEvents.length} event${icsEvents.length === 1 ? "" : "s"})`,
      {
        description:
          locale === "ar"
            ? "استورد الملف في Outlook أو Google Calendar."
            : "Import the file into Outlook or Google Calendar.",
      },
    );
  }, [icsEvents, employeeId, locale]);

  if (upcoming.length === 0) return null;

  /* Printable checklist content (PRD §03-053) -------------------- */
  const empName =
    locale === "ar" && data.employee.displayNameAr
      ? data.employee.displayNameAr
      : data.employee.displayName;
  const journeyLabel =
    data.employee.journeyType === "onboarding"
      ? locale === "ar"
        ? "الالتحاق"
        : "onboarding"
      : locale === "ar"
        ? "التنقل"
        : "mobility";
  const stageText = stageLabel(data.stage, data.employee.journeyType, locale);

  const checklistItems: {
    label: string;
    due?: string;
    isLate: boolean;
  }[] = [
    ...late.map((s) => ({
      label: locale === "ar" ? s.labelAr : s.label,
      due: s.dueAt,
      isLate: true,
    })),
    ...upcoming.map((s) => ({
      label: locale === "ar" ? s.labelAr : s.label,
      due: s.dueAt,
      isLate: false,
    })),
  ];

  return (
    <section className="ast-card p-5 sm:p-6" aria-label="Coming up">
      <div className="flex items-center gap-2 mb-4 flex-wrap no-print">
        <ChevronRight className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <h3 className="text-[14px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "القادم" : "Coming up"}
        </h3>
        {/* Action buttons — Print checklist + Add to calendar */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handlePrint}
            aria-label={locale === "ar" ? "طباعة القائمة" : "Print checklist"}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium transition-colors hover:border-[var(--brand-500)]"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-mid)",
              border: "1px solid var(--border)",
            }}
          >
            <Printer className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">
              {locale === "ar" ? "طباعة القائمة" : "Print checklist"}
            </span>
          </button>
          <button
            onClick={handleAddToCalendar}
            aria-label={locale === "ar" ? "أضف إلى التقويم" : "Add to calendar"}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium transition-colors hover:border-[var(--brand-500)]"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-mid)",
              border: "1px solid var(--border)",
            }}
          >
            <CalendarPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">
              {locale === "ar" ? "أضف للتقويم" : "Add to calendar"}
            </span>
          </button>
        </div>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
        {upcoming.map((step, i) => {
          const label = locale === "ar" ? step.labelAr : step.label;
          const owner = namedOwnerForGroup(step.ownerGroup);
          const ownerText = owner
            ? locale === "ar" && owner.nameAr
              ? owner.nameAr
              : owner.name
            : step.ownerGroup;
          return (
            <RevealOnScroll
              key={step.stepKey}
              as="li"
              index={i}
              className="ast-card-2 p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold tabular shrink-0"
                  style={{ background: "var(--surface-3)", color: "var(--text-mid)" }}
                >
                  {i + 1}
                </span>
                <span
                  className="text-[10px] font-mono uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-lo)" }}
                >
                  {stageLabel(step.stage, step.journeyType, locale)}
                </span>
              </div>
              <p className="text-[14px] font-medium leading-snug" style={{ color: "var(--text-hi)" }}>
                {label}
              </p>
              <div className="mt-auto pt-2 flex items-center justify-between text-[12px]">
                <span className="truncate pr-2" style={{ color: "var(--text-mid)" }}>{ownerText}</span>
                <span className="tabular shrink-0" style={{ color: "var(--brand-400)" }}>
                  {upcomingTargetCopy(step, locale)}
                </span>
              </div>
            </RevealOnScroll>
          );
        })}
      </ul>

      {/* Printable checklist — hidden on screen, visible only when printing.
          Plain-language copy: "{Name}'s checklist — Day N of onboarding". */}
      <div
        className="print-checklist hidden print:block"
        aria-hidden="true"
        style={{ color: "#000", background: "#fff", padding: "24px 16px" }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 6px" }}>
          {empName}
          {locale === "ar" ? " — قائمة " : "'s checklist — "}
          {locale === "ar"
            ? `اليوم ${data.dayInStage} من ${journeyLabel}`
            : `Day ${data.dayInStage} of ${journeyLabel}`}
        </h1>
        <p style={{ fontSize: "13px", margin: "0 0 18px", color: "#333" }}>
          {locale === "ar" ? `المرحلة: ${stageText}` : `Stage: ${stageText}`}
          {late.length > 0 && (
            <>
              {" · "}
              {locale === "ar"
                ? `${late.length} عنصر متأخر`
                : `${late.length} late item${late.length === 1 ? "" : "s"}`}
            </>
          )}
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "13px", lineHeight: 1.7 }}>
          {checklistItems.map((item, i) => (
            <li key={i} style={{ marginBottom: "8px" }}>
              <span style={{ display: "inline-block", width: "20px" }}>
                {item.isLate ? "☒" : "☐"}
              </span>
              <span style={{ fontWeight: item.isLate ? 600 : 400 }}>
                {item.label}
              </span>
              {item.isLate && (
                <span style={{ marginLeft: "8px", color: "#B91C1C", fontSize: "11px", fontWeight: 600 }}>
                  {locale === "ar" ? "متأخر" : "LATE"}
                </span>
              )}
              {item.due && (
                <span style={{ marginLeft: "12px", color: "#555" }} className="tabular">
                  — {format(new Date(item.due), "d MMM yyyy")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Pulse card (consent-gated) ---------- */

function PulseCard({
  employeeId,
  stage,
  pulseGranted,
  onGrantConsent,
  onSubmit,
  locale,
}: {
  employeeId: string;
  stage: string;
  pulseGranted: boolean;
  onGrantConsent: () => Promise<void>;
  onSubmit: (score: number) => Promise<void>;
  locale: "en" | "ar";
}) {
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [granting, setGranting] = useState(false);
  const [done, setDone] = useState(false);

  const handleGrant = async () => {
    setGranting(true);
    try {
      await onGrantConsent();
    } finally {
      setGranting(false);
    }
  };

  const handleSubmit = async () => {
    if (score === null) return;
    setSubmitting(true);
    try {
      await onSubmit(score);
      setDone(true);
      setScore(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="ast-card p-5 sm:p-6 relative overflow-hidden"
      aria-label="Pulse check"
    >
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: "var(--g-veil)", transform: "translate(40%, -40%)" }}
      />
      <div className="relative flex items-start gap-3 mb-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
          style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
        >
          <HelpCircle className="w-5 h-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "تقدير حالتك" : "Pulse check"}
          </h3>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "سؤالان، فقط إن أردت." : "Two questions, only if you want to."}
          </p>
        </div>
      </div>

      {!pulseGranted ? (
        <div className="relative">
          <div
            className="ast-card-2 p-4 flex items-start gap-3"
            style={{ borderColor: "rgba(22,154,165,0.30)" }}
          >
            <Lock className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            <div className="min-w-0">
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
                {locale === "ar"
                  ? "مشاركة شعورك اختيارية. يمكنك سحب الموافقة في أي وقت، ولا تُشارك دون إذنك."
                  : "Sharing how you feel is opt-in. You can revoke consent any time, and it's never shared without your say-so."}
              </p>
              <button
                onClick={handleGrant}
                disabled={granting}
                className="ast-focus mt-3 inline-flex items-center gap-2 h-10 px-4 rounded-[10px] text-[13px] font-medium transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
                style={{ background: "var(--brand-500)", color: "var(--surface-0)" }}
              >
                <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                {granting
                  ? (locale === "ar" ? "جارٍ التمكين..." : "Enabling…")
                  : (locale === "ar" ? "تفعيل التقدير" : "Enable pulse capture")}
              </button>
            </div>
          </div>
        </div>
      ) : done ? (
        <div
          className="ast-card-2 p-4 flex items-center gap-3"
          style={{ borderColor: "rgba(14,159,110,0.30)" }}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-steady)" }} />
          <p className="text-[13px]" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "تم الإرسال. شكراً لمشاركتك." : "Sent. Thank you for sharing."}
          </p>
          <button
            onClick={() => setDone(false)}
            className="ast-focus ml-auto text-[12px] underline tabular"
            style={{ color: "var(--brand-400)" }}
          >
            {locale === "ar" ? "مرة أخرى" : "Again"}
          </button>
        </div>
      ) : (
        <div className="relative">
          <p className="text-[13px] mb-3" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "كيف تسير رحلتك حتى الآن؟" : "How is your journey going so far?"}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = score === n;
              return (
                <button
                  key={n}
                  onClick={() => setScore(n)}
                  aria-pressed={active}
                  aria-label={`Score ${n} of 5`}
                  className={cn(
                    "ast-focus inline-flex items-center justify-center w-11 h-11 rounded-[10px] text-[14px] font-semibold tabular transition-all",
                    active ? "scale-105" : "hover:scale-105"
                  )}
                  style={{
                    background: active ? "var(--brand-500)" : "var(--surface-2)",
                    color: active ? "var(--surface-0)" : "var(--text-mid)",
                    border: `1px solid ${active ? "var(--brand-500)" : "var(--border)"}`,
                  }}
                >
                  {n}
                </button>
              );
            })}
            <button
              onClick={handleSubmit}
              disabled={score === null || submitting}
              className="ast-focus ml-auto inline-flex items-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-transform hover:-translate-y-0.5 disabled:hover:translate-y-0"
              style={{ background: "var(--accent-500)", color: "var(--surface-0)" }}
            >
              <Send className="w-4 h-4" strokeWidth={1.75} />
              {submitting ? (locale === "ar" ? "جارٍ الإرسال..." : "Sending…") : (locale === "ar" ? "إرسال" : "Send")}
            </button>
          </div>
          <p className="text-[11px] mt-3 tabular" style={{ color: "var(--text-lo)" }}>
            {locale === "ar"
              ? "مرتبط بمرحلتك الحالية. لا يُشارك مع مديرك دون موافقة منفصلة."
              : `Tied to your current stage (${stageLabel(stage, "onboarding", locale)}). Never shared with your manager without separate consent.`}
          </p>
        </div>
      )}
    </motion.section>
  );
}

/* ============================================================
   Main Today screen
   ============================================================ */

export function TodayScreen() {
  const employeeId = useAppStore((s) => s.currentEmployeeId);
  const locale = useAppStore((s) => s.locale);

  const [data, setData] = useState<JourneyMeData | null>(null);
  const [pulseGranted, setPulseGranted] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use the pack's deterministic NOW (2024-10-19) so elapsed-hour and
      // band reads match the seeded events. Real deployments would pass
      // the live clock here.
      const asOf = PACK_NOW.toISOString();
      const [journeyRes, meRes] = await Promise.all([
        fetch(`/api/v1/journey/me?employeeId=${encodeURIComponent(employeeId)}&asOf=${encodeURIComponent(asOf)}`, {
          headers: { Accept: "application/json" },
        }),
        fetch(`/api/v1/me/data?employeeId=${encodeURIComponent(employeeId)}`, {
          headers: { Accept: "application/json" },
        }),
      ]);
      const journeyJson: ApiEnvelope<JourneyMeData> = await journeyRes.json();
      if (!journeyJson.ok || !journeyJson.data) {
        throw new Error(journeyJson.error?.message ?? "Failed to load journey");
      }
      setData(journeyJson.data);

      // Consent check is best-effort — never blocks the screen
      try {
        const meJson: ApiEnvelope<MeData> = await meRes.json();
        if (meJson.ok && meJson.data) {
          setPulseGranted(!!meJson.data.pulseConsentGranted);
        }
      } catch {
        // leave pulseGranted false → consent prompt shows
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError({ message: msg });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dir = locale === "ar" ? "rtl" : "ltr";

  /* Actions ---------------------------------------------------- */

  const handleStartStep = useCallback(
    async (nbs: NextBestStep) => {
      if (!data) return;
      const emp = data.employee;
      const requestType = nbs.requestType;
      if (!requestType) {
        toast.success(locale === "ar" ? "تم تسجيل البدء" : "Step started", {
          description: locale === "ar" ? nbs.labelAr : nbs.label,
        });
        return;
      }
      const idempotencyKey = `idm-${emp.id}-${requestType}-${Date.now().toString(36)}`;
      try {
        const res = await fetch("/api/v1/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: emp.id,
            type: requestType,
            payload: { stepKey: nbs.stepKey, label: nbs.label },
            idempotencyKey,
          }),
        });
        const json: ApiEnvelope<{ ref: string; owner?: { name: string } }> = await res.json();
        if (json.ok && json.data) {
          const ownerName = json.data.owner?.name ?? "the team";
          toast.success(locale === "ar" ? "تم إرسال الطلب" : "Request sent", {
            description: locale === "ar"
              ? `${nbs.labelAr} — ${ownerName} سيتولى الأمر`
              : `${nbs.label} — ${ownerName} will handle it`,
          });
        } else {
          toast.error(locale === "ar" ? "تعذّر الإرسال" : "Couldn't send", {
            description: json.error?.message ?? "Please try again.",
          });
        }
      } catch {
        toast.error(locale === "ar" ? "خطأ في الشبكة" : "Network error", {
          description: locale === "ar" ? "حاول مرة أخرى." : "Please retry.",
        });
      }
    },
    [data, locale]
  );

  const handleGrantConsent = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          purpose: "pulse_capture",
          granted: true,
          version: "v1",
        }),
      });
      const json: ApiEnvelope<{ receiptId: string }> = await res.json();
      if (json.ok) {
        setPulseGranted(true);
        toast.success(locale === "ar" ? "تم تفعيل التقدير" : "Pulse capture enabled", {
          description: locale === "ar"
            ? `رقم الإيصال: ${json.data?.receiptId ?? ""}`
            : `Receipt: ${json.data?.receiptId ?? ""}`,
        });
      } else {
        toast.error(json.error?.message ?? "Failed");
      }
    } catch {
      toast.error(locale === "ar" ? "خطأ في الشبكة" : "Network error");
    }
  }, [employeeId, locale]);

  const handleSubmitPulse = useCallback(
    async (score: number) => {
      if (!data) return;
      try {
        const res = await fetch("/api/v1/pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            stage: data.stage,
            score,
            consentId: `CN-pulse-${employeeId}`,
          }),
        });
        const json: ApiEnvelope<{ id: string }> = await res.json();
        if (json.ok) {
          toast.success(locale === "ar" ? "تم الإرسال" : "Pulse recorded", {
            description: locale === "ar" ? "شكراً لمشاركتك." : "Thank you for sharing.",
          });
        } else if (json.error?.code === "E_CONSENT_REQUIRED") {
          setPulseGranted(false);
          toast.error(locale === "ar" ? "يلزم الموافقة" : "Consent required", {
            description: json.error.hint ?? "",
          });
        } else {
          toast.error(json.error?.message ?? "Failed");
        }
      } catch {
        toast.error(locale === "ar" ? "خطأ في الشبكة" : "Network error");
      }
    },
    [data, employeeId, locale]
  );

  /* Render ---------------------------------------------------- */

  return (
    <div
      dir={dir}
      className="min-h-screen flex flex-col"
      style={{ background: "var(--surface-0)" }}
    >
      <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {loading ? (
          <TodaySkeleton />
        ) : error ? (
          <ErrorBanner
            message={error.message}
            requestId={error.requestId}
            onRetry={() => void load()}
          />
        ) : data ? (
          <>
            <HeroStrip data={data} />

            {/* Verdict card — first thing after the hero: "Here's where you stand." */}
            <VerdictCard
              band={data.band}
              score={data.score}
              signals={data.signals}
              suppressedFamilies={data.suppressedFamilies}
              locale={locale}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Tilt3D maxDeg={3} className="lg:col-span-7">
                <NextBestStepCard data={data} onStart={handleStartStep} />
              </Tilt3D>
              <LateItemsPanel data={data} />
            </div>

            <StageRail data={data} />

            <ComingUp data={data} />

            <PulseCard
              employeeId={employeeId}
              stage={data.stage}
              pulseGranted={pulseGranted}
              onGrantConsent={handleGrantConsent}
              onSubmit={handleSubmitPulse}
              locale={locale}
            />

            {/* Version footer */}
            <p
              className="text-[11px] font-mono tabular text-center pt-2 pb-4"
              style={{ color: "var(--text-lo)" }}
            >
              {data.engineVersion} · {data.mapVersion} · {data.corpusVersion}
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}

export default TodayScreen;
