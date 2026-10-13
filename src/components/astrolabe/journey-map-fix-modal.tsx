"use client";

/* ============================================================
   ASTROLABE — Journey-map fix proposal (PRD §11-217)
   A modal that lets a service owner propose a journey-map fix
   straight from a ticket: adjust target time, change owner
   group, add a missing step, remove a step, or reorder a
   dependency. Proposals are stored in local state — no
   backend write for the prototype; the journey-map owner
   would review them in the Admin console.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  Send,
  Loader2,
  Clock,
  ArrowLeftRight,
  Plus,
  Trash2,
  Users,
  GitBranch,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store/app-store";
import {
  steps as ALL_STEPS,
  stages as ALL_STAGES,
  employees as ALL_EMPLOYEES,
  type Owner,
  type RequestType,
} from "@/lib/data/pack";

/* ---------- Types ---------- */

export type ChangeType =
  | "adjust_target"
  | "change_owner"
  | "add_step"
  | "remove_step"
  | "reorder_dependency";

export interface MapFixProposal {
  id: string;
  requestRef: string;
  stepKey: string;
  changeType: ChangeType;
  reason: string;
  createdAt: string;
}

/* ---------- Static maps ---------- */

const REQUEST_TYPE_TO_STEP_KEY: Record<RequestType, string> = {
  it_kit: "ob_kit_issued",
  system_access: "ob_access_provisioned",
  visa: "ob_visa_application",
  relocation: "ob_relocation_allowance",
  payroll: "mb_payroll_change",
  training: "ob_training_booked",
  facilities: "ob_badge_issued",
  manager_handover: "mb_release_handover",
};

const OWNER_GROUPS: { id: Owner["group"]; label: string; labelAr: string }[] = [
  { id: "HR", label: "HR", labelAr: "الموارد البشرية" },
  { id: "IT", label: "IT", labelAr: "تقنية المعلومات" },
  { id: "Learning", label: "Learning", labelAr: "التعلم" },
  { id: "Facilities", label: "Facilities", labelAr: "المرافق" },
  { id: "Mobility", label: "Mobility", labelAr: "التنقل" },
  { id: "Payroll", label: "Payroll", labelAr: "الرواتب" },
  { id: "Immigration", label: "Immigration", labelAr: "الهجرة" },
];

/* ---------- Helpers ---------- */

function findStep(stepKey: string | null) {
  if (!stepKey) return undefined;
  return ALL_STEPS.find((s) => s.key === stepKey);
}

function stageLabel(stageKey: string, locale: "en" | "ar"): string {
  const stage = ALL_STAGES.find((s) => s.key === stageKey);
  if (!stage) return stageKey;
  return locale === "ar" ? stage.labelAr : stage.label;
}

/* ---------- Change type picker option ---------- */

const CHANGE_TYPES: {
  id: ChangeType;
  labelEn: string;
  labelAr: string;
  Icon: typeof Clock;
}[] = [
  { id: "adjust_target", labelEn: "Adjust target time", labelAr: "تعديل الوقت المستهدف", Icon: Clock },
  { id: "change_owner", labelEn: "Change owner group", labelAr: "تغيير مجموعة المالك", Icon: Users },
  { id: "add_step", labelEn: "Add missing step", labelAr: "إضافة خطوة مفقودة", Icon: Plus },
  { id: "remove_step", labelEn: "Remove step", labelAr: "إزالة خطوة", Icon: Trash2 },
  { id: "reorder_dependency", labelEn: "Reorder dependency", labelAr: "إعادة ترتيب التبعية", Icon: ArrowLeftRight },
];

/* ============================================================
   Modal
   ============================================================ */

export interface JourneyMapFixModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  requestRef: string;
  requestType: RequestType | null;
  /** Called with the new proposal when the user submits. */
  onSubmit: (proposal: MapFixProposal) => void;
}

export function JourneyMapFixModal({
  open,
  onOpenChange,
  requestRef,
  requestType,
  onSubmit,
}: JourneyMapFixModalProps) {
  const locale = useAppStore((s) => s.locale);

  const [changeType, setChangeType] = useState<ChangeType>("adjust_target");
  const [reason, setReason] = useState("");

  // adjust_target
  const [newTargetHours, setNewTargetHours] = useState<number>(48);

  // change_owner
  const [newOwnerGroup, setNewOwnerGroup] = useState<Owner["group"]>("IT");

  // add_step
  const [newStepKey, setNewStepKey] = useState("");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [newStepStage, setNewStepStage] = useState<string>("pre_boarding");
  const [newStepTarget, setNewStepTarget] = useState<number>(48);
  const [newStepDependsOn, setNewStepDependsOn] = useState<string>("none");

  // remove_step — confirmation toggle
  const [removeConfirmed, setRemoveConfirmed] = useState(false);

  // reorder_dependency
  const [reorderNewPrereq, setReorderNewPrereq] = useState<string>("none");

  const [submitting, setSubmitting] = useState(false);

  /* Reset transient state on close so the next open starts clean. */
  useEffect(() => {
    if (!open) {
      setChangeType("adjust_target");
      setReason("");
      setNewTargetHours(48);
      setNewOwnerGroup("IT");
      setNewStepKey("");
      setNewStepLabel("");
      setNewStepStage("pre_boarding");
      setNewStepTarget(48);
      setNewStepDependsOn("none");
      setRemoveConfirmed(false);
      setReorderNewPrereq("none");
    }
  }, [open]);

  const stepKey = requestType ? REQUEST_TYPE_TO_STEP_KEY[requestType] : null;
  const step = findStep(stepKey);

  /* Impact preview — downstream steps + affected employees.
     We compute these off the live steps array so the proposal
     stays honest about blast radius (PRD §11-217). */
  const downstreamSteps = useMemo(() => {
    if (!stepKey) return [];
    return ALL_STEPS.filter((s) => s.dependsOn.includes(stepKey));
  }, [stepKey]);

  const affectedEmployees = useMemo(() => {
    if (!step) return [];
    /* All employees on the same journey type. For prototype we
       don't restrict to the exact step's stage — that would
       always be 1-2 — so the count reflects the journey scope. */
    return ALL_EMPLOYEES.filter((e) => e.journeyType === step.journeyType);
  }, [step]);

  /* Pre-fill new step target to current step target when modal opens
     for the adjust_target variant, so the slider starts sensible. */
  useEffect(() => {
    if (open && step && changeType === "adjust_target") {
      setNewTargetHours((prev) => (prev === 48 ? step.targetHours : prev));
    }
  }, [open, step, changeType]);

  const handleSubmit = async () => {
    if (reason.trim().length < 5) {
      toast.error(
        locale === "ar"
          ? "أضف سبباً قصيراً للتغيير (1-2 جمل)"
          : "Add a short reason for the change (1-2 sentences)"
      );
      return;
    }
    if (changeType === "remove_step" && !removeConfirmed) {
      toast.error(
        locale === "ar"
          ? "أكّد إزالة الخطوة قبل الإرسال"
          : "Confirm step removal before submitting"
      );
      return;
    }
    if (changeType === "add_step") {
      if (!newStepKey.trim() || !newStepLabel.trim()) {
        toast.error(locale === "ar" ? "أدخل مفتاح الخطوة وعنوانها" : "Provide a step key and label");
        return;
      }
    }
    setSubmitting(true);
    try {
      // Simulate a network round-trip — there's no proposal API yet
      // in the prototype. The journey-map owner would pick this up
      // from their Admin queue.
      await new Promise((r) => setTimeout(r, 320));
      if (stepKey) {
        onSubmit({
          id: `MFP-${Date.now().toString(36)}`,
          requestRef,
          stepKey,
          changeType,
          reason: reason.trim(),
          createdAt: new Date().toISOString(),
        });
      }
      onOpenChange(false);
      toast.success(
        locale === "ar"
          ? "أُرسل اقتراح إصلاح خريطة الرحلة إلى مالك الخريطة. سيتم إشعارك عند المراجعة."
          : "Map fix proposal submitted to the journey-map owner. You'll be notified when it's reviewed."
      );
    } catch (e) {
      toast.error(locale === "ar" ? "تعذّر إرسال الاقتراح" : "Couldn't submit the proposal", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------- Render ---------------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: "var(--text-hi)" }}>
            <MapPin className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            {locale === "ar" ? "اقترح إصلاحاً لخريطة الرحلة" : "Propose a journey-map fix"}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? `من التذكرة ${requestRef} — سيُراجع مالك خريطة الرحلة اقتراحك.`
              : `From ticket ${requestRef} — the journey-map owner will review your proposal.`}
          </DialogDescription>
        </DialogHeader>

        {/* Current step context */}
        {step && (
          <div
            className="rounded-[10px] p-3 flex items-start gap-3 flex-wrap"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <div className="flex-1 min-w-[200px]">
              <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "الخطوة الحالية" : "Current step"}
              </p>
              <p className="text-[13px] font-medium mt-1" style={{ color: "var(--text-hi)" }}>
                <span className="font-mono text-[12px]" style={{ color: "var(--brand-400)" }} dir="ltr">{step.key}</span>
                <span style={{ color: "var(--text-mid)" }}> · {locale === "ar" ? step.labelAr : step.label}</span>
              </p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "الوقت المستهدف" : "Target hours"}
                </p>
                <p className="text-[13px] tabular mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">{step.targetHours}h</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "المالك" : "Owner group"}
                </p>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-hi)" }}>{step.ownerGroup}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar" ? "المرحلة" : "Stage"}
                </p>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-hi)" }}>{stageLabel(step.stage, locale)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Change type picker */}
        <div className="space-y-2">
          <Label className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "نوع التغيير المقترح" : "Proposed change"}
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CHANGE_TYPES.map((c) => {
              const Icon = c.Icon;
              const isActive = changeType === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChangeType(c.id)}
                  aria-pressed={isActive}
                  className="ast-focus inline-flex items-center gap-2 h-11 px-3 rounded-[10px] text-[12px] font-medium text-left transition-colors"
                  style={{
                    background: isActive ? "rgba(22,154,165,0.10)" : "var(--surface-2)",
                    border: `1px solid ${isActive ? "rgba(22,154,165,0.40)" : "var(--border)"}`,
                    color: isActive ? "var(--brand-400)" : "var(--text-mid)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="leading-tight">{locale === "ar" ? c.labelAr : c.labelEn}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Variant-specific inputs */}
        <motion.div
          key={changeType}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="space-y-3"
        >
          {changeType === "adjust_target" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-target" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? "الوقت المستهدف الجديد (ساعات)" : "New target (hours)"}
                </Label>
                <Input
                  id="new-target"
                  type="number"
                  min={1}
                  max={2160}
                  value={newTargetHours}
                  onChange={(e) => setNewTargetHours(Number(e.target.value) || 0)}
                  className="ast-focus h-11 text-[13px] tabular"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
                  dir="ltr"
                />
              </div>
              <div className="flex items-end">
                <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
                  {locale === "ar"
                    ? `الحالي: ${step?.targetHours ?? "—"} ساعة. يُطبَّق على الخطوات اللاحقة أيضاً.`
                    : `Current: ${step?.targetHours ?? "—"}h. Will also shift downstream deadlines.`}
                </p>
              </div>
            </div>
          )}

          {changeType === "change_owner" && (
            <div className="space-y-2">
              <Label htmlFor="new-owner" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
                {locale === "ar" ? "المجموعة المالكة الجديدة" : "New owner group"}
              </Label>
              <Select value={newOwnerGroup} onValueChange={(v) => setNewOwnerGroup(v as Owner["group"])}>
                <SelectTrigger
                  id="new-owner"
                  className="w-full h-11 text-[13px] ast-focus"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-hi)" }}>
                  {OWNER_GROUPS.map((g) => (
                    <SelectItem key={g.id} value={g.id} className="text-[13px]">
                      {locale === "ar" ? `${g.labelAr} · ${g.id}` : `${g.label} · ${g.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
                {locale === "ar"
                  ? `المالك الحالي: ${step?.ownerGroup ?? "—"}. سيتم إخطار المجموعة الجديدة بتبعات هذه الخطوة.`
                  : `Current owner: ${step?.ownerGroup ?? "—"}. The new group will inherit this step's queue.`}
              </p>
            </div>
          )}

          {changeType === "add_step" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-step-key" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? "مفتاح الخطوة" : "Step key"}
                </Label>
                <Input
                  id="new-step-key"
                  type="text"
                  value={newStepKey}
                  onChange={(e) => setNewStepKey(e.target.value)}
                  placeholder="ob_medical_check"
                  className="ast-focus h-11 text-[12px] font-mono"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-step-label" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? "عنوان الخطوة" : "Step label"}
                </Label>
                <Input
                  id="new-step-label"
                  type="text"
                  value={newStepLabel}
                  onChange={(e) => setNewStepLabel(e.target.value)}
                  placeholder={locale === "ar" ? "فحص طبي" : "Medical check"}
                  className="ast-focus h-11 text-[13px]"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-step-stage" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? "المرحلة" : "Stage"}
                </Label>
                <Select value={newStepStage} onValueChange={setNewStepStage}>
                  <SelectTrigger
                    id="new-step-stage"
                    className="w-full h-11 text-[13px] ast-focus"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-hi)" }}>
                    {ALL_STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key} className="text-[13px]">
                        {locale === "ar" ? s.labelAr : s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-step-target" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? "الوقت المستهدف (ساعات)" : "Target (hours)"}
                </Label>
                <Input
                  id="new-step-target"
                  type="number"
                  min={1}
                  max={2160}
                  value={newStepTarget}
                  onChange={(e) => setNewStepTarget(Number(e.target.value) || 0)}
                  className="ast-focus h-11 text-[13px] tabular"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="new-step-deps" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar" ? "تعتمد على" : "Depends on"}
                </Label>
                <Select value={newStepDependsOn} onValueChange={setNewStepDependsOn}>
                  <SelectTrigger
                    id="new-step-deps"
                    className="w-full h-11 text-[13px] ast-focus"
                    style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-hi)" }}>
                    <SelectItem value="none" className="text-[13px]">
                      {locale === "ar" ? "بلا تبعية" : "No prerequisite"}
                    </SelectItem>
                    {ALL_STEPS.map((s) => (
                      <SelectItem key={s.key} value={s.key} className="text-[13px]">
                        <span className="font-mono text-[12px]" dir="ltr">{s.key}</span>
                        <span style={{ color: "var(--text-mid)" }}> · {locale === "ar" ? s.labelAr : s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {changeType === "remove_step" && (
            <div
              className="rounded-[10px] p-3 flex items-start gap-3"
              style={{ background: "rgba(159,18,57,0.08)", border: "1px solid rgba(159,18,57,0.32)" }}
            >
              <Trash2 className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.75} style={{ color: "var(--status-blocked)" }} />
              <div className="flex-1 space-y-2">
                <p className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                  {locale === "ar"
                    ? `إزالة الخطوة ${step?.key ?? ""} (${step ? (locale === "ar" ? step.labelAr : step.label) : ""})`
                    : `Remove step ${step?.key ?? ""} (${step ? step.label : ""})`}
                </p>
                <p className="text-[12px]" style={{ color: "var(--text-mid)" }}>
                  {locale === "ar"
                    ? "سيُنقل أي طلب مفتوح حالياً مرتبط بهذه الخطوة إلى قائمة الانتظار العامة. لا يمكن التراجع دون مراجعة مالك الخريطة."
                    : "Any open request currently tied to this step will be moved to the general queue. Not reversible without the journey-map owner."}
                </p>
                <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={removeConfirmed}
                    onChange={(e) => setRemoveConfirmed(e.target.checked)}
                    className="ast-focus size-4"
                    style={{ accentColor: "var(--status-blocked)" }}
                  />
                  <span className="text-[12px]" style={{ color: "var(--text-mid)" }}>
                    {locale === "ar" ? "أؤكد أنني أريد إزالة هذه الخطوة" : "I confirm I want to remove this step"}
                  </span>
                </label>
              </div>
            </div>
          )}

          {changeType === "reorder_dependency" && (
            <div className="space-y-2">
              <Label htmlFor="reorder-prereq" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
                {locale === "ar"
                  ? `المتطلب السابق الجديد للخطوة ${step?.key ?? ""}`
                  : `New prerequisite for ${step?.key ?? ""}`}
              </Label>
              <Select value={reorderNewPrereq} onValueChange={setReorderNewPrereq}>
                <SelectTrigger
                  id="reorder-prereq"
                  className="w-full h-11 text-[13px] ast-focus"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: "var(--surface-1)", borderColor: "var(--border)", color: "var(--text-hi)" }}>
                  <SelectItem value="none" className="text-[13px]">
                    {locale === "ar" ? "بلا متطلب سابق" : "No prerequisite"}
                  </SelectItem>
                  {ALL_STEPS.filter((s) => s.key !== stepKey).map((s) => (
                    <SelectItem key={s.key} value={s.key} className="text-[13px]">
                      <span className="font-mono text-[12px]" dir="ltr">{s.key}</span>
                      <span style={{ color: "var(--text-mid)" }}> · {locale === "ar" ? s.labelAr : s.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
                {locale === "ar"
                  ? `المتطلب الحالي: ${step?.dependsOn.length ? step.dependsOn.join(", ") : "بلا"}.`
                  : `Current prerequisite: ${step?.dependsOn.length ? step.dependsOn.join(", ") : "none"}.`}
              </p>
            </div>
          )}
        </motion.div>

        {/* Reason textarea */}
        <div className="space-y-2">
          <Label htmlFor="reason" className="text-[12px] font-medium" style={{ color: "var(--text-mid)" }}>
            {locale === "ar" ? "سبب الاقتراح" : "Why this change?"}
          </Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={
              locale === "ar"
                ? "مثال: تذكرة الـ IT kit تستغرق 48 ساعة وليس 24 — معظم التأخيرات مصدرها هذا الهدف الضيق."
                : "e.g. The IT kit ticket takes 48h in practice, not 24 — most breach reasons trace to this tight target."
            }
            className="ast-focus text-[13px]"
            style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-hi)" }}
          />
        </div>

        {/* Impact preview */}
        <div
          className="rounded-[10px] p-3 flex items-center gap-3 flex-wrap"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(201,162,39,0.10)", color: "var(--accent-500)" }}
          >
            <GitBranch className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-[12px] font-medium" style={{ color: "var(--text-hi)" }}>
              {locale === "ar"
                ? "يتأثر هذا التغيير بـ"
                : "This change affects"}
              <span className="tabular ml-1" style={{ color: "var(--accent-500)" }}>{downstreamSteps.length}</span>
              <span style={{ color: "var(--text-mid)" }}>{locale === "ar" ? " خطوة لاحقة و" : " downstream steps and "}</span>
              <span className="tabular" style={{ color: "var(--accent-500)" }}>{affectedEmployees.length}</span>
              <span style={{ color: "var(--text-mid)" }}>{locale === "ar" ? " موظف" : " employees"}</span>
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-lo)" }}>
              {locale === "ar"
                ? "أعداد صغيرة تعني تغييراً محلياً. الكبيرة تستدعي مراجعة أعمق."
                : "Small numbers mean a local change. Larger numbers warrant a deeper review."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-hi)" }}
          >
            {locale === "ar" ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium disabled:opacity-60"
            style={{ background: "var(--accent-500)", color: "var(--surface-0)", border: "1px solid var(--accent-500)" }}
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Send className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {locale === "ar" ? "إرسال الاقتراح" : "Submit proposal"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
