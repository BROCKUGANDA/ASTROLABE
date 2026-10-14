/**
 * ASTROLABE Actions — Intake Schemas, Owner Resolution, Escalation Packets
 * PRD §12, §14
 */

import {
  Employee,
  Owner,
  RequestType,
  owners,
  hrbps,
  getOwner,
  events as ALL_EVENTS,
  serviceRequests as ALL_REQUESTS,
} from "../data/pack";
import { Assessment, FrictionSignal } from "../engine/engine";

export interface IntakeSchema {
  type: RequestType;
  label: string;
  labelAr: string;
  ownerGroup: Owner["group"];
  slaHours: number;
  fields: IntakeField[];
  autoAttachedContext: string[];
  policyRef: string;
}

export interface IntakeField {
  key: string;
  label: string;
  labelAr: string;
  type: "text" | "select" | "date" | "checkbox" | "textarea" | "number";
  required: boolean;
  prefillFrom?:
    | "employee.location"
    | "employee.stage"
    | "employee.startDate"
    | "employee.role"
    | "step.key"
    | "step.dueAt";
  options?: { value: string; label: string }[];
  helpText?: string;
  helpTextAr?: string;
}

export const INTAKE_SCHEMAS: Record<RequestType, IntakeSchema> = {
  it_kit: {
    type: "it_kit",
    label: "IT kit / device",
    labelAr: "جهاز تقنية المعلومات",
    ownerGroup: "IT",
    slaHours: 24,
    fields: [
      {
        key: "kit_type",
        label: "Kit type",
        labelAr: "نوع الجهاز",
        type: "select",
        required: true,
        options: [
          { value: "standard_laptop", label: "Standard laptop (Dell Latitude)" },
          { value: "cabin_crew", label: "Cabin crew kit (laptop + iPad mini)" },
          { value: "replacement", label: "Replacement for lost/damaged kit" },
        ],
      },
      {
        key: "delivery_location",
        label: "Delivery location",
        labelAr: "مكان التسليم",
        type: "select",
        required: true,
        prefillFrom: "employee.location",
        options: [
          { value: "DXB", label: "Dubai (DXB)" },
          { value: "AUH", label: "Abu Dhabi (AUH)" },
        ],
      },
      {
        key: "stage",
        label: "Onboarding stage",
        labelAr: "مرحلة الالتحاق",
        type: "text",
        required: true,
        prefillFrom: "employee.stage",
      },
      {
        key: "start_date",
        label: "Start date",
        labelAr: "تاريخ البدء",
        type: "date",
        required: true,
        prefillFrom: "employee.startDate",
      },
      {
        key: "prior_ticket",
        label: "Prior ticket reference (if any)",
        labelAr: "مرجع التذكرة السابقة",
        type: "text",
        required: false,
      },
      {
        key: "notes",
        label: "What's going on?",
        labelAr: "ماذا يحدث؟",
        type: "textarea",
        required: false,
        helpText: "Tell us in your own words — we'll attach it as context only.",
        helpTextAr: "اخبرنا بكلماتك الخاصة — سنرفقه كسياق فقط.",
      },
    ],
    autoAttachedContext: ["Step state", "Prior kit events"],
    policyRef: "it-policy#kit",
  },
  system_access: {
    type: "system_access",
    label: "System access",
    labelAr: "الوصول للأنظمة",
    ownerGroup: "IT",
    slaHours: 48,
    fields: [
      {
        key: "system",
        label: "System",
        labelAr: "النظام",
        type: "select",
        required: true,
        options: [
          { value: "email", label: "Email" },
          { value: "roster", label: "Cabin crew rostering" },
          { value: "learning", label: "Learning portal" },
          { value: "finance", label: "Finance system (elevated)" },
        ],
      },
      {
        key: "role_profile",
        label: "Role profile",
        labelAr: "ملف الدور",
        type: "text",
        required: true,
        prefillFrom: "employee.role",
      },
      {
        key: "manager_approver",
        label: "Manager approver",
        labelAr: "المدير المعتمد",
        type: "text",
        required: true,
      },
      {
        key: "effective_date",
        label: "Effective date",
        labelAr: "تاريخ السريان",
        type: "date",
        required: true,
      },
    ],
    autoAttachedContext: ["Role change event", "Transfer approval"],
    policyRef: "it-policy#access",
  },
  visa: {
    type: "visa",
    label: "Visa / work authorisation",
    labelAr: "التأشيرة / تصريح العمل",
    ownerGroup: "Immigration",
    slaHours: 72,
    fields: [
      {
        key: "passport_checklist",
        label: "Passport scan uploaded?",
        labelAr: "تم تحميل مسح جواز السفر؟",
        type: "checkbox",
        required: true,
      },
      {
        key: "photo_checklist",
        label: "Passport photo uploaded?",
        labelAr: "تم تحميل صورة جواز السفر؟",
        type: "checkbox",
        required: true,
      },
      {
        key: "dependants",
        label: "Any dependants on this visa?",
        labelAr: "هل هناك معالون على هذه التأشيرة؟",
        type: "checkbox",
        required: true,
      },
      {
        key: "current_step",
        label: "Current step",
        labelAr: "الخطوة الحالية",
        type: "text",
        required: true,
        prefillFrom: "employee.stage",
      },
    ],
    autoAttachedContext: ["Blocked-downstream list", "Policy section"],
    policyRef: "immigration-policy#visa",
  },
  relocation: {
    type: "relocation",
    label: "Relocation / housing",
    labelAr: "الانتقال / السكن",
    ownerGroup: "Mobility",
    slaHours: 72,
    fields: [
      {
        key: "family_size",
        label: "Family size",
        labelAr: "حجم الأسرة",
        type: "number",
        required: true,
      },
      {
        key: "arrival_date",
        label: "Arrival date",
        labelAr: "تاريخ الوصول",
        type: "date",
        required: true,
      },
      {
        key: "temporary_housing",
        label: "Temporary housing needed?",
        labelAr: "هل تحتاج سكن مؤقت؟",
        type: "checkbox",
        required: true,
      },
      {
        key: "allowance_band",
        label: "Allowance band",
        labelAr: "فئة البدل",
        type: "select",
        required: true,
        options: [
          { value: "single", label: "Single — AED 14,000" },
          { value: "dependants", label: "With dependants — AED 22,000" },
        ],
      },
    ],
    autoAttachedContext: ["Relocation policy citation", "Deadlines"],
    policyRef: "relocation-policy#allowance",
  },
  payroll: {
    type: "payroll",
    label: "Payroll / allowance",
    labelAr: "الرواتب / البدل",
    ownerGroup: "Payroll",
    slaHours: 48,
    fields: [
      {
        key: "change_type",
        label: "Change type",
        labelAr: "نوع التغيير",
        type: "select",
        required: true,
        options: [
          { value: "bank", label: "Bank details" },
          { value: "allowance", label: "Allowance adjustment" },
          { value: "transfer", label: "Transfer payroll" },
        ],
      },
      {
        key: "effective_date",
        label: "Effective date",
        labelAr: "تاريخ السريان",
        type: "date",
        required: true,
      },
      {
        key: "bank_confirmed",
        label: "Bank details confirmed?",
        labelAr: "تم تأكيد التفاصيل البنكية؟",
        type: "checkbox",
        required: true,
      },
      {
        key: "cycle_cutoff",
        label: "Payroll cycle cutoff (25th)",
        labelAr: "تقطع دورة الرواتب (25)",
        type: "date",
        required: true,
      },
    ],
    autoAttachedContext: ["MB-04 state", "Cutoff date"],
    policyRef: "payroll-policy#transfer",
  },
  training: {
    type: "training",
    label: "Training booking",
    labelAr: "حجز التدريب",
    ownerGroup: "Learning",
    slaHours: 48,
    fields: [
      {
        key: "course_code",
        label: "Course code",
        labelAr: "رمز الدورة",
        type: "select",
        required: true,
        options: [
          { value: "AV-SAFETY", label: "Aviation Safety (GCAA)" },
          { value: "CS-EXCEL", label: "Customer Service Excellence" },
          { value: "EMRG-PROC", label: "Emergency Procedures" },
          { value: "CULT-AWR", label: "Cultural Awareness" },
        ],
      },
      {
        key: "prerequisite_status",
        label: "Prerequisite access present?",
        labelAr: "هل الوصول المسبق موجود؟",
        type: "checkbox",
        required: true,
      },
      {
        key: "preferred_window",
        label: "Preferred window",
        labelAr: "الفترة المفضلة",
        type: "select",
        required: true,
        options: [
          { value: "am", label: "Morning" },
          { value: "pm", label: "Afternoon" },
        ],
      },
    ],
    autoAttachedContext: ["Prerequisite access state"],
    policyRef: "learning-policy#mandatory",
  },
  facilities: {
    type: "facilities",
    label: "Facilities / badge / desk",
    labelAr: "المرافق / البطاقة / المكتب",
    ownerGroup: "Facilities",
    slaHours: 24,
    fields: [
      {
        key: "site",
        label: "Site",
        labelAr: "الموقع",
        type: "select",
        required: true,
        prefillFrom: "employee.location",
        options: [
          { value: "DXB", label: "Dubai (DXB)" },
          { value: "AUH", label: "Abu Dhabi (AUH)" },
        ],
      },
      { key: "floor", label: "Floor", labelAr: "الطابق", type: "text", required: true },
      {
        key: "access_group",
        label: "Access group",
        labelAr: "مجموعة الوصول",
        type: "text",
        required: true,
      },
      {
        key: "mobility_flag",
        label: "Mobility case (transfer)?",
        labelAr: "حالة تنقل (نقل)؟",
        type: "checkbox",
        required: false,
      },
    ],
    autoAttachedContext: ["Location change event"],
    policyRef: "facilities-policy#badge",
  },
  manager_handover: {
    type: "manager_handover",
    label: "Manager handover",
    labelAr: "تسليم المدير",
    ownerGroup: "HR",
    slaHours: 120,
    fields: [
      {
        key: "from_manager",
        label: "From manager",
        labelAr: "من المدير",
        type: "text",
        required: true,
      },
      {
        key: "to_manager",
        label: "To manager",
        labelAr: "إلى المدير",
        type: "text",
        required: true,
      },
      {
        key: "handover_items",
        label: "Handover items",
        labelAr: "عناصر التسليم",
        type: "textarea",
        required: true,
      },
      {
        key: "effective_date",
        label: "Effective date",
        labelAr: "تاريخ السريان",
        type: "date",
        required: true,
      },
    ],
    autoAttachedContext: ["Transfer approval"],
    policyRef: "mobility-policy#handover",
  },
};

/* ============================================================
   OWNER RESOLUTION
   ============================================================ */
export function resolveOwner(
  type: RequestType,
  employee: Employee,
  stepOwnerGroup?: Owner["group"],
): { owner: Owner | null; path: string[]; fallbackUsed: boolean } {
  const path: string[] = [];
  // 1. Step owner in journey_map
  if (stepOwnerGroup) {
    path.push(`step_owner_group:${stepOwnerGroup}`);
    const owner = owners.find((o) => o.group === stepOwnerGroup);
    if (owner) return { owner, path, fallbackUsed: false };
  }
  // 2. Queue for (type, location)
  const schema = INTAKE_SCHEMAS[type];
  path.push(`queue:(${type},${employee.location})`);
  const owner = owners.find((o) => o.group === schema.ownerGroup);
  if (owner) return { owner, path, fallbackUsed: false };
  // 3. Functional fallback (HR)
  path.push("functional_fallback:HR");
  const hrOwner = owners.find((o) => o.group === "HR");
  if (hrOwner) return { owner: hrOwner, path, fallbackUsed: true };
  // 4. HRBP of record
  const hrbp = hrbps.find((h) => h.id === employee.hrbpId);
  if (hrbp) {
    path.push(`hrbp:${hrbp.id}`);
    return { owner: hrbp, path, fallbackUsed: true };
  }
  // 5. E_NO_OWNER
  path.push("E_NO_OWNER");
  return { owner: null, path, fallbackUsed: true };
}

/* ============================================================
   ESCALATION PACKET BUILDER
   ============================================================ */
export interface EscalationPacket {
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
  openRequests: {
    ref: string;
    type: string;
    ownerGroup: string;
    ageHours: number;
    reassignCount: number;
  }[];
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

export function buildEscalationPacket(
  employee: Employee,
  assessment: Assessment,
  decisionRequested: string,
  sharePulseSummary: boolean,
): EscalationPacket {
  const topSignals = assessment.signals
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((s) => ({
      code: s.code,
      weight: s.weight,
      description: s.description,
      evidenceRefs: s.evidenceRefs,
    }));

  // Build timeline from events
  const employeeEvents = ALL_EVENTS.filter((e) => e.employeeId === employee.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 10)
    .map((e) => ({
      occurredAt: e.occurredAt,
      stepKey: e.stepKey,
      type: e.type,
    }));

  // Open requests
  const openReqs = ALL_REQUESTS.filter((r) => r.employeeId === employee.id).map((r) => ({
    ref: r.ref,
    type: r.type,
    ownerGroup: r.ownerGroup,
    ageHours: (Date.now() - new Date(r.openedAt).getTime()) / 3600000,
    reassignCount: r.reassignCount,
  }));

  // Named owner = HRBP of record
  const hrbp = getOwner(employee.hrbpId) ?? hrbps[0];
  const backup = hrbps.find((h) => h.id !== hrbp.id);

  return {
    id: `ESC-${Date.now().toString(36)}`,
    employeeId: employee.id,
    employeeName: employee.displayName,
    journeyType: employee.journeyType,
    stage: assessment.stage,
    dayInStage: assessment.dayInStage,
    locale: employee.locale,
    band: assessment.band,
    score: assessment.score,
    topSignals,
    timeline: employeeEvents,
    blockedDownstream: assessment.signals
      .filter((s) => s.code === "DP-01" || s.code === "DP-02")
      .flatMap((s) => s.evidenceRefs.filter((r) => r.startsWith("step:")))
      .map((s) => s.replace("step:", "")),
    openRequests: openReqs,
    decisionRequested,
    namedOwner: {
      id: hrbp.id,
      name: hrbp.name,
      role: hrbp.role,
      email: hrbp.email,
    },
    backupOwner: backup
      ? {
          id: backup.id,
          name: backup.name,
          role: backup.role,
          email: backup.email,
        }
      : undefined,
    consentStatement: {
      sharedWithHrbp: sharePulseSummary
        ? ["journey_state", "request_telemetry", "pulse_summary"]
        : ["journey_state", "request_telemetry"],
      withheld: sharePulseSummary ? [] : ["pulse_summary", "free_text_comments"],
      freeTextExcluded: true,
    },
    createdAt: new Date().toISOString(),
  };
}

/* ============================================================
   REQUEST STATE MACHINE
   ------------------------------------------------------------
   PRD §29 item 15 — Request status is DERIVED, never written.
   The only legal way to move a ServiceRequest between statuses is
   `POST /api/v1/requests/[id]/transition`, which:
     1. validates `to` against the VALID_STATUSES set,
     2. checks the (from, to) pair against LEGAL_TRANSITIONS below,
     3. only then mutates `request.status`.
   No handler in the app writes `request.status = …` directly; any
   other code path that needs to change status MUST go through the
   transition route (or this `canTransition` predicate + the same
   idempotency-key rule). This makes every status change auditable
   from one site and prevents the engine, the UI, or a future
   model-call from silently jumping a request to "resolved".
   ============================================================ */
const LEGAL_TRANSITIONS: Record<string, string[]> = {
  draft: ["validated", "cancelled"],
  validated: ["submitted", "cancelled"],
  submitted: ["acknowledged", "returned", "cancelled"],
  acknowledged: ["in_progress", "returned"],
  in_progress: ["waiting_employee", "resolved", "returned", "reassigned"],
  waiting_employee: ["in_progress", "cancelled"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  returned: ["submitted", "cancelled"],
  reassigned: ["in_progress", "acknowledged"],
  reopened: ["submitted"],
  cancelled: [],
};

export function canTransition(from: string, to: string): boolean {
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}
