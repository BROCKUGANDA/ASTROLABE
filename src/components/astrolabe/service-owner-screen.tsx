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
import { formatDistanceToNow, differenceInHours } from "date-fns";
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
  locale,
}: {
  request: ServiceRequest;
  onAction: (id: string, to: string, opts?: { note?: string; question?: string; detail?: string }) => Promise<void>;
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
   SLA dashboard
   ============================================================ */
function SlaDashboard({ items, locale }: { items: ServiceRequest[]; locale: "en" | "ar" }) {
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
    <section className="ast-card p-5 sm:p-6 ast-fade-rise">
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
   Root
   ============================================================ */
export function ServiceOwnerScreen() {
  const locale = useAppStore((s) => s.locale);
  const dir = locale === "ar" ? "rtl" : "ltr";

  const [group, setGroup] = useState<OwnerGroup>("IT");
  const [items, setItems] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
              <RequestCard key={r.id} request={r} onAction={handleAction} locale={locale} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* SLA dashboard */}
      {!loading && !err && filtered.length > 0 && (
        <div className="mt-6">
          <SlaDashboard items={filtered} locale={locale} />
        </div>
      )}

      {/* Footer note */}
      <p className="mt-6 text-[11px] text-center tabular" style={{ color: "var(--text-lo)" }}>
        {locale === "ar"
          ? `قائمة ${group} · ${filtered.length} طلبًا · ${zeroClarificationCount} بدون توضيح`
          : `Queue ${group} · ${filtered.length} requests · ${zeroClarificationCount} without clarification`}
      </p>
    </div>
  );
}
