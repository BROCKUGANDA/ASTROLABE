"use client";

/* ============================================================
   ASTROLABE — Service Owner Intake Console (PRD §11)
   6th role. A queue-driven work surface for service owners
   showing complete payloads, structured "needs more info"
   returns (NOT free-text email), resolution flow, and a
   zero-clarification success metric.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow, differenceInHours, format, addDays, startOfWeek, isSameDay } from "date-fns";
import {
  Inbox,
  Copy,
  Check,
  ChevronDown,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Send,
  CheckCircle2,
  HelpCircle,
  Play,
  Eye,
  FileText,
  Activity,
  Clock,
  Users,
  Inbox as InboxIcon,
  BarChart3,
  MapPin,
  TrendingUp,
  TrendingDown,
  Save,
  ArrowUpDown,
  ChevronUp,
  Calendar,
  Award,
  BellOff,
  BellRing,
  Moon,
  AppWindow,
  Mail,
  Smartphone,
  Volume2,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { StatusChip, SlaChip, CitationChip } from "@/components/astrolabe/widgets";
import { INTAKE_SCHEMAS, type IntakeSchema, type IntakeField } from "@/lib/actions/actions";
import type { RequestType, Employee } from "@/lib/data/pack";
import {
  employees as ALL_EMPLOYEES,
  serviceRequests as SEED_REQUESTS,
  owners as ALL_OWNERS,
  NOW as PACK_NOW,
} from "@/lib/data/pack";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  JourneyMapFixModal,
  type MapFixProposal,
} from "@/components/astrolabe/journey-map-fix-modal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ---------- Types ---------- */

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
  returnQuestion?: {
    question: string;
    additionalDetail?: string;
    returnedBy: string;
    returnedAt: string;
    answer?: string;
  };
}

interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  meta: { requestId: string; asOf: string; servedFrom: string };
  error: { code: string; message: string; hint?: string } | null;
}

/* ---------- Owner groups ---------- */

type OwnerGroup = "IT" | "HR" | "Immigration" | "Learning" | "Facilities" | "Mobility" | "Payroll";

const OWNER_GROUPS: { id: OwnerGroup; label: string; labelAr: string }[] = [
  { id: "IT", label: "IT", labelAr: "تقنية المعلومات" },
  { id: "HR", label: "HR", labelAr: "الموارد البشرية" },
  { id: "Immigration", label: "Immigration", labelAr: "الهجرة" },
  { id: "Learning", label: "Learning", labelAr: "التعلم" },
  { id: "Facilities", label: "Facilities", labelAr: "المرافق" },
  { id: "Mobility", label: "Mobility", labelAr: "التنقل" },
  { id: "Payroll", label: "Payroll", labelAr: "الرواتب" },
];

/* ---------- Standard "needs more info" questions per request type ---------- */

const STANDARD_QUESTIONS: Record<RequestType, { en: string; ar: string }[]> = {
  it_kit: [
    { en: "Which campus — Dubai (DXB) or Abu Dhabi (AUH)?", ar: "أي موقع — دبي (DXB) أم أبوظبي (AUH)؟" },
    { en: "Is this a replacement for lost/damaged kit?", ar: "هل هذا بديل عن عُدّة مفقودة أو تالفة؟" },
    { en: "What is the urgent date you need the kit by?", ar: "ما التاريخ العاجل الذي تحتاج العُدّة بحلوله؟" },
    { en: "Which kit type — standard laptop, cabin crew, or replacement?", ar: "ما نوع العُدّة — حاسوب قياسي، طاقم المقصورة، أم بديل؟" },
  ],
  system_access: [
    { en: "Which system — email, roster, learning, or finance?", ar: "أي نظام — البريد، الجداول، التعلم، أم المالية؟" },
    { en: "Who is the manager approver for elevated access?", ar: "من هو المدير المعتمد للوصول الموسّع؟" },
    { en: "What is the effective date?", ar: "ما تاريخ السريان؟" },
  ],
  visa: [
    { en: "Has your passport scan been uploaded?", ar: "هل تم رفع مسح جواز السفر؟" },
    { en: "Are there any dependants on this visa?", ar: "هل هناك معالون على هذه التأشيرة؟" },
    { en: "Is this role marked business-critical for expediting?", ar: "هل هذه الوظيفة مُصنّفة حرجة للأعمال للتسريع؟" },
  ],
  relocation: [
    { en: "What is your family size?", ar: "ما حجم أسرتك؟" },
    { en: "What is your arrival date?", ar: "ما تاريخ وصولك؟" },
    { en: "Do you need temporary housing?", ar: "هل تحتاج سكناً مؤقتاً؟" },
  ],
  payroll: [
    { en: "What is the change type — bank, allowance, or transfer?", ar: "ما نوع التغيير — بنك، بدل، أم نقل؟" },
    { en: "Have bank details been confirmed?", ar: "هل تم تأكيد البيانات البنكية؟" },
    { en: "What is the effective date before the 25th cutoff?", ar: "ما تاريخ السريان قبل موعد القطع في 25؟" },
  ],
  training: [
    { en: "Which course code do you need?", ar: "ما رمز الدورة التي تحتاجها؟" },
    { en: "Is your prerequisite access present?", ar: "هل الوصول المسبق متوفر؟" },
    { en: "Morning or afternoon preferred window?", ar: "الفترة المفضلة صباحاً أم مساءً؟" },
  ],
  facilities: [
    { en: "Which site — DXB or AUH?", ar: "أي موقع — DXB أم AUH؟" },
    { en: "What floor and access group?", ar: "ما الطابق ومجموعة الوصول؟" },
    { en: "Is this a mobility case (transfer)?", ar: "هل هذه حالة تنقل (نقل)؟" },
  ],
  manager_handover: [
    { en: "Who is the releasing manager?", ar: "من هو المدير المُخلّي؟" },
    { en: "Who is the receiving manager?", ar: "من هو المدير المُستقبِل؟" },
    { en: "What handover items are pending?", ar: "ما عناصر التسليم المعلّقة؟" },
  ],
};

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

function findEmployee(id: string): Employee | undefined {
  return ALL_EMPLOYEES.find((e) => e.id === id);
}

function findAssignee(assigneeId: string): { name: string; role: string; email: string; group: string } | null {
  const o = ALL_OWNERS.find((x) => x.id === assigneeId);
  if (!o) return null;
  return { name: o.name, role: o.role, email: o.email, group: o.group };
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

/**
 * Build a synthetic payload view from the schema + employee.
 * In production this would come from the request row itself; here we
 * synthesise a plausible payload using prefillFrom hints so the
 * service owner sees the same shape of data they would in production.
 */
function buildPayloadView(schema: IntakeSchema, employee: Employee): Record<string, { label: string; labelAr: string; value: string; prefilled: boolean }> {
  const out: Record<string, { label: string; labelAr: string; value: string; prefilled: boolean }> = {};
  for (const field of schema.fields) {
    let value = "";
    let prefilled = false;
    if (field.prefillFrom === "employee.location") {
      value = employee.location;
      prefilled = true;
    } else if (field.prefillFrom === "employee.stage") {
      value = employee.stage;
      prefilled = true;
    } else if (field.prefillFrom === "employee.startDate") {
      value = employee.startDate.slice(0, 10);
      prefilled = true;
    } else if (field.prefillFrom === "employee.role") {
      value = employee.role;
      prefilled = true;
    } else if (field.prefillFrom === "step.key") {
      value = "—";
      prefilled = true;
    } else if (field.prefillFrom === "step.dueAt") {
      value = "—";
      prefilled = true;
    } else {
      // Synthesise plausible free-text values
      if (field.type === "checkbox") {
        value = field.required ? "Yes" : "—";
      } else if (field.type === "select" && field.options && field.options.length > 0) {
        value = field.options[0].label;
      } else if (field.type === "number") {
        value = "1";
      } else if (field.type === "textarea") {
        value = "—";
      } else if (field.type === "date") {
        value = "2024-10-15";
      } else {
        value = "—";
      }
    }
    out[field.key] = { label: field.label, labelAr: field.labelAr, value, prefilled };
  }
  return out;
}

function fieldTypeDef(t: IntakeField["type"]): string {
  switch (t) {
    case "select": return "select";
    case "date": return "date";
    case "checkbox": return "checkbox";
    case "textarea": return "textarea";
    case "number": return "number";
    default: return "text";
  }
}

/* ---------- Skeleton ---------- */

function CardSkeleton() {
  return <div className="ast-card p-6 h-32 ast-shimmer rounded-[14px]" aria-hidden="true" />;
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
          We can&apos;t reach your queue right now.
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
   Payload viewer (expandable)
   ============================================================ */
function PayloadView({ request, locale }: { request: ServiceRequest; locale: "en" | "ar" }) {
  const schema = INTAKE_SCHEMAS[request.type];
  const employee = findEmployee(request.employeeId);
  const payload = employee ? buildPayloadView(schema, employee) : {};
  const citation = parsePolicyRef(schema.policyRef);
  const assignee = findAssignee(request.assignee);

  return (
    <div className="mt-3 space-y-3">
      {/* Payload fields */}
      <div className="rounded-[10px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div
          className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] flex items-center gap-2"
          style={{ background: "var(--surface-2)", color: "var(--text-lo)", borderBottom: "1px solid var(--border)" }}
        >
          <FileText className="w-3 h-3" strokeWidth={1.75} />
          {locale === "ar" ? "حمولة الطلب الكاملة" : "Full intake payload"}
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
          {schema.fields.map((field) => {
            const v = payload[field.key];
            return (
              <div
                key={field.key}
                className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-1 sm:gap-3 px-3 py-2.5"
                style={{ borderColor: "var(--border-soft)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono tabular shrink-0" style={{ color: "var(--text-lo)" }} dir="ltr">
                    {field.key}
                  </span>
                  <span className="text-[12px] truncate" style={{ color: "var(--text-mid)" }}>
                    {locale === "ar" ? field.labelAr : field.label}
                  </span>
                  {v?.prefilled && (
                    <span
                      className="ast-chip text-[10px] shrink-0"
                      style={{
                        color: "var(--brand-400)",
                        background: "rgba(22,154,165,0.08)",
                        borderColor: "rgba(22,154,165,0.25)",
                        height: 18,
                        padding: "0 6px",
                      }}
                    >
                      {locale === "ar" ? "مُعبّأ مسبقاً" : "prefilled"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] font-medium truncate" style={{ color: "var(--text-hi)" }} dir="ltr">
                    {v?.value || "—"}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-[0.1em] shrink-0"
                    style={{ color: "var(--text-lo)" }}
                  >
                    {fieldTypeDef(field.type)}
                  </span>
                  {field.required && (
                    <span
                      className="ast-chip text-[10px] shrink-0"
                      style={{
                        color: "var(--accent-500)",
                        background: "rgba(201,162,39,0.08)",
                        borderColor: "rgba(201,162,39,0.32)",
                        height: 18,
                        padding: "0 6px",
                      }}
                    >
                      {locale === "ar" ? "ضروري" : "required"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Auto-attached context */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
          {locale === "ar" ? "سياق مُرفق تلقائياً" : "Auto-attached context"}:
        </span>
        {schema.autoAttachedContext.map((ctx) => (
          <span
            key={ctx}
            className="ast-chip text-[11px]"
            style={{
              color: "var(--text-mid)",
              background: "var(--surface-2)",
              borderColor: "var(--border)",
            }}
          >
            {ctx}
          </span>
        ))}
      </div>

      {/* Policy ref + assignee */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
          {locale === "ar" ? "المرجع" : "Policy ref"}:
        </span>
        <CitationChip citation={citation} locale={locale} />
        {assignee && (
          <>
            <span className="text-[11px] uppercase tracking-[0.12em] ml-2" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "المسؤول" : "Assignee"}:
            </span>
            <span
              className="ast-chip text-[11px] tabular"
              style={{ color: "var(--text-hi)", background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              {assignee.name} · {assignee.role}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Needs-more-info form (remounts each open via parent conditional)
   ============================================================ */
function NeedsMoreInfoForm({
  request,
  onSend,
  sending,
  locale,
  onCancel,
}: {
  request: ServiceRequest;
  onSend: (questionEn: string, additionalDetail: string) => void;
  sending: boolean;
  locale: "en" | "ar";
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState<string>("");
  const [detail, setDetail] = useState<string>("");
  const questions = STANDARD_QUESTIONS[request.type] ?? [];

  const handleSend = () => {
    if (!question) {
      toast.error(locale === "ar" ? "اختر سؤالاً من القائمة" : "Pick a question from the list");
      return;
    }
    onSend(question, detail);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2" style={{ color: "var(--text-hi)" }}>
          <HelpCircle className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          {locale === "ar" ? "نحتاج تفصيلاً إضافياً" : "We need one more detail"}
        </DialogTitle>
        <DialogDescription style={{ color: "var(--text-mid)" }}>
          {locale === "ar"
            ? `الطلب ${request.ref} — اختر سؤالاً قياسياً بدلاً من بريد حر.`
            : `Request ${request.ref} — pick a standard question, not a free-text email.`}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Standard question dropdown */}
        <div className="space-y-2">
          <Label htmlFor="std-q" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "سؤال قياسي" : "Standard question"}
          </Label>
          <Select value={question} onValueChange={setQuestion}>
            <SelectTrigger
              id="std-q"
              className="w-full h-11 text-[13px] ast-focus"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
            >
              <SelectValue placeholder={locale === "ar" ? "اختر سؤالاً…" : "Pick a question…"} />
            </SelectTrigger>
            <SelectContent style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-hi)" }}>
              {questions.map((q) => (
                <SelectItem key={q.en} value={q.en} className="text-[13px]">
                  {locale === "ar" ? q.ar : q.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
            {locale === "ar"
              ? "الأسئلة القياسية تحافظ على وضوح الطلب وتقلل رحلات الذهاب والإياب."
              : "Standard questions keep the request crisp and reduce round-trips."}
          </p>
        </div>

        {/* Free-text additional detail — the ONLY free-text part */}
        <div className="space-y-2">
          <Label htmlFor="detail" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "تفاصيل إضافية (الجزء الحر الوحيد)" : "Additional detail (only free-text part)"}
          </Label>
          <Textarea
            id="detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
            placeholder={locale === "ar" ? "اختياري — سياق إضافي بسيط" : "Optional — brief extra context"}
            className="ast-focus text-[13px]"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
          />
        </div>
      </div>

      <DialogFooter>
        <button
          onClick={onCancel}
          className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
        >
          {locale === "ar" ? "تراجع" : "Cancel"}
        </button>
        <button
          onClick={handleSend}
          disabled={sending}
          className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium disabled:opacity-60"
          style={{ background: "var(--brand-500)", color: "var(--surface-0)", border: "1px solid var(--brand-500)" }}
        >
          {sending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          {locale === "ar" ? "أرسل سؤالاً للموظف" : "Send structured question"}
        </button>
      </DialogFooter>
    </>
  );
}

/* ============================================================
   Needs-more-info dialog (structured, not free-text email)
   ============================================================ */
function NeedsMoreInfoDialog({
  open,
  onOpenChange,
  request,
  onSend,
  sending,
  locale,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: ServiceRequest | null;
  onSend: (questionEn: string, additionalDetail: string) => void;
  sending: boolean;
  locale: "en" | "ar";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[560px]"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
      >
        {open && request && (
          <NeedsMoreInfoForm
            request={request}
            onSend={onSend}
            sending={sending}
            locale={locale}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Resolve form (remounts each open via parent conditional)
   ============================================================ */
function ResolveForm({
  request,
  onResolve,
  resolving,
  locale,
  onCancel,
}: {
  request: ServiceRequest;
  onResolve: (note: string) => void;
  resolving: boolean;
  locale: "en" | "ar";
  onCancel: () => void;
}) {
  const [note, setNote] = useState<string>("");

  const handleResolve = () => {
    if (note.trim().length < 5) {
      toast.error(locale === "ar" ? "اكتب ملاحظة الحل (1-2 جمل)" : "Write a resolution note (1-2 sentences)");
      return;
    }
    onResolve(note);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2" style={{ color: "var(--text-hi)" }}>
          <CheckCircle2 className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--status-steady)" }} />
          {locale === "ar" ? "حل الطلب" : "Resolve request"}
        </DialogTitle>
        <DialogDescription style={{ color: "var(--text-mid)" }}>
          {locale === "ar"
            ? `الطلب ${request.ref} — اكتب ما الذي تغيّر (1-2 جمل).`
            : `Request ${request.ref} — write what changed (1-2 sentences).`}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="note" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
          {locale === "ar" ? "ملاحظة الحل" : "Resolution note"}
        </Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={locale === "ar" ? "مثال: صدر حاسوب Dell Latitude لماريا في مكتب IT بدبي." : "e.g. Issued Dell Latitude to Maria at the DXB IT counter."}
          className="ast-focus text-[13px]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
        />
        <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
          {locale === "ar"
            ? "يُرسل هذا كإشعار للموظف: \"تم حل طلبك — إليك ما تغيّر\"."
            : "Sent to the employee as: \"Your request is resolved — here's what changed\"."}
        </p>
      </div>

      <DialogFooter>
        <button
          onClick={onCancel}
          className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
        >
          {locale === "ar" ? "تراجع" : "Cancel"}
        </button>
        <button
          onClick={handleResolve}
          disabled={resolving}
          className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium disabled:opacity-60"
          style={{ background: "var(--status-steady)", color: "white", border: "1px solid var(--status-steady)" }}
        >
          {resolving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
          )}
          {locale === "ar" ? "حلّ" : "Resolve"}
        </button>
      </DialogFooter>
    </>
  );
}

/* ============================================================
   Resolve dialog (requires resolution note)
   ============================================================ */
function ResolveDialog({
  open,
  onOpenChange,
  request,
  onResolve,
  resolving,
  locale,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: ServiceRequest | null;
  onResolve: (note: string) => void;
  resolving: boolean;
  locale: "en" | "ar";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[520px]"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
      >
        {open && request && (
          <ResolveForm
            request={request}
            onResolve={onResolve}
            resolving={resolving}
            locale={locale}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   Request card
   ============================================================ */
function RequestCard({
  request,
  onAction,
  onProposeMapFix,
  locale,
}: {
  request: ServiceRequest;
  onAction: (id: string, to: string, opts?: { note?: string; question?: string; detail?: string }) => Promise<void>;
  onProposeMapFix: (request: ServiceRequest) => void;
  locale: "en" | "ar";
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [needsOpen, setNeedsOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  const schema = INTAKE_SCHEMAS[request.type];
  const employee = findEmployee(request.employeeId);
  const elapsedHours = differenceInHours(PACK_NOW, new Date(request.openedAt));
  const breach = computeBreach(elapsedHours, request.slaHours);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(request.ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard may be unavailable — fail silently
    }
  };

  const wrapAction = async (to: string, opts?: { note?: string; question?: string; detail?: string }) => {
    setPending(to);
    try {
      await onAction(request.id, to, opts);
    } finally {
      setPending(null);
    }
  };

  const canAcknowledge = request.status === "submitted";
  const canStart = request.status === "acknowledged";
  const canNeedsInfo = request.status === "in_progress" || request.status === "acknowledged";
  const canResolve = request.status === "in_progress" || request.status === "acknowledged" || request.status === "waiting_employee";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="ast-card p-4 sm:p-5"
    >
      {/* Top row */}
      <div className="flex items-start gap-3 flex-wrap">
        {/* Ref + type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              className="ast-focus inline-flex items-center gap-1.5 font-mono text-[12px] tabular px-2 py-0.5 rounded-md transition-colors"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--brand-400)",
              }}
              title={locale === "ar" ? "نسخ المرجع" : "Copy ref"}
              aria-label={`Copy ${request.ref}`}
            >
              {request.ref}
              {copied ? (
                <Check className="w-3 h-3" strokeWidth={2} style={{ color: "var(--status-steady)" }} />
              ) : (
                <Copy className="w-3 h-3" strokeWidth={1.75} />
              )}
            </button>
            <span className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? schema.labelAr : schema.label}
            </span>
          </div>
          {/* Employee + age + counts */}
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-mid)" }}>
              <Users className="w-3 h-3" strokeWidth={1.75} />
              <span style={{ color: "var(--text-hi)" }}>
                {employee ? (locale === "ar" && employee.displayNameAr ? employee.displayNameAr : employee.displayName) : request.employeeId}
              </span>
              <span className="font-mono tabular" style={{ color: "var(--text-lo)" }}>· {request.employeeId}</span>
            </span>
            <span className="text-[12px] inline-flex items-center gap-1.5" style={{ color: "var(--text-lo)" }}>
              <Clock className="w-3 h-3" strokeWidth={1.75} />
              <span className="tabular">
                {locale === "ar" ? `فُتح ${formatDistanceToNow(new Date(request.openedAt), { addSuffix: false, locale: undefined as never })}` : `opened ${formatDistanceToNow(new Date(request.openedAt), { addSuffix: false })} ago`}
              </span>
            </span>
            <span className="text-[11px] inline-flex items-center gap-1 tabular" style={{ color: request.reassignCount > 0 ? "var(--status-watch)" : "var(--text-lo)" }}>
              {locale === "ar" ? `إعادة ${request.reassignCount}` : `reassigns ${request.reassignCount}`}
            </span>
            <span className="text-[11px] inline-flex items-center gap-1 tabular" style={{ color: request.returnCount > 0 ? "var(--status-friction)" : "var(--text-lo)" }}>
              {locale === "ar" ? `إرجاع ${request.returnCount}` : `returns ${request.returnCount}`}
            </span>
          </div>
        </div>

        {/* Status + SLA */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={request.status} locale={locale} />
          <SlaChip elapsedHours={elapsedHours} targetHours={request.slaHours} breachLevel={breach} locale={locale} />
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center gap-2 flex-wrap mt-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
        >
          <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "عرض الحمولة" : "View payload"}
          <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} strokeWidth={1.75} />
        </button>

        {canAcknowledge && (
          <button
            onClick={() => wrapAction("acknowledged")}
            disabled={pending !== null}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium disabled:opacity-60"
            style={{ background: "var(--surface-2)", border: "1px solid rgba(22,154,165,0.32)", color: "var(--brand-400)" }}
          >
            {pending === "acknowledged" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {locale === "ar" ? "استلام" : "Acknowledge"}
          </button>
        )}

        {canStart && (
          <button
            onClick={() => wrapAction("in_progress")}
            disabled={pending !== null}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium disabled:opacity-60"
            style={{ background: "var(--brand-500)", border: "1px solid var(--brand-500)", color: "var(--surface-0)" }}
          >
            {pending === "in_progress" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {locale === "ar" ? "ابدأ العمل" : "Start work"}
          </button>
        )}

        {canNeedsInfo && (
          <button
            onClick={() => setNeedsOpen(true)}
            disabled={pending !== null}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium disabled:opacity-60"
            style={{ background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.32)", color: "var(--status-watch)" }}
          >
            <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
            {locale === "ar" ? "نحتاج تفصيلاً" : "Needs more info"}
          </button>
        )}

        {canResolve && (
          <button
            onClick={() => setResolveOpen(true)}
            disabled={pending !== null}
            className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium disabled:opacity-60"
            style={{ background: "rgba(14,159,110,0.08)", border: "1px solid rgba(14,159,110,0.32)", color: "var(--status-steady)" }}
          >
            {pending === "resolved" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {locale === "ar" ? "حلّ" : "Resolve"}
          </button>
        )}

        {/* PRD §11-217 — Propose a journey-map fix straight from the ticket */}
        <button
          onClick={() => onProposeMapFix(request)}
          disabled={pending !== null}
          className="ast-focus inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12px] font-medium disabled:opacity-60 ml-auto"
          style={{
            background: "rgba(201,162,39,0.06)",
            border: "1px solid rgba(201,162,39,0.30)",
            color: "var(--accent-500)",
          }}
          title={locale === "ar" ? "اقترح إصلاحاً على خريطة الرحلة" : "Propose a journey-map fix"}
        >
          <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
          {locale === "ar" ? "اقترح إصلاح الخريطة" : "Propose map fix"}
        </button>
      </div>

      {/* Expanded payload */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <PayloadView request={request} locale={locale} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialogs */}
      <NeedsMoreInfoDialog
        open={needsOpen}
        onOpenChange={setNeedsOpen}
        request={request}
        sending={pending === "returned"}
        onSend={(q, d) => wrapAction("returned", { question: q, detail: d }).then(() => setNeedsOpen(false))}
        locale={locale}
      />
      <ResolveDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        request={request}
        resolving={pending === "resolved"}
        onResolve={(note) => wrapAction("resolved", { note }).then(() => setResolveOpen(false))}
        locale={locale}
      />
    </motion.article>
  );
}

/* ============================================================
   SLA dashboard (PRD §11-215/216)
   Expanded into a full SLA analytics panel with:
     · headline stats (breach rate, median ack, median resolve)
     · breach reasons breakdown (bar chart)
     · capacity declarations (honest SLA estimates)
     · 7-day SLA trend mini-chart (sparkline)
     · owner performance table (sortable, top performer badge)
   ============================================================ */

/* ---------- Breach-reason synthesis ----------
   For the prototype we classify each open request into one of five
   reason buckets using its actual returnCount / reassignCount /
   status signals, then add a small baseline so the bars are always
   visible. In production these counts would come from event log
   analytics, not heuristics. */

type BreachReason = {
  key: string;
  label: string;
  labelAr: string;
  count: number;
};

function computeBreachReasons(items: ServiceRequest[]): BreachReason[] {
  let waitingEmployee = 0;
  let waitingDownstream = 0;
  let incompleteIntake = 0;
  let queueOverload = 0;
  let ambiguous = 0;

  // Per-assignee open count → "queue overload" signal.
  const perAssignee: Record<string, number> = {};
  for (const r of items) {
    if (r.status === "resolved" || r.status === "closed" || r.status === "cancelled") continue;
    perAssignee[r.assignee] = (perAssignee[r.assignee] ?? 0) + 1;
  }

  for (const r of items) {
    if (r.status === "resolved" || r.status === "closed" || r.status === "cancelled") continue;
    if (r.returnCount > 0) incompleteIntake += 1;
    else if (r.reassignCount > 0) waitingDownstream += 1;
    else if (r.status === "waiting_employee") waitingEmployee += 1;
    else if ((perAssignee[r.assignee] ?? 0) >= 3) queueOverload += 1;
    else ambiguous += 1;
  }

  // Baseline — prototype padding so the chart reads even on a 4-row queue.
  const BASE = 2;
  return [
    { key: "waiting_employee", label: "Waiting on employee", labelAr: "بانتظار الموظف", count: waitingEmployee + BASE },
    { key: "waiting_downstream", label: "Waiting on downstream team", labelAr: "بانتظار فريق لاحق", count: waitingDownstream + BASE },
    { key: "incomplete_intake", label: "Incomplete intake", labelAr: "إدخال ناقص", count: incompleteIntake + BASE },
    { key: "queue_overload", label: "Queue overload", labelAr: "ازدحام القائمة", count: queueOverload + BASE },
    { key: "ambiguous_request", label: "Ambiguous request", labelAr: "طلب غامض", count: ambiguous + BASE },
  ];
}

/* ---------- Owner performance synthesis ----------
   Deterministic synthetic per-owner metrics seeded by the owner ID
   so they stay stable across re-renders but vary across owners. */

type OwnerPerf = {
  id: string;
  name: string;
  nameAr: string;
  role: string;
  ticketsHandled: number;
  medianResolveHours: number;
  breachRate: number; // 0-100
  zeroClarificationRate: number; // 0-100
};

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function generateOwnerPerf(group: OwnerGroup): OwnerPerf[] {
  const groupOwners = ALL_OWNERS.filter((o) => o.group === group);
  if (groupOwners.length === 0) return [];
  return groupOwners.map((o) => {
    const h = hashStr(o.id);
    return {
      id: o.id,
      name: o.name,
      nameAr: o.nameAr ?? o.name,
      role: o.role,
      ticketsHandled: 8 + (h % 14), // 8-21
      medianResolveHours: 12 + (h % 24), // 12-35h
      breachRate: 4 + (h % 22), // 4-25%
      zeroClarificationRate: 58 + (h % 38), // 58-95%
    };
  });
}

/* ---------- Breach reasons bar chart ---------- */

function BreachReasonsChart({ items, locale }: { items: ServiceRequest[]; locale: "en" | "ar" }) {
  const reasons = useMemo(() => computeBreachReasons(items), [items]);
  const max = Math.max(...reasons.map((r) => r.count), 1);
  const total = reasons.reduce((s, r) => s + r.count, 0);

  return (
    <div className="ast-card-2 p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "لماذا تُخرق التذاكر" : "Why tickets breach"}
        </h3>
      </div>
      <ul className="space-y-2.5">
        {reasons.map((r, i) => {
          const pct = (r.count / max) * 100;
          const sharePct = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return (
            <li key={r.key} className="flex items-center gap-3">
              <div className="w-[140px] sm:w-[200px] shrink-0 text-[12px]" style={{ color: "var(--text-mid)" }}>
                {locale === "ar" ? r.labelAr : r.label}
              </div>
              <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)" }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.42, delay: i * 0.05, ease: [0.2, 0.8, 0.2, 1] }}
                  className="h-full rounded-full"
                  style={{ background: "var(--brand-500)", opacity: 0.85 }}
                />
              </div>
              <div className="w-[78px] text-right shrink-0 flex items-center justify-end gap-1.5">
                <span className="text-[12px] font-mono tabular" style={{ color: "var(--text-hi)" }} dir="ltr">{r.count}</span>
                <span className="text-[10px] tabular" style={{ color: "var(--text-lo)" }} dir="ltr">{sharePct}%</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] mt-3" style={{ color: "var(--text-lo)" }}>
        {locale === "ar"
          ? "أسباب الخرق المستخلصة من علامات الإرجاع وإعادة التعيين وحالة الطلب."
          : "Reasons synthesised from return / reassign signals + request status."}
      </p>
    </div>
  );
}

/* ---------- Weekly capacity calendar (PRD §11-215) ----------
   Replaces the simple "Weekly capacity: X" input with a 7-day
   calendar (Mon-Sun) showing committed vs available per day, leave
   indicators, weekend dimming, current-day highlight, a weekly
   summary, and a 4-week utilization trend sparkline.
   --------------------------------------------------------------- */

/* Deterministic PRNG — used for synthetic per-day committed counts
   and the 4-week utilization trend. The hashStr() helper already
   exists in this file (see generateOwnerPerf above). */
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

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAY_SHORT_AR = ["إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت", "أحد"];

function CapacityDeclaration({ items, locale }: { items: ServiceRequest[]; locale: "en" | "ar" }) {
  const ar = locale === "ar";
  const openItems = useMemo(
    () =>
      items.filter(
        (r) => r.status !== "resolved" && r.status !== "closed" && r.status !== "cancelled",
      ),
    [items],
  );

  // Compute the current week (Mon-Sun) from PACK_NOW.
  const weekStart = useMemo(
    () => startOfWeek(PACK_NOW, { weekStartsOn: 1 }),
    [],
  );
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Per-day capacity (editable, default 3) and per-day leave toggle.
  // Initialised once from a deterministic seed so the demo is stable.
  const [capacityByDay, setCapacityByDay] = useState<number[]>(() => {
    const rand = mulberry32(hashStr("cap-seed-v1"));
    return Array.from({ length: 7 }, () => 2 + Math.floor(rand() * 3)); // 2..4
  });
  const [leaveByDay, setLeaveByDay] = useState<boolean[]>(() => Array.from({ length: 7 }, () => false));
  const [saving, setSaving] = useState(false);

  // Per-day committed count — synthetic, deterministic. The total is
  // capped near the number of open items so the calendar feels live.
  const committedByDay = useMemo(() => {
    const rand = mulberry32(hashStr("committed-seed-v1"));
    const total = openItems.length;
    // Distribute `total` across 7 days with a weekday bias (Mon-Thu get
    // more, Fri-Sat get fewer because of UAE weekend).
    const weights = [1.0, 1.0, 1.0, 1.0, 0.3, 0.3, 0.6];
    const raw = weights.map((w) => w * (0.6 + rand() * 0.8));
    const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
    const counts = raw.map((r) => Math.round((r / rawSum) * total));
    // Fix rounding drift on the last day
    const drift = total - counts.reduce((a, b) => a + b, 0);
    counts[6] = Math.max(0, counts[6] + drift);
    return counts;
  }, [openItems.length]);

  // 4-week utilization trend (committed/capacity % per week).
  const utilizationTrend = useMemo(() => {
    const rand = mulberry32(hashStr("util-trend-v1"));
    return Array.from({ length: 4 }, (_, i) => {
      // Recent weeks trend toward current utilization
      const currentUtil = (() => {
        const cap = capacityByDay.reduce((a, b) => a + b, 0) || 1;
        const com = committedByDay.reduce((a, b) => a + b, 0);
        return Math.min(100, Math.round((com / cap) * 100));
      })();
      const noise = (rand() - 0.5) * 24 * (1 - i / 5);
      return Math.max(0, Math.min(100, Math.round(currentUtil + noise - (3 - i) * 4)));
    });
  }, [capacityByDay, committedByDay]);

  const totalCapacity = capacityByDay.reduce((a, b) => a + b, 0);
  const totalCommitted = committedByDay.reduce((a, b) => a + b, 0);
  const totalAvailable = Math.max(0, totalCapacity - totalCommitted);
  const currentUtilization = totalCapacity > 0 ? Math.round((totalCommitted / totalCapacity) * 100) : 0;

  const handleCapacityChange = (i: number, value: number) => {
    setCapacityByDay((prev) => {
      const next = [...prev];
      next[i] = Math.max(0, Math.min(20, value));
      return next;
    });
  };

  const handleLeaveToggle = (i: number) => {
    setLeaveByDay((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 280));
      toast.success(
        ar ? "حُفظت الطاقة الأسبوعية" : "Weekly capacity saved",
        {
          description: ar
            ? `الطاقة: ${totalCapacity} · ملتزم: ${totalCommitted} · متاح: ${totalAvailable}`
            : `Capacity ${totalCapacity} · committed ${totalCommitted} · available ${totalAvailable}`,
        },
      );
    } catch (e) {
      toast.error(ar ? "تعذّر الحفظ" : "Couldn't save", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  // Headline message color: sand-gold if >5, amber if 1-5, red if 0.
  const headlineColor =
    totalAvailable > 5
      ? "var(--accent-500)"
      : totalAvailable >= 1
      ? "var(--status-watch)"
      : "var(--status-friction)";

  // Utilization warning
  const overloaded = currentUtilization > 90;
  const hasCapacity = currentUtilization < 50;

  return (
    <div className="ast-card-2 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Users className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--accent-500)" }} />
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {ar ? "تقويم الطاقة الأسبوعي" : "Weekly capacity calendar"}
        </h3>
        <span className="text-[10px] uppercase tracking-[0.10em] ml-auto" style={{ color: "var(--text-lo)" }} dir="ltr">
          {format(weekStart, "d MMM")} → {format(addDays(weekStart, 6), "d MMM")}
        </span>
      </div>

      {/* 7-day calendar */}
      <div
        className="grid grid-cols-7 gap-1.5 mb-3"
        style={{ minWidth: 0 }}
      >
        {days.map((day, i) => {
          const isWeekend = i === 4 || i === 5; // Fri(4) / Sat(5) — UAE weekend
          const isToday = isSameDay(day, PACK_NOW);
          const dimmed = isWeekend;
          const committed = committedByDay[i] ?? 0;
          const capacity = capacityByDay[i] ?? 0;
          const onLeave = leaveByDay[i] ?? false;
          const effectiveCapacity = onLeave ? 0 : capacity;
          const available = Math.max(0, effectiveCapacity - committed);
          const availColor =
            available === 0
              ? "var(--status-friction)"
              : available === 1
              ? "var(--status-watch)"
              : "var(--brand-400)";

          return (
            <div
              key={i}
              className="rounded-[10px] p-2 flex flex-col gap-1.5"
              style={{
                background: dimmed ? "var(--surface-3)" : "var(--surface-2)",
                border: `1px solid ${isToday ? "var(--brand-500)" : dimmed ? "var(--border-soft)" : "var(--border)"}`,
                opacity: dimmed ? 0.62 : 1,
                boxShadow: isToday ? "0 0 0 1px var(--brand-500), 0 4px 12px rgba(22,154,165,0.12)" : undefined,
              }}
            >
              {/* Day name + date */}
              <div className="flex items-baseline justify-between gap-1">
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: isToday ? "var(--brand-400)" : "var(--text-mid)" }}
                >
                  {ar ? WEEKDAY_SHORT_AR[i] : WEEKDAY_SHORT[i]}
                </span>
                {isToday && (
                  <span
                    className="text-[8px] uppercase tracking-[0.08em] px-1 py-0.5 rounded"
                    style={{
                      background: "rgba(22,154,165,0.14)",
                      color: "var(--brand-400)",
                    }}
                  >
                    {ar ? "اليوم" : "today"}
                  </span>
                )}
              </div>
              <span className="text-[9px] tabular" style={{ color: "var(--text-lo)" }} dir="ltr">
                {format(day, "d MMM")}
              </span>

              {/* Leave badge */}
              {onLeave && (
                <span
                  className="inline-flex items-center gap-0.5 self-start text-[8px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "rgba(217,119,6,0.12)",
                    color: "var(--status-watch)",
                    border: "1px solid rgba(217,119,6,0.30)",
                  }}
                >
                  <Moon className="w-2 h-2" strokeWidth={2} />
                  {ar ? "إجازة" : "Leave"}
                </span>
              )}

              {/* Committed */}
              <div>
                <span className="text-[8px] uppercase tracking-[0.06em]" style={{ color: "var(--text-lo)" }}>
                  {ar ? "ملتزم" : "Committed"}
                </span>
                <p className="text-[14px] font-semibold tabular leading-none" style={{ color: "var(--text-hi)" }} dir="ltr">
                  {committed}
                </p>
              </div>

              {/* Capacity (editable) */}
              <div>
                <span className="text-[8px] uppercase tracking-[0.06em]" style={{ color: "var(--text-lo)" }}>
                  {ar ? "الطاقة" : "Capacity"}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={capacity}
                  onChange={(e) => handleCapacityChange(i, Number(e.target.value) || 0)}
                  disabled={onLeave}
                  className="ast-focus h-7 w-full text-[13px] font-semibold tabular px-1.5 mt-0.5"
                  style={{
                    background: "var(--surface-3)",
                    borderColor: "var(--border)",
                    color: onLeave ? "var(--text-lo)" : "var(--text-hi)",
                    opacity: onLeave ? 0.5 : 1,
                  }}
                  dir="ltr"
                  aria-label={ar ? `طاقة ${WEEKDAY_SHORT_AR[i]}` : `Capacity ${WEEKDAY_SHORT[i]}`}
                />
              </div>

              {/* Available */}
              <div>
                <span className="text-[8px] uppercase tracking-[0.06em]" style={{ color: "var(--text-lo)" }}>
                  {ar ? "متاح" : "Available"}
                </span>
                <p className="text-[14px] font-semibold tabular leading-none" style={{ color: availColor }} dir="ltr">
                  {available}
                </p>
              </div>

              {/* Leave toggle */}
              <button
                onClick={() => handleLeaveToggle(i)}
                className="ast-focus inline-flex items-center justify-center h-6 px-1.5 rounded-full text-[8px] font-medium transition-colors mt-auto"
                style={{
                  background: onLeave
                    ? "rgba(217,119,6,0.12)"
                    : "var(--surface-3)",
                  color: onLeave ? "var(--status-watch)" : "var(--text-lo)",
                  border: `1px solid ${onLeave ? "rgba(217,119,6,0.30)" : "var(--border)"}`,
                }}
              >
                <Moon className="w-2.5 h-2.5" strokeWidth={1.75} />
                {onLeave ? (ar ? "إجازة" : "On leave") : (ar ? "إجازة؟" : "Leave?")}
              </button>
            </div>
          );
        })}
      </div>

      {/* Weekly summary */}
      <div
        className="rounded-[10px] p-3 mb-3"
        style={{ background: "var(--surface-3)" }}
      >
        <div className="grid grid-cols-3 gap-3 mb-2">
          <div>
            <p className="text-[9px] uppercase tracking-[0.10em]" style={{ color: "var(--text-lo)" }}>
              {ar ? "إجمالي الطاقة" : "Total capacity"}
            </p>
            <p className="text-[20px] font-semibold tabular leading-none mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">
              {totalCapacity}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.10em]" style={{ color: "var(--text-lo)" }}>
              {ar ? "إجمالي ملتزم" : "Total committed"}
            </p>
            <p className="text-[20px] font-semibold tabular leading-none mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">
              {totalCommitted}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.10em]" style={{ color: "var(--text-lo)" }}>
              {ar ? "إجمالي متاح" : "Total available"}
            </p>
            <p className="text-[20px] font-semibold tabular leading-none mt-1" style={{ color: headlineColor }} dir="ltr">
              {totalAvailable}
            </p>
          </div>
        </div>
        {/* Headline message */}
        <div
          className="rounded-[8px] p-2.5 flex items-center gap-2 text-[12px]"
          style={{
            background:
              totalAvailable > 5
                ? "rgba(201,162,39,0.08)"
                : totalAvailable >= 1
                ? "rgba(217,119,6,0.08)"
                : "rgba(220,38,38,0.08)",
            border: `1px solid ${
              totalAvailable > 5
                ? "rgba(201,162,39,0.30)"
                : totalAvailable >= 1
                ? "rgba(217,119,6,0.30)"
                : "rgba(220,38,38,0.30)"
            }`,
            color: headlineColor,
          }}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          <span>
            {totalAvailable === 0
              ? ar
                ? "الأسبوع ممتلئ — لا يمكنك استقبال المزيد"
                : "This week you're full — no more tickets"
              : ar
              ? `هذا الأسبوع يمكنك معالجة ${totalAvailable} تذاكر إضافية`
              : `This week you can handle ${totalAvailable} more ticket${totalAvailable === 1 ? "" : "s"}`}
          </span>
        </div>
      </div>

      {/* 4-week utilization trend + warning */}
      <div
        className="rounded-[10px] p-3"
        style={{ background: "var(--surface-3)" }}
      >
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            <span className="text-[10px] uppercase tracking-[0.10em] font-medium" style={{ color: "var(--text-lo)" }}>
              {ar ? "اتجاه الاستخدام (4 أسابيع)" : "Utilization trend (4 weeks)"}
            </span>
          </div>
          <span
            className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium"
            style={{
              background: overloaded
                ? "rgba(217,119,6,0.12)"
                : hasCapacity
                ? "rgba(22,154,165,0.12)"
                : "var(--surface-2)",
              color: overloaded
                ? "var(--status-watch)"
                : hasCapacity
                ? "var(--brand-400)"
                : "var(--text-mid)",
              border: `1px solid ${
                overloaded
                  ? "rgba(217,119,6,0.32)"
                  : hasCapacity
                  ? "rgba(22,154,165,0.32)"
                  : "var(--border)"
              }`,
            }}
          >
            {overloaded ? (
              <>
                <AlertTriangle className="w-2.5 h-2.5" strokeWidth={2} />
                {ar ? "أنت محمّل" : "You're overloaded"}
              </>
            ) : hasCapacity ? (
              <>
                <TrendingUp className="w-2.5 h-2.5" strokeWidth={2} />
                {ar ? "لديك طاقة" : "You have capacity"}
              </>
            ) : (
              <>
                <Activity className="w-2.5 h-2.5" strokeWidth={2} />
                {ar ? "مستقر" : "Steady"}
              </>
            )}
          </span>
        </div>
        {/* Mini bar chart for 4-week trend */}
        <div className="flex items-end gap-2 h-12">
          {utilizationTrend.map((v, i) => {
            const height = Math.max(6, v);
            const isThis = i === utilizationTrend.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <span className="text-[8px] tabular" style={{ color: isThis ? "var(--brand-400)" : "var(--text-lo)" }} dir="ltr">
                  {v}%
                </span>
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${height}%`,
                    minHeight: 4,
                    background: v > 90
                      ? "linear-gradient(180deg, var(--status-watch) 0%, var(--status-friction) 100%)"
                      : isThis
                      ? "linear-gradient(180deg, var(--brand-400) 0%, var(--brand-500) 100%)"
                      : "linear-gradient(180deg, var(--surface-3) 0%, var(--surface-2) 100%)",
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-1">
          {["-3w", "-2w", "-1w", "now"].map((lbl, i) => (
            <span
              key={lbl}
              className="text-[8px] tabular flex-1 text-center"
              style={{ color: i === 3 ? "var(--brand-400)" : "var(--text-lo)" }}
              dir="ltr"
            >
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="ast-focus inline-flex items-center gap-2 h-10 px-4 rounded-full text-[12px] font-medium disabled:opacity-60 w-full sm:w-auto justify-center mt-3"
        style={{ background: "var(--accent-500)", color: "var(--surface-0)", border: "1px solid var(--accent-500)" }}
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
        ) : (
          <Save className="w-3.5 h-3.5" strokeWidth={1.75} />
        )}
        {ar ? "حفظ الطاقة الأسبوعية" : "Save weekly capacity"}
      </button>
    </div>
  );
}

/* ---------- SLA trend mini-chart (7-day sparkline) ---------- */

const TREND_DATA: number[] = [12, 8, 15, 10, 6, 4, 8];
const TREND_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function SlaTrendChart({ locale }: { locale: "en" | "ar" }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Trend label: compare last 3 days vs prior 3
  const last3 = TREND_DATA.slice(-3);
  const prev3 = TREND_DATA.slice(-6, -3);
  const lastAvg = last3.reduce((s, v) => s + v, 0) / last3.length;
  const prevAvg = prev3.reduce((s, v) => s + v, 0) / prev3.length;
  const improving = lastAvg <= prevAvg;

  // Geometry
  const W = 280;
  const H = 64;
  const pad = 6;
  const max = Math.max(...TREND_DATA, 1);
  const min = 0;
  const stepX = (W - pad * 2) / (TREND_DATA.length - 1);
  const y = (v: number) => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  const x = (i: number) => pad + i * stepX;
  const linePath = TREND_DATA.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(TREND_DATA.length - 1).toFixed(1)} ${H - pad} L ${x(0).toFixed(1)} ${H - pad} Z`;

  return (
    <div className="ast-card-2 p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "اتجاه نسبة الخرق (7 أيام)" : "Breach-rate trend (7 days)"}
          </h3>
        </div>
        <span
          className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium"
          style={{
            background: improving ? "rgba(14,159,110,0.10)" : "rgba(220,38,38,0.10)",
            color: improving ? "var(--status-steady)" : "var(--status-friction)",
            border: `1px solid ${improving ? "rgba(14,159,110,0.30)" : "rgba(220,38,38,0.30)"}`,
          }}
        >
          {improving ? (
            <TrendingDown className="w-3 h-3" strokeWidth={2} />
          ) : (
            <TrendingUp className="w-3 h-3" strokeWidth={2} />
          )}
          {locale === "ar"
            ? improving ? "الاتجاه: يتحسن" : "الاتجاه: يسوء"
            : improving ? "Trend: improving" : "Trend: worsening"}
        </span>
      </div>

      <TooltipProvider delayDuration={0}>
        <div className="relative w-full">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[64px]" role="img" aria-label="7-day breach rate trend">
            <defs>
              <linearGradient id="sla-trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--brand-500)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#sla-trend-fill)" />
            <motion.path
              d={linePath}
              fill="none"
              stroke="var(--brand-500)"
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            />
            {TREND_DATA.map((v, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <circle
                    cx={x(i)}
                    cy={y(v)}
                    r={hoverIdx === i ? 4 : 3}
                    fill="var(--accent-500)"
                    stroke="var(--surface-1)"
                    strokeWidth={1.5}
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
                  {TREND_DAYS[i]} · {v}%
                </TooltipContent>
              </Tooltip>
            ))}
          </svg>
        </div>
      </TooltipProvider>

      <div className="flex items-center justify-between mt-2 px-1">
        {TREND_DAYS.map((d, i) => (
          <span
            key={d}
            className="text-[10px] tabular"
            style={{ color: hoverIdx === i ? "var(--brand-400)" : "var(--text-lo)" }}
            dir="ltr"
          >
            {d}
          </span>
        ))}
      </div>
      <p className="text-[11px] mt-2" style={{ color: "var(--text-lo)" }}>
        {locale === "ar"
          ? "السطر يرسم نسبة الخرق اليومية؛ النقاط الذهبية أيام الأسابيع."
          : "Line plots daily breach rate; gold dots mark weekdays."}
      </p>
    </div>
  );
}

/* ---------- Owner performance table ---------- */

type SortKey = "ticketsHandled" | "medianResolveHours" | "breachRate" | "zeroClarificationRate";
type SortDir = "asc" | "desc";

function OwnerPerfTable({ group, locale }: { group: OwnerGroup; locale: "en" | "ar" }) {
  const rows = useMemo(() => generateOwnerPerf(group), [group]);
  const [sortKey, setSortKey] = useState<SortKey>("zeroClarificationRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const diff = sortDir === "asc" ? av - bv : bv - av;
      return diff;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  // Top performer = highest zero-clarification rate (composite: high ZCR + low breach)
  const topPerformerId = useMemo(() => {
    if (rows.length === 0) return null;
    const sortedTop = [...rows].sort((a, b) => {
      const ascore = a.zeroClarificationRate - a.breachRate * 1.5;
      const bscore = b.zeroClarificationRate - b.breachRate * 1.5;
      return bscore - ascore;
    });
    return sortedTop[0].id;
  }, [rows]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const columns: { key: SortKey; label: string; labelAr: string; align: "left" | "right" }[] = [
    { key: "ticketsHandled", label: "Tickets handled", labelAr: "تذاكر معالجة", align: "right" },
    { key: "medianResolveHours", label: "Median resolve", labelAr: "وسيط الحل", align: "right" },
    { key: "breachRate", label: "Breach rate", labelAr: "نسبة الخرق", align: "right" },
    { key: "zeroClarificationRate", label: "Zero-clarif.", labelAr: "صفر-توضيح", align: "right" },
  ];

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 inline-block ml-1 opacity-50" strokeWidth={1.75} />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 inline-block ml-1" strokeWidth={2} style={{ color: "var(--brand-400)" }} />
      : <ChevronDown className="w-3 h-3 inline-block ml-1" strokeWidth={2} style={{ color: "var(--brand-400)" }} />;
  };

  if (rows.length === 0) {
    return (
      <div className="ast-card-2 p-4">
        <p className="text-[12px]" style={{ color: "var(--text-lo)" }}>
          {locale === "ar" ? "لا يوجد مالكو خدمات في هذه المجموعة بعد." : "No service owners in this group yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="ast-card-2 overflow-hidden">
      <div className="flex items-center gap-2 p-3" style={{ borderBottom: "1px solid var(--border-soft)" }}>
        <Award className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-hi)" }}>
          {locale === "ar" ? "أداء المالكين" : "Owner performance"}
        </h3>
        <span className="text-[11px] ml-auto" style={{ color: "var(--text-lo)" }}>
          {locale === "ar" ? `${rows.length} مالكين` : `${rows.length} owners`}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow style={{ borderColor: "var(--border)" }}>
            <TableHead className="text-[11px] uppercase tracking-[0.10em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "المالك" : "Owner"}
            </TableHead>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={cn(
                  "text-[11px] uppercase tracking-[0.10em] cursor-pointer ast-focus select-none",
                  c.align === "right" ? "text-right" : "text-left",
                )}
                style={{ color: "var(--text-lo)" }}
                onClick={() => toggleSort(c.key)}
              >
                {locale === "ar" ? c.labelAr : c.label}
                <SortIcon k={c.key} />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((r) => {
            const isTop = r.id === topPerformerId;
            return (
              <TableRow key={r.id} style={{ borderColor: "var(--border-soft)" }}>
                <TableCell className="text-[13px]" style={{ color: "var(--text-hi)" }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{locale === "ar" ? r.nameAr : r.name}</span>
                    {isTop && (
                      <span
                        className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-medium"
                        style={{
                          background: "rgba(22,154,165,0.10)",
                          color: "var(--brand-400)",
                          border: "1px solid rgba(22,154,165,0.32)",
                        }}
                      >
                        <Award className="w-2.5 h-2.5" strokeWidth={2} />
                        {locale === "ar" ? "الأفضل" : "Top performer"}
                      </span>
                    )}
                    <span className="text-[11px] block w-full" style={{ color: "var(--text-lo)" }}>{r.role}</span>
                  </div>
                </TableCell>
                <TableCell className="text-[13px] tabular text-right" style={{ color: "var(--text-hi)" }} dir="ltr">
                  {r.ticketsHandled}
                </TableCell>
                <TableCell className="text-[13px] tabular text-right" style={{ color: "var(--text-hi)" }} dir="ltr">
                  {r.medianResolveHours.toFixed(0)}h
                </TableCell>
                <TableCell
                  className="text-[13px] tabular text-right"
                  style={{ color: r.breachRate >= 15 ? "var(--status-friction)" : r.breachRate >= 8 ? "var(--status-watch)" : "var(--status-steady)" }}
                  dir="ltr"
                >
                  {r.breachRate.toFixed(0)}%
                </TableCell>
                <TableCell
                  className="text-[13px] tabular text-right"
                  style={{ color: r.zeroClarificationRate >= 80 ? "var(--status-steady)" : r.zeroClarificationRate >= 60 ? "var(--accent-500)" : "var(--status-watch)" }}
                  dir="ltr"
                >
                  {r.zeroClarificationRate.toFixed(0)}%
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------- The expanded SLA panel ---------- */

function SlaDashboard({
  items,
  group,
  locale,
}: {
  items: ServiceRequest[];
  group: OwnerGroup;
  locale: "en" | "ar";
}) {
  const breachCount = items.filter((r) => {
    const elapsed = differenceInHours(PACK_NOW, new Date(r.openedAt));
    return elapsed >= r.slaHours;
  }).length;
  const breachRate = items.length > 0 ? (breachCount / items.length) * 100 : 0;

  // Synthetic median time-to-acknowledge and time-to-resolve
  // (in production these would come from event timestamps)
  const medianAck = items.length > 0 ? 1.2 : 0; // hours
  const medianResolve = items.length > 0 ? 18.5 : 0; // hours

  const stats = [
    {
      label: locale === "ar" ? "نسبة الخرق" : "Breach rate",
      value: `${breachRate.toFixed(0)}%`,
      sub: `${breachCount}/${items.length}`,
      color: breachRate > 0 ? "var(--status-friction)" : "var(--status-steady)",
    },
    {
      label: locale === "ar" ? "وسيط وقت الاستلام" : "Median time-to-acknowledge",
      value: `${medianAck.toFixed(1)}h`,
      sub: locale === "ar" ? "من الفتح للاستلام" : "opened → acknowledged",
      color: "var(--brand-400)",
    },
    {
      label: locale === "ar" ? "وسيط وقت الحل" : "Median time-to-resolve",
      value: `${medianResolve.toFixed(1)}h`,
      sub: locale === "ar" ? "من الفتح للحل" : "opened → resolved",
      color: "var(--accent-500)",
    },
  ];

  return (
    <section className="space-y-3 ast-fade-rise">
      {/* Header + headline stats */}
      <div className="ast-card p-5 sm:p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Activity className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "لوحة SLA" : "SLA dashboard"}
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
              {locale === "ar" ? "مقاييس الزمن الحقيقي لمجموعة المالكين هذه" : "Live metrics for this owner group"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="ast-card-2 p-4">
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                {s.label}
              </p>
              <p className="text-[26px] font-semibold tabular mt-1.5" style={{ color: s.color }} dir="ltr">
                {s.value}
              </p>
              <p className="text-[11px] tabular mt-1" style={{ color: "var(--text-lo)" }}>
                {s.sub}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Breach reasons + trend (two-column on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BreachReasonsChart items={items} locale={locale} />
        <SlaTrendChart locale={locale} />
      </div>

      {/* Capacity declarations */}
      <CapacityDeclaration items={items} locale={locale} />

      {/* Owner performance table */}
      <OwnerPerfTable group={group} locale={locale} />
    </section>
  );
}

/* ============================================================
   Empty state
   ============================================================ */
function EmptyState({ group, locale }: { group: OwnerGroup; locale: "en" | "ar" }) {
  // Find the most common request types for this group
  const groupSchemas = Object.values(INTAKE_SCHEMAS).filter((s) => s.ownerGroup === group);

  return (
    <section className="ast-card p-8 sm:p-10 text-center ast-fade-rise">
      <div
        className="inline-flex items-center justify-center w-14 h-14 rounded-full mx-auto mb-4"
        style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
      >
        <InboxIcon className="w-6 h-6" strokeWidth={1.75} />
      </div>
      <h3 className="text-[18px] font-semibold" style={{ color: "var(--text-hi)" }}>
        {locale === "ar" ? "لا تذاكر في قائمتك" : "No tickets in your queue"}
      </h3>
      <p className="text-[13px] mt-2 max-w-[440px] mx-auto" style={{ color: "var(--text-mid)" }}>
        {locale === "ar"
          ? "إليك ما يحتاجه الناس عادةً من هذه المجموعة."
          : "Here's what people usually need from this group."}
      </p>

      {groupSchemas.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          {groupSchemas.map((s) => (
            <span
              key={s.type}
              className="ast-chip text-[12px]"
              style={{ color: "var(--text-mid)", background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              {locale === "ar" ? s.labelAr : s.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   Section: Notification preferences (PRD §07-127)
   Per-owner channel matrix + quiet hours + per-owner mute.
   Distinct from the admin global kill-switch — this is the
   owner's own preferences, stored locally for the prototype.
   ============================================================ */

type NotifChannel = "in_app" | "email" | "push";
type NotifPrefs = Record<string, Record<NotifChannel, boolean>>;

const NOTIF_CATEGORIES: { id: string; label: string; labelAr: string; Icon: typeof BellRing }[] = [
  { id: "new_ticket", label: "New ticket assigned", labelAr: "تذكرة جديدة مسندة إليك", Icon: Inbox },
  { id: "returned", label: "Ticket returned to you", labelAr: "تذكرة أُعيدت إليك", Icon: RotateCcw },
  { id: "sla_breach", label: "SLA breach", labelAr: "اختراق SLA", Icon: AlertTriangle },
  { id: "daily_digest", label: "Daily digest", labelAr: "ملخص يومي", Icon: Calendar },
  { id: "weekly_digest", label: "Weekly digest", labelAr: "ملخص أسبوعي", Icon: FileText },
  { id: "escalation", label: "Escalation about your queue", labelAr: "تصعيد بشأن قائمتك", Icon: TrendingUp },
];

const NOTIF_CHANNELS: { id: NotifChannel; label: string; labelAr: string; Icon: typeof BellRing }[] = [
  { id: "in_app", label: "In-app", labelAr: "داخل التطبيق", Icon: AppWindow },
  { id: "email", label: "Email", labelAr: "البريد", Icon: Mail },
  { id: "push", label: "Push", labelAr: "إشعار فوري", Icon: Smartphone },
];

const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  new_ticket:     { in_app: true,  email: true,  push: false },
  returned:       { in_app: true,  email: false, push: false },
  sla_breach:     { in_app: true,  email: true,  push: true  },
  daily_digest:   { in_app: true,  email: false, push: false },
  weekly_digest:  { in_app: false, email: true,  push: false },
  escalation:     { in_app: true,  email: true,  push: true  },
};

function NotificationPreferencesPanel({ locale }: { locale: "en" | "ar" }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(() =>
    JSON.parse(JSON.stringify(DEFAULT_NOTIF_PREFS)) as NotifPrefs
  );
  const [quietEnabled, setQuietEnabled] = useState(true);
  const [quietFrom, setQuietFrom] = useState("22:00");
  const [quietTo, setQuietTo] = useState("07:00");
  const [muted, setMuted] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleChannel = (catId: string, channel: NotifChannel) => {
    if (muted) return; // muted → no toggles
    setPrefs((prev) => ({
      ...prev,
      [catId]: { ...prev[catId], [channel]: !prev[catId][channel] },
    }));
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success(
        locale === "ar" ? "حُفظت تفضيلات الإشعارات" : "Notification preferences saved",
        {
          description: locale === "ar"
            ? "سنحترم تفضيلاتك — فقط عند الحاجة إليك."
            : "We'll respect your channels — only when something needs you.",
        }
      );
    }, 480);
  };

  const handleMuteAll = () => {
    const next = !muted;
    setMuted(next);
    if (next) {
      toast.warning(
        locale === "ar"
          ? "كُتمت كل الإشعارات"
          : "All notifications muted",
        {
          description: locale === "ar"
            ? "لن ترى شيئاً حتى تُلغي الكتم."
            : "You'll see nothing until you unmute.",
          duration: 5000,
        }
      );
    } else {
      toast.success(
        locale === "ar" ? "أُلغي كتم الإشعارات" : "Notifications unmuted",
        {
          description: locale === "ar"
            ? "عادت قنواتك المفضّلة."
            : "Your preferred channels are back.",
        }
      );
    }
  };

  return (
    <section
      className="ast-card p-5 sm:p-6 ast-fade-rise"
      style={muted ? { borderColor: "rgba(220,38,38,0.30)" } : undefined}
      aria-labelledby="notif-prefs-title"
    >
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{
              background: muted ? "rgba(220,38,38,0.10)" : "rgba(22,154,165,0.10)",
              color: muted ? "var(--status-friction)" : "var(--brand-400)",
            }}
          >
            <BellRing className="w-4.5 h-4.5" strokeWidth={1.75} />
          </div>
          <div>
            <h2 id="notif-prefs-title" className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "كيف تريد أن نُنبّهك" : "How you want to be notified"}
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? "اختر قناتك لكل فئة. لن نُرسل لك شيئاً إلا عند الحاجة إليك."
                : "Choose your channel per category. We'll never spam — only when something needs you."}
            </p>
          </div>
        </div>
        <button
          onClick={handleMuteAll}
          aria-pressed={muted}
          className="ast-focus inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[12px] font-medium transition-colors shrink-0"
          style={{
            background: muted ? "rgba(220,38,38,0.10)" : "var(--surface-2)",
            border: `1px solid ${muted ? "rgba(220,38,38,0.40)" : "var(--border)"}`,
            color: muted ? "var(--status-friction)" : "var(--text-hi)",
          }}
        >
          <BellOff className="w-3.5 h-3.5" strokeWidth={1.75} />
          {muted
            ? (locale === "ar" ? "ارفع الكتم" : "Unmute all")
            : (locale === "ar" ? "اكتم الكل" : "Mute all")}
        </button>
      </div>

      {/* Muted banner */}
      <AnimatePresence>
        {muted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="ast-card-2 p-3 mt-3 flex items-start gap-2"
            style={{ borderColor: "rgba(220,38,38,0.30)", background: "rgba(220,38,38,0.04)" }}
            role="status"
          >
            <Volume2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} style={{ color: "var(--status-friction)" }} />
            <p className="text-[12px]" style={{ color: "var(--text-hi)" }}>
              {locale === "ar"
                ? "كتمت كل القنوات. لن تصلك إشعارات دفع أو بريد أو إشعار داخل التطبيق حتى ترفع الكتم."
                : "All channels muted. No in-app, email, or push notifications will arrive until you unmute."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Matrix table */}
      <div className="mt-4 -mx-2 overflow-x-auto">
        <table className="w-full text-[12px]" role="grid" aria-label={locale === "ar" ? "مصفوفة الإشعارات" : "Notification matrix"}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th
                className="text-left p-2 text-[10px] uppercase tracking-[0.1em] font-medium"
                style={{ color: "var(--text-lo)" }}
              >
                {locale === "ar" ? "الفئة" : "Category"}
              </th>
              {NOTIF_CHANNELS.map((c) => {
                const Icon = c.Icon;
                return (
                  <th
                    key={c.id}
                    className="text-center p-2 text-[10px] uppercase tracking-[0.1em] font-medium min-w-[88px]"
                    style={{ color: "var(--text-lo)" }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>{locale === "ar" ? c.labelAr : c.label}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {NOTIF_CATEGORIES.map((cat) => {
              const Icon = cat.Icon;
              const rowPrefs = prefs[cat.id];
              return (
                <tr
                  key={cat.id}
                  style={{ borderBottom: "1px solid var(--border-soft)" }}
                  className={muted ? "opacity-50" : ""}
                >
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
                      <span className="text-[13px]" style={{ color: "var(--text-hi)" }}>
                        {locale === "ar" ? cat.labelAr : cat.label}
                      </span>
                    </div>
                  </td>
                  {NOTIF_CHANNELS.map((c) => (
                    <td key={c.id} className="p-2 text-center">
                      <label className="inline-flex items-center justify-center w-11 h-11 cursor-pointer ast-focus rounded">
                        <span className="sr-only">
                          {locale === "ar" ? cat.labelAr : cat.label} · {locale === "ar" ? c.labelAr : c.label}
                        </span>
                        <Checkbox
                          checked={muted ? false : rowPrefs[c.id]}
                          onCheckedChange={() => toggleChannel(cat.id, c.id)}
                          disabled={muted}
                          className="data-[state=checked]:bg-[var(--brand-500)] data-[state=checked]:border-[var(--brand-500)] data-[state=checked]:text-[var(--surface-0)]"
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Quiet hours */}
      <div
        className="mt-5 ast-card-2 p-4"
        style={{ borderColor: "rgba(22,154,165,0.22)", background: "rgba(22,154,165,0.03)" }}
      >
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
              style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
            >
              <Moon className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "ساعات الهدوء" : "Quiet hours"}
              </h3>
              <p className="text-[11px]" style={{ color: "var(--text-mid)" }}>
                {locale === "ar"
                  ? "لن نُرسل دفعاً أو بريداً في هذه الفترة. تبقى الرسائل داخل التطبيق تنتظرك."
                  : "We won't send push or email during quiet hours. In-app messages still arrive — you'll see them when you open the app."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="quiet-switch" className="text-[12px]" style={{ color: "var(--text-mid)" }}>
              {locale === "ar" ? "مُفعّل" : "Enabled"}
            </Label>
            <Switch
              id="quiet-switch"
              checked={quietEnabled}
              onCheckedChange={setQuietEnabled}
              aria-label={locale === "ar" ? "تفعيل ساعات الهدوء" : "Enable quiet hours"}
            />
          </div>
        </div>

        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${quietEnabled ? "" : "opacity-50 pointer-events-none"}`}>
          <div>
            <Label htmlFor="quiet-from" className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "من" : "From"}
            </Label>
            <Input
              id="quiet-from"
              type="time"
              value={quietFrom}
              onChange={(e) => setQuietFrom(e.target.value)}
              className="mt-1 h-10 font-mono tabular"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-hi)",
              }}
              dir="ltr"
            />
          </div>
          <div>
            <Label htmlFor="quiet-to" className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "إلى" : "To"}
            </Label>
            <Input
              id="quiet-to"
              type="time"
              value={quietTo}
              onChange={(e) => setQuietTo(e.target.value)}
              className="mt-1 h-10 font-mono tabular"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-hi)",
              }}
              dir="ltr"
            />
          </div>
          <div>
            <Label htmlFor="quiet-tz" className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "المنطقة الزمنية" : "Timezone"}
            </Label>
            <Input
              id="quiet-tz"
              type="text"
              value="Asia/Dubai"
              readOnly
              aria-readonly
              className="mt-1 h-10 font-mono tabular"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-lo)",
                cursor: "default",
              }}
              dir="ltr"
            />
          </div>
        </div>

        {/* Plain-language explainer */}
        <p className="text-[11px] mt-3 leading-relaxed" style={{ color: "var(--text-lo)" }}>
          {locale === "ar"
            ? `من ${quietFrom} إلى ${quietTo} بتوقين آسيا/دبي — لن تصلك إشعارات الدفع أو البريد. تبقى الرسائل داخل التطبيق تنتظرك عند فتحه.`
            : `From ${quietFrom} to ${quietTo} (Asia/Dubai) — no push or email will arrive. In-app messages still land; you'll see them when you open the app.`}
        </p>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 mt-5">
        <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
          {locale === "ar"
            ? "هذه تفضيلاتك أنت — منفصلة عن مفتاح الإسكات العام للإدارة."
            : "These are your own preferences — separate from the admin global kill switch."}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium disabled:opacity-60"
          style={{
            background: "var(--brand-500)",
            color: "var(--surface-0)",
            border: "1px solid var(--brand-500)",
          }}
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
          ) : (
            <Save className="w-4 h-4" strokeWidth={1.75} />
          )}
          {locale === "ar" ? "احفظ التفضيلات" : "Save preferences"}
        </button>
      </div>
    </section>
  );
}

/* ============================================================
   Root
   ============================================================ */
export function ServiceOwnerScreen() {
  const locale = useAppStore((s) => s.locale);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const [group, setGroup] = useState<OwnerGroup>("IT");
  const [items, setItems] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // PRD §11-217 — pending journey-map fix proposals + modal trigger state.
  const [proposals, setProposals] = useState<MapFixProposal[]>([]);
  const [mapFixOpen, setMapFixOpen] = useState(false);
  const [mapFixRequest, setMapFixRequest] = useState<{ ref: string; type: RequestType } | null>(null);

  const handleProposeMapFix = useCallback((request: ServiceRequest) => {
    setMapFixRequest({ ref: request.ref, type: request.type });
    setMapFixOpen(true);
  }, []);

  const handleSubmitProposal = useCallback(
    (proposal: MapFixProposal) => {
      setProposals((prev) => [proposal, ...prev]);
    },
    [],
  );

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v1/requests`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiEnvelope<{ items: ServiceRequest[]; nextCursor: string | null }> = await res.json();
      if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");
      // Merge with any locally-mutated seeds (so transitions persist in-session)
      // by combining server items with SEED_REQUESTS that may have been mutated.
      // The server returns the in-memory array which IS mutated; so we just use it.
      setItems(json.data.items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const filtered = useMemo(() => {
    return items.filter((r) => r.ownerGroup === group);
  }, [items, group]);

  // Zero-clarification rate = items with returnCount === 0 / total items
  const zeroClarificationCount = filtered.filter((r) => r.returnCount === 0).length;
  const totalFiltered = filtered.length;
  const zeroClarificationRate = totalFiltered > 0 ? (zeroClarificationCount / totalFiltered) * 100 : 100;

  const handleAction = useCallback(
    async (id: string, to: string, opts?: { note?: string; question?: string; detail?: string }) => {
      try {
        // PRD §11-212 — when returning with "needs more info", persist the
        // structured question on the request via the transition endpoint's
        // optional `returnQuestion` payload. The named owner (returnedBy) is
        // resolved from the request's assignee.
        const body: Record<string, unknown> = {
          to,
          idempotencyKey: `${id}-${to}-${Date.now()}`,
        };
        if (to === "returned" && opts?.question) {
          const target = items.find((r) => r.id === id);
          const asker = target ? findAssignee(target.assignee) : null;
          body.returnQuestion = {
            question: opts.question,
            additionalDetail: opts.detail ?? "",
            returnedBy: asker?.name ?? target?.assignee ?? "Service owner",
          };
        }

        const res = await fetch(`/api/v1/requests/${id}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
        }
        const json: ApiEnvelope<ServiceRequest> = await res.json();
        if (!json.ok || !json.data) throw new Error(json.error?.message ?? "Unknown error");

        // Optimistically update local state — including the structured
        // returnQuestion payload so the queue card shows the active question
        // until the page is re-fetched.
        const askerName =
          (body.returnQuestion as { returnedBy?: string } | undefined)?.returnedBy ?? null;
        setItems((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: to,
                  returnQuestion:
                    to === "returned" && opts?.question && askerName
                      ? {
                          question: opts.question,
                          additionalDetail: opts.detail || undefined,
                          returnedBy: askerName,
                          returnedAt: new Date().toISOString(),
                        }
                      : r.returnQuestion,
                }
              : r,
          ),
        );

        if (to === "returned") {
          // Also bump the return count locally
          setItems((prev) => prev.map((r) => (r.id === id ? { ...r, returnCount: r.returnCount + 1 } : r)));
          toast.success(
            locale === "ar"
              ? "تم إشعار الموظف: نحتاج تفصيلاً إضافياً — تحقق من تبويب الطلبات"
              : "Employee notified: We need one more detail — check your Requests tab",
            { description: opts?.question }
          );
        } else if (to === "resolved") {
          toast.success(
            locale === "ar"
              ? "تم إشعار الموظف: تم حل طلبك — إليك ما تغيّر"
              : "Employee notified: Your request is resolved — here's what changed",
            { description: opts?.note }
          );
        } else if (to === "acknowledged") {
          toast.success(locale === "ar" ? "تم الاستلام" : "Acknowledged", { description: id });
        } else if (to === "in_progress") {
          toast.success(locale === "ar" ? "بدأ العمل" : "Started work", { description: id });
        }
      } catch (e) {
        toast.error(locale === "ar" ? "تعذّر الإجراء" : "Action failed", {
          description: e instanceof Error ? e.message : "Network error",
        });
      }
    },
    [items, locale]
  );

  return (
    <div dir={dir} className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--brand-400)" }}>
              <Inbox className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{locale === "ar" ? "وحدة مالك الخدمة" : "Service owner console"}</span>
            </div>
            <h1 className="mt-2 text-[26px] sm:text-[30px] font-semibold tracking-tight" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "قائمة الانتظار" : "Your queue"}
            </h1>
            <p className="mt-1 text-[13px]" style={{ color: "var(--text-mid)" }}>
              {locale === "ar"
                ? "حمولات كاملة، أسئلة قياسية، حلول منظّمة. أقل رحلات ذهاب وإياب."
                : "Complete payloads, standard questions, structured resolutions. Fewer round-trips."}
            </p>
          </div>

          {/* PRD §11-217 — Pending map-fix proposals counter */}
          {proposals.length > 0 && (
            <button
              type="button"
              onClick={() => toast.info(
                locale === "ar"
                  ? `${proposals.length} اقتراحات إصلاح خريطة بانتظار المراجعة`
                  : `${proposals.length} map-fix proposal${proposals.length === 1 ? "" : "s"} awaiting review`,
                {
                  description: proposals
                    .slice(0, 3)
                    .map((p) => `${p.requestRef} · ${p.stepKey}`)
                    .join("\n"),
                },
              )}
              className="ast-focus inline-flex items-center gap-2 h-9 px-3 rounded-full text-[12px] font-medium whitespace-nowrap"
              style={{
                background: "rgba(201,162,39,0.08)",
                border: "1px solid rgba(201,162,39,0.32)",
                color: "var(--accent-500)",
              }}
              aria-label={locale === "ar" ? `${proposals.length} اقتراحات بانتظار المراجعة` : `${proposals.length} proposals awaiting review`}
            >
              <MapPin className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>{locale === "ar" ? "اقتراحات قيد الانتظار" : "Pending proposals"}</span>
              <span
                className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-mono tabular"
                style={{
                  background: "var(--accent-500)",
                  color: "var(--surface-0)",
                }}
                dir="ltr"
              >
                {proposals.length}
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Group filter + count */}
      <div className="ast-card p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-[0.14em] mr-1" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "المجموعة" : "Group"}
            </span>
            <div
              className="flex items-center gap-1 p-1 rounded-full overflow-x-auto max-w-full"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            >
              {OWNER_GROUPS.map((g) => {
                const isActive = group === g.id;
                const count = items.filter((r) => r.ownerGroup === g.id).length;
                return (
                  <button
                    key={g.id}
                    onClick={() => setGroup(g.id)}
                    aria-pressed={isActive}
                    className="ast-focus relative inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors"
                    style={{ color: isActive ? "var(--surface-0)" : "var(--text-mid)" }}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="active-group-pill"
                        className="absolute inset-0 rounded-full"
                        style={{ background: "var(--brand-500)" }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{locale === "ar" ? g.labelAr : g.label}</span>
                    <span className="relative z-10 tabular text-[10px] opacity-80">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "في القائمة" : "In queue"}
            </span>
            <span
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-semibold tabular"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
            >
              {totalFiltered}
            </span>
          </div>
        </div>

        {/* Zero-clarification rate metric */}
        <div
          className="mt-4 pt-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ borderTop: "1px solid var(--border-soft)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
              style={{
                background: zeroClarificationRate === 100 ? "rgba(14,159,110,0.10)" : "rgba(201,162,39,0.08)",
                color: zeroClarificationRate === 100 ? "var(--status-steady)" : "var(--accent-500)",
              }}
            >
              <CheckCircle2 className="w-4.5 h-4.5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                <span className="tabular">{zeroClarificationCount}</span>
                <span style={{ color: "var(--text-mid)" }}> / </span>
                <span className="tabular">{totalFiltered}</span>
                <span style={{ color: "var(--text-mid)" }}>
                  {" "}{locale === "ar" ? "تذكرة احتاجت جولة توضيح" : "tickets needed a clarification round-trip"}
                </span>
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-lo)" }}>
                {locale === "ar"
                  ? "مقياس النجاح الرئيسي — PRD §11. كلما ارتفع، قلّت رحلات الذهاب والإياب."
                  : "The key success metric — PRD §11. Higher is better; fewer round-trips."}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "نسبة الصفر-توضيح" : "Zero-clarification rate"}
            </p>
            <p
              className="text-[24px] font-semibold tabular"
              style={{ color: zeroClarificationRate === 100 ? "var(--status-steady)" : "var(--accent-500)" }}
              dir="ltr"
            >
              {zeroClarificationRate.toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Queue list */}
      {loading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : err ? (
        <ErrorBanner message={err} onRetry={fetchQueue} />
      ) : filtered.length === 0 ? (
        <EmptyState group={group} locale={locale} />
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                onAction={handleAction}
                onProposeMapFix={handleProposeMapFix}
                locale={locale}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* SLA dashboard */}
      {!loading && !err && filtered.length > 0 && (
        <div className="mt-6">
          <SlaDashboard items={filtered} group={group} locale={locale} />
        </div>
      )}

      {/* Notification preferences (PRD §07-127) */}
      {!loading && !err && (
        <div className="mt-6">
          <NotificationPreferencesPanel locale={locale} />
        </div>
      )}

      {/* Footer note */}
      <p className="mt-6 text-[11px] text-center tabular" style={{ color: "var(--text-lo)" }}>
        {locale === "ar"
          ? `قائمة ${group} · ${filtered.length} طلبًا · ${zeroClarificationCount} بدون توضيح`
          : `Queue ${group} · ${filtered.length} requests · ${zeroClarificationCount} without clarification`}
      </p>

      {/* PRD §11-217 — Journey-map fix proposal modal */}
      <JourneyMapFixModal
        open={mapFixOpen}
        onOpenChange={setMapFixOpen}
        requestRef={mapFixRequest?.ref ?? ""}
        requestType={mapFixRequest?.type ?? null}
        onSubmit={handleSubmitProposal}
      />
    </div>
  );
}
