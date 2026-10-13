"use client";

/* ============================================================
   ASTROLABE — Judge Screen (prove the engine, PRD §18, §21)
   Three sub-views via `judgeView`:
     · scenarios — S1..S5 switcher + as-of clock slider
     · trace     — engine trace panel + BandSphere3D + side-by-side
                   read-only Today view
     · degraded  — L0..L4 simulator with banners
   The judge is a debugging instrument, not a UX surface — every
   engine decision is rendered explicitly with its reason.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Microscope,
  Activity,
  Layers,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  RotateCcw,
  Clock,
  Gauge,
  CircleDot,
  Cpu,
  ShieldOff,
  Ban,
  Eye,
  Info,
  Lock,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import { useAppStore, type DegradedLevel } from "@/lib/store/app-store";
import {
  BandChip,
  SignalBadge,
  type Band as BandT,
} from "@/components/astrolabe/widgets";
import { BandSphere3D } from "@/components/three/astrolabe";
import { Slider } from "@/components/ui/slider";
import { NOW as PACK_NOW, stages as ALL_STAGES } from "@/lib/data/pack";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

interface Scenario {
  id: string;
  employeeId: string;
  title: string;
  description: string;
}

interface EmployeeLite {
  id: string;
  ref: string;
  displayName: string;
  displayNameAr?: string;
  journeyType: "onboarding" | "mobility";
  stage: string;
  location: "DXB" | "AUH" | "REMOTE";
}

interface Assessment {
  employeeId: string;
  asOf: string;
  band: BandT;
  score: number;
  signals: { code: string; family: string; weight: number; description: string; evidenceRefs: string[]; hardTrip?: boolean; forceBlocked?: boolean }[];
  suppressedFamilies: string[];
  stage: string;
  dayInStage: number;
}

interface EngineTrace {
  stageInference: { stage: string; reason: string };
  signalsFired: { code: string; weight: number; family: string; evidence: string[] }[];
  signalsSuppressed: { family: string; reason: string }[];
  band: { score: number; band: BandT; hardTrips: string[]; forcedBlocked: boolean };
  nextBestStep: { stepKey: string; reason: string } | null;
  servedFrom: string;
  degraded: string[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string };
  error: { code: string; message: string; hint?: string } | null;
}

/* ---------- Stage labels ---------- */
const STAGE_LABELS: Record<string, { en: string; ar: string }> = Object.fromEntries(
  ALL_STAGES.map((s) => [s.key, { en: s.label, ar: s.labelAr }])
);

function stageLabel(key: string, locale: "en" | "ar"): string {
  const e = STAGE_LABELS[key];
  if (!e) return key;
  return locale === "ar" ? e.ar : e.en;
}

/* ---------- Degraded levels ---------- */
const DEGRADED: { id: DegradedLevel; en: string; ar: string; desc: string; descAr: string; color: string }[] = [
  {
    id: "L0",
    en: "Full",
    ar: "كامل",
    desc: "All systems normal. Live corpus, live writes, full reasoning.",
    descAr: "كل الأنظمة طبيعية. النصوص حية، الكتابة حية، الاستدلال كامل.",
    color: "var(--status-steady)",
  },
  {
    id: "L1",
    en: "Extractive",
    ar: "استخلاصي",
    desc: "Live corpus unreachable. Answers quote policy directly with citations. No paraphrasing.",
    descAr: "النصوص الحية غير متاحة. الإجابات تقتبس السياسة مباشرة مع الإشارات. لا إعادة صياغة.",
    color: "var(--brand-400)",
  },
  {
    id: "L2",
    en: "Curated",
    ar: "منسّق",
    desc: "Corpus degraded. Answers fall back to a small curated pack of common policies. May miss edge cases.",
    descAr: "النصوص متدهورة. تعود الإجابات إلى حزمة منسّقة صغيرة من السياسات الشائعة. قد تفوت الحالات الخاصة.",
    color: "var(--status-watch)",
  },
  {
    id: "L3",
    en: "Queued writes",
    ar: "كتابة مؤجلة",
    desc: "Writes are queued, not applied. Employees see 'queued' status. Reads still work.",
    descAr: "الكتابات في قائمة انتظار ولا تُطبّق. يرى الموظفون حالة «مؤجلة». القراءة لا تزال تعمل.",
    color: "var(--accent-500)",
  },
  {
    id: "L4",
    en: "Safe read-only",
    ar: "قراءة فقط",
    desc: "All writes disabled. The instrument shows who to contact instead of acting.",
    descAr: "كل الكتابات معطّلة. تُظهر الأداة من تتواصل معه بدلاً من التصرف.",
    color: "var(--status-friction)",
  },
];

/* ---------- Skeletons ---------- */
function TraceSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="ast-card p-6 h-32 ast-shimmer rounded-[14px]" />
      <div className="ast-card p-6 h-72 ast-shimmer rounded-[14px]" />
      <div className="ast-card p-6 h-48 ast-shimmer rounded-[14px]" />
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
          The trace can&apos;t be loaded right now.
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

/* ---------- Sub-view tabs ---------- */
function JudgeTabs() {
  const locale = useAppStore((s) => s.locale);
  const view = useAppStore((s) => s.judgeView);
  const setView = useAppStore((s) => s.setJudgeView);
  const TABS: { id: typeof view; label: string; labelAr: string; Icon: typeof Microscope }[] = [
    { id: "scenarios", label: "Scenarios", labelAr: "السيناريوهات", Icon: Layers },
    { id: "trace", label: "Trace", labelAr: "الأثر", Icon: Activity },
    { id: "degraded", label: "Degraded", labelAr: "المتدهور", Icon: Cpu },
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

/* ---------- As-of clock ---------- */
function AsOfClock() {
  const locale = useAppStore((s) => s.locale);
  const offsetHours = useAppStore((s) => s.asOfOffsetHours);
  const setOffset = useAppStore((s) => s.setAsOfOffset);

  const asOf = useMemo(() => {
    return new Date(PACK_NOW.getTime() + offsetHours * 3600 * 1000);
  }, [offsetHours]);

  const offsetDays = offsetHours / 24;

  return (
    <div className="ast-card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] font-medium" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "ساعة التقدير" : "Assessment clock"}
          </p>
          <p className="text-[28px] font-semibold tabular mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">
            {format(asOf, "EEE d MMM yyyy · HH:mm")}
          </p>
          <p className="text-[12px] mt-1 tabular" style={{ color: "var(--text-mid)" }}>
            {offsetHours === 0
              ? (locale === "ar" ? "الوقت المرجعي للنموذج" : "Pack reference time (now)")
              : offsetHours > 0
              ? (locale === "ar" ? `بعد ${offsetDays.toFixed(1)} يوم` : `+${offsetDays.toFixed(1)} days from now`)
              : (locale === "ar" ? `قبل ${Math.abs(offsetDays).toFixed(1)} يوم` : `${Math.abs(offsetDays).toFixed(1)} days ago`)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "الإزاحة" : "Offset"}
          </p>
          <p className="text-[20px] font-mono tabular" style={{ color: "var(--brand-400)" }} dir="ltr">
            {offsetHours > 0 ? "+" : ""}{offsetHours}h
          </p>
        </div>
      </div>

      <Slider
        value={[offsetHours]}
        min={-240}
        max={240}
        step={6}
        onValueChange={(v) => setOffset(v[0])}
        className="ast-focus"
        aria-label="As-of offset hours"
      />
      <div className="flex items-center justify-between mt-2 text-[11px] tabular" style={{ color: "var(--text-lo)" }}>
        <span>{locale === "ar" ? "−10 أيام" : "−10 days"}</span>
        <span>{locale === "ar" ? "الآن" : "now"}</span>
        <span>{locale === "ar" ? "+10 أيام" : "+10 days"}</span>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => setOffset(0)}
          className="ast-focus inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[11px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
        >
          <Clock className="w-3 h-3" strokeWidth={1.75} />
          {locale === "ar" ? "إعادة للآن" : "Reset to now"}
        </button>
        {[-72, -24, 24, 72].map((h) => (
          <button
            key={h}
            onClick={() => setOffset(h)}
            className="ast-focus h-8 px-2.5 rounded-full text-[11px] font-medium tabular"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
          >
            {h > 0 ? "+" : ""}{h}h
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Scenarios view
   ============================================================ */
function ScenariosView({ onLoad }: { onLoad: (employeeId: string) => void }) {
  const locale = useAppStore((s) => s.locale);
  const setEmployee = useAppStore((s) => s.setEmployee);
  const setOffset = useAppStore((s) => s.setAsOfOffset);
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [employees, setEmployees] = useState<Record<string, EmployeeLite> | null>(null);
  const [previewAssess, setPreviewAssess] = useState<Record<string, Assessment | null>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [scRes, empRes] = await Promise.all([
        fetch("/api/v1/scenarios", { cache: "no-store" }),
        fetch("/api/v1/employees", { cache: "no-store" }),
      ]);
      if (!scRes.ok || !empRes.ok) throw new Error("HTTP error");
      const scJson: ApiEnvelope<{ scenarios: Scenario[] }> = await scRes.json();
      const empJson: ApiEnvelope<{ items: EmployeeLite[] }> = await empRes.json();
      if (!scJson.ok || !scJson.data || !empJson.ok || !empJson.data) {
        throw new Error(scJson.error?.message ?? empJson.error?.message ?? "Unknown error");
      }
      setScenarios(scJson.data.scenarios);
      const map: Record<string, EmployeeLite> = {};
      for (const e of empJson.data.items) map[e.id] = e;
      setEmployees(map);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Live preview assessment for selected scenario (recomputes with asOf offset)
  const offsetHours = useAppStore((s) => s.asOfOffsetHours);
  useEffect(() => {
    if (!selectedId || !scenarios) return;
    const sc = scenarios.find((s) => s.id === selectedId);
    if (!sc) return;
    const asOf = new Date(PACK_NOW.getTime() + offsetHours * 3600 * 1000).toISOString();
    let cancelled = false;
    fetch(`/api/v1/journey/${encodeURIComponent(sc.employeeId)}/assessment?asOf=${encodeURIComponent(asOf)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: ApiEnvelope<{ assessment: Assessment; trace: EngineTrace }>) => {
        if (cancelled) return;
        if (json.ok && json.data) {
          setPreviewAssess((prev) => ({ ...prev, [sc.id]: json.data!.assessment }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, scenarios, offsetHours]);

  const handleLoad = useCallback((sc: Scenario) => {
    setEmployee(sc.employeeId);
    onLoad(sc.employeeId);
  }, [onLoad, setEmployee]);

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        <div className="ast-card h-24 ast-shimmer rounded-[14px]" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="ast-card p-4 h-24 ast-shimmer rounded-[12px]" />
        ))}
      </div>
    );
  }
  if (err) return <ErrorBanner message={err} onRetry={fetchAll} />;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "السيناريوهات الخمسة" : "Five scenarios"}
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
          {locale === "ar"
            ? "كل بطاقة تُحمّل موظفاً في الأداة وتعرض التصنيف المتوقع. حرّك الساعة لرؤية المحرك يعيد التقييم."
            : "Each card loads an employee into the instrument and previews the expected band. Drag the clock to watch the engine re-assess."}
        </p>
      </div>

      <AsOfClock />

      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {scenarios?.map((sc) => {
          const emp = employees?.[sc.employeeId];
          const a = previewAssess[sc.id];
          const isSelected = selectedId === sc.id;
          return (
            <motion.li
              key={sc.id}
              initial={false}
              whileHover={{ y: -2 }}
              onClick={() => { setSelectedId(sc.id); setEmployee(sc.employeeId); }}
              className={cn("ast-card p-4 sm:p-5 cursor-pointer ast-focus transition-colors")}
              style={{
                borderColor: isSelected ? "rgba(22,154,165,0.40)" : "var(--border)",
                background: isSelected ? "rgba(22,154,165,0.04)" : "var(--surface-1)",
              }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono text-[12px] tabular px-2 py-0.5 rounded"
                    style={{ background: "var(--surface-3)", color: "var(--brand-400)" }}
                  >
                    {sc.id}
                  </span>
                  <h3 className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
                    {sc.title}
                  </h3>
                </div>
                {a && <BandChip band={a.band} score={a.score} locale={locale} size="sm" />}
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
                {sc.description}
              </p>
              <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                <p className="text-[11px] font-mono tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
                  {sc.employeeId}{emp ? ` · ${emp.displayName}` : ""}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); handleLoad(sc); }}
                  className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium"
                  style={{
                    background: "var(--brand-500)",
                    color: "var(--surface-0)",
                    border: "1px solid var(--brand-500)",
                  }}
                >
                  <PlayCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                  {locale === "ar" ? "حمّل السيناريو" : "Load scenario"}
                </button>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

/* ============================================================
   Trace view
   ============================================================ */
function TraceView({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const locale = useAppStore((s) => s.locale);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const offsetHours = useAppStore((s) => s.asOfOffsetHours);

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [trace, setTrace] = useState<EngineTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchTrace = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const asOf = new Date(PACK_NOW.getTime() + offsetHours * 3600 * 1000).toISOString();
      const res = await fetch(`/api/v1/journey/${encodeURIComponent(employeeId)}/assessment?asOf=${encodeURIComponent(asOf)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<{ assessment: Assessment; trace: EngineTrace }> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      setAssessment(json.data.assessment);
      setTrace(json.data.trace);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [employeeId, offsetHours]);

  useEffect(() => { fetchTrace(); }, [fetchTrace]);

  if (loading) return <TraceSkeleton />;
  if (err || !assessment || !trace) {
    return <ErrorBanner message={err ?? "No data"} onRetry={fetchTrace} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={onBack}
          className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "السيناريوهات" : "Scenarios"}
        </button>
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "أثر المحرك" : "Engine trace"}
        </h2>
        <span className="text-[11px] font-mono tabular ml-auto" style={{ color: "var(--text-lo)" }} dir="ltr">
          {employeeId}
        </span>
      </div>

      <AsOfClock />

      {/* Side-by-side: trace | employee today */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Trace panel */}
        <div className="space-y-4">
          {/* Band readout + 3D sphere */}
          <section className="ast-card p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="text-[11px] uppercase tracking-[0.14em] font-medium" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "حكم التصنيف" : "Band verdict"}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <BandChip band={assessment.band} score={assessment.score} locale={locale} size="lg" />
                  {trace.band.forcedBlocked && (
                    <span className="ast-chip" style={{ color: "var(--status-blocked)", background: "rgba(159,18,57,0.12)", borderColor: "rgba(159,18,57,0.40)" }}>
                      <Ban className="w-3 h-3" strokeWidth={2} />
                      {locale === "ar" ? "إجباري محظور" : "Forced blocked"}
                    </span>
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <dt className="uppercase tracking-[0.1em] text-[10px]" style={{ color: "var(--text-lo)" }}>{locale === "ar" ? "النتيجة" : "Score"}</dt>
                    <dd className="font-mono tabular text-[18px]" style={{ color: "var(--text-hi)" }}>{trace.band.score}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-[0.1em] text-[10px]" style={{ color: "var(--text-lo)" }}>{locale === "ar" ? "رحلات صلبة" : "Hard trips"}</dt>
                    <dd className="font-mono tabular text-[18px]" style={{ color: trace.band.hardTrips.length > 0 ? "var(--status-blocked)" : "var(--text-hi)" }}>
                      {trace.band.hardTrips.length}
                    </dd>
                  </div>
                </dl>
                {trace.band.hardTrips.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {trace.band.hardTrips.map((code) => (
                      <span key={code} className="ast-chip font-mono text-[11px]" style={{ color: "var(--status-blocked)" }}>
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {/* 3D sphere */}
              <div
                className="w-28 h-28 sm:w-36 sm:h-36 shrink-0 rounded-full"
                style={{ background: "var(--surface-2)" }}
              >
                {!reducedMotion && <BandSphere3D band={assessment.band} />}
              </div>
            </div>
          </section>

          {/* Stage inference */}
          <section className="ast-card p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "استدلال المرحلة" : "Stage inference"}
              </h3>
            </div>
            <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
              {stageLabel(trace.stageInference.stage, locale)}
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-mid)" }}>
              {trace.stageInference.reason}
            </p>
          </section>

          {/* Signals fired table */}
          <section className="ast-card p-5 sm:p-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "الإشارات المُطلقة" : "Signals fired"}
                </h3>
              </div>
              <span className="text-[11px] tabular" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? `${trace.signalsFired.length} إشارة` : `${trace.signalsFired.length} signals`}
              </span>
            </div>

            {trace.signalsFired.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
                {locale === "ar" ? "لا إشارات." : "No signals fired."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>{locale === "ar" ? "الكود" : "Code"}</th>
                      <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>{locale === "ar" ? "العائلة" : "Family"}</th>
                      <th className="text-right p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>{locale === "ar" ? "الوزن" : "Weight"}</th>
                      <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium hidden sm:table-cell" style={{ color: "var(--text-lo)" }}>{locale === "ar" ? "الأدلة" : "Evidence"}</th>
                      <th className="text-center p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>{locale === "ar" ? "صلبة" : "Hard"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.signalsFired
                      .slice()
                      .sort((a, b) => b.weight - a.weight)
                      .map((s, i) => {
                        const hard = s.code.startsWith("DP") || s.code.startsWith("MB");
                        return (
                          <tr key={`${s.code}-${i}`} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                            <td className="p-2"><SignalBadge code={s.code} weight={s.weight} hardTrip={hard} /></td>
                            <td className="p-2 font-mono text-[11px]" style={{ color: "var(--text-mid)" }} dir="ltr">{s.family}</td>
                            <td className="p-2 text-right tabular font-mono" style={{ color: "var(--text-hi)" }}>{s.weight}</td>
                            <td className="p-2 hidden sm:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {s.evidence.slice(0, 3).map((e, i) => (
                                  <span key={i} className="font-mono text-[10px] tabular px-1.5 py-0.5 rounded" style={{ background: "var(--surface-2)", color: "var(--text-lo)" }} dir="ltr">
                                    {e.length > 28 ? e.slice(0, 28) + "…" : e}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              {hard ? (
                                <Ban className="w-3.5 h-3.5 inline-block" strokeWidth={2} style={{ color: "var(--status-blocked)" }} />
                              ) : (
                                <span className="text-[11px]" style={{ color: "var(--text-lo)" }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Suppressed families */}
          {trace.signalsSuppressed.length > 0 && (
            <section className="ast-card p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <ShieldOff className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--status-watch)" }} />
                <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "العائلات المكتومة" : "Suppressed families"}
                </h3>
              </div>
              <ul className="space-y-2">
                {trace.signalsSuppressed.map((s) => (
                  <li key={s.family} className="ast-card-2 p-3 flex items-start gap-3">
                    <span className="font-mono text-[12px] px-2 py-0.5 rounded" style={{ background: "var(--surface-3)", color: "var(--status-watch)" }} dir="ltr">{s.family}</span>
                    <p className="text-[12px] flex-1" style={{ color: "var(--text-mid)" }}>{s.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Next best step */}
          {trace.nextBestStep && (
            <section className="ast-card p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <CircleDot className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--accent-500)" }} />
                <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "الخطوة الأفضل التالية" : "Next best step"}
                </h3>
              </div>
              <p className="text-[14px] font-mono font-medium" style={{ color: "var(--accent-500)" }} dir="ltr">{trace.nextBestStep.stepKey}</p>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-mid)" }}>{trace.nextBestStep.reason}</p>
            </section>
          )}

          {/* Provenance */}
          <section className="ast-card-2 p-4 flex items-center gap-3 flex-wrap">
            <Cpu className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "المصدر" : "Served from"}
            </span>
            <span className="text-[12px] font-mono tabular" style={{ color: "var(--text-hi)" }} dir="ltr">{trace.servedFrom}</span>
            {trace.degraded.length > 0 && (
              <>
                <span className="mx-1 text-[11px]" style={{ color: "var(--text-lo)" }}>·</span>
                <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "المتدهور" : "Degraded"}
                </span>
                <div className="flex gap-1.5 flex-wrap">
                  {trace.degraded.map((d) => (
                    <span key={d} className="ast-chip font-mono text-[10px]" style={{ color: "var(--status-watch)" }}>{d}</span>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        {/* Side-by-side: employee Today (read-only) */}
        <aside>
          <div className="ast-card p-5 sm:p-6 sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "ما يراه الموظف" : "What the employee sees"}
              </h3>
              <span className="text-[10px] uppercase tracking-[0.1em] ml-auto" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "للقراءة فقط" : "read-only"}
              </span>
            </div>
            <EmployeeTodayReadOnly assessment={assessment} trace={trace} employeeId={employeeId} />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- Read-only Today summary for side-by-side ---------- */
function EmployeeTodayReadOnly({
  assessment,
  trace,
  employeeId,
}: {
  assessment: Assessment;
  trace: EngineTrace;
  employeeId: string;
}) {
  const locale = useAppStore((s) => s.locale);

  const topSignals = assessment.signals
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const nbs = trace.nextBestStep;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--text-lo)" }}>
          {locale === "ar" ? "الموظف" : "Employee"}
        </p>
        <p className="text-[16px] font-medium" style={{ color: "var(--text-hi)" }}>
          {employeeId}
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
          {stageLabel(assessment.stage, locale)}
          <span className="mx-1.5">·</span>
          <span className="tabular">
            {locale === "ar" ? `يوم ${assessment.dayInStage}` : `Day ${assessment.dayInStage}`}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <BandChip band={assessment.band} score={assessment.score} locale={locale} size="md" />
        <span className="text-[11px] tabular" style={{ color: "var(--text-lo)" }}>
          {locale === "ar" ? `النتيجة ${assessment.score}` : `score ${assessment.score}`}
        </span>
      </div>

      {/* Next best step (sand-gold) */}
      {nbs && (
        <div
          className="p-4 rounded-[12px]"
          style={{
            background: "rgba(201,162,39,0.06)",
            border: "1px solid rgba(201,162,39,0.30)",
          }}
        >
          <p className="text-[11px] uppercase tracking-[0.14em] font-medium" style={{ color: "var(--accent-500)" }}>
            {locale === "ar" ? "خطوتك التالية" : "Your next move"}
          </p>
          <p className="text-[14px] font-medium mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">
            {nbs.stepKey}
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-mid)" }}>{nbs.reason}</p>
        </div>
      )}

      {/* Top signals */}
      {topSignals.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "أبرز الإشارات" : "Top signals"}
          </p>
          <ul className="space-y-1.5">
            {topSignals.map((s, i) => (
              <li key={`${s.code}-${i}`} className="flex items-start gap-2">
                <SignalBadge code={s.code} weight={s.weight} hardTrip={s.hardTrip} />
                <span className="text-[11px] flex-1 leading-snug" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? s.description : s.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suppressed disclosure */}
      {assessment.suppressedFamilies.length > 0 && (
        <div className="ast-card-2 p-3 flex items-start gap-2" style={{ borderColor: "rgba(217,119,6,0.32)" }}>
          <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-watch)" }} />
          <p className="text-[11px]" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? `عائلات مكتومة: ${assessment.suppressedFamilies.join(", ")}`
              : `Suppressed families: ${assessment.suppressedFamilies.join(", ")}`}
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Degraded simulator
   ============================================================ */
function DegradedView() {
  const locale = useAppStore((s) => s.locale);
  const level = useAppStore((s) => s.degradedLevel);
  const setLevel = useAppStore((s) => s.setDegradedLevel);

  const current = DEGRADED.find((d) => d.id === level) ?? DEGRADED[0];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "محاكي التدهور" : "Degraded simulator"}
        </h2>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
          {locale === "ar"
            ? "اضبط مستوى التدهور لرؤية كيف تتصرف الأداة في كل وضع. ينعكس على كل الشاشات."
            : "Set the degraded level to see how the instrument behaves in each mode. Reflected across all surfaces."}
        </p>
      </div>

      {/* Level buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {DEGRADED.map((d) => {
          const isActive = level === d.id;
          return (
            <button
              key={d.id}
              onClick={() => { setLevel(d.id); toast(`Degraded level set to ${d.id} — ${d.en}`, { description: d.desc }); }}
              className="ast-focus p-3 rounded-[10px] text-left transition-colors"
              style={{
                background: isActive ? "rgba(22,154,165,0.10)" : "var(--surface-2)",
                border: `1px solid ${isActive ? "rgba(22,154,165,0.40)" : "var(--border)"}`,
                color: isActive ? "var(--text-hi)" : "var(--text-mid)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: d.color }}
                />
                <span className="font-mono text-[13px] tabular" style={{ color: isActive ? "var(--text-hi)" : "var(--text-mid)" }}>
                  {d.id}
                </span>
                {isActive && <CheckCircle2 className="w-3.5 h-3.5 ml-auto" strokeWidth={2} style={{ color: "var(--brand-400)" }} />}
              </div>
              <p className="text-[12px] font-medium" style={{ color: isActive ? "var(--text-hi)" : "var(--text-mid)" }}>
                {locale === "ar" ? d.ar : d.en}
              </p>
            </button>
          );
        })}
      </div>

      {/* Current-level banner */}
      <motion.section
        key={level}
        initial={false}
        animate={{ opacity: 1 }}
        className="ast-card p-5 sm:p-6"
        style={{
          borderColor: `${current.color}55`,
          background: `${current.color}0A`,
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
            style={{ background: `${current.color}1A`, color: current.color }}
          >
            <Cpu className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-[0.14em] font-medium" style={{ color: current.color }}>
              {locale === "ar" ? `المستوى ${current.id}` : `Level ${current.id}`} · {locale === "ar" ? current.ar : current.en}
            </p>
            <p className="text-[14px] mt-1" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? current.descAr : current.desc}
            </p>
          </div>
        </div>
      </motion.section>

      {/* Level-specific behaviour simulations */}
      <AnimatePresence mode="wait">
        {level === "L1" && (
          <motion.div
            key="L1"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="ast-card-2 p-4 flex items-start gap-3"
            style={{ borderColor: "rgba(22,154,165,0.32)", background: "rgba(22,154,165,0.06)" }}
          >
            <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "محاكاة Ask" : "Ask simulation"}
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-mid)" }}>
                {locale === "ar"
                  ? "كل إجابة تُظهر لافتة: «أقتبس السياسة مباشرة الآن» — لا إعادة صياغة، إشارات فقط."
                  : "Every answer shows the banner: \"Quoting policy directly right now\" — no paraphrasing, citations only."}
              </p>
            </div>
          </motion.div>
        )}
        {level === "L4" && (
          <motion.div
            key="L4"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="ast-card-2 p-4 flex items-start gap-3"
            style={{ borderColor: "rgba(220,38,38,0.32)", background: "rgba(220,38,38,0.06)" }}
          >
            <Lock className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-friction)" }} />
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "وضع القراءة فقط" : "Read-only mode"}
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-mid)" }}>
                {locale === "ar"
                  ? "كل عمليات الكتابة معطّلة. تُظهر الأداة: «وضع القراءة فقط — إليك من تتواصل معه». زر الإرسال وموافقة النبضة معطّلة."
                  : "All write actions disabled. The instrument shows: \"Read-only mode — here is who to contact\". Submit buttons and pulse consent are disabled."}
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  disabled
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium opacity-50 cursor-not-allowed"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
                >
                  {locale === "ar" ? "إرسال (معطّل)" : "Send (disabled)"}
                </button>
                <button
                  disabled
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium opacity-50 cursor-not-allowed"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
                >
                  {locale === "ar" ? "تفعيل النبضة (معطّل)" : "Enable pulse (disabled)"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* All-level reference */}
      <section className="ast-card p-5 sm:p-6">
        <h3 className="text-[14px] font-semibold mb-3" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "مرجع المستويات" : "Level reference"}
        </h3>
        <ul className="space-y-2">
          {DEGRADED.map((d) => (
            <li key={d.id} className="ast-card-2 p-3 flex items-start gap-3">
              <span
                className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                style={{ background: d.color }}
              />
              <div className="flex-1">
                <p className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                  <span className="font-mono">{d.id}</span> · {locale === "ar" ? d.ar : d.en}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? d.descAr : d.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ============================================================
   Root
   ============================================================ */
export function JudgeScreen() {
  const locale = useAppStore((s) => s.locale);
  const view = useAppStore((s) => s.judgeView);
  const setView = useAppStore((s) => s.setJudgeView);
  const employeeId = useAppStore((s) => s.currentEmployeeId);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const handleLoadScenario = useCallback(() => {
    setView("trace");
  }, [setView]);

  return (
    <div
      dir={dir}
      className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10"
    >
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--brand-400)" }}>
            <Microscope className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{locale === "ar" ? "وحدة القاضي" : "Judge console"}</span>
          </div>
          <h1 className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-tight" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "أثبت أن المحرك يعمل" : "Prove the engine"}
          </h1>
        </div>
        <JudgeTabs />
      </header>

      {view === "scenarios" && <ScenariosView onLoad={handleLoadScenario} />}
      {view === "trace" && <TraceView employeeId={employeeId} onBack={() => setView("scenarios")} />}
      {view === "degraded" && <DegradedView />}
    </div>
  );
}
