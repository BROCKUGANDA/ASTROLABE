"use client";

/* ============================================================
   ASTROLABE — HRBP Screen (early-warning console, PRD §10, §14)
   Three sub-views via `hrbpView`:
     · queue    — ranked band-severity list with claim + open-packet
     · employee — escalation packet preview with consent statement
     · stalls   — stage × owner-group heatmap with k≥5 suppression
   HRBP queue never shows free-text comments. Pulse summary only
   shared when employee opted in (server-enforced).
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  ListOrdered,
  User,
  Grid3X3,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
  Clock,
  Hand,
  Send,
  Edit3,
  UserCog,
  ShieldCheck,
  Lock,
  CheckCircle2,
  ArrowLeft,
  Info,
  Hourglass,
  Filter,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import {
  BandChip,
  SignalBadge,
  StatusChip,
  type Band as BandT,
} from "@/components/astrolabe/widgets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hrbps as ALL_HRBPS } from "@/lib/data/pack";

/* ---------- Types ---------- */

type Purpose = "journey_assistance" | "pulse_capture" | "share_pulse_summary" | "comment_retention" | "aggregate_analytics" | "manager_visibility";

interface QueueItem {
  employeeId: string;
  employeeName: string;
  journeyType: "onboarding" | "mobility";
  stage: string;
  band: BandT;
  score: number;
  topSignals: { code: string; weight: number; description: string }[];
  leadTimeHours: number;
  suggestedOwner: { id: string; name: string; role: string; email: string } | null;
}

interface Assessment {
  employeeId: string;
  asOf: string;
  band: BandT;
  score: number;
  signals: { code: string; family: string; weight: number; description: string; descriptionAr: string; evidenceRefs: string[]; hardTrip?: boolean; forceBlocked?: boolean }[];
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

interface EscalationPacket {
  id: string;
  employeeId: string;
  employeeName: string;
  journeyType: string;
  stage: string;
  dayInStage: number;
  locale: string;
  band: string;
  score: number;
  topSignals: { code: string; weight: number; description: string; evidenceRefs: string[] }[];
  timeline: { occurredAt: string; stepKey: string; type: string; targetVsActual?: string }[];
  blockedDownstream: string[];
  openRequests: { ref: string; type: string; ownerGroup: string; ageHours: number; reassignCount: number }[];
  decisionRequested: string;
  namedOwner: { id: string; name: string; role: string; email: string };
  backupOwner?: { id: string; name: string; role: string; email: string };
  consentStatement: {
    sharedWithHrbp: string[];
    withheld: string[];
    freeTextExcluded: boolean;
  };
  createdAt: string;
}

interface StallsCell {
  stage: string;
  ownerGroup: string;
  suppressed: boolean;
  reason?: string;
  n?: number;
  employeeCount?: number;
  medianTimeToCompleteHours?: number;
  breachRate?: number;
  reassignmentRate?: number;
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

function bandSortIndex(b: BandT): number {
  return { steady: 0, watch: 1, friction: 2, blocked: 3 }[b];
}

/* ============================================================
   Skeleton
   ============================================================ */
function QueueSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="ast-card p-4 h-24 ast-shimmer rounded-[12px]" />
      ))}
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
          The queue can&apos;t be loaded right now.
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

/* ============================================================
   Sub-view tabs
   ============================================================ */
function HrbpTabs() {
  const locale = useAppStore((s) => s.locale);
  const view = useAppStore((s) => s.hrbpView);
  const setView = useAppStore((s) => s.setHrbpView);
  const TABS: { id: typeof view; label: string; labelAr: string; Icon: typeof ListOrdered }[] = [
    { id: "queue", label: "Queue", labelAr: "القائمة", Icon: ListOrdered },
    { id: "employee", label: "Packet", labelAr: "الطرد", Icon: User },
    { id: "stalls", label: "Stalls", labelAr: "الاختناقات", Icon: Grid3X3 },
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
   Queue view
   ============================================================ */
function QueueView({ onOpenPacket }: { onOpenPacket: (employeeId: string) => void }) {
  const locale = useAppStore((s) => s.locale);
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchQ = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/v1/hrbp/queue", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<{ items: QueueItem[] }> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      setItems(json.data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQ(); }, [fetchQ]);

  const handleClaim = useCallback(async (item: QueueItem) => {
    setClaiming(item.employeeId);
    // Fake audit-event write — there's no API yet, so we just simulate the receipt.
    await new Promise((r) => setTimeout(r, 320));
    toast.success("Case claimed by Fatima — employee notified", {
      description: `${item.employeeName} · ${item.employeeId}`,
    });
    setClaiming(null);
  }, []);

  if (loading) return <QueueSkeleton />;
  if (err) return <ErrorBanner message={err} onRetry={fetchQ} />;
  if (!items) return null;

  const active = items.filter((i) => bandSortIndex(i.band) >= 2); // friction + blocked
  const rest = items.filter((i) => bandSortIndex(i.band) < 2);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "قائمة أول من يحتاج مساعدة" : "Who needs help first"}
          </h2>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? `${active.length} موظف في احتكاك أو أعلى اليوم.`
              : `${active.length} employee${active.length === 1 ? "" : "s"} in Friction or above today.`}
          </p>
        </div>
        <button
          onClick={fetchQ}
          className="ast-focus inline-flex items-center gap-2 h-9 px-3 rounded-full text-[12px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "تحديث" : "Refresh"}
        </button>
      </div>

      {active.length === 0 ? (
        <div className="ast-card p-10 flex flex-col items-center text-center">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full mb-4"
            style={{ background: "rgba(14,159,110,0.10)", color: "var(--status-steady)" }}
          >
            <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "لا أحد في احتكاك أو أعلى اليوم." : "No one in Friction or above today."}
          </p>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "تحقق لاحقاً، أو تصفّح بقية القائمة أدناه." : "Check back later, or browse the watch list below."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3 mb-8">
          {active.map((item, i) => (
            <QueueRow
              key={item.employeeId}
              item={item}
              rank={i + 1}
              claiming={claiming === item.employeeId}
              onClaim={() => handleClaim(item)}
              onOpen={() => onOpenPacket(item.employeeId)}
            />
          ))}
        </ul>
      )}

      {/* Watch + steady (collapsed by default-ish) */}
      {rest.length > 0 && (
        <details className="ast-card p-4" style={{ borderColor: "var(--border-soft)" }}>
          <summary className="cursor-pointer text-[13px] font-medium flex items-center gap-2" style={{ color: "var(--text-mid)" }}>
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            {locale === "ar"
              ? `${rest.length} موظف تحت المراقبة أو مستقر`
              : `${rest.length} on watch or steady`}
          </summary>
          <ul className="mt-3 space-y-2">
            {rest.map((item, i) => (
              <QueueRow
                key={item.employeeId}
                item={item}
                rank={active.length + i + 1}
                claiming={claiming === item.employeeId}
                onClaim={() => handleClaim(item)}
                onOpen={() => onOpenPacket(item.employeeId)}
                compact
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function QueueRow({
  item,
  rank,
  claiming,
  onClaim,
  onOpen,
  compact = false,
}: {
  item: QueueItem;
  rank: number;
  claiming: boolean;
  onClaim: () => void;
  onOpen: () => void;
  compact?: boolean;
}) {
  const locale = useAppStore((s) => s.locale);
  const leadDays = Math.max(0, Math.round(item.leadTimeHours / 24));
  return (
    <motion.li
      initial={false}
      className={cn("ast-card p-4 sm:p-5", compact && "p-3")}
    >
      <div className="flex items-start gap-3 sm:gap-4 flex-wrap">
        {/* Rank + band */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[12px] tabular font-mono" style={{ color: "var(--text-lo)" }}>
            #{rank}
          </span>
          <BandChip band={item.band} score={item.score} locale={locale} size="lg" />
        </div>

        {/* Name + stage */}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium truncate" style={{ color: "var(--text-hi)" }}>
            {item.employeeName}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
            {stageLabel(item.stage, locale)}
            <span className="mx-1.5">·</span>
            <span className="tabular">
              {locale === "ar"
                ? `أول إشارة قبل ${leadDays} يوم`
                : `first signal ${leadDays} day${leadDays === 1 ? "" : "s"} ago`}
            </span>
          </p>

          {/* Top signals */}
          {item.topSignals.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {item.topSignals.map((s, i) => (
                <SignalBadge
                  key={`${s.code}-${i}`}
                  code={s.code}
                  weight={s.weight}
                  hardTrip={s.code.startsWith("DP") || s.code.startsWith("MB")}
                />
              ))}
            </div>
          )}
        </div>

        {/* Suggested owner + actions */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {item.suggestedOwner && (
            <div className="hidden md:flex flex-col items-end text-right">
              <span className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "المقترح" : "Suggested"}
              </span>
              <span className="text-[12px] font-medium" style={{ color: "var(--text-hi)" }}>
                {item.suggestedOwner.name}
              </span>
            </div>
          )}
          <button
            onClick={onClaim}
            disabled={claiming}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-hi)",
            }}
          >
            <Hand className="w-3.5 h-3.5" strokeWidth={1.75} />
            {claiming
              ? (locale === "ar" ? "..." : "Claiming…")
              : (locale === "ar" ? "تولّى" : "Claim")}
          </button>
          <button
            onClick={onOpen}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium transition-colors"
            style={{
              background: "var(--brand-500)",
              color: "var(--surface-0)",
              border: "1px solid var(--brand-500)",
            }}
          >
            {locale === "ar" ? "افتح الطرد" : "Open packet"}
            <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </motion.li>
  );
}

/* ============================================================
   Employee (escalation packet) view
   ============================================================ */
function EmployeeView({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const locale = useAppStore((s) => s.locale);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [trace, setTrace] = useState<EngineTrace | null>(null);
  const [packet, setPacket] = useState<EscalationPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [decision, setDecision] = useState("");
  const [sharePulse, setSharePulse] = useState(false);
  const [namedOwnerId, setNamedOwnerId] = useState<string>("HRBP-1");
  const [editMode, setEditMode] = useState(false);
  const [building, setBuilding] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchAssessment = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/journey/${encodeURIComponent(employeeId)}/assessment`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<{ assessment: Assessment; trace: EngineTrace }> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      setAssessment(json.data.assessment);
      setTrace(json.data.trace);
      // Default decision text
      const a = json.data.assessment;
      const top = a.signals.sort((x, y) => y.weight - x.weight)[0];
      setDecision(
        locale === "ar"
          ? `يرجى مراجعة ${top?.code ?? "الوضع"} لموظف في ${stageLabel(a.stage, "ar")} — التصنيف ${a.band}.`
          : `Please review ${top?.code ?? "the situation"} for an employee in ${stageLabel(a.stage, "en")} — band ${a.band}.`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [employeeId, locale]);

  useEffect(() => { fetchAssessment(); }, [fetchAssessment]);

  // Pulse-suppressed banner
  const pulseSuppressed = useMemo(() => {
    if (!trace) return false;
    return trace.signalsSuppressed.some((s) => s.family === "PS");
  }, [trace]);

  const buildPacket = useCallback(async () => {
    setBuilding(true);
    setErr(null);
    try {
      const res = await fetch("/api/v1/escalations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId,
          decisionRequested: decision,
          sharePulseSummary: sharePulse,
          namedOwnerId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<EscalationPacket> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      setPacket(json.data);
      setEditMode(false);
      toast.success("Packet built", { description: json.data.id });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
      toast.error("Could not build packet");
    } finally {
      setBuilding(false);
    }
  }, [decision, employeeId, namedOwnerId, sharePulse]);

  const handleSend = useCallback(async () => {
    setSending(true);
    await new Promise((r) => setTimeout(r, 420));
    setSending(false);
    setSent(true);
    setConfirmOpen(false);
    toast.success("Packet sent", {
      description: `Employee notified: "I've asked Fatima in HR to step in. She'll reply today."`,
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <div className="h-10 ast-shimmer rounded-full" />
        <div className="ast-card p-6 h-40 ast-shimmer rounded-[14px]" />
        <div className="ast-card p-6 h-72 ast-shimmer rounded-[14px]" />
      </div>
    );
  }
  if (err) return <ErrorBanner message={err} onRetry={fetchAssessment} />;

  return (
    <div>
      {/* Back + heading */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "القائمة" : "Queue"}
        </button>
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "طرد التصعيد" : "Escalation packet"}
        </h2>
        {assessment && (
          <BandChip band={assessment.band} score={assessment.score} locale={locale} size="md" />
        )}
      </div>

      {/* Consent-limited notice */}
      {pulseSuppressed && (
        <div
          className="ast-card-2 p-3 mb-4 flex items-start gap-3"
          style={{ borderColor: "rgba(217,119,6,0.32)", background: "rgba(217,119,6,0.06)" }}
        >
          <Lock className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-watch)" }} />
          <p className="text-[13px]" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "نبضة مكتومة — يستخدم هذا العرض بيانات الرحلة والطلبات فقط."
              : "Pulse signals are suppressed — this view uses journey and request data only."}
          </p>
        </div>
      )}

      {/* Sent success state */}
      {sent && packet ? (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="ast-card p-6 mb-4"
          style={{ borderColor: "rgba(14,159,110,0.32)" }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-full shrink-0"
              style={{ background: "rgba(14,159,110,0.12)", color: "var(--status-steady)" }}
            >
              <CheckCircle2 className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "تم إرسال الطرد" : "Packet sent"}
              </p>
              <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
                {locale === "ar"
                  ? "تم إشعار الموظف: «طلبتُ من فاطمة في الموارد البشرية التدخّل. ستردّ اليوم.»"
                  : "Employee notified: \"I've asked Fatima in HR to step in. She'll reply today.\""}
              </p>
              <p className="text-[12px] mt-2 font-mono tabular" style={{ color: "var(--text-lo)" }}>
                {packet.id} · {packet.namedOwner.name}
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}

      {/* Decision editor */}
      <section className="ast-card p-5 sm:p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Edit3 className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "ما القرار المطلوب" : "Decision requested"}
          </h3>
        </div>
        <Textarea
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          disabled={!editMode && !!packet}
          rows={3}
          className="ast-focus w-full text-[13px] resize-y"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-hi)",
          }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {/* Named owner selector */}
          <div>
            <label className="text-[11px] uppercase tracking-[0.12em] font-medium" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "المسؤول المُسمّى" : "Named owner"}
            </label>
            <Select value={namedOwnerId} onValueChange={setNamedOwnerId} disabled={!!packet && !editMode}>
              <SelectTrigger className="ast-focus h-11 mt-1.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}>
                {ALL_HRBPS.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name} · {h.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Share pulse toggle */}
          <div>
            <label className="text-[11px] uppercase tracking-[0.12em] font-medium" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "مشاركة ملخص النبضة" : "Share pulse summary"}
            </label>
            <button
              onClick={() => !packet || editMode ? setSharePulse((v) => !v) : null}
              disabled={(!!packet && !editMode) || pulseSuppressed}
              className="ast-focus w-full h-11 mt-1.5 px-3 rounded-full text-[13px] font-medium flex items-center justify-between disabled:opacity-60"
              style={{
                background: sharePulse ? "rgba(22,154,165,0.10)" : "var(--surface-2)",
                border: `1px solid ${sharePulse ? "rgba(22,154,165,0.32)" : "var(--border)"}`,
                color: sharePulse ? "var(--brand-400)" : "var(--text-mid)",
              }}
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                {sharePulse
                  ? (locale === "ar" ? "يُشارك الملخص (1–5)" : "Share summary (1–5)")
                  : (locale === "ar" ? "لا تُشارك الملخص" : "Don't share summary")}
              </span>
              {pulseSuppressed && (
                <Lock className="w-3 h-3" strokeWidth={1.75} style={{ color: "var(--text-lo)" }} />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {!packet || editMode ? (
            <button
              onClick={buildPacket}
              disabled={building || !decision.trim()}
              className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium transition-colors disabled:opacity-50"
              style={{
                background: "var(--brand-500)",
                color: "var(--surface-0)",
                border: "1px solid var(--brand-500)",
              }}
            >
              <UserCog className="w-4 h-4" strokeWidth={1.75} />
              {building
                ? (locale === "ar" ? "جارٍ البناء..." : "Building…")
                : packet
                ? (locale === "ar" ? "أعد بناء الطرد" : "Rebuild packet")
                : (locale === "ar" ? "ابنِ الطرد" : "Build packet")}
            </button>
          ) : (
            <>
              <button
                onClick={() => setEditMode(true)}
                className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
              >
                <Edit3 className="w-4 h-4" strokeWidth={1.75} />
                {locale === "ar" ? "تحرير الملخص" : "Edit summary"}
              </button>
              <button
                onClick={() => setEditMode(true)}
                className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
              >
                <UserCog className="w-4 h-4" strokeWidth={1.75} />
                {locale === "ar" ? "تعيين لمالك الخدمة" : "Assign to service owner"}
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium transition-colors"
                style={{
                  background: "var(--accent-500)",
                  color: "var(--surface-0)",
                  border: "1px solid var(--accent-500)",
                }}
              >
                <Send className="w-4 h-4" strokeWidth={1.75} />
                {locale === "ar" ? "أرسل الطرد" : "Send packet"}
              </button>
            </>
          )}
        </div>
      </section>

      {/* Packet preview */}
      <AnimatePresence>
        {packet && (
          <motion.section
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="ast-card p-5 sm:p-6 space-y-5"
          >
            {/* Header */}
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] font-mono" style={{ color: "var(--text-lo)" }}>
                  {packet.id}
                </p>
                <h3 className="text-[18px] font-semibold mt-1" style={{ color: "var(--text-hi)" }}>
                  {packet.employeeName}
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
                  {stageLabel(packet.stage, locale)}
                  <span className="mx-1.5">·</span>
                  <span className="tabular">
                    {locale === "ar" ? `يوم ${packet.dayInStage}` : `Day ${packet.dayInStage}`}
                  </span>
                  <span className="mx-1.5">·</span>
                  <span>{packet.journeyType === "onboarding" ? (locale === "ar" ? "التحاق" : "Onboarding") : (locale === "ar" ? "تنقل" : "Mobility")}</span>
                </p>
              </div>
              <BandChip band={packet.band as BandT} score={packet.score} locale={locale} size="lg" />
            </div>

            {/* Situation */}
            <div>
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "الوضع" : "Situation"}
              </h4>
              <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-hi)" }}>
                {locale === "ar"
                  ? `${packet.employeeName} في ${stageLabel(packet.stage, "ar")}، يوم ${packet.dayInStage}. التصنيف ${packet.band} (${packet.score}). أبرز إشارة: ${packet.topSignals[0]?.code ?? "—"}.`
                  : `${packet.employeeName} is in ${stageLabel(packet.stage, "en")}, day ${packet.dayInStage}. Band ${packet.band} (score ${packet.score}). Top signal: ${packet.topSignals[0]?.code ?? "—"}.`}
              </p>
            </div>

            {/* Evidence */}
            <div>
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "الأدلة" : "Evidence"}
              </h4>
              <ul className="space-y-2">
                {packet.topSignals.map((s, i) => (
                  <li key={`${s.code}-${i}`} className="ast-card-2 p-3 flex items-start gap-3">
                    <SignalBadge code={s.code} weight={s.weight} hardTrip={s.code.startsWith("DP") || s.code.startsWith("MB")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px]" style={{ color: "var(--text-hi)" }}>{s.description}</p>
                      {s.evidenceRefs.length > 0 && (
                        <p className="text-[11px] font-mono mt-1 tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
                          {s.evidenceRefs.join(" · ")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Timeline */}
            <div>
              <h4 className="text-[11px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "آخر 10 أحداث" : "Timeline (last 10 events)"}
              </h4>
              <ol className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {packet.timeline.map((e, i) => (
                  <li key={i} className="text-[12px] flex items-center gap-2 tabular" style={{ color: "var(--text-mid)" }}>
                    <span className="font-mono text-[11px]" style={{ color: "var(--text-lo)" }} dir="ltr">
                      {format(new Date(e.occurredAt), "d MMM HH:mm")}
                    </span>
                    <span style={{ color: "var(--text-mid)" }}>·</span>
                    <span className="font-mono text-[11px]" style={{ color: "var(--brand-400)" }} dir="ltr">{e.stepKey}</span>
                    <span style={{ color: "var(--text-mid)" }}>·</span>
                    <span>{e.type.replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Blocked downstream */}
            {packet.blockedDownstream.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "محظور في اتجاه التيار" : "Blocked downstream"}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {packet.blockedDownstream.map((k) => (
                    <span key={k} className="ast-chip font-mono text-[11px]" style={{ color: "var(--status-friction)" }}>
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Open requests */}
            {packet.openRequests.length > 0 && (
              <div>
                <h4 className="text-[11px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "الطلبات المفتوحة" : "Open requests"}
                </h4>
                <ul className="space-y-1.5">
                  {packet.openRequests.map((r) => {
                    const ageDays = Math.max(0, Math.round(r.ageHours / 24));
                    return (
                      <li key={r.ref} className="ast-card-2 p-3 flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-[11px] tabular" style={{ color: "var(--brand-400)" }} dir="ltr">{r.ref}</span>
                        <span className="text-[12px]" style={{ color: "var(--text-mid)" }}>{r.type.replace(/_/g, " ")}</span>
                        <span className="text-[11px] tabular" style={{ color: "var(--text-lo)" }}>
                          {locale === "ar" ? `العمر ${ageDays} يوم` : `age ${ageDays}d`}
                        </span>
                        {r.reassignCount > 0 && (
                          <span className="ast-chip text-[10px]" style={{ color: "var(--status-watch)" }}>
                            {locale === "ar" ? `أُعيد تعيينها ${r.reassignCount}×` : `reassigned ${r.reassignCount}×`}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Named owner + backup */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="ast-card-2 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "المسؤول المُسمّى" : "Named owner"}
                </p>
                <p className="text-[14px] font-medium mt-1" style={{ color: "var(--text-hi)" }}>{packet.namedOwner.name}</p>
                <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>{packet.namedOwner.role}</p>
                <p className="text-[11px] font-mono mt-1 tabular" style={{ color: "var(--brand-400)" }} dir="ltr">{packet.namedOwner.email}</p>
              </div>
              {packet.backupOwner && (
                <div className="ast-card-2 p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                    {locale === "ar" ? "البديل" : "Backup"}
                  </p>
                  <p className="text-[14px] font-medium mt-1" style={{ color: "var(--text-hi)" }}>{packet.backupOwner.name}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>{packet.backupOwner.role}</p>
                  <p className="text-[11px] font-mono mt-1 tabular" style={{ color: "var(--brand-400)" }} dir="ltr">{packet.backupOwner.email}</p>
                </div>
              )}
            </div>

            {/* Consent statement */}
            <div
              className="p-4 rounded-[10px]"
              style={{ background: "rgba(22,154,165,0.06)", border: "1px solid rgba(22,154,165,0.22)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--brand-400)" }}>
                  {locale === "ar" ? "بيان الموافقة" : "Consent statement"}
                </p>
              </div>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
                <span className="font-medium" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "مُشارك مع شريك الموارد البشرية: " : "Shared with HRBP: "}
                </span>
                {packet.consentStatement.sharedWithHrbp.join(", ").replace(/_/g, " ")}
                <br />
                <span className="font-medium" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "مكتوم: " : "Withheld: "}
                </span>
                {packet.consentStatement.withheld.join(", ").replace(/_/g, " ") || (locale === "ar" ? "—" : "none")}
                <br />
                <span className="font-medium" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "النص الحر مستثنى افتراضياً." : "Free-text excluded by default."}
                </span>
              </p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Send-packet confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "إرسال الطرد؟" : "Send packet?"}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? "سيُشعَر الموظف باسم المسؤول المُسمّى. سيُقال لهم: «طلبتُ من فاطمة في الموارد البشرية التدخّل. ستردّ اليوم.»"
                : "The employee will be notified with the named owner. They'll hear: \"I've asked Fatima in HR to step in. She'll reply today.\""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button
                className="ast-focus inline-flex items-center h-11 px-4 rounded-full text-[13px] font-medium"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
              >
                {locale === "ar" ? "تراجع" : "Cancel"}
              </button>
            </DialogClose>
            <button
              onClick={handleSend}
              disabled={sending}
              className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium"
              style={{ background: "var(--accent-500)", color: "var(--surface-0)", border: "1px solid var(--accent-500)" }}
            >
              <Send className="w-4 h-4" strokeWidth={1.75} />
              {sending ? (locale === "ar" ? "جارٍ الإرسال..." : "Sending…") : (locale === "ar" ? "أرسل" : "Send")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
   Stalls view (heatmap)
   ============================================================ */
function StallsView() {
  const locale = useAppStore((s) => s.locale);
  const [cells, setCells] = useState<StallsCell[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCells = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/v1/insights/stalls", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<{ cells: StallsCell[] }> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      setCells(json.data.cells);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCells(); }, [fetchCells]);

  // Build matrix
  const matrix = useMemo(() => {
    if (!cells) return { stages: [], groups: [], map: new Map<string, StallsCell>() };
    const stageSet = new Set<string>();
    const groupSet = new Set<string>();
    const map = new Map<string, StallsCell>();
    for (const c of cells) {
      stageSet.add(c.stage);
      groupSet.add(c.ownerGroup);
      map.set(`${c.stage}|${c.ownerGroup}`, c);
    }
    // Preserve stage order via STAGE_LABELS insertion
    const stageOrder = Object.keys(STAGE_LABELS);
    const stages = Array.from(stageSet).sort((a, b) => stageOrder.indexOf(a) - stageOrder.indexOf(b));
    const groups = Array.from(groupSet).sort();
    return { stages, groups, map };
  }, [cells]);

  // Color scale: teal → sand-gold → red (by medianDays)
  function cellColor(c: StallsCell | undefined): string {
    if (!c || c.suppressed) return "var(--surface-2)";
    const m = c.medianTimeToCompleteHours ?? 0;
    // Map 0h → teal, 48h → sand-gold, 168h+ → red
    if (m <= 24) return "rgba(22,154,165,0.18)";
    if (m <= 72) return "rgba(201,162,39,0.18)";
    if (m <= 168) return "rgba(217,119,6,0.20)";
    return "rgba(220,38,38,0.20)";
  }
  function cellBorder(c: StallsCell | undefined): string {
    if (!c || c.suppressed) return "var(--border)";
    const m = c.medianTimeToCompleteHours ?? 0;
    if (m <= 24) return "rgba(22,154,165,0.36)";
    if (m <= 72) return "rgba(201,162,39,0.36)";
    if (m <= 168) return "rgba(217,119,6,0.36)";
    return "rgba(220,38,38,0.36)";
  }

  const FILTER_CHIPS = [
    { en: "All stages", ar: "كل المراحل" },
    { en: "All owners", ar: "كل المالكين" },
    { en: "All locations", ar: "كل المواقع" },
  ];

  if (loading) {
    return (
      <div className="space-y-3" aria-hidden="true">
        <div className="h-10 ast-shimmer rounded-full" />
        <div className="ast-card p-6 h-72 ast-shimmer rounded-[14px]" />
      </div>
    );
  }
  if (err) return <ErrorBanner message={err} onRetry={fetchCells} />;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "خريطة الاختناقات" : "Stall heatmap"}
          </h2>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "الوسيط لكل (مرحلة × مالك). الخلايا أقل من 5 مكتومة."
              : "Median days per stage × owner. Cells below k=5 are suppressed."}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--text-lo)" }} />
          {FILTER_CHIPS.map((f) => (
            <button
              key={f.en}
              className="ast-focus h-8 px-2.5 rounded-full text-[11px] font-medium"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
            >
              {locale === "ar" ? f.ar : f.en}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap */}
      <div className="ast-card p-4 sm:p-5 overflow-x-auto">
        <table className="w-full border-collapse min-w-[640px]">
          <thead>
            <tr>
              <th className="text-left p-2 text-[11px] uppercase tracking-[0.12em] font-medium" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "المرحلة / المالك" : "Stage / Owner"}
              </th>
              {matrix.groups.map((g) => (
                <th key={g} className="p-2 text-center text-[11px] uppercase tracking-[0.08em] font-medium" style={{ color: "var(--text-lo)" }}>
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.stages.map((s) => (
              <tr key={s}>
                <td className="p-2 text-[12px] font-medium" style={{ color: "var(--text-hi)" }}>
                  {stageLabel(s, locale)}
                </td>
                {matrix.groups.map((g) => {
                  const c = matrix.map.get(`${s}|${g}`);
                  const suppressed = !c || c.suppressed;
                  return (
                    <td key={g} className="p-1.5 align-top">
                      <div
                        className="rounded-[8px] p-3 min-h-[88px] flex flex-col justify-between"
                        style={{
                          background: cellColor(c),
                          border: `1px solid ${cellBorder(c)}`,
                        }}
                        title={suppressed ? "Not enough data to show safely (n<5)" : `n=${c?.n ?? 0}`}
                      >
                        {suppressed ? (
                          <div className="flex flex-col items-center text-center gap-1.5 h-full justify-center">
                            <Hourglass className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--text-lo)" }} />
                            <p className="text-[10px] leading-tight" style={{ color: "var(--text-lo)" }}>
                              {locale === "ar"
                                ? "بيانات غير كافية (n<5)"
                                : "Not enough data to show safely (n<5)"}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-[18px] font-semibold tabular" style={{ color: "var(--text-hi)" }}>
                              {((c?.medianTimeToCompleteHours ?? 0) / 24).toFixed(1)}
                              <span className="text-[11px] font-normal ml-1" style={{ color: "var(--text-mid)" }}>
                                {locale === "ar" ? "يوم" : "days"}
                              </span>
                            </p>
                            <p className="text-[10px] tabular" style={{ color: "var(--text-mid)" }}>
                              {locale === "ar" ? "خرق " : "breach "}
                              <span style={{ color: "var(--status-watch)" }}>
                                {Math.round((c?.breachRate ?? 0) * 100)}%
                              </span>
                            </p>
                            <p className="text-[10px] tabular" style={{ color: "var(--text-mid)" }}>
                              {locale === "ar" ? "إعادة " : "reassign "}
                              <span style={{ color: "var(--status-friction)" }}>
                                {Math.round((c?.reassignmentRate ?? 0) * 100)}%
                              </span>
                            </p>
                            <p className="text-[9px] font-mono tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
                              n={c?.n ?? 0}
                            </p>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 flex-wrap text-[11px]" style={{ color: "var(--text-mid)" }}>
        <span>{locale === "ar" ? "السرعة:" : "Speed:"}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(22,154,165,0.36)" }} />
          {locale === "ar" ? "≤ يوم" : "≤ 1 day"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(201,162,39,0.36)" }} />
          {locale === "ar" ? "1–3 أيام" : "1–3 days"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(217,119,6,0.40)" }} />
          {locale === "ar" ? "3–7 أيام" : "3–7 days"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: "rgba(220,38,38,0.40)" }} />
          {locale === "ar" ? "+7 أيام" : "7+ days"}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   Root
   ============================================================ */
export function HrbpScreen() {
  const locale = useAppStore((s) => s.locale);
  const view = useAppStore((s) => s.hrbpView);
  const setView = useAppStore((s) => s.setHrbpView);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const openPacket = useCallback((employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setView("employee");
  }, [setView]);

  const backToQueue = useCallback(() => {
    setView("queue");
    setSelectedEmployeeId(null);
  }, [setView]);

  return (
    <div
      dir={dir}
      className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10"
    >
      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--brand-400)" }}>
            <ListOrdered className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{locale === "ar" ? "وحدة شريك الموارد البشرية" : "HRBP console"}</span>
          </div>
          <h1 className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-tight" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "أول من يحتاج مساعدة اليوم" : "Who needs you first today"}
          </h1>
        </div>
        <HrbpTabs />
      </header>

      {view === "queue" && <QueueView onOpenPacket={openPacket} />}
      {view === "employee" && (
        selectedEmployeeId
          ? <EmployeeView employeeId={selectedEmployeeId} onBack={backToQueue} />
          : (
            <div className="ast-card p-10 flex flex-col items-center text-center">
              <div
                className="flex items-center justify-center w-14 h-14 rounded-full mb-4"
                style={{ background: "var(--surface-2)", color: "var(--text-mid)" }}
              >
                <User className="w-6 h-6" strokeWidth={1.75} />
              </div>
              <p className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "اختر موظفاً من القائمة لعرض الطرد." : "Pick someone from the queue to view their packet."}
              </p>
              <button
                onClick={() => setView("queue")}
                className="ast-focus mt-4 inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium"
                style={{ background: "var(--brand-500)", color: "var(--surface-0)", border: "1px solid var(--brand-500)" }}
              >
                <ListOrdered className="w-4 h-4" strokeWidth={1.75} />
                {locale === "ar" ? "افتح القائمة" : "Open queue"}
              </button>
            </div>
          )
      )}
      {view === "stalls" && <StallsView />}
    </div>
  );
}
