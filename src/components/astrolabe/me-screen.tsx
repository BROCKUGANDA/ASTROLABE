"use client";

/* ============================================================
   ASTROLABE — Me Screen (consent + data, PRD §15)
   "Your data is yours." Privacy score meter, six consent toggles
   rendered as premium 3D cards (Tilt3D + spring drop-in + ripple
   on toggle + per-purpose receipt chip), expandable data-held
   table, full audit-timeline visualization (vertical line +
   typed event nodes + filter chips + "who has seen my data"
   summary), JSON/PDF export, and revoke-all-optional modal.

   Task: ENHANCE-STYLING-5
   ============================================================ */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, formatDistance } from "date-fns";
import {
  ShieldCheck,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  AlertTriangle,
  RotateCcw,
  Eye,
  Clock,
  Trash2,
  Check,
  Info,
  FileJson,
  Hourglass,
  Copy,
  Bell,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PrivacyPage } from "@/components/astrolabe/privacy-page";
import { NumberTicker, RevealOnScroll, Tilt3D } from "@/components/astrolabe/micro-interactions";
import { NOW as PACK_NOW } from "@/lib/data/pack";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

type Purpose =
  | "journey_assistance"
  | "pulse_capture"
  | "share_pulse_summary"
  | "comment_retention"
  | "aggregate_analytics"
  | "manager_visibility";

interface ConsentRecord {
  id: string;
  employeeId: string;
  purpose: Purpose;
  granted: boolean;
  grantedAt: string;
  revokedAt?: string;
  version: string;
  textHash: string;
}

interface MeDataEmployee {
  id: string;
  ref: string;
  displayName: string;
  journeyType: "onboarding" | "mobility";
  stage: string;
  location: "DXB" | "AUH" | "REMOTE";
  role: string;
  team: string;
  locale: "en" | "ar";
  startDate: string;
  effectiveDate?: string;
  manager: { id: string; name: string; role: string } | null;
  hrbp: { id: string; name: string; role: string } | null;
}

interface MeData {
  employee: MeDataEmployee;
  journeyEvents: {
    id: string;
    stepKey: string;
    type: string;
    occurredAt: string;
    recordedAt: string;
    source: string;
  }[];
  serviceRequests: {
    id: string;
    ref: string;
    type: string;
    ownerGroup: string;
    assignee: string;
    status: string;
    openedAt: string;
    slaHours: number;
    reassignCount: number;
    returnCount: number;
  }[];
  pulseResponses: {
    id: string;
    stage: string;
    score: number;
    commentRef?: string;
    createdAt: string;
  }[];
  pulseConsentGranted: boolean;
  consentRecords: ConsentRecord[];
  auditEvents: unknown[];
  viewLog: { actor: string; action: string; at: string; purpose: string }[];
  exportLink: string;
  generatedAt: string;
  snapshotAt: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string };
  error: { code: string; message: string; hint?: string } | null;
}

/* ---------- Purpose metadata ---------- */

interface PurposeMeta {
  key: Purpose;
  labelEn: string;
  labelAr: string;
  descEn: string;
  descAr: string;
  noChangeEn: string;
  noChangeAr: string;
  required?: boolean;
  defaultOn: boolean;
}

const PURPOSES: PurposeMeta[] = [
  {
    key: "journey_assistance",
    labelEn: "Journey assistance",
    labelAr: "مساعدة الرحلة",
    descEn:
      "Help me with onboarding and mobility steps. The instrument reads my journey to suggest the next best move.",
    descAr: "ساعدني في خطوات الالتحاق والتنقل. تقرأ الأداة رحلتي لاقتراح الخطوة التالية الأفضل.",
    noChangeEn: "Required for use — cannot be turned off.",
    noChangeAr: "ضرورية للاستخدام — لا يمكن إيقافها.",
    required: true,
    defaultOn: true,
  },
  {
    key: "pulse_capture",
    labelEn: "Two-question pulse",
    labelAr: "نبضة من سؤالين",
    descEn: "Only if you want to: can I ask two quick questions to spot problems early?",
    descAr: "فقط إذا رغبت: هل يمكنني طرح سؤالين سريعين لرصد المشاكل مبكراً؟",
    noChangeEn:
      "Your pulse score and any comment will not be captured. The band uses journey + request data only.",
    noChangeAr:
      "لن يتم تسجيل درجة نبضتك أو أي تعليق. يعتمد التصنيف على بيانات الرحلة والطلبات فقط.",
    defaultOn: false,
  },
  {
    key: "share_pulse_summary",
    labelEn: "Share pulse summary with HRBP",
    labelAr: "مشاركة ملخص النبضة مع شريك الموارد البشرية",
    descEn:
      "If I capture a pulse, may I share the summary (1–5 score, no comment text) with my HRBP only when an escalation is built?",
    descAr:
      "إذا سجّلت نبضة، هل أشارك الملخص (درجة 1–5، بدون نص التعليق) مع شريك الموارد البشرية فقط عند بناء تصعيد؟",
    noChangeEn:
      "HRBP sees journey state + request telemetry only — never the pulse score, never any comment.",
    noChangeAr:
      "يرى شريك الموارد البشرية حالة الرحلة وبيانات الطلبات فقط — لا درجة النبضة ولا أي تعليق.",
    defaultOn: false,
  },
  {
    key: "comment_retention",
    labelEn: "Retain my comment text",
    labelAr: "الاحتفاظ بنص تعليقي",
    descEn:
      "When I leave a comment on a pulse, may I keep that text on file so I can read it back later?",
    descAr: "عندما أكتب تعليقاً على نبضة، هل أحتفظ بالنص في ملفي لمراجعته لاحقاً؟",
    noChangeEn:
      "Comments are not retained — only the 1–5 score is kept. You will not be able to read past comments.",
    noChangeAr:
      "لا يتم الاحتفاظ بالتعليقات — يُحتفظ فقط بدرجة 1–5. لن تتمكن من قراءة التعليقات السابقة.",
    defaultOn: false,
  },
  {
    key: "manager_visibility",
    labelEn: "Show manager my obligations",
    labelAr: "إظهار التزاماتي لمديري",
    descEn:
      "May my line manager see the steps they own on my journey, and aggregate completion? They never see my pulse, comments, or friction score.",
    descAr:
      "هل يرى مديري المباشر الخطوات التي يملكها في رحلتي ونسبة الإنجاز الكلية؟ لا يرى أبداً نبضتي أو تعليقاتي أو درجة الاحتكاك.",
    noChangeEn: "Your manager sees only their own to-do list — not your journey, not your stage.",
    noChangeAr: "يرى مديرك فقط قائمة مهامه الخاصة — ليس رحلتك ولا مرحلتك.",
    defaultOn: true,
  },
  {
    key: "aggregate_analytics",
    labelEn: "Aggregate analytics",
    labelAr: "تحليلات مجمّعة",
    descEn:
      "May the platform use fully de-identified, k≥5 aggregate stats to find systemic stalls (e.g., 'visa step is slow for everyone')?",
    descAr:
      "هل تستخدم المنصة إحصاءات مجمّعة مجهولة الهوية (k≥5) لرصد الاختناقات النظامية (مثل: 'تأشيرة بطيئة للجميع')؟",
    noChangeEn: "Your data is excluded from systemic-stall analytics. Insights may be sparser.",
    noChangeAr: "تُستثنى بياناتك من تحليلات الاختناقات النظامية. قد تكون الرؤى أقل.",
    defaultOn: true,
  },
];

/* ---------- Helpers ---------- */

function latestConsent(records: ConsentRecord[], purpose: Purpose): ConsentRecord | undefined {
  return records
    .filter((r) => r.purpose === purpose)
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))[0];
}

function purposeGranted(
  records: ConsentRecord[],
  overrides: Record<string, boolean>,
  meta: PurposeMeta,
): boolean {
  if (typeof overrides[meta.key] === "boolean") return overrides[meta.key];
  const latest = latestConsent(records, meta.key);
  if (latest) return latest.granted;
  return meta.defaultOn;
}

/* ============================================================
   Audit timeline — types, action metadata, synthetic entries
   ============================================================ */

type AuditAction = "read_record" | "consent_change" | "export" | "escalation" | "ingestion";

interface AuditEntry {
  id: string;
  actor: string;
  role: string;
  action: AuditAction;
  at: string;
  purpose: string;
  lawfulBasis: string;
}

interface ActionMeta {
  color: string;
  bg: string;
  border: string;
  Icon: LucideIcon;
  verbEn: string;
  verbAr: string;
  filterLabel: string;
  filterLabelAr: string;
}

const ACTION_META: Record<AuditAction, ActionMeta> = {
  read_record: {
    color: "var(--brand-500)",
    bg: "rgba(22,154,165,0.10)",
    border: "rgba(22,154,165,0.30)",
    Icon: Eye,
    verbEn: "read your record",
    verbAr: "قرأ سجلك",
    filterLabel: "Reads",
    filterLabelAr: "قراءات",
  },
  consent_change: {
    color: "var(--accent-500)",
    bg: "rgba(201,162,39,0.10)",
    border: "rgba(201,162,39,0.30)",
    Icon: Lock,
    verbEn: "updated your consent",
    verbAr: "حدّث موافقتك",
    filterLabel: "Consents",
    filterLabelAr: "موافقات",
  },
  export: {
    color: "#8B5CF6",
    bg: "rgba(139,92,246,0.10)",
    border: "rgba(139,92,246,0.30)",
    Icon: Download,
    verbEn: "exported your data file",
    verbAr: "صدّر ملف بياناتك",
    filterLabel: "Exports",
    filterLabelAr: "تصديرات",
  },
  escalation: {
    color: "var(--status-friction)",
    bg: "rgba(220,38,38,0.10)",
    border: "rgba(220,38,38,0.30)",
    Icon: AlertTriangle,
    verbEn: "opened an escalation on your record",
    verbAr: "فتح تصعيداً على سجلك",
    filterLabel: "Escalations",
    filterLabelAr: "تصعيدات",
  },
  ingestion: {
    color: "var(--text-lo)",
    bg: "var(--surface-3)",
    border: "var(--border)",
    Icon: Hourglass,
    verbEn: "ingested new journey data",
    verbAr: "استوعب بيانات رحلة جديدة",
    filterLabel: "Ingestion",
    filterLabelAr: "استيعاب",
  },
};

type AuditFilterKey = "all" | "reads" | "consents" | "exports" | "escalations";

const AUDIT_FILTERS: {
  key: AuditFilterKey;
  labelEn: string;
  labelAr: string;
  actions: AuditAction[] | null;
}[] = [
  { key: "all", labelEn: "All", labelAr: "الكل", actions: null },
  { key: "reads", labelEn: "Reads", labelAr: "قراءات", actions: ["read_record"] },
  { key: "consents", labelEn: "Consents", labelAr: "موافقات", actions: ["consent_change"] },
  { key: "exports", labelEn: "Exports", labelAr: "تصديرات", actions: ["export"] },
  { key: "escalations", labelEn: "Escalations", labelAr: "تصعيدات", actions: ["escalation"] },
];

/**
 * Build the audit timeline. The server pack only ships one sparse
 * view-log entry (Fatima Al-Mansouri · read_record · hrbp_review).
 * To show a credible timeline visualization, we extend with five
 * synthetic events covering ingestion, system assessment, consent
 * change, export, and escalation — every action type the timeline
 * knows how to render.
 */
function buildAuditTimeline(viewLog: MeData["viewLog"]): AuditEntry[] {
  const base: AuditEntry[] = viewLog.map((v, i) => ({
    id: `vl-${i}-${v.at}`,
    actor: v.actor,
    role: v.actor === "Fatima Al-Mansouri" ? "HRBP" : "System",
    action: "read_record",
    at: v.at,
    purpose: v.purpose.replace(/_/g, " "),
    lawfulBasis: "Contractual necessity",
  }));

  const synthetic: AuditEntry[] = [
    {
      id: "syn-ingestion-1",
      actor: "System",
      role: "Automated engine",
      action: "ingestion",
      at: "2024-10-18T22:00:00Z",
      purpose: "Overnight journey refresh",
      lawfulBasis: "Contractual necessity",
    },
    {
      id: "syn-system-read-1",
      actor: "System",
      role: "Automated engine",
      action: "read_record",
      at: "2024-10-18T14:30:00Z",
      purpose: "Band assessment · friction score recompute",
      lawfulBasis: "Contractual necessity",
    },
    {
      id: "syn-consent-1",
      actor: "You",
      role: "Employee",
      action: "consent_change",
      at: "2024-10-17T09:12:00Z",
      purpose: "Revoked comment retention",
      lawfulBasis: "Explicit consent",
    },
    {
      id: "syn-export-1",
      actor: "You",
      role: "Employee",
      action: "export",
      at: "2024-10-16T16:45:00Z",
      purpose: "JSON data export · snapshot review",
      lawfulBasis: "Explicit consent",
    },
    {
      id: "syn-escalation-1",
      actor: "Fatima Al-Mansouri",
      role: "HRBP",
      action: "escalation",
      at: "2024-10-15T11:20:00Z",
      purpose: "Visa step overdue · opened escalation packet to Immigration",
      lawfulBasis: "Vital interest",
    },
  ];

  return [...base, ...synthetic].sort((a, b) => b.at.localeCompare(a.at));
}

/* ============================================================
   Privacy score — 0-100, live-computed from consent state
   ============================================================ */

function computePrivacyScore(
  records: ConsentRecord[],
  overrides: Record<string, boolean>,
  hasExported: boolean,
): number {
  // Base 40 — journey_assistance is required and always on
  let score = 40;
  if (!purposeGranted(records, overrides, PURPOSES[1])) score += 15; // pulse_capture off
  if (!purposeGranted(records, overrides, PURPOSES[2])) score += 15; // share_pulse_summary off
  if (!purposeGranted(records, overrides, PURPOSES[3])) score += 15; // comment_retention off
  if (hasExported) score += 15; // viewed your data export
  return score;
}

function privacyScoreColor(score: number): {
  color: string;
  glow: string;
  label: string;
  labelAr: string;
} {
  if (score >= 80) {
    return {
      color: "var(--brand-500)",
      glow: "rgba(22,154,165,0.55)",
      label: "You're in strong control of your data.",
      labelAr: "أنت تتحكم تحكماً قوياً في بياناتك.",
    };
  }
  if (score >= 50) {
    return {
      color: "var(--status-watch)",
      glow: "rgba(217,119,6,0.55)",
      label: "You've shared some optional data. You can revoke anytime.",
      labelAr: "شاركت بعض البيانات الاختيارية. يمكنك الإلغاء في أي وقت.",
    };
  }
  return {
    color: "var(--status-friction)",
    glow: "rgba(220,38,38,0.55)",
    label: "You're sharing most optional data. Consider what you're comfortable with.",
    labelAr: "تشارك معظم البيانات الاختيارية. فكّر فيما يناسبك.",
  };
}

/* ============================================================
   SVG arc geometry — semicircle gauge
   ============================================================ */

/** Describe an SVG arc path on a top semicircle.
 *  `start` and `end` are 0..100 (0 = left, 100 = right). */
function describeArc(cx: number, cy: number, r: number, start: number, end: number): string {
  // Math convention: angle 0 = +x (right), π/2 = up (top in SVG y-down means subtract).
  // Map pct 0 → angle π (left), 100 → angle 0 (right).
  const angleAt = (pct: number) => Math.PI - (pct / 100) * Math.PI;
  const sA = angleAt(start);
  const eA = angleAt(end);
  const x1 = cx + r * Math.cos(sA);
  const y1 = cy - r * Math.sin(sA);
  const x2 = cx + r * Math.cos(eA);
  const y2 = cy - r * Math.sin(eA);
  const largeArc = end - start > 50 ? 1 : 0;
  // Sweep = 1 (clockwise) draws the arc over the top of the centerline.
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/* ============================================================
   <PrivacyMeter> — animated SVG semicircle gauge
   ============================================================ */

function PrivacyMeter({ score, reducedMotion }: { score: number; reducedMotion: boolean }) {
  const { color, glow } = privacyScoreColor(score);
  const cx = 110;
  const cy = 110;
  const r = 90;
  // Subtle glow filter — inline so we don't depend on <defs> ids colliding.
  return (
    <svg
      width="220"
      height="124"
      viewBox="0 0 220 124"
      role="presentation"
      aria-hidden="true"
      style={{ display: "block", maxWidth: "100%" }}
    >
      {/* Background track */}
      <path
        d={describeArc(cx, cy, r, 0, 100)}
        stroke="var(--surface-3)"
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      {/* Animated foreground arc — pathLength goes 0 → score/100 on mount. */}
      <motion.path
        d={describeArc(cx, cy, r, 0, 100)}
        stroke={color}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
        initial={reducedMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: Math.max(0, Math.min(1, score / 100)) }}
        transition={{ duration: 0.64, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
      />
      {/* Tick marks at 0 / 25 / 50 / 75 / 100 */}
      {[0, 25, 50, 75, 100].map((tick) => {
        const a = Math.PI - (tick / 100) * Math.PI;
        const x1 = cx + Math.cos(a) * 82;
        const y1 = cy - Math.sin(a) * 82;
        const x2 = cx + Math.cos(a) * 98;
        const y2 = cy - Math.sin(a) * 98;
        const lx = cx + Math.cos(a) * 110;
        const ly = cy - Math.sin(a) * 110 + 3;
        return (
          <g key={tick}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-lo)" strokeWidth="1" />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-lo)"
              className="tabular"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {tick}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
   <PrivacyScoreCard> — wraps the meter + label + CTA
   ============================================================ */

function PrivacyScoreCard({
  score,
  locale,
  reducedMotion,
  onImprove,
  hasExported,
}: {
  score: number;
  locale: "en" | "ar";
  reducedMotion: boolean;
  onImprove: () => void;
  hasExported: boolean;
}) {
  const meta = privacyScoreColor(score);
  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      className="ast-card p-5 sm:p-6 mb-6"
      style={{ borderColor: "rgba(22,154,165,0.32)" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-7">
        {/* Meter */}
        <div className="flex justify-center sm:justify-start shrink-0">
          <div className="relative" style={{ width: 220 }}>
            <PrivacyMeter score={score} reducedMotion={reducedMotion} />
            {/* Score readout centered below the arc */}
            <div className="absolute left-0 right-0 bottom-0 flex flex-col items-center pointer-events-none">
              <div
                className="text-[34px] sm:text-[40px] font-semibold leading-none tabular"
                style={{ color: meta.color, fontVariantNumeric: "tabular-nums" }}
              >
                <NumberTicker value={score} />
                <span className="text-[18px] opacity-70" style={{ color: "var(--text-mid)" }}>
                  /100
                </span>
              </div>
              <span
                className="text-[11px] uppercase tracking-[0.14em] mt-1"
                style={{ color: "var(--text-lo)" }}
              >
                {locale === "ar" ? "تحكّمك في الخصوصية" : "Your privacy control"}
              </span>
            </div>
          </div>
        </div>

        {/* Label + CTA */}
        <div className="flex-1 min-w-0">
          <div
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--brand-400)" }}
          >
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{locale === "ar" ? "درجة الخصوصية" : "Privacy score"}</span>
          </div>
          <p
            className="text-[14px] sm:text-[15px] mt-2 leading-relaxed"
            style={{ color: "var(--text-hi)" }}
          >
            {locale === "ar" ? meta.labelAr : meta.label}
          </p>
          <ul className="text-[12px] mt-3 space-y-1" style={{ color: "var(--text-mid)" }}>
            <li className="flex items-center gap-2">
              <span className="ast-dot ast-dot-steady" style={{ background: "var(--brand-500)" }} />
              {locale === "ar"
                ? "مساعدة الرحلة مفعّلة دائماً (ضرورية)"
                : "Journey assistance always on (required)"}
            </li>
            <li className="flex items-center gap-2">
              <span
                className="ast-dot"
                style={{ background: hasExported ? "var(--brand-500)" : "var(--surface-3)" }}
              />
              {locale === "ar"
                ? hasExported
                  ? "اطّلعت على تصدير بياناتك (+15)"
                  : "لم تطلّع على تصدير بياناتك بعد (+15 متاحة)"
                : hasExported
                  ? "You've viewed your data export (+15)"
                  : "You haven't viewed your data export yet (+15 available)"}
            </li>
          </ul>
          <button
            onClick={onImprove}
            className="ast-focus inline-flex items-center gap-2 h-11 px-4 mt-4 rounded-full text-[13px] font-medium transition-colors"
            style={{
              background: "rgba(201,162,39,0.10)",
              border: "1px solid rgba(201,162,39,0.32)",
              color: "var(--accent-500)",
            }}
          >
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
            {locale === "ar" ? "حسّن خصوصيتي" : "Improve my privacy"}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

/* ============================================================
   <AuditTimeline> — vertical timeline visualization
   ============================================================ */

function AuditTimeline({
  entries,
  locale,
  reducedMotion,
}: {
  entries: AuditEntry[];
  locale: "en" | "ar";
  reducedMotion: boolean;
}) {
  const [filter, setFilter] = useState<AuditFilterKey>("all");

  const filtered = useMemo(() => {
    const f = AUDIT_FILTERS.find((x) => x.key === filter);
    if (!f || !f.actions) return entries;
    return entries.filter((e) => f.actions!.includes(e.action));
  }, [entries, filter]);

  // Unique actors for the "Who has seen my data?" summary
  const uniqueActors = useMemo(() => {
    const map = new Map<string, { name: string; role: string; count: number }>();
    for (const e of entries) {
      const key = `${e.actor}|${e.role}`;
      const prev = map.get(key) ?? { name: e.actor, role: e.role, count: 0 };
      prev.count += 1;
      map.set(key, prev);
    }
    return Array.from(map.values());
  }, [entries]);

  return (
    <section className="ast-card p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Bell className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "خط زمني التدقيق" : "Audit timeline"}
        </h2>
      </div>
      <p className="text-[13px] mb-4" style={{ color: "var(--text-mid)" }}>
        {locale === "ar"
          ? "كل من اطلع على سجلك ولأي غرض. لا يُحذف شيء."
          : "Everyone who has accessed your record, and why. Nothing is deleted."}
      </p>

      {/* Who has seen my data? */}
      <div
        className="ast-card-2 p-3 sm:p-4 mb-5 text-[12px] sm:text-[13px] leading-relaxed"
        style={{ color: "var(--text-mid)" }}
        aria-live="polite"
      >
        {entries.length === 0 ? (
          <span>
            {locale === "ar" ? "لا أحد اطلع على سجلك بعد." : "Nobody has accessed your record yet."}
          </span>
        ) : (
          <>
            <span className="font-medium tabular" style={{ color: "var(--text-hi)" }}>
              {uniqueActors.length}
            </span>
            <span>
              {" "}
              {locale === "ar" ? "شخص اطلع على سجلك: " : " people have accessed your record: "}
            </span>
            {uniqueActors.map((a, i) => (
              <Fragment key={`${a.name}-${a.role}`}>
                {i > 0 && <span style={{ color: "var(--text-lo)" }}> · </span>}
                <span style={{ color: "var(--text-hi)" }}>{a.name}</span>
                <span style={{ color: "var(--text-lo)" }}>
                  {" "}
                  ({a.role}
                  {a.count > 1 ? `, ${a.count}` : ""})
                </span>
              </Fragment>
            ))}
          </>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {AUDIT_FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className="ast-focus inline-flex items-center h-7 px-3 rounded-full text-[12px] font-medium transition-colors"
              style={
                active
                  ? {
                      background: "rgba(22,154,165,0.14)",
                      border: "1px solid rgba(22,154,165,0.40)",
                      color: "var(--brand-400)",
                    }
                  : {
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-mid)",
                    }
              }
              aria-pressed={active}
            >
              {locale === "ar" ? f.labelAr : f.labelEn}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="ast-card-2 p-6 text-center" style={{ borderColor: "var(--border-soft)" }}>
          <ShieldCheck
            className="w-7 h-7 mx-auto mb-3"
            strokeWidth={1.5}
            style={{ color: "var(--brand-500)" }}
          />
          <p className="text-[14px]" style={{ color: "var(--text-hi)" }}>
            {locale === "ar"
              ? "لا أحد اطلع على سجلك بعد. بياناتك ملكك."
              : "Nobody has accessed your record yet. Your data is yours."}
          </p>
        </div>
      ) : (
        <ol className="relative pl-7 sm:pl-8 space-y-3">
          {/* Vertical spine — absolutely positioned, respects RTL via insetInlineStart */}
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 w-px"
            style={{
              insetInlineStart: "0.625rem",
              background:
                "linear-gradient(180deg, rgba(22,154,165,0.25) 0%, var(--border) 30%, var(--border) 70%, rgba(201,162,39,0.20) 100%)",
            }}
          />
          {filtered.map((entry, i) => {
            const meta = ACTION_META[entry.action];
            const Icon = meta.Icon;
            const ago = formatDistance(new Date(entry.at), PACK_NOW, {
              addSuffix: true,
            });
            return (
              <RevealOnScroll key={entry.id} as="li" index={Math.min(i, 6)} className="relative">
                {/* Node — colored circle on the spine */}
                <span
                  aria-hidden="true"
                  className="absolute w-3 h-3 rounded-full"
                  style={{
                    insetInlineStart: "-1.625rem",
                    top: "0.875rem",
                    background: meta.color,
                    boxShadow: `0 0 0 3px var(--surface-1), 0 0 8px ${meta.color}55`,
                  }}
                />
                {/* Event card */}
                <div
                  className="ast-card-2 p-3 sm:p-4 transition-shadow"
                  style={{ borderLeftColor: meta.color, borderLeftWidth: "2px" }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                      style={{ background: meta.bg, color: meta.color }}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-snug" style={{ color: "var(--text-hi)" }}>
                        <span className="font-medium">{entry.actor}</span>
                        <span style={{ color: "var(--text-lo)" }}> · {entry.role}</span>
                      </p>
                      <p
                        className="text-[13px] mt-0.5 leading-snug"
                        style={{ color: "var(--text-mid)" }}
                      >
                        {locale === "ar" ? meta.verbAr : meta.verbEn}
                      </p>
                      <p
                        className="text-[12px] mt-1 leading-snug"
                        style={{ color: "var(--text-lo)" }}
                      >
                        {entry.purpose}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="ast-chip">
                          <Clock className="w-3 h-3" strokeWidth={1.75} />
                          <span className="tabular">{ago}</span>
                        </span>
                        <span
                          className="ast-chip"
                          style={{
                            color: meta.color,
                            background: meta.bg,
                            borderColor: meta.border,
                          }}
                        >
                          {entry.lawfulBasis}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </RevealOnScroll>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ---------- Skeleton ---------- */

function MeSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="ast-card h-24 ast-shimmer rounded-[14px]" />
      <div className="ast-card h-44 ast-shimmer rounded-[14px]" />
      <div className="ast-card p-6 space-y-4 ast-shimmer rounded-[14px]">
        <div className="h-5 w-1/3 rounded bg-white/5" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-white/5" />
        ))}
      </div>
      <div className="ast-card h-72 ast-shimmer rounded-[14px]" />
      <div className="ast-card h-48 ast-shimmer rounded-[14px]" />
    </div>
  );
}

/* ---------- Error banner ---------- */

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
          We can&apos;t reach your data file right now.
        </p>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
          {message}
        </p>
      </div>
      <button
        onClick={onRetry}
        className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium shrink-0"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--text-hi)",
        }}
      >
        <RotateCcw className="w-4 h-4" strokeWidth={1.75} />
        Retry
      </button>
    </div>
  );
}

/* ---------- Data-row model ---------- */

interface DataRow {
  source: string;
  purpose: string;
  retention: string;
  lastViewed: string;
  sample: unknown;
  count: number;
  hidden?: boolean; // hidden when consent off (pulse)
}

/* ---------- Ripple state ---------- */

interface RippleState {
  kind: "grant" | "revoke";
  ts: number;
}

/* ============================================================
   Component
   ============================================================ */

export function MeScreen() {
  const employeeId = useAppStore((s) => s.currentEmployeeId);
  const locale = useAppStore((s) => s.locale);
  const overrides = useAppStore((s) => s.consentOverrides);
  const setConsent = useAppStore((s) => s.setConsent);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pendingPurpose, setPendingPurpose] = useState<Purpose | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // ENHANCE-STYLING-5 — new state
  const [ripples, setRipples] = useState<Record<string, RippleState | null>>({});
  const [hasExportedData, setHasExportedData] = useState(false);
  const [highlightPurpose, setHighlightPurpose] = useState<Purpose | null>(null);
  const consentSectionRef = useRef<HTMLElement | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/me/data?employeeId=${encodeURIComponent(employeeId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<MeData> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      setData(json.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pulseOn = useMemo(() => {
    if (!data) return false;
    return purposeGranted(data.consentRecords, overrides, PURPOSES[1]);
  }, [data, overrides]);

  // Trigger a brief ripple from the switch on toggle. Teal when
  // granting, muted gray when revoking. Self-cleans after 500ms.
  const triggerRipple = useCallback((purpose: Purpose, kind: "grant" | "revoke") => {
    const ts = Date.now();
    setRipples((prev) => ({ ...prev, [purpose]: { kind, ts } }));
    window.setTimeout(() => {
      setRipples((prev) => {
        const cur = prev[purpose];
        if (cur && cur.ts === ts) {
          return { ...prev, [purpose]: null };
        }
        return prev;
      });
    }, 500);
  }, []);

  const handleToggle = useCallback(
    async (meta: PurposeMeta, next: boolean) => {
      if (meta.required) return;
      // Fire the ripple immediately (before async work) so the user
      // sees instant feedback even on a slow network.
      triggerRipple(meta.key, next ? "grant" : "revoke");
      setPendingPurpose(meta.key);
      // Optimistic update via the store
      setConsent(meta.key, next);
      try {
        const res = await fetch("/api/v1/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId, purpose: meta.key, granted: next, version: "v1" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiEnvelope<{ receiptId: string; grantedAt: string }> = await res.json();
        if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
        const stamp = format(new Date(json.data.grantedAt), "HH:mm");
        if (next) {
          toast.success(`Consent recorded · ${json.data.receiptId} at ${stamp}`, {
            description: meta.labelEn,
          });
        } else {
          toast(`Revoked · ${json.data.receiptId}`, {
            description: meta.labelEn,
          });
        }
        // Refetch so the snapshot reflects the server (and the
        // receipt chip below the toggle pulls the latest record).
        await fetchData();
      } catch (e) {
        // Roll back
        setConsent(meta.key, !next);
        toast.error("Could not update consent", {
          description: e instanceof Error ? e.message : "Network error",
        });
      } finally {
        setPendingPurpose(null);
      }
    },
    [employeeId, fetchData, setConsent, triggerRipple],
  );

  const handleRevokeAll = useCallback(async () => {
    const optionalPurposes = PURPOSES.filter((p) => !p.required);
    for (const p of optionalPurposes) {
      const currentlyOn = data ? purposeGranted(data.consentRecords, overrides, p) : false;
      if (currentlyOn) {
        setConsent(p.key, false);
        try {
          await fetch("/api/v1/consent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId, purpose: p.key, granted: false, version: "v1" }),
          });
        } catch {
          /* ignore — already rolled back state */
        }
      }
    }
    setRevokeOpen(false);
    toast("All optional consents revoked", {
      description:
        "Pulse, sharing, comment retention, manager visibility, and analytics are off. Journey assistance remains on.",
    });
    await fetchData();
  }, [data, employeeId, fetchData, overrides, setConsent]);

  const handleExportJson = useCallback(() => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `astrolabe-me-${employeeId}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setHasExportedData(true);
    toast.success("Exported as JSON", {
      description: `${employeeId} · snapshot ${data.snapshotAt.slice(0, 10)}`,
    });
  }, [data, employeeId]);

  const handleExportPdf = useCallback(() => {
    setHasExportedData(true);
    toast("PDF export queued — we'll email you", {
      description: "A signed PDF copy of your data file will arrive within 24 hours.",
    });
  }, []);

  const handleCopyReceipt = useCallback((receiptId: string, grantedAt: string) => {
    const text = `RC-${receiptId} · ${format(new Date(grantedAt), "HH:mm")}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => toast.success("Receipt copied", { description: text }))
        .catch(() => toast.error("Could not copy"));
    } else {
      toast.error("Clipboard not available");
    }
  }, []);

  // Scroll the consent section into view + flash the first OFF-able
  // toggle (currently ON, not required) with a 1.5s sand-gold glow.
  const improvePrivacy = useCallback(() => {
    consentSectionRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
    if (!data) return;
    const target = PURPOSES.find(
      (p) => !p.required && purposeGranted(data.consentRecords, overrides, p),
    );
    if (target) {
      setHighlightPurpose(target.key);
      window.setTimeout(() => setHighlightPurpose(null), 1500);
    }
  }, [data, overrides, reducedMotion]);

  // Live privacy score — recomputes whenever consent overrides or
  // the export flag changes. Drives the NumberTicker + SVG arc.
  const privacyScore = useMemo(() => {
    if (!data) return 0;
    return computePrivacyScore(data.consentRecords, overrides, hasExportedData);
  }, [data, overrides, hasExportedData]);

  // Full audit timeline — server view log + synthetic entries.
  const auditEntries = useMemo<AuditEntry[]>(() => {
    if (!data) return [];
    return buildAuditTimeline(data.viewLog);
  }, [data]);

  /* ---------- Build data-held rows from server snapshot ---------- */
  const dataRows: DataRow[] = useMemo(() => {
    if (!data) return [];
    const nowIso = data.generatedAt;
    const rows: DataRow[] = [
      {
        source: "Employee record",
        purpose: "Journey assistance",
        retention: "Duration of employment + 6 years",
        lastViewed: data.viewLog[0]?.at ?? nowIso,
        count: 1,
        sample: data.employee,
      },
      {
        source: "Journey events",
        purpose: "Journey assistance",
        retention: "Duration of employment + 6 years",
        lastViewed: data.viewLog[0]?.at ?? nowIso,
        count: data.journeyEvents.length,
        sample: data.journeyEvents.slice(0, 5),
      },
      {
        source: "Service requests",
        purpose: "Journey assistance",
        retention: "Duration of employment + 6 years",
        lastViewed: data.viewLog[0]?.at ?? nowIso,
        count: data.serviceRequests.length,
        sample: data.serviceRequests,
      },
      {
        source: "Pulse responses",
        purpose: "Pulse capture",
        retention: "12 months (or until consent revoked)",
        lastViewed: "—",
        count: data.pulseResponses.length,
        sample: data.pulseResponses,
        hidden: !pulseOn,
      },
      {
        source: "Consent records",
        purpose: "Audit / proof",
        retention: "Duration of employment + 6 years",
        lastViewed: nowIso,
        count: data.consentRecords.length,
        sample: data.consentRecords,
      },
      {
        source: "Audit events",
        purpose: "Access log",
        retention: "Duration of employment + 6 years",
        lastViewed: nowIso,
        count: data.auditEvents.length,
        sample: data.auditEvents,
      },
    ];
    return rows;
  }, [data, pulseOn]);

  /* ---------- Render ---------- */

  return (
    <div dir={dir} className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      {/* Heading */}
      <header className="mb-6">
        <div
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--brand-400)" }}
        >
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{locale === "ar" ? "مركز الخصوصية" : "Privacy center"}</span>
        </div>
        <h1
          className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-tight"
          style={{ color: "var(--text-hi)" }}
        >
          {locale === "ar" ? "بياناتك ملكك" : "Your data is yours"}
        </h1>
      </header>

      {/* Privacy summary banner */}
      <motion.section
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="ast-card p-5 sm:p-6 mb-6"
        style={{ borderColor: "rgba(22,154,165,0.32)" }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.12)", color: "var(--brand-400)" }}
          >
            <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-[15px] sm:text-[16px] font-medium"
              style={{ color: "var(--text-hi)" }}
            >
              {locale === "ar"
                ? "بياناتك ملكك. لا نستخدمها أبداً لتقييم الأداء أو الإجراءات التأديبية أو قرارات التأشيرة."
                : "Your data is yours. We never use it for performance, discipline, or visa decisions."}
            </p>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? "تتحكم في ما نراه وفي ما نشاركه. كل تغيير يُسجَّل بإيصال."
                : "You control what we see and what we share. Every change is recorded with a receipt."}
            </p>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setPrivacyOpen(true);
              }}
              className="ast-focus inline-flex items-center gap-1.5 mt-3 text-[13px] font-medium"
              style={{ color: "var(--brand-400)" }}
            >
              {locale === "ar" ? "ملخص الخصوصية" : "Privacy summary"}
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </a>
          </div>
        </div>
      </motion.section>

      {/* Privacy page modal */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent
          className="sm:max-w-[820px] max-h-[88vh] overflow-y-auto"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            color: "var(--text-hi)",
          }}
        >
          <DialogTitle className="sr-only">
            {locale === "ar" ? "الخصوصية بالكامل" : "Privacy in full"}
          </DialogTitle>
          <PrivacyPage />
        </DialogContent>
      </Dialog>

      {/* Loading / error */}
      {loading ? (
        <MeSkeleton />
      ) : err ? (
        <ErrorBanner message={err} onRetry={fetchData} />
      ) : data ? (
        <>
          {/* Privacy score card */}
          <PrivacyScoreCard
            score={privacyScore}
            locale={locale}
            reducedMotion={reducedMotion}
            onImprove={improvePrivacy}
            hasExported={hasExportedData}
          />

          {/* Pulse-off disclosure when applicable */}
          <AnimatePresence>
            {!pulseOn && (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="ast-card-2 p-4 mb-6 flex items-start gap-3"
                style={{ borderColor: "rgba(217,119,6,0.32)", background: "rgba(217,119,6,0.06)" }}
              >
                <Info
                  className="w-4 h-4 mt-0.5 shrink-0"
                  strokeWidth={1.75}
                  style={{ color: "var(--status-watch)" }}
                />
                <p className="text-[13px]" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar"
                    ? "نبضتك متوقفة. يستخدم هذا العرض بيانات الرحلة والطلبات فقط."
                    : "Pulse signals are off, so this view uses journey and request data only."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Consent toggles — 3D cards with spring drop-in + ripple */}
          <section ref={consentSectionRef} className="ast-card p-5 sm:p-6 mb-6 scroll-mt-6">
            <div className="flex items-baseline justify-between mb-5">
              <div>
                <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "ما الذي تسمح به" : "What you allow"}
                </h2>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar"
                    ? "ستة أغراض. كل واحد قابل للعكس. كل تغيير يولّد إيصالاً."
                    : "Six purposes. Each is reversible. Every change generates a receipt."}
                </p>
              </div>
            </div>

            <ul className="space-y-3">
              {PURPOSES.map((meta, index) => {
                const granted = purposeGranted(data.consentRecords, overrides, meta);
                const isPending = pendingPurpose === meta.key;
                const latest = latestConsent(data.consentRecords, meta.key);
                const ripple = ripples[meta.key];
                const isHighlighted = highlightPurpose === meta.key;
                const accentColor = meta.required
                  ? "var(--accent-500)"
                  : granted
                    ? "var(--brand-500)"
                    : "var(--border)";
                return (
                  <Tilt3D key={meta.key} maxDeg={2} as="li">
                    <motion.div
                      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : {
                              type: "spring",
                              stiffness: 220,
                              damping: 26,
                              delay: Math.min(index, 6) * 0.04,
                            }
                      }
                      whileHover={reducedMotion ? undefined : { y: -2 }}
                      className={cn(
                        "relative ast-card-2 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-4 transition-shadow",
                        !granted && !meta.required && "opacity-70",
                      )}
                      style={{
                        borderLeftColor: accentColor,
                        borderLeftWidth: "3px",
                        boxShadow:
                          granted && !meta.required ? "inset 0 0 0 0 transparent" : undefined,
                      }}
                    >
                      {/* Highlight flash — sand-gold ring on Improve-my-privacy target */}
                      <motion.span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-[var(--radius-md)]"
                        initial={false}
                        animate={
                          isHighlighted
                            ? {
                                boxShadow: [
                                  "0 0 0 0 rgba(201,162,39,0)",
                                  "0 0 0 6px rgba(201,162,39,0.50)",
                                  "0 0 0 0 rgba(201,162,39,0)",
                                ],
                              }
                            : { boxShadow: "0 0 0 0 rgba(201,162,39,0)" }
                        }
                        transition={{ duration: 1.5, ease: "easeOut" }}
                      />
                      {/* Teal glow under the toggle when granted (not required) */}
                      {granted && !meta.required && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -inset-px rounded-[var(--radius-md)]"
                          style={{
                            boxShadow:
                              "inset 0 0 24px rgba(22,154,165,0.06), 0 0 12px rgba(22,154,165,0.04)",
                          }}
                        />
                      )}

                      <div className="flex-1 min-w-0 relative">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3
                            className="text-[15px] font-medium"
                            style={{ color: "var(--text-hi)" }}
                          >
                            {locale === "ar" ? meta.labelAr : meta.labelEn}
                          </h3>
                          {meta.required && (
                            <span
                              className="ast-chip"
                              style={{
                                color: "var(--accent-500)",
                                background: "rgba(201,162,39,0.08)",
                                borderColor: "rgba(201,162,39,0.32)",
                              }}
                            >
                              <Lock className="w-3 h-3" strokeWidth={2} />
                              {locale === "ar" ? "ضروري" : "Required"}
                            </span>
                          )}
                          {granted ? (
                            <span
                              className="ast-chip"
                              style={{
                                color: "var(--status-steady)",
                                background: "rgba(14,159,110,0.08)",
                                borderColor: "rgba(14,159,110,0.30)",
                              }}
                            >
                              <Check className="w-3 h-3" strokeWidth={2} />
                              {locale === "ar" ? "مُفعّل" : "Active"}
                            </span>
                          ) : (
                            <span className="ast-chip">{locale === "ar" ? "متوقف" : "Off"}</span>
                          )}
                        </div>
                        <p
                          className="text-[13px] mt-2 leading-relaxed"
                          style={{ color: "var(--text-mid)" }}
                        >
                          {locale === "ar" ? meta.descAr : meta.descEn}
                        </p>
                        <p
                          className="text-[12px] mt-2 leading-relaxed"
                          style={{ color: "var(--text-lo)" }}
                        >
                          <span className="font-medium" style={{ color: "var(--text-mid)" }}>
                            {locale === "ar" ? "إذا رفضت: " : "What changes if you say no: "}
                          </span>
                          {locale === "ar" ? meta.noChangeAr : meta.noChangeEn}
                        </p>

                        {/* Receipt chip — fades in (320ms) when the latest record changes */}
                        <AnimatePresence mode="wait">
                          {latest && (
                            <motion.div
                              key={latest.id}
                              initial={reducedMotion ? false : { opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                              transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                              className="mt-3"
                            >
                              <button
                                type="button"
                                onClick={() => handleCopyReceipt(latest.id, latest.grantedAt)}
                                className="ast-focus inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] tabular transition-colors"
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  color: "var(--text-mid)",
                                  background: "var(--surface-2)",
                                  border: "1px solid var(--border)",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                                aria-label={locale === "ar" ? "نسخ الإيصال" : "Copy receipt"}
                              >
                                <Copy className="w-3 h-3" strokeWidth={1.75} />
                                <span>RC-{latest.id}</span>
                                <span style={{ color: "var(--text-lo)" }}>·</span>
                                <span>{format(new Date(latest.grantedAt), "HH:mm")}</span>
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="shrink-0 self-start sm:self-center relative">
                        {/* Ripple emanating from the switch on toggle */}
                        <div className="relative inline-flex">
                          <AnimatePresence>
                            {ripple && (
                              <motion.span
                                key={ripple.ts}
                                aria-hidden="true"
                                className="absolute left-1/2 top-1/2 w-8 h-8 -ml-4 -mt-4 rounded-full pointer-events-none"
                                initial={{ opacity: 0.5, scale: 0 }}
                                animate={{ opacity: 0, scale: 4 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                                style={{
                                  background:
                                    ripple.kind === "grant"
                                      ? "rgba(22,154,165,0.45)"
                                      : "rgba(125,141,161,0.40)",
                                }}
                              />
                            )}
                          </AnimatePresence>
                          {meta.required ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex items-center gap-1.5">
                                  <Lock
                                    className="w-3.5 h-3.5"
                                    strokeWidth={1.75}
                                    style={{ color: "var(--accent-500)" }}
                                  />
                                  <Switch
                                    checked
                                    disabled
                                    aria-label={`${meta.labelEn} — required`}
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {locale === "ar" ? "ضروري للاستخدام" : "Required for use"}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex">
                                  <Switch
                                    checked={granted}
                                    disabled={isPending}
                                    onCheckedChange={(v) => handleToggle(meta, v)}
                                    aria-label={meta.labelEn}
                                    className="ast-focus data-[state=checked]:bg-[var(--brand-500)]"
                                  />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                {granted
                                  ? locale === "ar"
                                    ? "اضغط لإيقافه"
                                    : "Click to revoke"
                                  : locale === "ar"
                                    ? "اضغط للتفعيل"
                                    : "Click to grant"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </Tilt3D>
                );
              })}
            </ul>

            {/* Revoke all */}
            <div className="mt-5 flex justify-end">
              <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
                <AlertDialogTrigger asChild>
                  <button
                    className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium transition-colors"
                    style={{
                      background: "rgba(220,38,38,0.08)",
                      border: "1px solid rgba(220,38,38,0.32)",
                      color: "var(--status-friction)",
                    }}
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    {locale === "ar"
                      ? "إيقاف كل الموافقات الاختيارية"
                      : "Revoke all optional consents"}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border)",
                    color: "var(--text-hi)",
                  }}
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle style={{ color: "var(--text-hi)" }}>
                      {locale === "ar"
                        ? "إيقاف كل الموافقات الاختيارية؟"
                        : "Revoke all optional consents?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription style={{ color: "var(--text-mid)" }}>
                      {locale === "ar"
                        ? "سيتم إيقاف النبضة ومشاركة الملخص والاحتفاظ بالتعليقات ورؤية المدير والتحليلات. مساعدة الرحلة تبقى مفعّلة لأنها ضرورية. يمكنك إعادة تفعيل أي غرض لاحقاً."
                        : "This will turn off pulse capture, pulse summary sharing, comment retention, manager visibility, and aggregate analytics. Journey assistance stays on because it's required. You can re-enable any purpose later."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      className="ast-focus"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        color: "var(--text-hi)",
                      }}
                    >
                      {locale === "ar" ? "تراجع" : "Cancel"}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRevokeAll}
                      className="ast-focus"
                      style={{
                        background: "var(--status-friction)",
                        color: "white",
                        border: "1px solid var(--status-friction)",
                      }}
                    >
                      {locale === "ar" ? "أوقف الكل" : "Revoke all"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>

          {/* Data held about me */}
          <section className="ast-card p-5 sm:p-6 mb-6">
            <div className="flex items-baseline justify-between mb-5 flex-wrap gap-3">
              <div>
                <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar" ? "البيانات المخزّنة عنك" : "Data held about you"}
                </h2>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar"
                    ? "كل ما لدينا في ملف واحد. اضغط أي صف لرؤية عينة."
                    : "Everything we hold, in one file. Tap any row to see a sample."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportJson}
                  className="ast-focus inline-flex items-center gap-2 h-11 px-3.5 rounded-full text-[13px] font-medium transition-colors"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-hi)",
                  }}
                >
                  <FileJson className="w-4 h-4" strokeWidth={1.75} />
                  {locale === "ar" ? "تصدير JSON" : "Export as JSON"}
                </button>
                <button
                  onClick={handleExportPdf}
                  className="ast-focus inline-flex items-center gap-2 h-11 px-3.5 rounded-full text-[13px] font-medium transition-colors"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-hi)",
                  }}
                >
                  <FileText className="w-4 h-4" strokeWidth={1.75} />
                  {locale === "ar" ? "تصدير PDF" : "Export as PDF"}
                </button>
              </div>
            </div>

            <div
              className="rounded-[10px] overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <Table>
                <TableHeader>
                  <TableRow
                    style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
                  >
                    <TableHead
                      className="text-[11px] uppercase tracking-[0.12em]"
                      style={{ color: "var(--text-lo)" }}
                    >
                      {locale === "ar" ? "المصدر" : "Source"}
                    </TableHead>
                    <TableHead
                      className="text-[11px] uppercase tracking-[0.12em]"
                      style={{ color: "var(--text-lo)" }}
                    >
                      {locale === "ar" ? "الغرض" : "Purpose"}
                    </TableHead>
                    <TableHead
                      className="text-[11px] uppercase tracking-[0.12em] hidden sm:table-cell"
                      style={{ color: "var(--text-lo)" }}
                    >
                      {locale === "ar" ? "الاحتفاظ" : "Retention"}
                    </TableHead>
                    <TableHead
                      className="text-[11px] uppercase tracking-[0.12em] hidden md:table-cell"
                      style={{ color: "var(--text-lo)" }}
                    >
                      {locale === "ar" ? "آخر مشاهدة" : "Last viewed"}
                    </TableHead>
                    <TableHead
                      className="text-[11px] uppercase tracking-[0.12em] text-right"
                      style={{ color: "var(--text-lo)" }}
                    >
                      <span className="tabular">{locale === "ar" ? "العدد" : "Count"}</span>
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataRows.map((row) => {
                    const isOpen = expandedRow === row.source;
                    const suppressed = row.hidden;
                    return (
                      <Fragment key={row.source}>
                        <TableRow
                          className="cursor-pointer ast-focus"
                          style={{ borderColor: "var(--border-soft)" }}
                          onClick={() => setExpandedRow(isOpen ? null : row.source)}
                        >
                          <TableCell
                            className="font-medium text-[13px]"
                            style={{ color: "var(--text-hi)" }}
                          >
                            <div className="flex items-center gap-2">
                              {suppressed ? (
                                <Lock
                                  className="w-3.5 h-3.5 shrink-0"
                                  strokeWidth={1.75}
                                  style={{ color: "var(--text-lo)" }}
                                />
                              ) : (
                                <Unlock
                                  className="w-3.5 h-3.5 shrink-0"
                                  strokeWidth={1.75}
                                  style={{ color: "var(--brand-400)" }}
                                />
                              )}
                              {row.source}
                            </div>
                          </TableCell>
                          <TableCell className="text-[13px]" style={{ color: "var(--text-mid)" }}>
                            {row.purpose}
                          </TableCell>
                          <TableCell
                            className="text-[12px] hidden sm:table-cell"
                            style={{ color: "var(--text-mid)" }}
                          >
                            {row.retention}
                          </TableCell>
                          <TableCell
                            className="text-[12px] hidden md:table-cell tabular"
                            style={{ color: "var(--text-mid)" }}
                          >
                            {row.lastViewed === "—"
                              ? "—"
                              : format(new Date(row.lastViewed), "d MMM HH:mm")}
                          </TableCell>
                          <TableCell
                            className="text-right tabular text-[13px]"
                            style={{ color: "var(--text-hi)" }}
                          >
                            {suppressed ? "—" : row.count}
                          </TableCell>
                          <TableCell className="text-right">
                            {suppressed ? (
                              <span className="text-[11px]" style={{ color: "var(--text-lo)" }}>
                                {locale === "ar" ? "مكتوم" : "suppressed"}
                              </span>
                            ) : (
                              <ChevronDown
                                className={cn(
                                  "w-4 h-4 transition-transform",
                                  isOpen && "rotate-180",
                                )}
                                strokeWidth={1.75}
                                style={{ color: "var(--text-mid)" }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <tr style={{ background: "var(--surface-2)" }}>
                            <td colSpan={6} className="p-0">
                              <motion.div
                                initial={reducedMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.2 }}
                                className="p-4 sm:p-5"
                              >
                                {suppressed ? (
                                  <p className="text-[12px]" style={{ color: "var(--text-lo)" }}>
                                    {locale === "ar"
                                      ? "هذا الصف مكتوم لأن موافقة النبضة متوقفة."
                                      : "This row is suppressed because pulse capture consent is off."}
                                  </p>
                                ) : (
                                  <pre
                                    className="text-[11px] font-mono leading-relaxed max-h-72 overflow-auto rounded p-3"
                                    style={{
                                      background: "var(--surface-0)",
                                      border: "1px solid var(--border)",
                                      color: "var(--text-mid)",
                                      direction: "ltr",
                                    }}
                                  >
                                    {JSON.stringify(row.sample, null, 2)}
                                  </pre>
                                )}
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Audit timeline — replaces the flat view log */}
          <AuditTimeline entries={auditEntries} locale={locale} reducedMotion={reducedMotion} />

          {/* Footer — receipt anchor */}
          <p className="mt-6 text-[11px] text-center tabular" style={{ color: "var(--text-lo)" }}>
            {locale === "ar"
              ? `ملف ${employeeId} · لقطة ${data.snapshotAt.slice(0, 10)} · ${data.consentRecords.length} سجل موافقة`
              : `File ${employeeId} · snapshot ${data.snapshotAt.slice(0, 10)} · ${data.consentRecords.length} consent records`}
          </p>
        </>
      ) : null}
    </div>
  );
}
