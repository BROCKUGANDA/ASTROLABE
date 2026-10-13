"use client";

/* ============================================================
   ASTROLABE — Journey Screen
   The full map and history. JourneyOrbit3D at the top,
   sticky collapsing stage rail, grouped step list with
   expandable rows + blocked-by chain in words, then a
   virtualised timeline of events with sticky week headers.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from "framer-motion";
import { format, startOfWeek } from "date-fns";
import {
  Compass,
  ChevronRight,
  ChevronDown,
  Circle,
  CircleDot,
  Diamond,
  Square,
  Ban,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Hourglass,
  ListTree,
  History,
  ClipboardList,
  UserCircle,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import {
  BandChip,
  StatusChip,
  SlaChip,
  CitationChip,
  type Band as BandT,
} from "@/components/astrolabe/widgets";
import { JourneyOrbit3D } from "@/components/three/astrolabe";
import { stages as ALL_STAGES, owners as ALL_OWNERS, steps as ALL_STEPS, NOW as PACK_NOW } from "@/lib/data/pack";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ---------- Types (mirror API) ---------- */

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
  signals: unknown[];
  suppressedFamilies: string[];
  nextBestStep: unknown;
  steps: Step[];
  engineVersion: string;
  mapVersion: string;
  corpusVersion: string;
}

interface JourneyEvent {
  id: string;
  stepKey: string;
  type: string;
  occurredAt: string;
  recordedAt: string;
  source: string;
}

interface MeData {
  employee: { id: string };
  journeyEvents: JourneyEvent[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string };
  error: { code: string; message: string; hint?: string; retryable?: boolean } | null;
}

/* ---------- Display helpers ---------- */

const OWNER_GROUP_LABEL: Record<string, { en: string; ar: string }> = {
  HR: { en: "HR", ar: "الموارد البشرية" },
  IT: { en: "IT", ar: "تقنية المعلومات" },
  Learning: { en: "Learning", ar: "التعلم" },
  Facilities: { en: "Facilities", ar: "المرافق" },
  Mobility: { en: "Mobility", ar: "التنقل" },
  Payroll: { en: "Payroll", ar: "الرواتب" },
  Immigration: { en: "Immigration", ar: "الهجرة" },
};

function namedOwnerForGroup(group: string): { name: string; nameAr?: string; role: string } | null {
  const o = ALL_OWNERS.find((x) => x.group === group);
  if (!o) return null;
  return { name: o.name, nameAr: o.nameAr, role: o.role };
}

function stageLabel(stageKey: string, journeyType: string, locale: "en" | "ar"): string {
  const st = ALL_STAGES.find((s) => s.key === stageKey && s.journeyType === journeyType);
  if (!st) return stageKey;
  return locale === "ar" ? st.labelAr : st.label;
}

function stepLabelByKey(stepKey: string, locale: "en" | "ar"): string {
  const s = ALL_STEPS.find((x) => x.key === stepKey);
  if (!s) return stepKey;
  return locale === "ar" ? s.labelAr : s.label;
}

function fmtDate(iso: string | undefined, locale: "en" | "ar"): string {
  if (!iso) return locale === "ar" ? "—" : "—";
  return format(new Date(iso), "EEEE d MMM");
}

function fmtTime(iso: string, locale: "en" | "ar"): string {
  return format(new Date(iso), locale === "ar" ? "d MMM · HH:mm" : "d MMM · HH:mm");
}

function eventLabel(type: string, locale: "en" | "ar"): string {
  const map: Record<string, { en: string; ar: string }> = {
    started: { en: "Started", ar: "بدأت" },
    completed: { en: "Completed", ar: "اكتملت" },
    blocked: { en: "Blocked", ar: "حُظرت" },
    unblocked: { en: "Unblocked", ar: "أُلغي الحظر" },
    waiting_employee: { en: "Waiting on you", ar: "بانتظارك" },
    waiting_owner: { en: "Waiting on team", ar: "بانتظار الفريق" },
    skipped: { en: "Skipped", ar: "تم تخطيها" },
    note: { en: "Note added", ar: "أُضيفت ملاحظة" },
  };
  const cfg = map[type] ?? { en: type, ar: type };
  return locale === "ar" ? cfg.ar : cfg.en;
}

function sourceLabel(source: string, locale: "en" | "ar"): string {
  const map: Record<string, { en: string; ar: string }> = {
    "hr-system": { en: "HR system", ar: "نظام الموارد" },
    "it-system": { en: "IT system", ar: "نظام تقنية" },
    "facilities-system": { en: "Facilities system", ar: "نظام المرافق" },
    "mobility-system": { en: "Mobility system", ar: "نظام التنقل" },
    "immigration-portal": { en: "Immigration portal", ar: "بوابة الهجرة" },
    "payroll-system": { en: "Payroll system", ar: "نظام الرواتب" },
    "learning-portal": { en: "Learning portal", ar: "بوابة التعلم" },
  };
  const cfg = map[source] ?? { en: source, ar: source };
  return locale === "ar" ? cfg.ar : cfg.en;
}

/* Band-shape icon: steady ○ watch ◔ friction ◆ blocked ■ */
function statusToBand(status: StepStatus, breach: BreachLevel): BandT {
  if (status === "done" || status === "skipped") return "steady";
  if (status === "blocked") return "blocked";
  if (breach === "hard") return "blocked";
  if (breach === "breached") return "friction";
  if (status === "waiting_employee" || status === "waiting_owner") return "watch";
  if (breach === "due_soon") return "watch";
  return "steady";
}

function bandShape(band: BandT) {
  switch (band) {
    case "steady":
      return { Icon: Circle, color: "var(--status-steady)" };
    case "watch":
      return { Icon: CircleDot, color: "var(--status-watch)" };
    case "friction":
      return { Icon: Diamond, color: "var(--status-friction)" };
    case "blocked":
      return { Icon: Square, color: "var(--status-blocked)" };
  }
}

function stepToOrbitStatus(s: Step): "done" | "active" | "blocked" | "waiting" | "todo" {
  if (s.status === "done" || s.status === "skipped") return "done";
  if (s.status === "blocked") return "blocked";
  if (s.status === "waiting_employee" || s.status === "waiting_owner") return "waiting";
  if (s.status === "in_progress") return "active";
  return "todo";
}

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

/* Walk the blockedBy chain to build a phrase in words. */
function blockedByChainWords(step: Step, allSteps: Step[], locale: "en" | "ar"): string {
  if (step.blockedBy.length === 0) return "";
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: Step | undefined = step;
  while (current && current.blockedBy.length > 0) {
    const firstDepKey = current.blockedBy[0];
    if (visited.has(firstDepKey)) break;
    visited.add(firstDepKey);
    const dep = allSteps.find((s) => s.stepKey === firstDepKey);
    if (!dep) break;
    chain.push(locale === "ar" ? dep.labelAr : dep.label);
    current = dep;
  }
  if (chain.length === 0) return "";
  if (locale === "ar") {
    return `${chain.join(" ← ")} — يجب إكمال هذه الخطوات أولاً`;
  }
  if (chain.length === 1) return `${chain[0]} needs to finish first`;
  if (chain.length === 2) return `${chain[0]} waits on ${chain[1]}`;
  // chain.length >= 3 — join with "which waits on"
  const head = chain[0];
  const tail = chain.slice(1);
  return `${head} waits on ${tail.join(", which waits on ")}`;
}

/* ---------- Skeleton ---------- */

function JourneySkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="ast-card h-[280px] sm:h-[380px] ast-shimmer rounded-[14px]" />
      <div className="ast-card h-16 ast-shimmer rounded-[14px]" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="ast-card h-14 ast-shimmer rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}

/* ---------- Error banner ---------- */

function ErrorBanner({
  message,
  requestId,
  onRetry,
  locale,
}: {
  message: string;
  requestId?: string;
  onRetry: () => void;
  locale: "en" | "ar";
}) {
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
          {locale === "ar"
            ? "تعذّر الوصول إلى رحلتك الآن."
            : "The instrument can't reach your journey right now."}
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
        {locale === "ar" ? "إعادة" : "Retry"}
      </button>
    </div>
  );
}

/* ---------- Empty state ---------- */

function EmptyState({
  employee,
  locale,
  onRetry,
}: {
  employee: Employee | null;
  locale: "en" | "ar";
  onRetry: () => void;
}) {
  const hrbp = employee?.hrbp;
  const preboarding = [
    locale === "ar" ? "توقيع العرض" : "Sign your offer",
    locale === "ar" ? "تحميل مسح جواز السفر" : "Upload your passport scan",
    locale === "ar" ? "تأكيد بدل الانتقال" : "Confirm your relocation allowance",
  ];
  return (
    <div className="ast-card p-8 sm:p-12 flex flex-col items-center text-center gap-6">
      <div
        className="flex items-center justify-center w-20 h-20 rounded-full"
        style={{ background: "var(--g-veil)", color: "var(--brand-400)" }}
      >
        <Compass className="w-9 h-9" strokeWidth={1.5} />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-[20px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar"
            ? "رحلتك لم تبدأ في النظام بعد"
            : "Your journey hasn't started in the system yet"}
        </h2>
        <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
          {locale === "ar"
            ? "بمجرد أن يسجّل فريق الموارد البشرية أول حدث، سترى خريطتك الكاملة هنا."
            : "As soon as HR records the first event, you'll see your full map here."}
        </p>
      </div>

      <div className="ast-card-2 p-5 w-full max-w-md text-left">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "قائمة ما قبل الالتحاق" : "Pre-boarding checklist"}
          </h3>
        </div>
        <ul className="space-y-2">
          {preboarding.map((item, i) => (
            <li key={i} className="flex items-center gap-3 text-[14px]" style={{ color: "var(--text-mid)" }}>
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold tabular shrink-0"
                style={{ background: "var(--surface-3)", color: "var(--text-lo)" }}
              >
                {i + 1}
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {hrbp && (
        <div className="ast-card-2 p-4 w-full max-w-md flex items-center gap-3 text-left">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <UserCircle className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "جهة الاتصال في الموارد" : "Your HR contact"}
            </p>
            <p className="text-[14px] font-medium truncate" style={{ color: "var(--text-hi)" }}>
              {hrbp.name}
            </p>
            <p className="text-[12px] truncate" style={{ color: "var(--text-mid)" }}>
              {hrbp.role}
            </p>
          </div>
        </div>
      )}

      <button
        onClick={onRetry}
        className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-[10px] text-[13px] font-medium"
        style={{ background: "var(--brand-500)", color: "var(--surface-0)" }}
      >
        <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
        {locale === "ar" ? "تحقق مرة أخرى" : "Check again"}
      </button>
    </div>
  );
}

/* ---------- Orbit header ---------- */

function OrbitHeader({ data, locale }: { data: JourneyMeData; locale: "en" | "ar" }) {
  const orbitSteps = useMemo(
    () =>
      data.steps.map((s) => ({
        label: locale === "ar" ? s.labelAr : s.label,
        status: stepToOrbitStatus(s),
      })),
    [data.steps, locale]
  );
  return (
    <section className="ast-card relative overflow-hidden" aria-label="Journey orbit">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--g-veil)" }}
      />
      <div className="relative h-[280px] sm:h-[380px]">
        <JourneyOrbit3D steps={orbitSteps} />
      </div>
      <div className="relative flex items-center justify-between gap-3 px-5 sm:px-6 pb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Compass className="w-4 h-4 shrink-0" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          <h2 className="text-[14px] font-semibold truncate" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "مدار رحلتك" : "Your journey orbit"}
          </h2>
        </div>
        <BandChip band={data.band} score={data.score} locale={locale} size="sm" />
      </div>
    </section>
  );
}

/* ---------- Sticky collapsing Stage Rail ---------- */

function StickyStageRail({ data, locale }: { data: JourneyMeData; locale: "en" | "ar" }) {
  const journeyType = data.employee.journeyType;
  const journeyStages = useMemo(
    () => ALL_STAGES.filter((s) => s.journeyType === journeyType).sort((a, b) => a.order - b.order),
    [journeyType]
  );

  const { scrollY } = useScroll();
  // Map scroll 0..120px → height 64..48px (height values apply per segment padding wrapper)
  const raw = useTransform(scrollY, [0, 120], [64, 48]);
  const heightSpring = useSpring(raw, { stiffness: 220, damping: 28 });
  const [h, setH] = useState(64);
  useEffect(() => {
    const unsub = heightSpring.on("change", (v) => setH(v));
    return () => unsub();
  }, [heightSpring]);

  const segState = (stageKey: string): "done" | "active" | "blocked" | "pending" => {
    const stepsInStage = data.steps.filter((s) => s.stage === stageKey);
    if (stepsInStage.length === 0) return "pending";
    const allDone = stepsInStage.every((s) => s.status === "done" || s.status === "skipped");
    if (allDone) return "done";
    const anyBlocked = stepsInStage.some((s) => s.status === "blocked" || s.breachLevel === "hard");
    if (anyBlocked) return "blocked";
    if (stageKey === data.stage) return "active";
    const stageOrder = journeyStages.find((s) => s.key === stageKey)?.order ?? 0;
    const currentOrder = journeyStages.find((s) => s.key === data.stage)?.order ?? 0;
    if (stageOrder < currentOrder) return "done";
    return "pending";
  };

  return (
    <motion.div
      style={{ height: h }}
      className="sticky top-0 z-30 transition-[height] duration-100"
    >
      <div className="h-full ast-card rounded-none border-l-0 border-r-0 flex items-center px-3 sm:px-4 gap-2 overflow-x-auto">
        <ol
          className="flex items-center gap-1 sm:gap-2 min-w-0"
          aria-label="Stage rail"
        >
          {journeyStages.map((st, idx) => {
            const state = segState(st.key);
            const isActive = st.key === data.stage;
            const label = locale === "ar" ? st.labelAr : st.label;
            return (
              <li key={st.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
                {idx > 0 && (
                  <ChevronRight
                    className="w-3 h-3 shrink-0"
                    strokeWidth={1.75}
                    style={{ color: "var(--text-lo)" }}
                    aria-hidden="true"
                  />
                )}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="ast-rail-seg"
                    data-state={state === "pending" ? undefined : state}
                    style={{
                      width: 28,
                      height: 4,
                      ...(state === "pending" ? { background: "var(--surface-3)" } : {}),
                    }}
                    aria-label={`${label}: ${state}`}
                  />
                  <span
                    className="text-[11px] sm:text-[12px] font-medium whitespace-nowrap tabular"
                    style={{
                      color: isActive
                        ? "var(--accent-500)"
                        : state === "done"
                          ? "var(--brand-400)"
                          : state === "blocked"
                            ? "var(--status-blocked)"
                            : "var(--text-lo)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </motion.div>
  );
}

/* ---------- Blocked-by mini graph ---------- */

function BlockedByGraph({ step, allSteps, locale }: { step: Step; allSteps: Step[]; locale: "en" | "ar" }) {
  const chain: Step[] = [];
  const visited = new Set<string>();
  let cur: Step | undefined = step;
  while (cur && cur.blockedBy.length > 0) {
    const firstKey = cur.blockedBy[0];
    if (visited.has(firstKey)) break;
    visited.add(firstKey);
    const dep = allSteps.find((s) => s.stepKey === firstKey);
    if (!dep) break;
    chain.unshift(dep);
    cur = dep;
  }
  if (chain.length === 0) return null;

  return (
    <div className="ast-card-2 p-3 overflow-x-auto">
      <div className="flex items-center gap-2 min-w-max">
        {chain.map((s, i) => (
          <div key={s.stepKey} className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 px-3 h-9 rounded-[10px] shrink-0"
              style={{
                background: "rgba(159,18,57,0.08)",
                border: "1px solid rgba(159,18,57,0.30)",
              }}
            >
              <Ban className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-blocked)" }} />
              <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? s.labelAr : s.label}
              </span>
            </div>
            {i < chain.length - 1 && (
              <ArrowRight
                className="w-3.5 h-3.5 shrink-0"
                strokeWidth={1.75}
                style={{ color: "var(--text-lo)" }}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
        <ArrowRight
          className="w-3.5 h-3.5 shrink-0"
          strokeWidth={1.75}
          style={{ color: "var(--text-lo)" }}
          aria-hidden="true"
        />
        <div
          className="flex items-center gap-2 px-3 h-9 rounded-[10px] shrink-0"
          style={{
            background: "rgba(201,162,39,0.08)",
            border: "1px solid rgba(201,162,39,0.30)",
          }}
        >
          <Hourglass className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--accent-500)" }} />
          <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? step.labelAr : step.label}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Step row (expandable) ---------- */

function StepRow({
  step,
  allSteps,
  events,
  locale,
  isExpanded,
  onToggle,
}: {
  step: Step;
  allSteps: Step[];
  events: JourneyEvent[];
  locale: "en" | "ar";
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const band = statusToBand(step.status, step.breachLevel);
  const { Icon, color } = bandShape(band);
  const label = locale === "ar" ? step.labelAr : step.label;
  const owner = namedOwnerForGroup(step.ownerGroup);
  const ownerText = owner
    ? locale === "ar" && owner.nameAr
      ? owner.nameAr
      : owner.name
    : (OWNER_GROUP_LABEL[step.ownerGroup]?.[locale] ?? step.ownerGroup);
  const due = fmtDate(step.dueAt, locale);
  const stepEvents = useMemo(
    () => events.filter((e) => e.stepKey === step.stepKey).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [events, step.stepKey]
  );
  const citation = step.policyRefs[0] ? parsePolicyRef(step.policyRefs[0]) : null;
  const chainWords = blockedByChainWords(step, allSteps, locale);
  const showBlockedGraph = step.status === "blocked" && step.blockedBy.length > 0;

  return (
    <li className="ast-card-2 overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="ast-focus w-full text-left flex items-center gap-3 p-3.5 min-h-[56px] hover:bg-[var(--surface-3)] transition-colors"
      >
        {/* Left: status icon + label */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Icon
            className="w-4 h-4 shrink-0"
            strokeWidth={2}
            style={{ color }}
            aria-label={band}
          />
          <div className="min-w-0">
            <p className="text-[14px] font-medium leading-snug truncate" style={{ color: "var(--text-hi)" }}>
              {label}
            </p>
            <p className="text-[11px] tabular mt-0.5" style={{ color: "var(--text-lo)" }}>
              {step.stepKey}
            </p>
          </div>
        </div>

        {/* Middle: owner + due + sla + downstream */}
        <div className="hidden md:flex items-center gap-3 flex-1 min-w-0">
          <span className="text-[12px] truncate" style={{ color: "var(--text-mid)" }}>
            {ownerText}
          </span>
          {step.startedAt && step.status !== "done" && step.status !== "skipped" && (
            <SlaChip
              elapsedHours={step.elapsedHours}
              targetHours={step.targetHours}
              breachLevel={step.breachLevel}
              locale={locale}
            />
          )}
          {step.status !== "done" && step.status !== "skipped" && step.dueAt && (
            <span className="text-[12px] tabular shrink-0" style={{ color: "var(--text-mid)" }}>
              {due}
            </span>
          )}
          {step.downstreamAtRisk > 0 && step.status !== "done" && step.status !== "skipped" && (
            <span
              className="inline-flex items-center gap-1 text-[11px] tabular shrink-0"
              style={{ color: "var(--status-watch)" }}
              title={`${step.downstreamAtRisk} downstream step(s) depend on this`}
            >
              <ListTree className="w-3 h-3" strokeWidth={1.75} />
              {locale === "ar"
                ? `يحجب ${step.downstreamAtRisk} خطوة`
                : `blocks ${step.downstreamAtRisk}`}
            </span>
          )}
        </div>

        {/* Right: status chip + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusChip status={step.status} locale={locale} />
          <ChevronDown
            className="w-4 h-4 transition-transform shrink-0"
            strokeWidth={1.75}
            style={{
              color: "var(--text-lo)",
              transform: isExpanded ? "rotate(180deg)" : "none",
            }}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Mobile meta line */}
      <div className="md:hidden flex items-center gap-2 px-3.5 pb-2 -mt-1 flex-wrap text-[11px]" style={{ color: "var(--text-mid)" }}>
        <span>{ownerText}</span>
        {step.startedAt && step.status !== "done" && step.status !== "skipped" && (
          <SlaChip
            elapsedHours={step.elapsedHours}
            targetHours={step.targetHours}
            breachLevel={step.breachLevel}
            locale={locale}
          />
        )}
        {step.status !== "done" && step.status !== "skipped" && step.dueAt && (
          <span className="tabular">{due}</span>
        )}
        {step.downstreamAtRisk > 0 && step.status !== "done" && step.status !== "skipped" && (
          <span className="tabular" style={{ color: "var(--status-watch)" }}>
            · {locale === "ar" ? `يحجب ${step.downstreamAtRisk}` : `blocks ${step.downstreamAtRisk}`}
          </span>
        )}
      </div>

      {/* Expanded panel */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-1 space-y-4" style={{ borderTop: "1px solid var(--border-soft)" }}>
              {/* Blocked-by chain in words */}
              {(chainWords || showBlockedGraph) && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                    {locale === "ar" ? "لماذا هي محظورة" : "Why this is held up"}
                  </p>
                  {chainWords && (
                    <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
                      {chainWords}
                    </p>
                  )}
                  {showBlockedGraph && (
                    <BlockedByGraph step={step} allSteps={allSteps} locale={locale} />
                  )}
                </div>
              )}

              {/* Timeline of events for this step */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "أحداث هذه الخطوة" : "Events for this step"}
                </p>
                {stepEvents.length === 0 ? (
                  <p className="text-[13px]" style={{ color: "var(--text-lo)" }}>
                    {locale === "ar" ? "لا توجد أحداث بعد." : "No events yet."}
                  </p>
                ) : (
                  <ol className="space-y-1.5">
                    {stepEvents.map((ev) => (
                      <li
                        key={ev.id}
                        className="flex items-center gap-3 text-[12px] py-1"
                      >
                        <span className="tabular shrink-0" style={{ color: "var(--text-lo)", minWidth: "8.5rem" }}>
                          {fmtTime(ev.occurredAt, locale)}
                        </span>
                        <span className="font-medium" style={{ color: "var(--text-hi)" }}>
                          {eventLabel(ev.type, locale)}
                        </span>
                        <span className="opacity-60">·</span>
                        <span style={{ color: "var(--text-mid)" }}>{sourceLabel(ev.source, locale)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Policy citation */}
              {citation && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                    {locale === "ar" ? "المرجع" : "Citation"}
                  </span>
                  <CitationChip citation={citation} locale={locale} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* ---------- Step list grouped by stage ---------- */

function StepList({
  data,
  events,
  locale,
}: {
  data: JourneyMeData;
  events: JourneyEvent[];
  locale: "en" | "ar";
}) {
  // `userOverride` is undefined until the user clicks; before then we
  // derive the default-expanded step (the first blocked/hard one).
  const [userOverride, setUserOverride] = useState<string | null | undefined>(undefined);
  const journeyType = data.employee.journeyType;
  const journeyStages = useMemo(
    () => ALL_STAGES.filter((s) => s.journeyType === journeyType).sort((a, b) => a.order - b.order),
    [journeyType]
  );

  const stepsByStage = useMemo(() => {
    const map = new Map<string, Step[]>();
    for (const st of journeyStages) {
      map.set(
        st.key,
        data.steps.filter((s) => s.stage === st.key)
      );
    }
    return map;
  }, [data.steps, journeyStages]);

  // Auto-expand the first blocked or hard-breached step until the user
  // makes an explicit choice.
  const defaultExpandedKey = useMemo(() => {
    const blocked = data.steps.find((s) => s.status === "blocked" || s.breachLevel === "hard");
    return blocked ? blocked.stepKey : null;
  }, [data.steps]);
  const expandedKey = userOverride !== undefined ? userOverride : defaultExpandedKey;

  return (
    <div className="space-y-6">
      {journeyStages.map((st) => {
        const stepsInStage = stepsByStage.get(st.key) ?? [];
        if (stepsInStage.length === 0) return null;
        const isActive = st.key === data.stage;
        const stageLabelTxt = locale === "ar" ? st.labelAr : st.label;
        const doneCount = stepsInStage.filter((s) => s.status === "done" || s.status === "skipped").length;
        return (
          <section key={st.key} aria-label={stageLabelTxt}>
            <div
              className="sticky top-[64px] z-20 -mx-1 px-1 py-2 flex items-center gap-3"
              style={{ background: "var(--surface-0)" }}
            >
              <h3
                className="text-[13px] font-semibold uppercase tracking-[0.14em] truncate"
                style={{
                  color: isActive ? "var(--accent-500)" : "var(--text-hi)",
                }}
              >
                {stageLabelTxt}
              </h3>
              <span
                className="text-[11px] tabular shrink-0"
                style={{ color: "var(--text-lo)" }}
              >
                {doneCount}/{stepsInStage.length}
              </span>
              {isActive && (
                <span
                  className="text-[10px] uppercase tracking-[0.12em] shrink-0 px-2 py-0.5 rounded-full"
                  style={{
                    background: "rgba(201,162,39,0.10)",
                    color: "var(--accent-500)",
                    border: "1px solid rgba(201,162,39,0.30)",
                  }}
                >
                  {locale === "ar" ? "الحالية" : "Current"}
                </span>
              )}
              <div className="flex-1 h-px" style={{ background: "var(--border-soft)" }} />
            </div>
            <ol className="space-y-2 mt-1">
              {stepsInStage.map((step) => (
                <StepRow
                  key={step.stepKey}
                  step={step}
                  allSteps={data.steps}
                  events={events}
                  locale={locale}
                  isExpanded={expandedKey === step.stepKey}
                  onToggle={() =>
                    setUserOverride((prev) => (prev === step.stepKey ? null : step.stepKey))
                  }
                />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Timeline (events with sticky week headers) ---------- */

interface WeekGroup {
  weekKey: string;
  weekLabel: string;
  events: JourneyEvent[];
}

function groupByWeek(events: JourneyEvent[], locale: "en" | "ar"): WeekGroup[] {
  const groups: WeekGroup[] = [];
  const seenWeeks = new Set<string>();
  // Sort newest first
  const sorted = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  for (const ev of sorted) {
    const d = new Date(ev.occurredAt);
    const weekStart = startOfWeek(d, { weekStartsOn: 1 });
    const weekKey = format(weekStart, "yyyy-MM-dd");
    let g = groups.find((x) => x.weekKey === weekKey);
    if (!g) {
      g = {
        weekKey,
        weekLabel: locale === "ar"
          ? `أسبوع ${format(weekStart, "d MMM")}`
          : `Week of ${format(weekStart, "d MMM")}`,
        events: [],
      };
      groups.push(g);
      seenWeeks.add(weekKey);
    }
    g.events.push(ev);
  }
  return groups;
}

function Timeline({ events, locale }: { events: JourneyEvent[]; locale: "en" | "ar" }) {
  const groups = useMemo(() => groupByWeek(events, locale), [events, locale]);
  const sliced = useMemo(() => groups.map((g) => ({ ...g, events: g.events.slice(0, 50) })), [groups]);

  // Compute global index for stagger
  let globalIdx = 0;

  return (
    <section className="ast-card p-5 sm:p-6" aria-label="Timeline">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <h3 className="text-[14px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "السجل الزمني" : "Timeline"}
        </h3>
        <span className="ml-auto text-[11px] tabular" style={{ color: "var(--text-lo)" }}>
          {events.length} {locale === "ar" ? "حدث" : "events"}
        </span>
      </div>

      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
        {sliced.map((g) => (
          <div key={g.weekKey}>
            <div
              className="sticky top-0 z-10 py-2 -mx-1 px-1"
              style={{ background: "var(--surface-1)" }}
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.14em] tabular"
                style={{ color: "var(--text-lo)" }}
              >
                {g.weekLabel}
              </p>
            </div>
            <ol className="space-y-1">
              {g.events.map((ev) => {
                const i = globalIdx++;
                return (
                  <li
                    key={ev.id}
                    className="ast-fade-rise flex items-center gap-3 py-2 border-b last:border-0"
                    style={
                      {
                        borderColor: "var(--border-soft)",
                        "--i": i,
                        animationDelay: `calc(var(--i) * 40ms)`,
                      } as React.CSSProperties
                    }
                  >
                    <span
                      className="tabular text-[11px] shrink-0 font-mono"
                      style={{ color: "var(--text-lo)", minWidth: "7rem" }}
                    >
                      {fmtTime(ev.occurredAt, locale)}
                    </span>
                    <span
                      className="text-[12px] font-medium truncate shrink-0"
                      style={{ color: "var(--text-hi)", maxWidth: "40%" }}
                    >
                      {stepLabelByKey(ev.stepKey, locale)}
                    </span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--text-mid)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {eventLabel(ev.type, locale)}
                    </span>
                    <span className="text-[11px] truncate ml-auto" style={{ color: "var(--text-lo)" }}>
                      {sourceLabel(ev.source, locale)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Main Journey screen
   ============================================================ */

export function JourneyScreen() {
  const employeeId = useAppStore((s) => s.currentEmployeeId);
  const locale = useAppStore((s) => s.locale);

  const [data, setData] = useState<JourneyMeData | null>(null);
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use the pack's deterministic NOW (2024-10-19) so elapsed-hour and
      // band reads match the seeded events.
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

      try {
        const meJson: ApiEnvelope<MeData> = await meRes.json();
        if (meJson.ok && meJson.data) {
          setEvents(meJson.data.journeyEvents ?? []);
        }
      } catch {
        setEvents([]);
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

  const hasEvents = events.length > 0 || (data?.steps.some((s) => s.startedAt) ?? false);

  return (
    <div
      dir={dir}
      className="min-h-screen flex flex-col"
      style={{ background: "var(--surface-0)" }}
    >
      <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {loading ? (
          <JourneySkeleton />
        ) : error ? (
          <ErrorBanner
            message={error.message}
            requestId={error.requestId}
            onRetry={() => void load()}
            locale={locale}
          />
        ) : data ? (
          !hasEvents ? (
            <EmptyState employee={data.employee} locale={locale} onRetry={() => void load()} />
          ) : (
            <>
              <OrbitHeader data={data} locale={locale} />
              <StickyStageRail data={data} locale={locale} />
              <StepList data={data} events={events} locale={locale} />
              <Timeline events={events} locale={locale} />

              <p
                className="text-[11px] font-mono tabular text-center pt-2 pb-4"
                style={{ color: "var(--text-lo)" }}
              >
                {data.engineVersion} · {data.mapVersion} · {data.corpusVersion}
              </p>
            </>
          )
        ) : null}
      </main>
    </div>
  );
}

export default JourneyScreen;
