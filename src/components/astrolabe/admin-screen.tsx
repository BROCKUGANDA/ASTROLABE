"use client";

/* ============================================================
   ASTROLABE — Admin Screen (operability console, PRD §25)
   Renders: ingestion, quarantine, corpus, feature flags,
   replay, audit chain, health endpoints.
   All values are synthetic-prototype only — no real backend.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Database,
  ShieldCheck,
  ShieldAlert,
  Flag,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  RotateCcw,
  Link2,
  Activity,
  Server,
  Heart,
  GitBranch,
  Boxes,
  FileWarning,
  Loader2,
  XCircle,
  ClipboardList,
  Copy,
  Check,
  Trash2,
  Plus,
  ArrowUpDown,
  RefreshCw,
  X,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { BandChip, type Band as BandT } from "@/components/astrolabe/widgets";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PilotPlanPage } from "@/components/astrolabe/pilot-plan-page";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

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

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string; latencyMs?: number };
  error: { code: string; message: string; hint?: string } | null;
}

/* ---------- Static synthetic data ---------- */

const PACK_VERSION = "synthetic-2024-q4-v1";
const CORPUS_VERSION = "policies-2024-q4-v1";
const LAST_LOADED = "2024-10-19T10:00:00Z";

interface IngestionStat {
  label: string;
  labelAr: string;
  count: number;
}
const INGESTION_ROWS: IngestionStat[] = [
  { label: "Employees", labelAr: "الموظفون", count: 5 },
  { label: "Journey events", labelAr: "أحداث الرحلة", count: 32 },
  { label: "Service requests", labelAr: "طلبات الخدمة", count: 3 },
  { label: "Policy chunks", labelAr: "أجزاء السياسة", count: 17 },
  { label: "Pulse responses", labelAr: "ردود النبضة", count: 2 },
  { label: "Consent records", labelAr: "سجلات الموافقة", count: 6 },
];
const INGESTION_TOTAL = INGESTION_ROWS.reduce((a, r) => a + r.count, 0);

interface CorpusDoc {
  slug: string;
  label: string;
  labelAr: string;
}
const CORPUS_DOCS: CorpusDoc[] = [
  { slug: "relocation-policy", label: "Relocation", labelAr: "الانتقال" },
  { slug: "immigration-policy", label: "Immigration", labelAr: "الهجرة" },
  { slug: "it-policy", label: "IT Provisioning", labelAr: "تكنولوجيا المعلومات" },
  { slug: "onboarding-policy", label: "Onboarding", labelAr: "الالتحاق" },
  { slug: "learning-policy", label: "Learning", labelAr: "التعلم" },
  { slug: "mobility-policy", label: "Mobility", labelAr: "التنقل" },
  { slug: "payroll-policy", label: "Payroll", labelAr: "الرواتب" },
  { slug: "facilities-policy", label: "Facilities", labelAr: "المرافق" },
];
const CORPUS_CHUNKS = 17;
const CORPUS_BILINGUAL_PAIRS = 2;
const CORPUS_EN_ONLY = 13;

interface FeatureFlag {
  key: string;
  label: string;
  labelAr: string;
  description: string;
  descriptionAr: string;
  defaultOn: boolean;
}
const FEATURE_FLAGS: FeatureFlag[] = [
  { key: "ai_compose", label: "AI Compose", labelAr: "تأليف الذكاء", description: "Policy answer composition via model", descriptionAr: "تأليف إجابات السياسة عبر النموذج", defaultOn: true },
  { key: "semantic_cache", label: "Semantic cache", labelAr: "ذاكرة دلالية", description: "Semantic answer cache", descriptionAr: "ذاكرة الإجابات الدلالية", defaultOn: true },
  { key: "pulse_capture", label: "Pulse capture", labelAr: "التقاط النبضة", description: "Opt-in pulse prompts", descriptionAr: "مطالبات النبضة الاختيارية", defaultOn: true },
  { key: "auto_draft_escalation", label: "Auto-draft escalation", labelAr: "تصعيد تلقائي", description: "Auto-draft escalation packets", descriptionAr: "صياغة حزم التصعيد تلقائياً", defaultOn: true },
  { key: "manager_view", label: "Manager view", labelAr: "رؤية المدير", description: "Manager aggregate view", descriptionAr: "رؤية المدير المجمّعة", defaultOn: true },
  { key: "analytics_rollup", label: "Analytics rollup", labelAr: "تجميع التحليلات", description: "Cohort analytics rollups", descriptionAr: "تجميعات تحليل الفئات", defaultOn: true },
  { key: "arabic_locale", label: "Arabic locale", labelAr: "اللغة العربية", description: "Arabic UI + citations", descriptionAr: "واجهة وإشارات عربية", defaultOn: true },
  { key: "judge_mode", label: "Judge mode", labelAr: "وضع القاضي", description: "Judge mode scenario switcher", descriptionAr: "مبدّل سيناريوهات وضع القاضي", defaultOn: true },
];

interface AuditEventRow {
  id: string;
  actor: string;
  action: string;
  subject: string;
  subjectId: string;
  hash: string;
  prevHash: string;
  at: string;
}
const AUDIT_EVENTS: AuditEventRow[] = [
  { id: "ae-001", actor: "system", action: "ingestion", subject: "pack", subjectId: "synthetic-2024-q4-v1", hash: "0xabc4129f7e8d2c1b", prevHash: "0x0000000000000000", at: "2024-10-19T10:00:00Z" },
  { id: "ae-002", actor: "Fatima Al-Mansouri", action: "read_record", subject: "employee", subjectId: "E-1042", hash: "0xdef8734ab201f55c", prevHash: "0xabc4129f7e8d2c1b", at: "2024-10-19T10:42:11Z" },
  { id: "ae-003", actor: "system", action: "assess", subject: "employee", subjectId: "E-1043", hash: "0x1237c9e4a1b8d2f0", prevHash: "0xdef8734ab201f55c", at: "2024-10-19T11:08:43Z" },
  { id: "ae-004", actor: "Maria Santos", action: "consent", subject: "consent", subjectId: "CN-001", hash: "0x456b1d8ace2f7741", prevHash: "0x1237c9e4a1b8d2f0", at: "2024-10-19T13:59:02Z" },
  { id: "ae-005", actor: "system", action: "escalation", subject: "escalation", subjectId: "ESC-2024-038", hash: "0x789f0a2c4e1b9d33", prevHash: "0x456b1d8ace2f7741", at: "2024-10-19T14:14:55Z" },
];

interface HealthEndpoint {
  path: string;
  status: number;
  body: string;
  label: string;
  labelAr: string;
}
const HEALTH_ENDPOINTS: HealthEndpoint[] = [
  { path: "GET /healthz", status: 200, body: "ok", label: "Liveness", labelAr: "الحيوية" },
  { path: "GET /readyz", status: 200, body: "DB ✓ · Redis ✓ · Corpus ✓ · Map ✓", label: "Readiness", labelAr: "الجاهزية" },
  { path: "GET /version", status: 200, body: "v1.0.0", label: "Version", labelAr: "الإصدار" },
];

const ALL_EMPLOYEE_IDS = ["E-1042", "E-1043", "E-1044", "E-1045", "E-1046"];

/* ---------- Helpers ---------- */

function truncateHash(h: string): string {
  // "0x" + first 8 chars total + "…" + last 4 chars.
  // 0xabc4129f7e8d2c1b → 0xabc412…2c1b
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

function shortDate(iso: string, locale: "en" | "ar"): string {
  try {
    const d = new Date(iso);
    return format(d, "d MMM yyyy · HH:mm") + (locale === "ar" ? " ت" : " UTC");
  } catch {
    return iso;
  }
}

/* ---------- Audit chain tamper helpers (PRD §23-451) ---------- */

/** Actions performed by the system — colored teal in the timeline. */
const SYSTEM_ACTIONS = new Set(["ingestion", "assess", "escalation"]);
function isSystemAction(action: string): boolean {
  return SYSTEM_ACTIONS.has(action);
}

type TamperType = "alter_hash" | "delete_event" | "reorder_events" | "inject_fake";

interface VerifyResult {
  ok: boolean;
  verifiedCount: number;
  totalCount: number;
  tamperedEventId?: string;
  expectedPrev?: string;
  foundPrev?: string;
  lastVerifiedId?: string;
}

/** Walk the chain and verify every prev-hash links to the prior event's hash. */
function verifyChain(chain: AuditEventRow[]): VerifyResult {
  if (chain.length === 0) {
    return { ok: true, verifiedCount: 0, totalCount: 0 };
  }
  // Genesis event: its prevHash must be the zero marker "0x0000000000000000".
  const ZERO = "0x0000000000000000";
  if (chain[0].prevHash !== ZERO) {
    return {
      ok: false,
      verifiedCount: 0,
      totalCount: chain.length,
      tamperedEventId: chain[0].id,
      expectedPrev: ZERO,
      foundPrev: chain[0].prevHash,
      lastVerifiedId: undefined,
    };
  }
  let lastVerifiedId: string | undefined = chain[0].id;
  for (let i = 1; i < chain.length; i += 1) {
    const prev = chain[i - 1];
    const cur = chain[i];
    if (cur.prevHash !== prev.hash) {
      return {
        ok: false,
        verifiedCount: i,
        totalCount: chain.length,
        tamperedEventId: cur.id,
        expectedPrev: prev.hash,
        foundPrev: cur.prevHash,
        lastVerifiedId,
      };
    }
    lastVerifiedId = cur.id;
  }
  return {
    ok: true,
    verifiedCount: chain.length,
    totalCount: chain.length,
  };
}

function cloneChain(src: AuditEventRow[]): AuditEventRow[] {
  return src.map((e) => ({ ...e }));
}

/** Apply a tamper to a fresh copy of the chain. Returns the tampered copy and the set of affected ids. */
function applyTamper(type: TamperType): { chain: AuditEventRow[]; tamperedIds: string[] } {
  const chain = cloneChain(AUDIT_EVENTS);
  const tamperedIds: string[] = [];
  if (type === "alter_hash") {
    // ae-003's prevHash is rewritten to a fake value, breaking the link
    // at ae-003. (Matches the spec's example verification message.)
    const target = chain.find((e) => e.id === "ae-003");
    if (target) {
      target.prevHash = "0xFAKEFAKEFAKEFAKE";
      tamperedIds.push("ae-003");
    }
  } else if (type === "delete_event") {
    // Remove ae-002 → ae-003's prevHash no longer links to the prior event (ae-001).
    const idx = chain.findIndex((e) => e.id === "ae-002");
    if (idx >= 0) {
      chain.splice(idx, 1);
      const orphan = chain.find((e) => e.id === "ae-003");
      if (orphan) tamperedIds.push(orphan.id);
    }
  } else if (type === "reorder_events") {
    // Swap ae-002 and ae-003 → both become orphans of the new ordering.
    const a = chain.findIndex((e) => e.id === "ae-002");
    const b = chain.findIndex((e) => e.id === "ae-003");
    if (a >= 0 && b >= 0) {
      const tmp = chain[a];
      chain[a] = chain[b];
      chain[b] = tmp;
      tamperedIds.push("ae-002", "ae-003");
    }
  } else if (type === "inject_fake") {
    // Insert a synthetic event between ae-002 and ae-003 with a wrong prev hash.
    const idx = chain.findIndex((e) => e.id === "ae-003");
    if (idx >= 0) {
      const fake: AuditEventRow = {
        id: "ae-fake",
        actor: "system",
        action: "ingestion",
        subject: "pack",
        subjectId: "synthetic-fake-v1",
        hash: "0xDEADBEEFDEADBEEF",
        prevHash: "0xWRONGPREV000000",
        at: "2024-10-19T11:00:00Z",
      };
      chain.splice(idx, 0, fake);
      tamperedIds.push("ae-fake");
    }
  }
  return { chain, tamperedIds };
}

/* ---------- Skeletons ---------- */

function CardSkeleton() {
  return (
    <div className="ast-card p-6 h-40 ast-shimmer rounded-[14px]" aria-hidden="true" />
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
          Replay couldn&apos;t run.
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
   Section: Ingestion report
   ============================================================ */
function IngestionReportCard() {
  const locale = useAppStore((s) => s.locale);
  const [reingesting, setReingesting] = useState(false);

  const handleReingest = () => {
    setReingesting(true);
    setTimeout(() => {
      setReingesting(false);
      toast.success(
        locale === "ar" ? "أُعيد تحميل الحزمة" : "Pack re-ingested",
        { description: locale === "ar" ? `${PACK_VERSION} · ${INGESTION_TOTAL} صفاً` : `${PACK_VERSION} · ${INGESTION_TOTAL} rows validated` }
      );
    }, 850);
  };

  return (
    <section className="ast-card p-5 sm:p-6 ast-fade-rise">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Database className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "تقرير الابتلاع" : "Ingestion report"}
            </h2>
            <p className="text-[11px] font-mono tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
              {PACK_VERSION}
            </p>
          </div>
        </div>
        <button
          onClick={handleReingest}
          disabled={reingesting}
          className="ast-focus inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium disabled:opacity-60"
          style={{
            background: "var(--brand-500)",
            color: "var(--surface-0)",
            border: "1px solid var(--brand-500)",
          }}
        >
          {reingesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          {locale === "ar" ? "إعادة تحميل" : "Re-ingest"}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4">
        {INGESTION_ROWS.map((row) => (
          <div key={row.label} className="ast-card-2 p-3">
            <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? row.labelAr : row.label}
            </p>
            <p className="text-[22px] font-semibold tabular mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">
              {row.count}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 pt-3" style={{ borderTop: "1px solid var(--border-soft)" }}>
        <div className="flex items-center gap-2">
          <span className="ast-dot ast-dot-steady" aria-hidden="true" />
          <span className="text-[12px]" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "الصفوف في الحجر الصحي"
              : "Quarantined rows"}
          </span>
          <span className="text-[12px] font-mono tabular" style={{ color: "var(--status-steady)" }} dir="ltr">0</span>
          <span className="text-[11px]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? `· جميع ${INGESTION_TOTAL} صفاً اجتازت التحقق` : `· all ${INGESTION_TOTAL} rows passed validation`}
          </span>
        </div>
        <p className="text-[11px] font-mono tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
          {locale === "ar" ? "آخر تحميل" : "Last loaded"}: {shortDate(LAST_LOADED, locale)}
        </p>
      </div>
    </section>
  );
}

/* ============================================================
   Section: Quarantine table
   ============================================================ */
function QuarantineTable() {
  const locale = useAppStore((s) => s.locale);

  return (
    <section className="ast-card p-5 sm:p-6 ast-fade-rise">
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{ background: "rgba(217,119,6,0.10)", color: "var(--status-watch)" }}
        >
          <FileWarning className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "الحجر الصحي" : "Quarantine"}
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? `لا صفوف محجوزة. جميع السجلات الـ${INGESTION_TOTAL} اجتازت التحقق من المخطط.`
              : `No quarantined rows. All ${INGESTION_TOTAL} records passed schema validation.`}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "الصف" : "Row"}
              </th>
              <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "السبب" : "Reason"}
              </th>
              <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium hidden sm:table-cell" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "التفاصيل" : "Detail"}
              </th>
              <th className="text-right p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "الحالة" : "Status"}
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Empty-state row */}
            <tr>
              <td colSpan={4} className="p-6 text-center">
                <div className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-lo)" }}>
                  <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} style={{ color: "var(--status-steady)" }} />
                  {locale === "ar" ? "الحجر الصحي فارغ — كل شيء سليم" : "Quarantine empty — all clear"}
                </div>
              </td>
            </tr>
            {/* Sample dimmed demonstration row */}
            <tr
              style={{ borderBottom: "1px solid var(--border-soft)", opacity: 0.55 }}
              aria-label="Sample quarantined row demonstration"
            >
              <td className="p-2 font-mono tabular" style={{ color: "var(--text-mid)" }} dir="ltr">Row 48</td>
              <td className="p-2">
                <span className="ast-chip font-mono text-[10px]" style={{ color: "var(--status-watch)" }}>
                  E_VALIDATION
                </span>
              </td>
              <td className="p-2 hidden sm:table-cell" style={{ color: "var(--text-lo)" }} dir="ltr">
                missing <code className="font-mono">employeeId</code> → quarantined
              </td>
              <td className="p-2 text-right">
                <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--status-watch)" }}>
                  <span className="ast-dot ast-dot-watch" aria-hidden="true" />
                  {locale === "ar" ? "محجوز" : "quarantined"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ============================================================
   Section: Corpus version
   ============================================================ */
function CorpusVersionCard() {
  const locale = useAppStore((s) => s.locale);
  const [reindexing, setReindexing] = useState(false);

  const handleReindex = () => {
    setReindexing(true);
    setTimeout(() => {
      setReindexing(false);
      toast.success(
        locale === "ar" ? "أُعيدت فهرسة النصوص" : "Corpus re-indexed",
        { description: `${CORPUS_VERSION} · ${CORPUS_CHUNKS} chunks · ${CORPUS_DOCS.length} docs` }
      );
    }, 900);
  };

  return (
    <section className="ast-card p-5 sm:p-6 ast-fade-rise">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Boxes className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "إصدار النصوص" : "Corpus version"}
            </h2>
            <p className="text-[11px] font-mono tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
              {CORPUS_VERSION}
            </p>
          </div>
        </div>
        <button
          onClick={handleReindex}
          disabled={reindexing}
          className="ast-focus inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium disabled:opacity-60"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-hi)",
          }}
        >
          {reindexing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          {locale === "ar" ? "إعادة الفهرسة" : "Re-index corpus"}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
        <div className="ast-card-2 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "المستندات" : "Documents"}
          </p>
          <p className="text-[22px] font-semibold tabular mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">{CORPUS_DOCS.length}</p>
        </div>
        <div className="ast-card-2 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "الأجزاء" : "Chunks"}
          </p>
          <p className="text-[22px] font-semibold tabular mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">{CORPUS_CHUNKS}</p>
        </div>
        <div className="ast-card-2 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "أزواج ثنائية" : "Bilingual pairs"}
          </p>
          <p className="text-[22px] font-semibold tabular mt-1" style={{ color: "var(--accent-500)" }} dir="ltr">{CORPUS_BILINGUAL_PAIRS}</p>
        </div>
        <div className="ast-card-2 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar" ? "إنجليزي فقط" : "EN-only"}
          </p>
          <p className="text-[22px] font-semibold tabular mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">{CORPUS_EN_ONLY}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CORPUS_DOCS.map((doc) => (
          <span
            key={doc.slug}
            className="ast-chip font-mono text-[11px]"
            title={doc.slug}
          >
            {locale === "ar" ? doc.labelAr : doc.label}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Section: Feature flags / kill switches
   ============================================================ */
function FeatureFlagsPanel() {
  const locale = useAppStore((s) => s.locale);
  const [flags, setFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, f.defaultOn]))
  );

  const toggle = (f: FeatureFlag) => {
    const next = !flags[f.key];
    setFlags((prev) => ({ ...prev, [f.key]: next }));
    toast(
      locale === "ar"
        ? `العلم ${f.key} أصبح ${next ? "مفعّلاً" : "معطّلاً"}`
        : `Flag ${f.key} set to ${next ? "on" : "off"}`,
      { description: next ? (locale === "ar" ? f.descriptionAr : f.description) : (locale === "ar" ? "تم الإيقاف" : "Switched off") }
    );
  };

  const onCount = Object.values(flags).filter(Boolean).length;

  return (
    <section className="ast-card p-5 sm:p-6 ast-fade-rise">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "rgba(201,162,39,0.10)", color: "var(--accent-500)" }}
          >
            <Flag className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "أعلام الميزات / مفاتيح الإيقاف" : "Feature flags / kill switches"}
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? `المفعّل ${onCount} من ${FEATURE_FLAGS.length} · مفاتيح الإيقاف فورية عبر كل السطوح`
                : `${onCount} of ${FEATURE_FLAGS.length} ON · kill switches take effect across every surface instantly`}
            </p>
          </div>
        </div>
      </div>

      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {FEATURE_FLAGS.map((f) => {
          const isOn = flags[f.key];
          return (
            <li
              key={f.key}
              className="ast-card-2 p-3 flex items-center justify-between gap-3"
              style={{
                borderColor: isOn ? "rgba(22,154,165,0.28)" : "var(--border)",
                background: isOn ? "rgba(22,154,165,0.04)" : "var(--surface-2)",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] tabular" style={{ color: "var(--text-hi)" }} dir="ltr">{f.key}</span>
                  <span
                    className="ast-chip text-[10px]"
                    style={{
                      color: isOn ? "var(--status-steady)" : "var(--text-lo)",
                      background: isOn ? "rgba(14,159,110,0.10)" : "var(--surface-3)",
                      borderColor: isOn ? "rgba(14,159,110,0.30)" : "var(--border)",
                    }}
                  >
                    {isOn ? (locale === "ar" ? "مفعّل" : "ON") : (locale === "ar" ? "معطّل" : "OFF")}
                  </span>
                </div>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? f.descriptionAr : f.description}
                </p>
              </div>
              <Switch
                checked={isOn}
                onCheckedChange={() => toggle(f)}
                aria-label={f.key}
                className="ast-focus shrink-0"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ============================================================
   Section: Replay panel
   ============================================================ */
function ReplayPanel() {
  const locale = useAppStore((s) => s.locale);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Assessment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [asOfUsed, setAsOfUsed] = useState<string | null>(null);

  const runReplay = useCallback(async () => {
    setRunning(true);
    setErr(null);
    setResults(null);
    try {
      const asOf = new Date().toISOString();
      const res = await fetch("/api/v1/admin/replay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ asOf, employeeIds: ALL_EMPLOYEE_IDS }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<{ jobId: string; asOf: string; results: Assessment[] }> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      setResults(json.data.results);
      setJobId(json.data.jobId);
      setAsOfUsed(json.data.asOf);
      toast.success(
        locale === "ar" ? `اكتمل التشغيل المعاد · ${json.data.results.length} موظف` : `Replay complete · ${json.data.results.length} employees`,
        { description: `job ${json.data.jobId}` }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setErr(msg);
      toast.error(locale === "ar" ? "فشل التشغيل المعاد" : "Replay failed", { description: msg });
    } finally {
      setRunning(false);
    }
  }, [locale]);

  return (
    <section className="ast-card p-5 sm:p-6 ast-fade-rise">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Play className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "إعادة التشغيل الحتمي" : "Deterministic replay"}
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? "أعد تشغيل المحرك على الموظفين الخمسة بنقطة زمنية واحدة. نفس النتيجة في كل مرة."
                : "Re-run the engine across all 5 employees at a single timestamp. Byte-identical every time."}
            </p>
          </div>
        </div>
        <button
          onClick={runReplay}
          disabled={running}
          className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium disabled:opacity-60"
          style={{
            background: "var(--brand-500)",
            color: "var(--surface-0)",
            border: "1px solid var(--brand-500)",
          }}
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          {locale === "ar" ? "شغّل الإعادة" : "Run replay"}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {err && (
          <motion.div
            key="err"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ErrorBanner message={err} onRetry={runReplay} />
          </motion.div>
        )}

        {running && !results && !err && (
          <motion.div
            key="running"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
            aria-live="polite"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="ast-card-2 p-3 h-12 ast-shimmer rounded-[10px]" />
            ))}
          </motion.div>
        )}

        {results && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--status-steady)" }} />
                <span className="text-[12px]" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? "اكتمل — حتمي" : "Complete — deterministic"}
                </span>
              </div>
              <p className="text-[11px] font-mono tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
                job {jobId} · asOf {asOfUsed ? shortDate(asOfUsed, locale) : ""}
              </p>
            </div>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "الموظف" : "Employee"}
                    </th>
                    <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "التصنيف" : "Band"}
                    </th>
                    <th className="text-right p-2 text-[10px] uppercase tracking-[0.1em] font-medium" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "النتيجة" : "Score"}
                    </th>
                    <th className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium hidden sm:table-cell" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "المرحلة" : "Stage"}
                    </th>
                    <th className="text-right p-2 text-[10px] uppercase tracking-[0.1em] font-medium tabular" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "يوم بالمرحلة" : "Day in stage"}
                    </th>
                    <th className="text-right p-2 text-[10px] uppercase tracking-[0.1em] font-medium tabular" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "إشارات" : "Signals"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.employeeId} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                      <td className="p-2 font-mono tabular" style={{ color: "var(--text-hi)" }} dir="ltr">{r.employeeId}</td>
                      <td className="p-2"><BandChip band={r.band} score={r.score} locale={locale} size="sm" /></td>
                      <td className="p-2 text-right font-mono tabular" style={{ color: "var(--text-hi)" }} dir="ltr">{r.score}</td>
                      <td className="p-2 hidden sm:table-cell" style={{ color: "var(--text-mid)" }} dir="ltr">{r.stage}</td>
                      <td className="p-2 text-right tabular" style={{ color: "var(--text-mid)" }} dir="ltr">{r.dayInStage}</td>
                      <td className="p-2 text-right tabular" style={{ color: "var(--text-mid)" }} dir="ltr">{r.signals.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {!running && !results && !err && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="ast-card-2 p-6 text-center"
          >
            <p className="text-[12px]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar"
                ? "اضغط «شغّل الإعادة» لمعاينة نتائج المحرك."
                : "Press “Run replay” to see engine results across all 5 employees."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ============================================================
   Section: Audit chain (PRD §23-451 — hash-chained audit log
   with tamper-test UI + enhanced vertical timeline visualization)
   ============================================================ */

function TamperOptionCard({
  type,
  icon: Icon,
  title,
  titleAr,
  desc,
  descAr,
  onClick,
}: {
  type: string;
  icon: typeof ShieldAlert;
  title: string;
  titleAr: string;
  desc: string;
  descAr: string;
  onClick: () => void;
}) {
  const locale = useAppStore((s) => s.locale);
  return (
    <button
      onClick={onClick}
      className="ast-focus text-left ast-card-2 p-4 hover:border-[rgba(220,38,38,0.40)] transition-colors flex items-start gap-3"
      style={{ borderColor: "rgba(220,38,38,0.20)" }}
      data-testid={`tamper-${type}`}
    >
      <div
        className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
        style={{ background: "rgba(220,38,38,0.10)", color: "var(--status-friction)" }}
      >
        <Icon className="w-4 h-4" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? titleAr : title}
        </p>
        <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-mid)" }}>
          {locale === "ar" ? descAr : desc}
        </p>
      </div>
    </button>
  );
}

function AuditChainPanel() {
  const locale = useAppStore((s) => s.locale);
  const [chain, setChain] = useState<AuditEventRow[]>(() => cloneChain(AUDIT_EVENTS));
  const [tamperedIds, setTamperedIds] = useState<string[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [tamperOpen, setTamperOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isTampered = tamperedIds.length > 0;

  const handleVerify = () => {
    setVerifying(true);
    setResult(null);
    setTimeout(() => {
      const r = verifyChain(chain);
      setResult(r);
      setVerifying(false);
      if (r.ok) {
        toast.success(
          locale === "ar"
            ? `تم التحقق من السلسلة — ${r.verifiedCount}/${r.totalCount} أحداث، لا تلاعب.`
            : `Audit chain verified — ${r.verifiedCount}/${r.totalCount} events, no tampering detected.`
        );
      } else {
        toast.error(
          locale === "ar"
            ? `⚠ كُشف التلاعب — الحدث ${r.tamperedEventId} به كسر في الهاش. آخر حدث مُتحقَّق: ${r.lastVerifiedId ?? "—"}.`
            : `⚠ TAMPER DETECTED — Event ${r.tamperedEventId} has a broken hash link. Last verified event: ${r.lastVerifiedId ?? "—"}.`,
          { duration: 6000 }
        );
      }
    }, 550);
  };

  const handleTamper = (type: TamperType) => {
    const { chain: newChain, tamperedIds: ids } = applyTamper(type);
    setChain(newChain);
    setTamperedIds(ids);
    setResult(null);
    setTamperOpen(false);
    const labelEn: Record<TamperType, string> = {
      alter_hash: "Hash altered",
      delete_event: "Event deleted",
      reorder_events: "Events reordered",
      inject_fake: "Fake event injected",
    };
    const labelAr: Record<TamperType, string> = {
      alter_hash: "عُدّل الهاش",
      delete_event: "حُذف حدث",
      reorder_events: "أُعيد ترتيب الأحداث",
      inject_fake: "حُقن حدث مزيف",
    };
    toast.warning(
      locale === "ar" ? labelAr[type] : labelEn[type],
      {
        description: locale === "ar"
          ? "السلسلة الآن مكسورة — اضغط «تحقّق من السلسلة» لرؤية الكشف."
          : "The chain is now broken — press \"Verify chain\" to see the detection.",
      }
    );
  };

  const handleReset = () => {
    setChain(cloneChain(AUDIT_EVENTS));
    setTamperedIds([]);
    setResult(null);
    toast.success(
      locale === "ar" ? "أُعيدت السلسلة" : "Chain reset",
      { description: locale === "ar" ? "5/5 أحداث سليمة." : "Restored to 5/5 verified events." }
    );
  };

  const handleRegenerate = () => {
    // Prototype only — re-stamp the chain hashes from a deterministic seed.
    toast.success(
      locale === "ar" ? "أُعيد توليد التجزئات" : "Hashes regenerated",
      {
        description: locale === "ar"
          ? "أُعيد بناء السلسلة من البذرة المُلحقة."
          : "Chain rebuilt from the appended seed.",
      }
    );
  };

  const handleCopyHash = async (id: string, hash: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(hash);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1400);
      toast.success(
        locale === "ar" ? "نُسخ الهاش" : "Hash copied",
        { description: hash }
      );
    } catch {
      toast.error(locale === "ar" ? "تعذّر النسخ" : "Copy failed");
    }
  };

  return (
    <section className="ast-card p-5 sm:p-6 ast-fade-rise">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{
              background: isTampered ? "rgba(220,38,38,0.10)" : "rgba(22,154,165,0.10)",
              color: isTampered ? "var(--status-friction)" : "var(--brand-400)",
            }}
          >
            <GitBranch className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "سلسلة التدقيق" : "Audit chain"}
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? `سجل الهاش المتسلسل · ${chain.length} أحداث${isTampered ? " · مكسور" : ""}`
                : `Hash-chained audit log · ${chain.length} events${isTampered ? " · broken" : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="ast-focus inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium disabled:opacity-60"
            style={{
              background: result?.ok ? "rgba(14,159,110,0.10)" : "var(--surface-2)",
              border: `1px solid ${result?.ok ? "rgba(14,159,110,0.40)" : "var(--border)"}`,
              color: result?.ok ? "var(--status-steady)" : "var(--text-hi)",
            }}
          >
            {verifying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {locale === "ar" ? "تحقّق من السلسلة" : "Verify chain"}
          </button>
          <button
            onClick={() => setTamperOpen(true)}
            className="ast-focus inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium"
            style={{
              background: "rgba(220,38,38,0.10)",
              border: "1px solid rgba(220,38,38,0.36)",
              color: "var(--status-friction)",
            }}
          >
            <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.75} />
            {locale === "ar" ? "محاكاة تلاعب" : "Simulate tamper event"}
          </button>
          {isTampered && (
            <button
              onClick={handleReset}
              className="ast-focus inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-hi)",
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.75} />
              {locale === "ar" ? "إعادة تعيين" : "Reset chain"}
            </button>
          )}
          <button
            onClick={handleRegenerate}
            className="ast-focus inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-mid)",
            }}
            title={locale === "ar" ? "إعادة توليد الهاشات" : "Regenerate hashes"}
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="hidden sm:inline">
              {locale === "ar" ? "أعد توليد الهاشات" : "Regenerate hashes"}
            </span>
          </button>
        </div>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-3 flex-wrap mb-4 text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--brand-400)" }} aria-hidden="true" />
          {locale === "ar" ? "نظام" : "System"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent-500)" }} aria-hidden="true" />
          {locale === "ar" ? "إنسان" : "Human"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--status-friction)" }} aria-hidden="true" />
          {locale === "ar" ? "مُتلاعب" : "Tampered"}
        </span>
      </div>

      {/* Vertical timeline */}
      <ol className="relative pl-1">
        {/* Spine line */}
        <div
          className="absolute left-[15px] top-3 bottom-3 w-px"
          style={{ background: isTampered ? "rgba(220,38,38,0.30)" : "var(--border)" }}
          aria-hidden="true"
        />
        {chain.map((ev, i) => {
          const isFirst = i === 0;
          const isLast = i === chain.length - 1;
          const tampered = tamperedIds.includes(ev.id);
          const system = isSystemAction(ev.action);
          // A link is broken BEFORE this event if this event is tampered
          // OR the previous event is tampered (injected/reordered).
          const prevEvent = i > 0 ? chain[i - 1] : null;
          const linkBroken =
            tampered ||
            (!!prevEvent && tamperedIds.includes(prevEvent.id) && ev.prevHash !== prevEvent.hash);

          const nodeColor = tampered
            ? "var(--status-friction)"
            : system
            ? "var(--brand-400)"
            : "var(--accent-500)";
          const nodeBg = tampered
            ? "rgba(220,38,38,0.10)"
            : system
            ? "rgba(22,154,165,0.10)"
            : "rgba(201,162,39,0.10)";

          // Connector segment ABOVE this node (between prev node and this node).
          const connectorBroken = linkBroken && !isFirst;

          return (
            <li key={`${ev.id}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
              {/* Connector segment above (between prev and this) */}
              {!isFirst && (
                <div
                  className="absolute left-[15px] -top-2 h-3 w-px"
                  style={{
                    background: connectorBroken ? "var(--status-friction)" : "var(--border)",
                    boxShadow: connectorBroken ? "0 0 8px rgba(220,38,38,0.5)" : "none",
                  }}
                  aria-hidden="true"
                />
              )}
              {/* Node */}
              <div
                className="relative z-10 shrink-0 mt-0.5 flex items-center justify-center w-[30px] h-[30px] rounded-full"
                style={{
                  background: nodeBg,
                  border: `1.5px solid ${nodeColor}`,
                  color: nodeColor,
                  boxShadow: tampered ? "0 0 0 4px rgba(220,38,38,0.10)" : "none",
                }}
              >
                {tampered ? (
                  <AlertOctagon className="w-3.5 h-3.5" strokeWidth={2} />
                ) : (
                  <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                )}
              </div>
              {/* Card */}
              <div className="flex-1 min-w-0">
                <div
                  className="ast-card-2 p-3"
                  style={{
                    borderColor: tampered ? "rgba(220,38,38,0.40)" : "var(--border)",
                    background: tampered ? "rgba(220,38,38,0.04)" : undefined,
                  }}
                >
                  {/* Row 1: id · actor · action chip · date · TAMPERED badge */}
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-mono text-[11px] tabular" style={{ color: "var(--text-lo)" }} dir="ltr">{ev.id}</span>
                      <span className="text-[12px] font-medium truncate" style={{ color: "var(--text-hi)" }}>{ev.actor}</span>
                      <span
                        className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                        style={{
                          background: nodeBg,
                          color: nodeColor,
                          border: `1px solid ${nodeColor}40`,
                        }}
                        dir="ltr"
                      >
                        {ev.action}
                      </span>
                      {tampered && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-[0.1em]"
                          style={{
                            background: "rgba(220,38,38,0.10)",
                            color: "var(--status-friction)",
                            border: "1px solid rgba(220,38,38,0.40)",
                          }}
                        >
                          <ShieldAlert className="w-3 h-3" strokeWidth={2} />
                          {locale === "ar" ? "مُتلاعب" : "Tampered"}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
                      {shortDate(ev.at, locale)}
                    </span>
                  </div>

                  {/* Row 2: subject:subjectId */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px] font-mono tabular" style={{ color: "var(--text-lo)" }}>
                    <span dir="ltr">
                      <span>subject </span>
                      <span style={{ color: "var(--text-mid)" }}>{ev.subject}:</span>
                      <span style={{ color: "var(--text-hi)" }}>{ev.subjectId}</span>
                    </span>
                  </div>

                  {/* Row 3: prev · hash + copy */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-[10px] font-mono tabular">
                    <div className="ast-card-2 p-1.5 px-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="uppercase tracking-[0.1em]" style={{ color: "var(--text-lo)" }}>
                          {locale === "ar" ? "سابق" : "prev"}
                        </p>
                        <p
                          style={{
                            color: linkBroken ? "var(--status-friction)" : isFirst ? "var(--text-lo)" : "var(--text-mid)",
                          }}
                          dir="ltr"
                          className={isFirst ? "italic" : ""}
                        >
                          {truncateHash(ev.prevHash)}
                        </p>
                      </div>
                      {linkBroken && !isFirst && (
                        <XCircle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} style={{ color: "var(--status-friction)" }} />
                      )}
                    </div>
                    <div className="ast-card-2 p-1.5 px-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="uppercase tracking-[0.1em]" style={{ color: "var(--text-lo)" }}>hash</p>
                        <p style={{ color: nodeColor }} dir="ltr">{truncateHash(ev.hash)}</p>
                      </div>
                      <button
                        onClick={() => handleCopyHash(ev.id, ev.hash)}
                        className="ast-focus inline-flex items-center justify-center w-7 h-7 rounded shrink-0 transition-colors"
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          color: copiedId === ev.id ? "var(--status-steady)" : "var(--text-mid)",
                        }}
                        title={locale === "ar" ? "نسخ الهاش" : "Copy hash"}
                        aria-label={locale === "ar" ? `نسخ هاش ${ev.id}` : `Copy hash for ${ev.id}`}
                      >
                        {copiedId === ev.id ? (
                          <Check className="w-3 h-3" strokeWidth={2} />
                        ) : (
                          <Copy className="w-3 h-3" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {/* Tail mark on last node */}
              {isLast && (
                <span
                  className="absolute left-[12px] -bottom-1 w-[9px] h-[9px] rounded-b-full"
                  style={{ background: isTampered ? "var(--status-friction)" : "var(--brand-400)", opacity: 0.6 }}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Verification result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="ast-card-2 p-3 mt-2 flex items-start gap-2"
            style={
              result.ok
                ? { borderColor: "rgba(14,159,110,0.32)", background: "rgba(14,159,110,0.06)" }
                : { borderColor: "rgba(220,38,38,0.40)", background: "rgba(220,38,38,0.06)" }
            }
            role="status"
          >
            {result.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} style={{ color: "var(--status-steady)" }} />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2} style={{ color: "var(--status-friction)" }} />
            )}
            <div className="flex-1 min-w-0">
              {result.ok ? (
                <p className="text-[12px]" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar"
                    ? `تم التحقق — ${result.verifiedCount} من ${result.totalCount}، سلسلة سليمة. لا تلاعب.`
                    : `Audit chain verified — ${result.verifiedCount}/${result.totalCount} events, no tampering detected.`}
                </p>
              ) : (
                <p className="text-[12px]" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar"
                    ? `⚠ كُشف التلاعب — الحدث ${result.tamperedEventId} به كسر في رابط الهاش. المتوقع: ${result.expectedPrev ?? "—"}، المُكتشف: ${result.foundPrev ?? "—"}. آخر حدث مُتحقَّق: ${result.lastVerifiedId ?? "—"}.`
                    : `⚠ TAMPER DETECTED — Event ${result.tamperedEventId} has a broken hash link. Expected prev: ${result.expectedPrev ?? "—"}, found: ${result.foundPrev ?? "—"}. Last verified event: ${result.lastVerifiedId ?? "—"}.`}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tamper simulation modal */}
      <Dialog open={tamperOpen} onOpenChange={setTamperOpen}>
        <DialogContent
          className="sm:max-w-[560px]"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
        >
          <DialogTitle className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "محاكاة تلاعب" : "Simulate tamper event"}
          </DialogTitle>
          <DialogDescription className="text-[12px]" style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "اختر نوع التلاعب — سنطبّقه على السلسلة المعروضة. اضغط «تحقّق من السلسلة» بعدها لرؤية الكشف."
              : "Pick a tamper type — we'll apply it to the rendered chain. Press \"Verify chain\" afterwards to see the detection."}
          </DialogDescription>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
            <TamperOptionCard
              type="alter_hash"
              icon={ShieldAlert}
              title="Alter a hash"
              titleAr="تعديل هاش"
              desc="Rewrite one event's prev-hash to a fake value. The next link no longer matches the prior event's hash."
              descAr="إعادة كتابة الهاش السابق لحدث إلى قيمة مزيفة. الرابط التالي لم يعد يطابق هاش الحدث السابق."
              onClick={() => handleTamper("alter_hash")}
            />
            <TamperOptionCard
              type="delete_event"
              icon={Trash2}
              title="Delete an event"
              titleAr="حذف حدث"
              desc="Remove an event from the chain. The next event's prev-hash now points to nothing."
              descAr="حذف حدث من السلسلة. الهاش السابق للحدث التالي يشير الآن إلى العدم."
              onClick={() => handleTamper("delete_event")}
            />
            <TamperOptionCard
              type="reorder_events"
              icon={ArrowUpDown}
              title="Reorder events"
              titleAr="إعادة ترتيب الأحداث"
              desc="Swap two adjacent events. Both prev-hash links become orphans in the new ordering."
              descAr="تبادل حدثين متجاورين. الروابط السابقة لكلا الحدثين تصبح يتيمة في الترتيب الجديد."
              onClick={() => handleTamper("reorder_events")}
            />
            <TamperOptionCard
              type="inject_fake"
              icon={Plus}
              title="Inject a fake event"
              titleAr="حقن حدث مزيف"
              desc="Insert a synthetic event with a wrong prev-hash. It carries a 'fake' marker on the timeline."
              descAr="إدراج حدث اصطناعي بهاش سابق خاطئ. يحمل علامة «مزيف» على الخط الزمني."
              onClick={() => handleTamper("inject_fake")}
            />
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={() => setTamperOpen(false)}
              className="ast-focus inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-hi)",
              }}
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.75} />
              {locale === "ar" ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ============================================================
   Section: Health endpoints
   ============================================================ */
function HealthEndpoints() {
  const locale = useAppStore((s) => s.locale);
  return (
    <section className="ast-card p-5 sm:p-6 ast-fade-rise">
      <div className="flex items-center gap-2.5 mb-4">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
          style={{ background: "rgba(14,159,110,0.10)", color: "var(--status-steady)" }}
        >
          <Heart className="w-4.5 h-4.5" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "نقاط نهاية الصحة" : "Health endpoints"}
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "فحوص التشغيل الثلاثة" : "The three ops endpoints"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {HEALTH_ENDPOINTS.map((ep) => (
          <div key={ep.path} className="ast-card-2 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <code className="font-mono text-[11px] tabular" style={{ color: "var(--brand-400)" }} dir="ltr">{ep.path}</code>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-mono tabular px-1.5 py-0.5 rounded"
                style={{ color: "var(--status-steady)", background: "rgba(14,159,110,0.10)", border: "1px solid rgba(14,159,110,0.30)" }}
                dir="ltr"
              >
                <span className="ast-dot ast-dot-steady" aria-hidden="true" />
                {ep.status} OK
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? ep.labelAr : ep.label}
              </p>
              <p className="text-[12px] font-mono tabular mt-0.5" style={{ color: "var(--text-hi)" }} dir="ltr">{ep.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   Root
   ============================================================ */
export function AdminScreen() {
  const locale = useAppStore((s) => s.locale);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const [pilotOpen, setPilotOpen] = useState(false);

  return (
    <div dir={dir} className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      <header className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--brand-400)" }}>
              <Server className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{locale === "ar" ? "وحدة الإدارة" : "Admin console"}</span>
            </div>
            <h1 className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-tight" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "لوحة التشغيل" : "Operability console"}
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? "الابتلاع، الحجر الصحي، النصوص، الأعلام، الإعادة، سلسلة التدقيق، والصحة — كلها في مكان واحد."
                : "Ingestion, quarantine, corpus, flags, replay, audit chain, and health — all in one place."}
            </p>
          </div>
          <button
            onClick={() => setPilotOpen(true)}
            className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium transition-colors shrink-0"
            style={{
              background: "var(--brand-500)",
              color: "var(--surface-0)",
              border: "1px solid var(--brand-500)",
            }}
          >
            <ClipboardList className="w-4 h-4" strokeWidth={1.75} />
            {locale === "ar" ? "خطة التجربة" : "Pilot plan"}
          </button>
        </div>
      </header>

      <div className="space-y-4">
        <IngestionReportCard />
        <QuarantineTable />
        <CorpusVersionCard />
        <FeatureFlagsPanel />
        <ReplayPanel />
        <AuditChainPanel />
        <HealthEndpoints />
      </div>

      {/* Pilot plan modal */}
      <Dialog open={pilotOpen} onOpenChange={setPilotOpen}>
        <DialogContent
          className="sm:max-w-[920px] max-h-[88vh] overflow-y-auto"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
        >
          <DialogTitle className="sr-only">{locale === "ar" ? "خطة التجربة" : "Pilot plan"}</DialogTitle>
          <PilotPlanPage />
        </DialogContent>
      </Dialog>
    </div>
  );
}
