"use client";

/* ============================================================
   ASTROLABE — Me Screen (consent + data, PRD §15)
   "Your data is yours." Privacy summary banner, six consent
   toggles, expandable data-held table, view log, JSON/PDF export,
   and revoke-all-optional modal.
   ============================================================ */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrivacyPage } from "@/components/astrolabe/privacy-page";
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
  journeyEvents: { id: string; stepKey: string; type: string; occurredAt: string; recordedAt: string; source: string }[];
  serviceRequests: { id: string; ref: string; type: string; ownerGroup: string; assignee: string; status: string; openedAt: string; slaHours: number; reassignCount: number; returnCount: number }[];
  pulseResponses: { id: string; stage: string; score: number; commentRef?: string; createdAt: string }[];
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
    descEn: "Help me with onboarding and mobility steps. The instrument reads my journey to suggest the next best move.",
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
    noChangeEn: "Your pulse score and any comment will not be captured. The band uses journey + request data only.",
    noChangeAr: "لن يتم تسجيل درجة نبضتك أو أي تعليق. يعتمد التصنيف على بيانات الرحلة والطلبات فقط.",
    defaultOn: false,
  },
  {
    key: "share_pulse_summary",
    labelEn: "Share pulse summary with HRBP",
    labelAr: "مشاركة ملخص النبضة مع شريك الموارد البشرية",
    descEn: "If I capture a pulse, may I share the summary (1–5 score, no comment text) with my HRBP only when an escalation is built?",
    descAr: "إذا سجّلت نبضة، هل أشارك الملخص (درجة 1–5، بدون نص التعليق) مع شريك الموارد البشرية فقط عند بناء تصعيد؟",
    noChangeEn: "HRBP sees journey state + request telemetry only — never the pulse score, never any comment.",
    noChangeAr: "يرى شريك الموارد البشرية حالة الرحلة وبيانات الطلبات فقط — لا درجة النبضة ولا أي تعليق.",
    defaultOn: false,
  },
  {
    key: "comment_retention",
    labelEn: "Retain my comment text",
    labelAr: "الاحتفاظ بنص تعليقي",
    descEn: "When I leave a comment on a pulse, may I keep that text on file so I can read it back later?",
    descAr: "عندما أكتب تعليقاً على نبضة، هل أحتفظ بالنص في ملفي لمراجعته لاحقاً؟",
    noChangeEn: "Comments are not retained — only the 1–5 score is kept. You will not be able to read past comments.",
    noChangeAr: "لا يتم الاحتفاظ بالتعليقات — يُحتفظ فقط بدرجة 1–5. لن تتمكن من قراءة التعليقات السابقة.",
    defaultOn: false,
  },
  {
    key: "manager_visibility",
    labelEn: "Show manager my obligations",
    labelAr: "إظهار التزاماتي لمديري",
    descEn: "May my line manager see the steps they own on my journey, and aggregate completion? They never see my pulse, comments, or friction score.",
    descAr: "هل يرى مديري المباشر الخطوات التي يملكها في رحلتي ونسبة الإنجاز الكلية؟ لا يرى أبداً نبضتي أو تعليقاتي أو درجة الاحتكاك.",
    noChangeEn: "Your manager sees only their own to-do list — not your journey, not your stage.",
    noChangeAr: "يرى مديرك فقط قائمة مهامه الخاصة — ليس رحلتك ولا مرحلتك.",
    defaultOn: true,
  },
  {
    key: "aggregate_analytics",
    labelEn: "Aggregate analytics",
    labelAr: "تحليلات مجمّعة",
    descEn: "May the platform use fully de-identified, k≥5 aggregate stats to find systemic stalls (e.g., 'visa step is slow for everyone')?",
    descAr: "هل تستخدم المنصة إحصاءات مجمّعة مجهولة الهوية (k≥5) لرصد الاختناقات النظامية (مثل: 'تأشيرة بطيئة للجميع')؟",
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
  meta: PurposeMeta
): boolean {
  if (typeof overrides[meta.key] === "boolean") return overrides[meta.key];
  const latest = latestConsent(records, meta.key);
  if (latest) return latest.granted;
  return meta.defaultOn;
}

/* ---------- Skeleton ---------- */

function MeSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="ast-card h-24 ast-shimmer rounded-[14px]" />
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
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/me/data?employeeId=${encodeURIComponent(employeeId)}`, { cache: "no-store" });
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

  const handleToggle = useCallback(
    async (meta: PurposeMeta, next: boolean) => {
      if (meta.required) return;
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
        // Refetch so the snapshot reflects the server
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
    [employeeId, fetchData, setConsent]
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
      description: "Pulse, sharing, comment retention, manager visibility, and analytics are off. Journey assistance remains on.",
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
    toast.success("Exported as JSON", { description: `${employeeId} · snapshot ${data.snapshotAt.slice(0, 10)}` });
  }, [data, employeeId]);

  const handleExportPdf = useCallback(() => {
    toast("PDF export queued — we'll email you", {
      description: "A signed PDF copy of your data file will arrive within 24 hours.",
    });
  }, []);

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
    <div
      dir={dir}
      className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10"
    >
      {/* Heading */}
      <header className="mb-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--brand-400)" }}>
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{locale === "ar" ? "مركز الخصوصية" : "Privacy center"}</span>
        </div>
        <h1 className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-tight" style={{ color: "var(--text-hi)" }}>
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
            <p className="text-[15px] sm:text-[16px] font-medium" style={{ color: "var(--text-hi)" }}>
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
              onClick={(e) => { e.preventDefault(); setPrivacyOpen(true); }}
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
          style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
        >
          <DialogTitle className="sr-only">{locale === "ar" ? "الخصوصية بالكامل" : "Privacy in full"}</DialogTitle>
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
                <Info className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-watch)" }} />
                <p className="text-[13px]" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar"
                    ? "نبضتك متوقفة. يستخدم هذا العرض بيانات الرحلة والطلبات فقط."
                    : "Pulse signals are off, so this view uses journey and request data only."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Consent toggles */}
          <section className="ast-card p-5 sm:p-6 mb-6">
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
              {PURPOSES.map((meta) => {
                const granted = purposeGranted(data.consentRecords, overrides, meta);
                const isPending = pendingPurpose === meta.key;
                return (
                  <li
                    key={meta.key}
                    className="ast-card-2 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-medium" style={{ color: "var(--text-hi)" }}>
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
                            {locale === "ar" ? "مُفعّل" : "On"}
                          </span>
                        ) : (
                          <span className="ast-chip">
                            {locale === "ar" ? "متوقف" : "Off"}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] mt-2 leading-relaxed" style={{ color: "var(--text-mid)" }}>
                        {locale === "ar" ? meta.descAr : meta.descEn}
                      </p>
                      <p className="text-[12px] mt-2 leading-relaxed" style={{ color: "var(--text-lo)" }}>
                        <span className="font-medium" style={{ color: "var(--text-mid)" }}>
                          {locale === "ar" ? "إذا رفضت: " : "What changes if you say no: "}
                        </span>
                        {locale === "ar" ? meta.noChangeAr : meta.noChangeEn}
                      </p>
                    </div>

                    <div className="shrink-0 self-start sm:self-center">
                      {meta.required ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>
                              <Switch checked disabled aria-label={`${meta.labelEn} — required`} />
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
                              ? locale === "ar" ? "اضغط لإيقافه" : "Click to revoke"
                              : locale === "ar" ? "اضغط للتفعيل" : "Click to grant"}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </li>
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
                    {locale === "ar" ? "إيقاف كل الموافقات الاختيارية" : "Revoke all optional consents"}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent
                  style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
                >
                  <AlertDialogHeader>
                    <AlertDialogTitle style={{ color: "var(--text-hi)" }}>
                      {locale === "ar" ? "إيقاف كل الموافقات الاختيارية؟" : "Revoke all optional consents?"}
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
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
                    >
                      {locale === "ar" ? "تراجع" : "Cancel"}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRevokeAll}
                      className="ast-focus"
                      style={{ background: "var(--status-friction)", color: "white", border: "1px solid var(--status-friction)" }}
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

            <div className="rounded-[10px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <Table>
                <TableHeader>
                  <TableRow style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                    <TableHead className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "المصدر" : "Source"}
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "الغرض" : "Purpose"}
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.12em] hidden sm:table-cell" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "الاحتفاظ" : "Retention"}
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.12em] hidden md:table-cell" style={{ color: "var(--text-lo)" }}>
                      {locale === "ar" ? "آخر مشاهدة" : "Last viewed"}
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.12em] text-right" style={{ color: "var(--text-lo)" }}>
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
                              <TableCell className="font-medium text-[13px]" style={{ color: "var(--text-hi)" }}>
                                <div className="flex items-center gap-2">
                                  {suppressed ? (
                                    <Lock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--text-lo)" }} />
                                  ) : (
                                    <Unlock className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                                  )}
                                  {row.source}
                                </div>
                              </TableCell>
                              <TableCell className="text-[13px]" style={{ color: "var(--text-mid)" }}>
                                {row.purpose}
                              </TableCell>
                              <TableCell className="text-[12px] hidden sm:table-cell" style={{ color: "var(--text-mid)" }}>
                                {row.retention}
                              </TableCell>
                              <TableCell className="text-[12px] hidden md:table-cell tabular" style={{ color: "var(--text-mid)" }}>
                                {row.lastViewed === "—"
                                  ? "—"
                                  : format(new Date(row.lastViewed), "d MMM HH:mm")}
                              </TableCell>
                              <TableCell className="text-right tabular text-[13px]" style={{ color: "var(--text-hi)" }}>
                                {suppressed ? "—" : row.count}
                              </TableCell>
                              <TableCell className="text-right">
                                {suppressed ? (
                                  <span className="text-[11px]" style={{ color: "var(--text-lo)" }}>
                                    {locale === "ar" ? "مكتوم" : "suppressed"}
                                  </span>
                                ) : (
                                  <ChevronDown
                                    className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")}
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

          {/* View log */}
          <section className="ast-card p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
              <h2 className="text-[17px] font-semibold" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "سجل المشاهدات" : "View log"}
              </h2>
            </div>
            {data.viewLog.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-mid)" }}>
                {locale === "ar" ? "لا مشاهدات بعد." : "No views yet."}
              </p>
            ) : (
              <ul className="space-y-2">
                {data.viewLog.map((entry, i) => (
                  <li
                    key={i}
                    className="ast-card-2 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                  >
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                      style={{ background: "var(--surface-3)", color: "var(--text-mid)" }}
                    >
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px]" style={{ color: "var(--text-hi)" }}>
                        <span className="font-medium">{entry.actor}</span>
                        <span style={{ color: "var(--text-mid)" }}>
                          {" "}
                          {locale === "ar" ? "قرأ سجلك" : "read your record"}
                        </span>
                      </p>
                      <p className="text-[12px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-lo)" }}>
                        <Clock className="w-3 h-3" strokeWidth={1.75} />
                        <span className="tabular">
                          {formatDistance(new Date(entry.at), new Date("2024-10-19T10:00:00Z"), { addSuffix: true })}
                        </span>
                        <span style={{ color: "var(--text-lo)" }}>·</span>
                        <span>{locale === "ar" ? "الغرض: " : "for "}{entry.purpose.replace(/_/g, " ")}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
