"use client";

/* ============================================================
   ASTROLABE — Requests Screen (status + intake, PRD §12)
   Left: live request list with SLA + status + expandable detail.
   Right: 3-step intake wizard with prefilled fields,
   inline validation, preview-and-submit, duplicate handling.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, formatDistance, addDays } from "date-fns";
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  RotateCcw,
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowLeft,
  User,
  Mail,
  ShieldCheck,
  FileText,
  Inbox,
  Sparkles,
  Send,
  X,
  Laptop,
  KeyRound,
  Plane,
  Home,
  Wallet,
  GraduationCap,
  Building,
  Users,
  Hourglass,
  Ban,
  CircleDot,
  CheckCircle2,
  HelpCircle,
  CornerUpLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { StatusChip, CitationChip } from "@/components/astrolabe/widgets";
import { Tilt3D } from "@/components/astrolabe/micro-interactions";
import { SlaRing } from "@/components/astrolabe/sla-ring";
import { INTAKE_SCHEMAS, type IntakeSchema, type IntakeField } from "@/lib/actions/actions";
import type { RequestType } from "@/lib/data/pack";
import { owners as ALL_OWNERS, getOwner, NOW as PACK_NOW } from "@/lib/data/pack";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ---------- Types (mirror the API envelope) ---------- */

interface ReturnQuestion {
  question: string;
  additionalDetail?: string;
  returnedBy: string;
  returnedAt: string;
  answer?: string;
}

interface ServiceRequest {
  id: string;
  ref: string;
  employeeId: string;
  type: RequestType;
  ownerGroup: string;
  assignee: string;
  status: string;
  openedAt: string;
  slaHours: number;
  reassignCount: number;
  returnCount: number;
  idempotencyKey: string;
  /** PRD §11-212 — structured "needs more info" question, present when status === "returned". */
  returnQuestion?: ReturnQuestion;
}

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

interface JourneyMeData {
  employee: Employee;
  stage: string;
  dayInStage: number;
  band: "steady" | "watch" | "friction" | "blocked";
  score: number;
  steps: { stepKey: string; label: string; labelAr: string; stage: string; status: string }[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string; latencyMs: number };
  error: { code: string; message: string; hint?: string; retryable?: boolean } | null;
}

/* ---------- Constants ---------- */

const TYPE_ICONS: Record<RequestType, LucideIcon> = {
  it_kit: Laptop,
  system_access: KeyRound,
  visa: Plane,
  relocation: Home,
  payroll: Wallet,
  training: GraduationCap,
  facilities: Building,
  manager_handover: Users,
};

const OWNER_GROUP_LABEL: Record<string, { en: string; ar: string }> = {
  HR: { en: "HR", ar: "الموارد البشرية" },
  IT: { en: "IT", ar: "تقنية المعلومات" },
  Learning: { en: "Learning", ar: "التعلم" },
  Facilities: { en: "Facilities", ar: "المرافق" },
  Mobility: { en: "Mobility", ar: "التنقل" },
  Payroll: { en: "Payroll", ar: "الرواتب" },
  Immigration: { en: "Immigration", ar: "الهجرة" },
};

// Most common types for empty-state quick-start (PRD §12)
const QUICKSTART_TYPES: RequestType[] = ["it_kit", "system_access", "training"];

/* ---------- Helpers ---------- */

function computeBreach(
  elapsedHours: number,
  targetHours: number,
): "none" | "due_soon" | "breached" | "hard" {
  if (elapsedHours >= targetHours * 2) return "hard";
  if (elapsedHours >= targetHours) return "breached";
  if (targetHours > 0 && elapsedHours / targetHours >= 0.75) return "due_soon";
  return "none";
}

function namedAssignee(
  assigneeId: string,
): { name: string; role: string; email: string; group: string } | null {
  const o = getOwner(assigneeId);
  if (!o) return null;
  return { name: o.name, role: o.role, email: o.email, group: o.group };
}

function resolveOwnerForType(
  type: RequestType,
): { name: string; role: string; email: string; group: string } | null {
  const schema = INTAKE_SCHEMAS[type];
  const o = ALL_OWNERS.find((x) => x.group === schema.ownerGroup);
  if (!o) return null;
  return { name: o.name, role: o.role, email: o.email, group: o.group };
}

function parsePolicyRef(ref: string): {
  docSlug: string;
  title: string;
  section: string;
  effectiveDate: string;
} {
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

/* ============================================================
   Main screen
   ============================================================ */

export function RequestsScreen() {
  const locale = useAppStore((s) => s.locale);
  const currentEmployeeId = useAppStore((s) => s.currentEmployeeId);
  const activeRequestType = useAppStore((s) => s.activeRequestType);
  const setActiveRequestType = useAppStore((s) => s.setActiveRequestType);

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<0 | 1 | 2>(0);
  const [wizardType, setWizardType] = useState<RequestType | null>(null);
  const [wizardPrefill, setWizardPrefill] = useState<Record<string, string>>({});
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  // Employee record for prefill
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [journeyStage, setJourneyStage] = useState<string>("");

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/requests?employeeId=${encodeURIComponent(currentEmployeeId)}`,
      );
      const json: ApiEnvelope<{ items: ServiceRequest[]; nextCursor: string | null }> =
        await res.json();
      if (!json.ok || !json.data) {
        throw new Error(json.error?.message ?? "Failed to load requests");
      }
      setRequests(json.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [currentEmployeeId]);

  // Fetch employee record for prefill (from /api/v1/journey/me)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v1/journey/me?employeeId=${encodeURIComponent(currentEmployeeId)}&asOf=${encodeURIComponent(PACK_NOW.toISOString())}`,
        );
        const json: ApiEnvelope<JourneyMeData> = await res.json();
        if (cancelled) return;
        if (json.ok && json.data) {
          setEmployee(json.data.employee);
          setJourneyStage(json.data.stage);
        }
      } catch {
        // Non-fatal — prefill just won't be available
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentEmployeeId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Pick up activeRequestType from store (e.g. when user clicked
  // "Start this request" from Ask or Today screen) → jump to step 2.
  useEffect(() => {
    if (activeRequestType && INTAKE_SCHEMAS[activeRequestType as RequestType]) {
      setWizardType(activeRequestType as RequestType);
      setWizardStep(1);
      setWizardOpen(true);
      // Pre-populate prefill map from employee record (only once per type)
      if (employee) {
        const pre: Record<string, string> = {};
        const schema = INTAKE_SCHEMAS[activeRequestType as RequestType];
        for (const field of schema.fields) {
          if (!field.prefillFrom) continue;
          if (field.prefillFrom === "employee.location") pre[field.key] = employee.location;
          else if (field.prefillFrom === "employee.stage") pre[field.key] = journeyStage;
          else if (field.prefillFrom === "employee.startDate")
            pre[field.key] = employee.startDate.slice(0, 10);
          else if (field.prefillFrom === "employee.role") pre[field.key] = employee.role;
        }
        setWizardPrefill(pre);
      }
      // Clear the store flag so we don't re-open on next mount
      setActiveRequestType(undefined);
    }
  }, [activeRequestType, employee, journeyStage, setActiveRequestType]);

  const openWizard = () => {
    setWizardType(null);
    setWizardStep(0);
    setWizardPrefill({});
    setDuplicateNotice(null);
    setWizardOpen(true);
  };

  const handlePickType = (type: RequestType) => {
    setWizardType(type);
    // Build prefill map fresh from employee record
    const pre: Record<string, string> = {};
    if (employee) {
      const schema = INTAKE_SCHEMAS[type];
      for (const field of schema.fields) {
        if (!field.prefillFrom) continue;
        if (field.prefillFrom === "employee.location") pre[field.key] = employee.location;
        else if (field.prefillFrom === "employee.stage") pre[field.key] = journeyStage;
        else if (field.prefillFrom === "employee.startDate")
          pre[field.key] = employee.startDate.slice(0, 10);
        else if (field.prefillFrom === "employee.role") pre[field.key] = employee.role;
      }
    }
    setWizardPrefill(pre);
    setWizardStep(1);
  };

  type SubmitResult =
    { ok: true; id: string; duplicate: boolean } | { ok: false; code: string; message: string };

  const handleSubmit = async (payload: Record<string, unknown>): Promise<SubmitResult> => {
    if (!wizardType) {
      return { ok: false, code: "E_NO_TYPE", message: "No request type selected" };
    }
    const idempotencyKey = `idm-${currentEmployeeId}-${wizardType}-${Date.now().toString(36)}`;
    try {
      const res = await fetch("/api/v1/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: currentEmployeeId,
          type: wizardType,
          payload,
          idempotencyKey,
        }),
      });
      const json: ApiEnvelope<ServiceRequest & { servedFrom?: string }> = await res.json();
      if (!json.ok || !json.data) {
        const code = json.error?.code ?? "E_UNKNOWN";
        const msg = json.error?.message ?? "Failed to create request";
        if (json.error?.hint) {
          toast.error(`${msg}`, { description: json.error.hint });
        } else {
          toast.error(msg);
        }
        return { ok: false, code, message: msg };
      }

      // Duplicate detection — idempotency replay returns servedFrom: "cache"
      const isDuplicate = json.data.servedFrom === "cache";
      await fetchRequests();
      setWizardOpen(false);

      if (isDuplicate) {
        setDuplicateNotice(json.data.id);
        setExpandedId(json.data.id);
        toast.info(
          locale === "ar"
            ? "هذا الطلب موجود بالفعل — نعرض الأصلي."
            : "This request already exists — showing the original.",
        );
      } else {
        setExpandedId(json.data.id);
        // Confetti-style toast
        toast.success(
          locale === "ar"
            ? `تم إنشاء الطلب ${json.data.ref} ✨`
            : `Request ${json.data.ref} created ✨`,
          {
            description:
              locale === "ar"
                ? "سيتواصل معك الفريق المالك قريباً."
                : "The owning team will reach out shortly.",
          },
        );
      }
      return { ok: true, id: json.data.id, duplicate: isDuplicate };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
      return { ok: false, code: "E_NETWORK", message: msg };
    }
  };

  // PRD §11-212 — when an employee answers a structured "needs more info"
  // question and clicks Resubmit, transition the request back to `submitted`
  // (which clears the active returnQuestion server-side) and refetch the
  // list so the card disappears.
  const handleResubmit = useCallback(
    async (reqId: string, answer: string): Promise<void> => {
      try {
        const res = await fetch(`/api/v1/requests/${reqId}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: "submitted",
            idempotencyKey: `${reqId}-resubmit-${Date.now()}`,
            answer,
          }),
        });
        const json: ApiEnvelope<ServiceRequest> = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error?.message ?? `HTTP ${res.status}`);
        }
        await fetchRequests();
        toast.success(
          locale === "ar"
            ? "أُرسلت إلى IT — سيتولّونها الآن."
            : "Sent back to IT — they'll pick it up now.",
        );
      } catch (err) {
        toast.error(locale === "ar" ? "تعذّر إعادة الإرسال" : "Couldn't resubmit", {
          description: err instanceof Error ? err.message : "Network error",
        });
      }
    },
    [fetchRequests, locale],
  );

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "var(--g-veil)", color: "var(--brand-400)" }}
            aria-hidden="true"
          >
            <Inbox className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1
              className="text-[20px] sm:text-[22px] font-semibold leading-tight"
              style={{ color: "var(--text-hi)" }}
            >
              {locale === "ar" ? "طلباتي" : "My requests"}
            </h1>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? "تتبّع طلباتك المفتوحة وابدأ طلباً جديداً."
                : "Track your open requests and start a new one."}
            </p>
          </div>
        </div>
        <button
          onClick={openWizard}
          className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-4 sm:px-5 rounded-[10px] text-[13px] sm:text-[14px] font-semibold shrink-0 transition-transform hover:-translate-y-0.5"
          style={{
            background: "var(--brand-500)",
            color: "var(--surface-0)",
            boxShadow: "0 4px 14px rgba(22,154,165,0.28)",
          }}
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span className="hidden sm:inline">{locale === "ar" ? "طلب جديد" : "New request"}</span>
          <span className="sm:hidden">{locale === "ar" ? "جديد" : "New"}</span>
        </button>
      </div>

      {/* Duplicate notice */}
      {duplicateNotice && (
        <div
          className="ast-card p-3 mb-4 flex items-center gap-2"
          style={{
            borderColor: "rgba(22,154,165,0.30)",
            background: "rgba(22,154,165,0.06)",
          }}
        >
          <CheckCircle2
            className="w-4 h-4 shrink-0"
            strokeWidth={1.75}
            style={{ color: "var(--brand-400)" }}
          />
          <p className="text-[13px]" style={{ color: "var(--text-hi)" }}>
            {locale === "ar"
              ? `هذا الطلب موجود بالفعل — نعرض الأصلي (${duplicateNotice}).`
              : `This request already exists — showing the original (${duplicateNotice}).`}
          </p>
          <button
            onClick={() => setDuplicateNotice(null)}
            className="ast-focus ml-auto shrink-0"
            aria-label={locale === "ar" ? "إغلاق" : "Dismiss"}
          >
            <X className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--text-lo)" }} />
          </button>
        </div>
      )}

      {/* Layout: list (left col-7) + wizard (right col-5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* List */}
        <section
          className="lg:col-span-7 order-2 lg:order-1"
          aria-label={locale === "ar" ? "قائمة الطلبات" : "Request list"}
        >
          {loading ? (
            <RequestListSkeleton />
          ) : error ? (
            <ErrorBanner message={error} onRetry={fetchRequests} locale={locale} />
          ) : requests.length === 0 ? (
            <EmptyState onPickType={handlePickType} locale={locale} />
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {requests.map((req, i) => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    expanded={expandedId === req.id}
                    onToggle={() => setExpandedId((cur) => (cur === req.id ? null : req.id))}
                    onResubmit={handleResubmit}
                    locale={locale}
                    index={i}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {/* Wizard — desktop right column; mobile modal */}
        <section
          className="lg:col-span-5 order-1 lg:order-2"
          aria-label={locale === "ar" ? "بدء طلب جديد" : "Start a new request"}
        >
          {/* Desktop: inline wizard card */}
          <div className="hidden lg:block ast-card p-5 sticky top-20">
            <Wizard
              key={wizardType ?? "none"}
              step={wizardStep}
              type={wizardType}
              prefill={wizardPrefill}
              onStepChange={setWizardStep}
              onPickType={handlePickType}
              onSubmit={handleSubmit}
              onReset={() => {
                setWizardType(null);
                setWizardStep(0);
                setWizardPrefill({});
              }}
              locale={locale}
              employeeId={currentEmployeeId}
            />
          </div>

          {/* Mobile: trigger button + modal wizard */}
          <div className="lg:hidden">
            <button
              onClick={openWizard}
              className="ast-focus w-full inline-flex items-center justify-center gap-2 h-12 px-4 rounded-[10px] text-[14px] font-semibold"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-hi)",
                border: "1px solid var(--border)",
              }}
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              {locale === "ar" ? "ابدأ طلباً جديداً" : "Start a new request"}
            </button>
          </div>
        </section>
      </div>

      {/* Mobile modal wizard */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="lg:hidden max-w-[calc(100%-1rem)] p-4 sm:p-5">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "طلب جديد" : "New request"}
            </DialogTitle>
          </DialogHeader>
          <Wizard
            key={`modal-${wizardType ?? "none"}`}
            step={wizardStep}
            type={wizardType}
            prefill={wizardPrefill}
            onStepChange={setWizardStep}
            onPickType={handlePickType}
            onSubmit={handleSubmit}
            onReset={() => {
              setWizardType(null);
              setWizardStep(0);
              setWizardPrefill({});
            }}
            locale={locale}
            employeeId={currentEmployeeId}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
   Return-question banner — "We need one more detail" (PRD §11-212)
   Sand-gold accent border (NOT red — this is a "your next move"
   trigger, not an error). Renders ABOVE the normal request details
   when status === "returned" && req.returnQuestion is present.
   ============================================================ */

function ReturnQuestionBanner({
  req,
  ownerGroupText,
  onResubmit,
  locale,
}: {
  req: ServiceRequest;
  ownerGroupText: string;
  onResubmit: (reqId: string, answer: string) => Promise<void>;
  locale: "en" | "ar";
}) {
  const rq = req.returnQuestion!;
  const [showForm, setShowForm] = useState(false);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Plain-language: "{first name} from {group} needs this to finish your
  // request. One quick answer and it's back on its way."
  const first = rq.returnedBy.split(" ")[0] || rq.returnedBy;
  const timeAgo = formatDistance(new Date(rq.returnedAt), PACK_NOW, { addSuffix: false });

  const handleSubmit = async () => {
    const trimmed = answer.trim();
    if (!trimmed) {
      toast.error(
        locale === "ar" ? "اكتب الإجابة قبل الإرسال" : "Write an answer before resubmitting",
      );
      return;
    }
    setSubmitting(true);
    try {
      await onResubmit(req.id, trimmed);
      // Parent refetches + the card disappears; nothing else to do here.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
      style={{
        borderBottom: "1px solid var(--border-soft)",
        background: "linear-gradient(180deg, rgba(201,162,39,0.08) 0%, rgba(201,162,39,0.02) 100%)",
      }}
    >
      {/* Sand-gold accent strip — the "your next move" cue */}
      <div
        className="h-[3px] w-full"
        style={{
          background: "var(--g-brass)",
        }}
        aria-hidden="true"
      />
      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{
              background: "rgba(201,162,39,0.12)",
              color: "var(--accent-500)",
            }}
            aria-hidden="true"
          >
            <HelpCircle className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="text-[15px] font-semibold leading-snug"
              style={{ color: "var(--text-hi)" }}
            >
              {locale === "ar" ? "نحتاج تفصيلاً إضافياً واحداً" : "We need one more detail"}
            </h3>
            <p
              className="text-[11px] mt-0.5 inline-flex items-center gap-1.5"
              style={{ color: "var(--text-lo)" }}
            >
              <User className="w-3 h-3" strokeWidth={1.75} />
              {locale === "ar"
                ? `${rq.returnedBy} من ${ownerGroupText} · قبل ${timeAgo}`
                : `${rq.returnedBy} from ${ownerGroupText} · ${timeAgo} ago`}
            </p>
          </div>
          <span
            className="ast-chip shrink-0"
            style={{
              color: "var(--accent-500)",
              background: "rgba(201,162,39,0.10)",
              borderColor: "rgba(201,162,39,0.32)",
            }}
          >
            {locale === "ar" ? "خطوتك التالية" : "Your next move"}
          </span>
        </div>

        {/* The structured question — large, clear */}
        <div className="mt-3 p-3 rounded-md ast-card-2">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5"
            style={{ color: "var(--text-lo)" }}
          >
            {locale === "ar" ? "السؤال" : "Question"}
          </p>
          <p
            className="text-[15px] sm:text-[16px] font-medium leading-snug"
            style={{ color: "var(--text-hi)" }}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            {rq.question}
          </p>
          {rq.additionalDetail && (
            <p
              className="text-[13px] mt-2 leading-relaxed"
              style={{ color: "var(--text-mid)" }}
              dir={locale === "ar" ? "rtl" : "ltr"}
            >
              {rq.additionalDetail}
            </p>
          )}
        </div>

        {/* Plain-language explainer */}
        <p className="text-[12px] mt-3 leading-relaxed" style={{ color: "var(--text-mid)" }}>
          {locale === "ar"
            ? `${first} من ${ownerGroupText} يحتاج هذا لإنهاء طلبك. إجابة سريعة واحدة ويعود في طريقه.`
            : `${first} from ${ownerGroupText} needs this to finish your request. One quick answer and it's back on its way.`}
        </p>

        {/* Answer form — toggled by the "Answer and resubmit" button */}
        <AnimatePresence initial={false}>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mt-3">
                <label
                  htmlFor={`answer-${req.id}`}
                  className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-lo)" }}
                >
                  {locale === "ar" ? "إجابتك" : "Your answer"}
                </label>
                <Textarea
                  id={`answer-${req.id}`}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder={locale === "ar" ? "اكتب الإجابة هنا…" : "Type your answer here…"}
                  className="ast-focus mt-1.5 text-[14px] leading-relaxed"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-hi)",
                    border: "1px solid var(--border)",
                  }}
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setAnswer("");
                    }}
                    disabled={submitting}
                    className="ast-focus inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-[10px] text-[13px] font-medium"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text-hi)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {locale === "ar" ? "إلغاء" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="ast-focus inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[10px] text-[13px] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                    style={{
                      background: "var(--accent-500)",
                      color: "var(--surface-0)",
                      boxShadow: "0 4px 14px rgba(201,162,39,0.28)",
                    }}
                  >
                    {submitting ? (
                      <Hourglass className="w-4 h-4 animate-pulse" strokeWidth={1.75} />
                    ) : (
                      <CornerUpLeft className="w-4 h-4" strokeWidth={1.75} />
                    )}
                    {submitting
                      ? locale === "ar"
                        ? "جارٍ الإرسال…"
                        : "Sending…"
                      : locale === "ar"
                        ? "إعادة الإرسال"
                        : "Resubmit"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA button */}
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="ast-focus mt-3 inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[10px] text-[13px] font-semibold transition-transform hover:-translate-y-0.5"
            style={{
              background: "var(--accent-500)",
              color: "var(--surface-0)",
              boxShadow: "0 4px 14px rgba(201,162,39,0.28)",
            }}
          >
            <CornerUpLeft className="w-4 h-4" strokeWidth={1.75} />
            {locale === "ar" ? "أجب وأعد الإرسال" : "Answer and resubmit"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ============================================================
   Helpers — reduced-motion hook + status-based depth config
   ============================================================ */

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

type DepthConfig = {
  shadow: string;
  borderLeft: string;
  opacity: number;
  glow: string;
};

/* Status-based depth layering — fresh requests are calm (e1 + teal hairline);
   in-progress is elevated (e2 + teal glow); returned is amber-elevated (e3 +
   amber glow, the "your next move" cue); resolved/closed are recessed
   (e1 + steady green hairline, slight opacity); draft is flat. */
function getRequestDepth(status: string): DepthConfig {
  switch (status) {
    case "submitted":
    case "acknowledged":
      return {
        shadow: "var(--e1)",
        borderLeft: "2px solid var(--brand-500)",
        opacity: 1,
        glow: "",
      };
    case "in_progress":
      return {
        shadow: "var(--e2)",
        borderLeft: "3px solid var(--brand-500)",
        opacity: 1,
        glow: "0 0 24px rgba(22,154,165,0.16)",
      };
    case "returned":
      return {
        shadow: "var(--e3)",
        borderLeft: "3px solid var(--accent-500)",
        opacity: 1,
        glow: "0 0 28px rgba(201,162,39,0.20)",
      };
    case "resolved":
    case "closed":
      return {
        shadow: "var(--e1)",
        borderLeft: "1px solid var(--status-steady)",
        opacity: 0.85,
        glow: "",
      };
    case "draft":
    default:
      return {
        shadow: "var(--e1)",
        borderLeft: "1px solid var(--border)",
        opacity: 1,
        glow: "",
      };
  }
}

/* ============================================================
   Request card (list item) — 3D tilt + status-based depth + SlaRing
   ============================================================ */

function RequestCard({
  req,
  expanded,
  onToggle,
  onResubmit,
  locale,
  index,
}: {
  req: ServiceRequest;
  expanded: boolean;
  onToggle: () => void;
  onResubmit: (reqId: string, answer: string) => Promise<void>;
  locale: "en" | "ar";
  index: number;
}) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const reduce = usePrefersReducedMotion();
  const schema = INTAKE_SCHEMAS[req.type];
  const typeLabel = schema ? (locale === "ar" ? schema.labelAr : schema.label) : req.type;
  const TypeIcon = TYPE_ICONS[req.type] ?? Inbox;

  // Compute elapsed from openedAt vs slaHours — use PACK_NOW as deterministic asOf
  const elapsedHours = Math.max(
    0,
    (PACK_NOW.getTime() - new Date(req.openedAt).getTime()) / 3_600_000,
  );
  const breach = computeBreach(elapsedHours, req.slaHours);

  const assignee = namedAssignee(req.assignee);
  const ownerGroupLabel = OWNER_GROUP_LABEL[req.ownerGroup];
  const ownerGroupText = ownerGroupLabel
    ? locale === "ar"
      ? ownerGroupLabel.ar
      : ownerGroupLabel.en
    : req.ownerGroup;

  // Status-based depth layering — different shadow + left border + glow per status
  const depth = getRequestDepth(req.status);
  const composeShadow = (base: string) => (depth.glow ? `${base}, ${depth.glow}` : base);
  const defaultShadow = composeShadow(depth.shadow);
  const hoverShadow = composeShadow("var(--e3)");
  const finalShadow = hovered ? hoverShadow : defaultShadow;

  const handleCopyRef = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(req.ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success(locale === "ar" ? "تم نسخ المرجع" : "Reference copied");
    } catch {
      toast.error(locale === "ar" ? "تعذّر النسخ" : "Couldn't copy");
    }
  };

  // PRD §11-212 — when the request has been returned WITH a structured
  // question, show the prominent "We need one more detail" banner ABOVE the
  // normal request details. Sand-gold accent — this is a "your next move"
  // trigger, NOT an error.
  const showReturnQuestion = req.status === "returned" && !!req.returnQuestion;

  // Spring drop-in — stiffness 200 / damping 24, 40ms stagger capped at 8 (320ms)
  const entranceTransition = reduce
    ? { duration: 0.12 }
    : {
        type: "spring" as const,
        stiffness: 200,
        damping: 24,
        delay: Math.min(index * 0.04, 0.32),
      };

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={entranceTransition}
      style={{ listStyle: "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hover-lift wrapper — 2px translateY on hover (180ms) */}
      <div
        style={{
          transform: hovered && !reduce ? "translateY(-2px)" : "translateY(0)",
          transition: reduce ? "none" : "transform 180ms var(--ease-standard)",
        }}
      >
        <Tilt3D maxDeg={2} as="div">
          {/* Visual card — status-based depth + accent left border */}
          <div
            className="ast-card overflow-hidden"
            style={{
              boxShadow: finalShadow,
              borderLeft: depth.borderLeft,
              opacity: depth.opacity,
            }}
          >
            {showReturnQuestion && req.returnQuestion && (
              <ReturnQuestionBanner
                req={req}
                ownerGroupText={ownerGroupText}
                onResubmit={onResubmit}
                locale={locale}
              />
            )}
            {/* Outer clickable area uses role=button on a div to avoid nested <button> hydration errors */}
            <div
              onClick={onToggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }}
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              className="ast-focus w-full text-left p-4 sm:p-5 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  {/* 3D medallion — radial gradient + inner highlight ring + drop shadow */}
                  <div
                    className="flex items-center justify-center rounded-full shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      background:
                        "radial-gradient(circle at 30% 30%, rgba(22,154,165,0.36) 0%, rgba(22,154,165,0.14) 55%, rgba(11,17,28,0.55) 100%)",
                      border: "1px solid rgba(22,154,165,0.30)",
                      color: "var(--brand-400)",
                      boxShadow: [
                        // Drop shadow below the icon (2px offset, 4px blur, 0.2 opacity)
                        "0 2px 4px rgba(0,0,0,0.20)",
                        // Inner highlight ring (1px, white at 0.1 opacity)
                        "inset 0 0 0 1px rgba(255,255,255,0.10)",
                        // Subtle inset glow at top-left for added depth
                        "inset 1.5px 1.5px 2px rgba(255,255,255,0.06)",
                      ].join(", "),
                    }}
                    aria-hidden="true"
                  >
                    <TypeIcon className="w-4 h-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[15px] font-semibold leading-snug truncate"
                      style={{ color: "var(--text-hi)" }}
                    >
                      {typeLabel}
                    </p>
                    <div className="mt-1.5 flex items-center flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyRef();
                        }}
                        className="ast-focus inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-mono tabular transition-colors hover:bg-[var(--surface-2)]"
                        style={{ color: "var(--text-lo)" }}
                        title={locale === "ar" ? "نسخ المرجع" : "Copy reference"}
                      >
                        {copied ? (
                          <Check
                            className="w-3 h-3"
                            strokeWidth={1.75}
                            style={{ color: "var(--status-steady)" }}
                          />
                        ) : (
                          <Copy className="w-3 h-3" strokeWidth={1.75} />
                        )}
                        {req.ref}
                      </button>
                      <span className="text-[11px] tabular" style={{ color: "var(--text-lo)" }}>
                        {locale === "ar"
                          ? `فُتح ${format(new Date(req.openedAt), "d MMM")}`
                          : `Opened ${format(new Date(req.openedAt), "d MMM")}`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <StatusChip status={req.status} locale={locale} />
                  <SlaRing
                    elapsedHours={elapsedHours}
                    targetHours={req.slaHours}
                    breachLevel={breach}
                  />
                </div>
              </div>

              {/* Meta row */}
              <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1.5 text-[12px]">
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ color: "var(--text-mid)" }}
                >
                  <User className="w-3 h-3" strokeWidth={1.75} />
                  {assignee ? assignee.name : req.assignee}
                  <span className="opacity-60">· {ownerGroupText}</span>
                </span>
                {req.reassignCount > 0 && (
                  <span
                    className="inline-flex items-center gap-1 tabular"
                    style={{ color: "var(--status-watch)" }}
                  >
                    <CircleDot className="w-3 h-3" strokeWidth={1.75} />
                    {locale === "ar"
                      ? `أُعيد تعيينها ${req.reassignCount}×`
                      : `Reassigned ${req.reassignCount}×`}
                  </span>
                )}
                {req.returnCount > 0 && (
                  <span
                    className="inline-flex items-center gap-1 tabular"
                    style={{ color: "var(--status-friction)" }}
                  >
                    <RotateCcw className="w-3 h-3" strokeWidth={1.75} />
                    {locale === "ar"
                      ? `أُرجعت ${req.returnCount}×`
                      : `Returned ${req.returnCount}×`}
                  </span>
                )}
                <span
                  className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium"
                  style={{ color: "var(--brand-400)" }}
                >
                  {expanded
                    ? locale === "ar"
                      ? "إخفاء"
                      : "Hide"
                    : locale === "ar"
                      ? "عرض"
                      : "View"}
                  <ChevronDown
                    className={cn("w-3.5 h-3.5 transition-transform", expanded && "rotate-180")}
                    strokeWidth={1.75}
                  />
                </span>
              </div>
            </div>

            {/* Expandable detail */}
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-[var(--border-soft)]"
                >
                  <div className="p-4 sm:p-5 space-y-4 bg-[var(--surface-0)]">
                    <RequestTimeline req={req} locale={locale} />
                    <RequestContext req={req} locale={locale} />
                    <RequestPolicyRef req={req} locale={locale} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Tilt3D>
      </div>
    </motion.li>
  );
}

/* ---------- Timeline (expandable) ---------- */

function RequestTimeline({ req, locale }: { req: ServiceRequest; locale: "en" | "ar" }) {
  // Build a minimal deterministic timeline from request metadata.
  // Real events would come from a separate endpoint; this is a prototype view.
  const events: { ts: string; labelEn: string; labelAr: string; icon: LucideIcon }[] = [
    {
      ts: req.openedAt,
      labelEn: `Request opened · assigned to ${namedAssignee(req.assignee)?.name ?? req.assignee}`,
      labelAr: `فُتح الطلب · عُيّن إلى ${namedAssignee(req.assignee)?.name ?? req.assignee}`,
      icon: Send,
    },
  ];
  if (req.reassignCount > 0) {
    events.push({
      ts: req.openedAt,
      labelEn: `Reassigned ${req.reassignCount}× within the owning team`,
      labelAr: `أُعيد تعيينها ${req.reassignCount}× داخل الفريق المالك`,
      icon: CircleDot,
    });
  }
  if (req.returnCount > 0) {
    events.push({
      ts: req.openedAt,
      labelEn: `Returned ${req.returnCount}× for clarification`,
      labelAr: `أُرجعت ${req.returnCount}× للتوضيح`,
      icon: RotateCcw,
    });
  }
  return (
    <div>
      <h4
        className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2"
        style={{ color: "var(--text-lo)" }}
      >
        {locale === "ar" ? "الجدول الزمني" : "Timeline"}
      </h4>
      <ol className="space-y-2">
        {events.map((ev, i) => {
          const Icon = ev.icon;
          return (
            <li key={i} className="flex items-start gap-2.5">
              <div
                className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--brand-400)",
                }}
              >
                <Icon className="w-3 h-3" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? ev.labelAr : ev.labelEn}
                </p>
                <p className="text-[10px] tabular mt-0.5" style={{ color: "var(--text-lo)" }}>
                  {format(new Date(ev.ts), "EEEE d MMM yyyy · HH:mm")}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------- Journey context attached (expandable) ---------- */

function RequestContext({ req, locale }: { req: ServiceRequest; locale: "en" | "ar" }) {
  const schema = INTAKE_SCHEMAS[req.type];
  if (!schema) return null;
  return (
    <div>
      <h4
        className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2"
        style={{ color: "var(--text-lo)" }}
      >
        {locale === "ar" ? "السياق المُرفق" : "Attached context"}
      </h4>
      <ul className="flex flex-wrap gap-1.5">
        {schema.autoAttachedContext.map((c) => (
          <li
            key={c}
            className="ast-chip"
            style={{
              color: "var(--brand-400)",
              background: "rgba(22,154,165,0.06)",
              borderColor: "rgba(22,154,165,0.22)",
              height: 26,
            }}
          >
            <Sparkles className="w-3 h-3" strokeWidth={1.75} />
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Policy ref (expandable) ---------- */

function RequestPolicyRef({ req, locale }: { req: ServiceRequest; locale: "en" | "ar" }) {
  const schema = INTAKE_SCHEMAS[req.type];
  if (!schema) return null;
  const citation = parsePolicyRef(schema.policyRef);
  return (
    <div>
      <h4
        className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2"
        style={{ color: "var(--text-lo)" }}
      >
        {locale === "ar" ? "السياسة المرجعية" : "Policy reference"}
      </h4>
      <CitationChip citation={citation} locale={locale} />
    </div>
  );
}

/* ============================================================
   StepIndicator — 3-dot wizard step indicator with labels
   Horizontal dots connected by a line that fills teal as the
   user progresses. Completed steps are filled teal with a
   checkmark; the current step is filled sand-gold with a
   pulse ring; future steps are outlined gray. Each dot has
   a label below.
   ============================================================ */

const WIZARD_STEPS: ReadonlyArray<{ en: string; ar: string }> = [
  { en: "Choose type", ar: "اختر النوع" },
  { en: "Fill details", ar: "أدخل التفاصيل" },
  { en: "Preview & submit", ar: "معاينة وإرسال" },
];

function StepIndicator({ step, locale }: { step: 0 | 1 | 2; locale: "en" | "ar" }) {
  const reduce = usePrefersReducedMotion();
  // Progress fraction (0, 0.5, 1.0) drives the filled-line width
  const progress = step / 2;

  return (
    <div className="mb-5">
      {/* Dot row with connecting line */}
      <div className="relative grid grid-cols-3 items-center" style={{ height: 12 }}>
        {/* Background track — runs from center of col 1 to center of col 3 */}
        <div
          className="absolute rounded-full"
          style={{
            left: "16.66%",
            right: "16.66%",
            top: "50%",
            height: 2,
            transform: "translateY(-50%)",
            background: "var(--surface-3)",
          }}
          aria-hidden="true"
        />
        {/* Filled track — animates from 0 to progress × 66.66% of total width */}
        <motion.div
          className="absolute rounded-full"
          style={{
            left: "16.66%",
            top: "50%",
            height: 2,
            transform: "translateY(-50%)",
            background: "var(--brand-500)",
          }}
          initial={false}
          animate={{ width: `${progress * 66.66}%` }}
          transition={
            reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 200, damping: 24 }
          }
          aria-hidden="true"
        />
        {/* Dots */}
        {WIZARD_STEPS.map((s, i) => {
          const isComplete = i < step;
          const isCurrent = i === step;
          const isFuture = i > step;
          return (
            <div
              key={i}
              className="relative flex justify-center items-center"
              style={{ height: 12 }}
            >
              <motion.div
                className="rounded-full flex items-center justify-center"
                style={{
                  width: 12,
                  height: 12,
                  borderWidth: 1,
                  borderStyle: "solid",
                  zIndex: 1,
                }}
                initial={false}
                animate={{
                  backgroundColor: isComplete
                    ? "var(--brand-500)"
                    : isCurrent
                      ? "var(--accent-500)"
                      : "var(--surface-1)",
                  borderColor: isFuture ? "var(--border)" : "transparent",
                  scale: isCurrent ? 1.1 : 0.95,
                }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring" as const, stiffness: 300, damping: 22 }
                }
              >
                {isComplete && (
                  <Check
                    className="w-2 h-2"
                    strokeWidth={3.5}
                    style={{ color: "var(--surface-0)" }}
                    aria-hidden="true"
                  />
                )}
              </motion.div>
              {/* Pulse ring around the current step */}
              {isCurrent && !reduce && (
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    width: 12,
                    height: 12,
                    border: "1px solid var(--accent-500)",
                  }}
                  initial={{ opacity: 0.6, scale: 1 }}
                  animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.8, 1] }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="grid grid-cols-3 gap-1 mt-2">
        {WIZARD_STEPS.map((s, i) => {
          const isCurrent = i === step;
          const isComplete = i < step;
          return (
            <div
              key={i}
              className={cn(
                "text-center",
                i === 0 && "text-left",
                i === WIZARD_STEPS.length - 1 && "text-right",
              )}
            >
              <motion.span
                className="text-[10px] font-medium uppercase tracking-[0.04em] tabular block"
                style={{
                  color: isCurrent
                    ? "var(--accent-500)"
                    : isComplete
                      ? "var(--brand-400)"
                      : "var(--text-lo)",
                }}
                initial={false}
                animate={{ opacity: isCurrent || isComplete ? 1 : 0.7 }}
                transition={reduce ? { duration: 0 } : { duration: 0.18 }}
              >
                {locale === "ar" ? s.ar : s.en}
              </motion.span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Wizard (3 steps)
   ============================================================ */

function Wizard({
  step,
  type,
  prefill,
  onStepChange,
  onPickType,
  onSubmit,
  onReset,
  locale,
  employeeId,
}: {
  step: 0 | 1 | 2;
  type: RequestType | null;
  prefill: Record<string, string>;
  onStepChange: (s: 0 | 1 | 2) => void;
  onPickType: (t: RequestType) => void;
  onSubmit: (
    payload: Record<string, unknown>,
  ) => Promise<{ ok: boolean; code?: string; message?: string; id?: string; duplicate?: boolean }>;
  onReset: () => void;
  locale: "en" | "ar";
  employeeId: string;
}) {
  const schema: IntakeSchema | null = type ? INTAKE_SCHEMAS[type] : null;
  // The Wizard is keyed by `type` in the parent so it remounts
  // whenever the type changes, ensuring this initializer re-runs.
  const [payload, setPayload] = useState<Record<string, unknown>>(() => {
    if (!type) return {};
    const s = INTAKE_SCHEMAS[type];
    const initial: Record<string, unknown> = {};
    for (const field of s.fields) {
      if (prefill[field.key] !== undefined) {
        initial[field.key] = prefill[field.key];
      } else if (field.type === "checkbox") {
        initial[field.key] = false;
      } else {
        initial[field.key] = "";
      }
    }
    return initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validateField = (field: IntakeField, value: unknown): string => {
    if (field.required) {
      if (value === undefined || value === null || value === "" || value === false) {
        return locale === "ar"
          ? `${locale === "ar" ? field.labelAr : field.label} مطلوب`
          : `${field.label} is required`;
      }
    }
    if (field.type === "number" && value !== "" && value !== undefined) {
      const n = Number(value);
      if (Number.isNaN(n)) {
        return locale === "ar" ? "يجب أن يكون رقماً" : "Must be a number";
      }
      if (n < 0) return locale === "ar" ? "لا يمكن أن يكون سالباً" : "Cannot be negative";
    }
    if (field.type === "date" && value && field.key === "effective_date") {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) {
        return locale === "ar" ? "تاريخ غير صالح" : "Invalid date";
      }
    }
    return "";
  };

  const validateAll = (): boolean => {
    if (!schema) return false;
    const next: Record<string, string> = {};
    for (const field of schema.fields) {
      const err = validateField(field, payload[field.key]);
      if (err) next[field.key] = err;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleFieldChange = (key: string, value: unknown) => {
    setPayload((prev) => ({ ...prev, [key]: value }));
    // Inline validation as you type — clear error on change, re-validate if it had one
    if (errors[key]) {
      const field = schema?.fields.find((f) => f.key === key);
      if (field) {
        const err = validateField(field, value);
        setErrors((prev) => {
          const next = { ...prev };
          if (err) next[key] = err;
          else delete next[key];
          return next;
        });
      }
    }
  };

  const handleSubmit = async () => {
    if (!schema) return;
    if (!validateAll()) {
      toast.error(
        locale === "ar" ? "يرجى تصحيح الحقول المطلوبة" : "Please fix the required fields",
      );
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const result = await onSubmit(payload);
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.message ?? "Failed to submit");
    }
  };

  return (
    <div>
      {/* Step indicator — 3-dot with labels and connecting line */}
      <StepIndicator step={step} locale={locale} />

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Step1TypeGrid onPick={onPickType} locale={locale} />
          </motion.div>
        )}
        {step === 1 && schema && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Step2Form
              schema={schema}
              payload={payload}
              errors={errors}
              prefill={prefill}
              onChange={handleFieldChange}
              onBack={() => {
                onReset();
                onStepChange(0);
              }}
              onNext={() => {
                if (validateAll()) onStepChange(2);
                else
                  toast.error(
                    locale === "ar"
                      ? "يرجى تصحيح الحقول المطلوبة"
                      : "Please fix the required fields",
                  );
              }}
              locale={locale}
            />
          </motion.div>
        )}
        {step === 2 && schema && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Step3Preview
              schema={schema}
              payload={payload}
              onBack={() => onStepChange(1)}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
              locale={locale}
              employeeId={employeeId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Step 1: Type grid ---------- */

function Step1TypeGrid({
  onPick,
  locale,
}: {
  onPick: (t: RequestType) => void;
  locale: "en" | "ar";
}) {
  const types = Object.values(INTAKE_SCHEMAS);
  return (
    <div>
      <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--text-hi)" }}>
        {locale === "ar" ? "ما نوع الطلب؟" : "What do you need?"}
      </h2>
      <p className="text-[12px] mb-4" style={{ color: "var(--text-mid)" }}>
        {locale === "ar"
          ? "اختر نوع الطلب وسأعبّئ ما أستطيع من رحلتك."
          : "Pick a type and I'll prefill what I can from your journey."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {types.map((schema) => {
          const Icon = TYPE_ICONS[schema.type];
          const ownerLabel = OWNER_GROUP_LABEL[schema.ownerGroup];
          return (
            <button
              key={schema.type}
              onClick={() => onPick(schema.type)}
              className="ast-focus ast-card-2 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--brand-500)]"
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                  style={{
                    background: "rgba(22,154,165,0.10)",
                    color: "var(--brand-400)",
                  }}
                  aria-hidden="true"
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <span
                  className="text-[13px] font-semibold leading-tight"
                  style={{ color: "var(--text-hi)" }}
                >
                  {locale === "ar" ? schema.labelAr : schema.label}
                </span>
              </div>
              <div
                className="flex items-center gap-2 text-[10px] tabular"
                style={{ color: "var(--text-lo)" }}
              >
                <Clock className="w-3 h-3" strokeWidth={1.75} />
                <span>
                  {locale === "ar" ? `${schema.slaHours}س SLA` : `${schema.slaHours}h SLA`}
                </span>
                <span aria-hidden="true" className="opacity-50">
                  ·
                </span>
                <span>
                  {ownerLabel
                    ? locale === "ar"
                      ? ownerLabel.ar
                      : ownerLabel.en
                    : schema.ownerGroup}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Step 2: Dynamic form ---------- */

function Step2Form({
  schema,
  payload,
  errors,
  prefill,
  onChange,
  onBack,
  onNext,
  locale,
}: {
  schema: IntakeSchema;
  payload: Record<string, unknown>;
  errors: Record<string, string>;
  prefill: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  onBack: () => void;
  onNext: () => void;
  locale: "en" | "ar";
}) {
  const TypeIcon = TYPE_ICONS[schema.type];
  const allValid = schema.fields.every((f) => {
    if (!f.required) return true;
    const v = payload[f.key];
    return v !== undefined && v !== null && v !== "" && v !== false;
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
          style={{
            background: "rgba(22,154,165,0.10)",
            color: "var(--brand-400)",
          }}
          aria-hidden="true"
        >
          <TypeIcon className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <h2
            className="text-[15px] font-semibold leading-tight"
            style={{ color: "var(--text-hi)" }}
          >
            {locale === "ar" ? schema.labelAr : schema.label}
          </h2>
          <p className="text-[11px] tabular" style={{ color: "var(--text-lo)" }}>
            {locale === "ar"
              ? `SLA ${schema.slaHours} ساعة · ${OWNER_GROUP_LABEL[schema.ownerGroup]?.ar ?? schema.ownerGroup}`
              : `SLA ${schema.slaHours}h · ${OWNER_GROUP_LABEL[schema.ownerGroup]?.en ?? schema.ownerGroup}`}
          </p>
        </div>
      </div>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 -mr-1">
        {schema.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            value={payload[field.key]}
            error={errors[field.key]}
            prefilled={!!prefill[field.key]}
            onChange={(v) => onChange(field.key, v)}
            locale={locale}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onBack}
          className="ast-focus inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-[10px] text-[13px] font-medium"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-hi)",
            border: "1px solid var(--border)",
          }}
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          {locale === "ar" ? "رجوع" : "Back"}
        </button>
        <button
          onClick={onNext}
          disabled={!allValid}
          className="ast-focus ml-auto inline-flex items-center justify-center gap-1.5 h-11 px-5 rounded-[10px] text-[13px] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
          style={{
            background: "var(--brand-500)",
            color: "var(--surface-0)",
          }}
        >
          {locale === "ar" ? "معاينة" : "Preview"}
          <ArrowRight className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/* ---------- Field row ---------- */

function FieldRow({
  field,
  value,
  error,
  prefilled,
  onChange,
  locale,
}: {
  field: IntakeField;
  value: unknown;
  error?: string;
  prefilled: boolean;
  onChange: (v: unknown) => void;
  locale: "en" | "ar";
}) {
  const label = locale === "ar" ? field.labelAr : field.label;
  const help = locale === "ar" ? field.helpTextAr : field.helpText;
  const labelEl = (
    <Label
      className="text-[12px] mb-1.5"
      style={{ color: "var(--text-hi)" }}
      htmlFor={`field-${field.key}`}
    >
      {label}
      {field.required && (
        <span style={{ color: "var(--status-friction)" }} aria-hidden="true">
          {" "}
          *
        </span>
      )}
      {prefilled && (
        <span
          className="ast-chip ml-2"
          style={{
            color: "var(--brand-400)",
            background: "rgba(22,154,165,0.06)",
            borderColor: "rgba(22,154,165,0.22)",
            height: 18,
            fontSize: 10,
            paddingInline: 6,
          }}
        >
          {locale === "ar" ? "مُعبّأ مسبقاً" : "Prefilled"}
        </span>
      )}
    </Label>
  );

  const errorEl = error ? (
    <p className="text-[11px] mt-1" style={{ color: "var(--status-friction)" }} role="alert">
      {error}
    </p>
  ) : null;

  const helpEl = help ? (
    <p className="text-[11px] mt-1" style={{ color: "var(--text-lo)" }}>
      {help}
    </p>
  ) : null;

  const inputEl = (() => {
    if (field.type === "text") {
      return (
        <Input
          id={`field-${field.key}`}
          type="text"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className="ast-focus h-10 bg-[var(--surface-2)]"
          style={{ color: "var(--text-hi)" }}
        />
      );
    }
    if (field.type === "number") {
      return (
        <Input
          id={`field-${field.key}`}
          type="number"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          min={0}
          aria-invalid={!!error}
          className="ast-focus h-10 bg-[var(--surface-2)] tabular"
          style={{ color: "var(--text-hi)" }}
        />
      );
    }
    if (field.type === "date") {
      return (
        <Input
          id={`field-${field.key}`}
          type="date"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className="ast-focus h-10 bg-[var(--surface-2)] tabular"
          style={{ color: "var(--text-hi)" }}
        />
      );
    }
    if (field.type === "textarea") {
      return (
        <Textarea
          id={`field-${field.key}`}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          aria-invalid={!!error}
          className="ast-focus bg-[var(--surface-2)]"
          style={{ color: "var(--text-hi)" }}
        />
      );
    }
    if (field.type === "select") {
      return (
        <Select value={(value as string) ?? ""} onValueChange={(v) => onChange(v)}>
          <SelectTrigger
            id={`field-${field.key}`}
            className="ast-focus h-10 w-full bg-[var(--surface-2)]"
            style={{ color: "var(--text-hi)" }}
            aria-invalid={!!error}
          >
            <SelectValue placeholder={locale === "ar" ? "اختر…" : "Select…"} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === "checkbox") {
      return (
        <label
          htmlFor={`field-${field.key}`}
          className="ast-focus inline-flex items-center gap-2.5 h-11 cursor-pointer rounded-md px-1"
          style={{ color: "var(--text-hi)" }}
        >
          <Checkbox
            id={`field-${field.key}`}
            checked={!!value}
            onCheckedChange={(v) => onChange(!!v)}
          />
          <span className="text-[13px]">
            {value ? (locale === "ar" ? "نعم" : "Yes") : locale === "ar" ? "لا" : "No"}
          </span>
        </label>
      );
    }
    return null;
  })();

  return (
    <div>
      {field.type === "checkbox" ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {labelEl}
            {helpEl}
          </div>
          <label
            htmlFor={`field-${field.key}`}
            className="ast-focus inline-flex items-center gap-2 cursor-pointer"
          >
            <Checkbox
              id={`field-${field.key}`}
              checked={!!value}
              onCheckedChange={(v) => onChange(!!v)}
            />
          </label>
        </div>
      ) : (
        <>
          {labelEl}
          {inputEl}
          {helpEl}
          {errorEl}
        </>
      )}
      {field.type === "checkbox" && error && (
        <p className="text-[11px] mt-1" style={{ color: "var(--status-friction)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Step 3: Preview ---------- */

function Step3Preview({
  schema,
  payload,
  onBack,
  onSubmit,
  submitting,
  submitError,
  locale,
  employeeId,
}: {
  schema: IntakeSchema;
  payload: Record<string, unknown>;
  onBack: () => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  locale: "en" | "ar";
  employeeId: string;
}) {
  const owner = resolveOwnerForType(schema.type);
  // Expected-by date: openedAt + slaHours (preview uses now + SLA)
  const expectedBy = addDays(new Date(), Math.ceil(schema.slaHours / 24));

  return (
    <div>
      <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--text-hi)" }}>
        {locale === "ar" ? "معاينة الإرسال" : "Preview before sending"}
      </h2>
      <p className="text-[12px] mb-4" style={{ color: "var(--text-mid)" }}>
        {locale === "ar"
          ? "تأكّد قبل الإرسال — لا يمكنك التراجع بعد الإنشاء."
          : "Review before sending — you can't undo once created."}
      </p>

      {/* Recipient */}
      {owner && (
        <div className="ast-card-2 p-3 mb-3" style={{ borderColor: "rgba(22,154,165,0.30)" }}>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-1.5"
            style={{ color: "var(--text-lo)" }}
          >
            {locale === "ar" ? "سيُرسل إلى" : "This will be sent to"}
          </p>
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
              style={{
                background: "rgba(22,154,165,0.10)",
                color: "var(--brand-400)",
              }}
              aria-hidden="true"
            >
              <User className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p
                className="text-[14px] font-semibold leading-tight truncate"
                style={{ color: "var(--text-hi)" }}
              >
                {owner.name}
              </p>
              <p className="text-[12px] truncate" style={{ color: "var(--text-mid)" }}>
                {owner.role}
                <span className="opacity-60">
                  {" "}
                  · {OWNER_GROUP_LABEL[owner.group]?.[locale === "ar" ? "ar" : "en"] ?? owner.group}
                </span>
              </p>
            </div>
          </div>
          <p className="text-[11px] mt-2 tabular" style={{ color: "var(--text-lo)" }}>
            {locale === "ar"
              ? `متوقع بحلول ${format(expectedBy, "EEEE d MMM")}`
              : `Expected by ${format(expectedBy, "EEEE d MMM")}`}
          </p>
        </div>
      )}

      {/* Payload preview */}
      <div className="ast-card-2 p-3 mb-3">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2"
          style={{ color: "var(--text-lo)" }}
        >
          {locale === "ar" ? "الحمولة" : "Payload"}
        </p>
        <dl className="space-y-1.5">
          {schema.fields.map((field) => {
            const v = payload[field.key];
            const display =
              field.type === "checkbox"
                ? v
                  ? locale === "ar"
                    ? "نعم"
                    : "Yes"
                  : locale === "ar"
                    ? "لا"
                    : "No"
                : (v as string) || "—";
            return (
              <div key={field.key} className="flex items-start justify-between gap-3 text-[12px]">
                <dt style={{ color: "var(--text-mid)" }} className="shrink-0">
                  {locale === "ar" ? field.labelAr : field.label}
                </dt>
                <dd
                  className="text-right font-mono tabular break-words min-w-0"
                  style={{ color: "var(--text-hi)" }}
                >
                  {display}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      {/* Auto-attached context */}
      <div className="mb-3">
        <p
          className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-2"
          style={{ color: "var(--text-lo)" }}
        >
          {locale === "ar" ? "سيُرفق تلقائياً" : "Will be auto-attached"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {schema.autoAttachedContext.map((c) => (
            <span
              key={c}
              className="ast-chip"
              style={{
                color: "var(--brand-400)",
                background: "rgba(22,154,165,0.06)",
                borderColor: "rgba(22,154,165,0.22)",
                height: 24,
              }}
            >
              <Sparkles className="w-3 h-3" strokeWidth={1.75} />
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Submit error inline */}
      {submitError && (
        <div
          className="p-2.5 mb-3 rounded-md flex items-start gap-2 text-[12px]"
          style={{
            background: "rgba(220,38,38,0.08)",
            border: "1px solid rgba(220,38,38,0.30)",
            color: "var(--status-friction)",
          }}
          role="alert"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" strokeWidth={1.75} />
          <span>{submitError}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          disabled={submitting}
          className="ast-focus inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-[10px] text-[13px] font-medium"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-hi)",
            border: "1px solid var(--border)",
          }}
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
          {locale === "ar" ? "تعديل" : "Edit"}
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="ast-focus ml-auto inline-flex items-center justify-center gap-2 h-11 px-5 rounded-[10px] text-[13px] font-semibold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          style={{
            background: "var(--accent-500)",
            color: "var(--surface-0)",
            boxShadow: "0 4px 14px rgba(201,162,39,0.28)",
          }}
        >
          {submitting ? (
            <>
              <Hourglass className="w-4 h-4 animate-pulse" strokeWidth={1.75} />
              {locale === "ar" ? "جارٍ الإرسال…" : "Submitting…"}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" strokeWidth={2} />
              {locale === "ar" ? "إرسال الطلب" : "Submit request"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Empty state
   ============================================================ */

function EmptyState({
  onPickType,
  locale,
}: {
  onPickType: (t: RequestType) => void;
  locale: "en" | "ar";
}) {
  return (
    <div className="ast-card p-6 sm:p-8 text-center">
      <div
        className="flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-3"
        style={{
          background: "var(--g-veil)",
          color: "var(--brand-400)",
        }}
        aria-hidden="true"
      >
        <Inbox className="w-6 h-6" strokeWidth={1.75} />
      </div>
      <h2 className="text-[16px] font-semibold mb-1" style={{ color: "var(--text-hi)" }}>
        {locale === "ar" ? "لا طلبات مفتوحة." : "No open requests."}
      </h2>
      <p className="text-[13px] mb-4 max-w-[400px] mx-auto" style={{ color: "var(--text-mid)" }}>
        {locale === "ar"
          ? "إليك ما يحتاجه الناس عادةً في اليوم الخامس."
          : "Here is what people usually need on day 5."}
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {QUICKSTART_TYPES.map((t) => {
          const schema = INTAKE_SCHEMAS[t];
          const Icon = TYPE_ICONS[t];
          return (
            <button
              key={t}
              onClick={() => onPickType(t)}
              className="ast-focus ast-card-2 inline-flex items-center gap-2 h-10 px-3 transition-all hover:-translate-y-0.5 hover:border-[var(--brand-500)]"
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
              <span className="text-[12px] font-medium" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? schema.labelAr : schema.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Skeleton + error
   ============================================================ */

function RequestListSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="ast-card p-5 h-28 ast-shimmer rounded-[14px]" />
      ))}
    </ul>
  );
}

function ErrorBanner({
  message,
  onRetry,
  locale,
}: {
  message: string;
  onRetry: () => void;
  locale: "en" | "ar";
}) {
  return (
    <div
      className="ast-card p-5 flex flex-col sm:flex-row sm:items-center gap-3"
      role="alert"
      style={{ borderColor: "rgba(220,38,38,0.40)" }}
    >
      <div
        className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
        style={{ background: "rgba(220,38,38,0.12)", color: "var(--status-friction)" }}
      >
        <AlertTriangle className="w-5 h-5" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "تعذّر تحميل طلباتك." : "Couldn't load your requests."}
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
