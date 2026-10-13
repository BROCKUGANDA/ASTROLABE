/**
 * ASTROLABE Synthetic Data Pack
 * ------------------------------
 * Versioned, hash-stable seed data for the deterministic engine.
 * Mirrors the PRD §9 domain model and §4 scope (two journeys only:
 * onboarding + internal mobility).
 *
 * All timestamps are ISO UTC. Employee timezone retained on the employee row.
 */

export const PACK_VERSION = "synthetic-2024-q4-v1";
export const ENGINE_VERSION = "engine-1.0.0";
export const CORPUS_VERSION = "policies-2024-q4-v1";

export type JourneyType = "onboarding" | "mobility";
export type Locale = "en" | "ar";
export type Location = "DXB" | "AUH" | "REMOTE";

export interface Employee {
  id: string;
  ref: string;
  displayName: string;
  displayNameAr?: string;
  journeyType: JourneyType;
  stage: string;
  startDate: string;
  effectiveDate?: string;
  location: Location;
  timezone: string;
  managerId: string;
  hrbpId: string;
  locale: Locale;
  role: string;
  roleAr?: string;
  team: string;
  nationality: string;
}

export interface Owner {
  id: string;
  name: string;
  nameAr?: string;
  role: string;
  group: "HR" | "IT" | "Learning" | "Facilities" | "Mobility" | "Payroll" | "Immigration";
  email: string;
}

export interface JourneyStep {
  key: string;
  label: string;
  labelAr: string;
  stage: string;
  ownerGroup: Owner["group"];
  targetHours: number;
  dependsOn: string[];
  policyRefs: string[];
  actor: "employee" | "owner" | "system";
  journeyType: JourneyType;
  requestType?: RequestType;
}

export type RequestType =
  | "it_kit"
  | "system_access"
  | "visa"
  | "relocation"
  | "payroll"
  | "training"
  | "facilities"
  | "manager_handover";

export interface JourneyStage {
  key: string;
  label: string;
  labelAr: string;
  order: number;
  journeyType: JourneyType;
}

export interface JourneyEvent {
  id: string;
  employeeId: string;
  stepKey: string;
  type:
    | "started"
    | "completed"
    | "blocked"
    | "unblocked"
    | "waiting_employee"
    | "waiting_owner"
    | "skipped"
    | "note";
  occurredAt: string;
  recordedAt: string;
  source: string;
  payloadHash: string;
}

export interface ServiceRequest {
  id: string;
  ref: string;
  employeeId: string;
  type: RequestType;
  ownerGroup: Owner["group"];
  assignee: string;
  status:
    | "draft"
    | "validated"
    | "submitted"
    | "acknowledged"
    | "in_progress"
    | "waiting_employee"
    | "resolved"
    | "closed"
    | "returned"
    | "reassigned"
    | "cancelled";
  openedAt: string;
  slaHours: number;
  reassignCount: number;
  returnCount: number;
  parentId?: string;
  idempotencyKey: string;
}

export interface PolicyChunk {
  id: string;
  docSlug: string;
  title: string;
  titleAr: string;
  section: string;
  effectiveDate: string;
  reviewDate: string;
  lang: Locale;
  text: string;
  pairId: string;
}

export interface PulseResponse {
  id: string;
  employeeId: string;
  stage: string;
  score: number;
  commentRef?: string;
  commentText?: string;
  consentId: string;
  createdAt: string;
}

export const owners: Owner[] = [
  { id: "O-IT-1", name: "Ahmed Al-Rashid", nameAr: "أحمد الراشد", role: "IT Provisioning Lead", group: "IT", email: "it-prov@astrolabe.internal" },
  { id: "O-IT-2", name: "Priya Nair", nameAr: "بريا ناير", role: "IT Access Lead", group: "IT", email: "it-access@astrolabe.internal" },
  { id: "O-HR-1", name: "Fatima Al-Mansouri", nameAr: "فاطمة المنصوري", role: "HR Business Partner", group: "HR", email: "fatima.hrbp@astrolabe.internal" },
  { id: "O-HR-2", name: "Rania Hassan", nameAr: "رانيا حسن", role: "Mobility Specialist", group: "Mobility", email: "mobility@astrolabe.internal" },
  { id: "O-IMM-1", name: "Saeed Al-Marri", nameAr: "سعيد المري", role: "Immigration Officer", group: "Immigration", email: "immigration@astrolabe.internal" },
  { id: "O-LEARN-1", name: "Lina Khoury", nameAr: "لينا خوري", role: "Learning Coordinator", group: "Learning", email: "learning@astrolabe.internal" },
  { id: "O-FAC-1", name: "Omar Farouk", nameAr: "عمر فاروق", role: "Facilities Supervisor", group: "Facilities", email: "facilities@astrolabe.internal" },
  { id: "O-PAY-1", name: "Mona Said", nameAr: "منى سعيد", role: "Payroll Specialist", group: "Payroll", email: "payroll@astrolabe.internal" },
];

export const managers: Owner[] = [
  { id: "MGR-1", name: "Ahmed Al-Rashid", role: "Line Manager — Cabin Crew DXB", group: "HR", email: "ahmed.mgr@astrolabe.internal" },
  { id: "MGR-2", name: "Yusuf Demir", role: "Line Manager — Warehouse AUH", group: "HR", email: "yusuf.mgr@astrolabe.internal" },
];

export const hrbps: Owner[] = [
  { id: "HRBP-1", name: "Fatima Al-Mansouri", nameAr: "فاطمة المنصوري", role: "HRBP — Cabin Crew", group: "HR", email: "fatima.hrbp@astrolabe.internal" },
  { id: "HRBP-2", name: "Khalid Idris", nameAr: "خالد إدريس", role: "HRBP — Ground Ops", group: "HR", email: "khalid.hrbp@astrolabe.internal" },
];

export const stages: JourneyStage[] = [
  { key: "pre_boarding", label: "Pre-boarding", labelAr: "ما قبل الالتحاق", order: 1, journeyType: "onboarding" },
  { key: "visa_processing", label: "Visa Processing", labelAr: "معالجة التأشيرة", order: 2, journeyType: "onboarding" },
  { key: "first_day", label: "First Day", labelAr: "اليوم الأول", order: 3, journeyType: "onboarding" },
  { key: "first_week", label: "First Week", labelAr: "الأسبوع الأول", order: 4, journeyType: "onboarding" },
  { key: "first_90", label: "First 90 Days", labelAr: "أول 90 يوماً", order: 5, journeyType: "onboarding" },
  { key: "transfer_approved", label: "Transfer Approved", labelAr: "تمت الموافقة على النقل", order: 1, journeyType: "mobility" },
  { key: "handover", label: "Handover", labelAr: "التسليم", order: 2, journeyType: "mobility" },
  { key: "effective_date", label: "Effective Date", labelAr: "تاريخ السريان", order: 3, journeyType: "mobility" },
  { key: "settle_new_role", label: "Settling In", labelAr: "الاستقرار", order: 4, journeyType: "mobility" },
];

export const steps: JourneyStep[] = [
  { key: "ob_offer_signed", label: "Offer signed", labelAr: "توقيع العرض", stage: "pre_boarding", ownerGroup: "HR", targetHours: 24, dependsOn: [], policyRefs: ["onboarding-policy#offer"], actor: "employee", journeyType: "onboarding" },
  { key: "ob_passport_upload", label: "Passport scan uploaded", labelAr: "تحميل مسح جواز السفر", stage: "pre_boarding", ownerGroup: "Immigration", targetHours: 48, dependsOn: ["ob_offer_signed"], policyRefs: ["immigration-policy#documents"], actor: "employee", journeyType: "onboarding" },
  { key: "ob_relocation_allowance", label: "Relocation allowance confirmed", labelAr: "تأكيد بدل الانتقال", stage: "pre_boarding", ownerGroup: "Mobility", targetHours: 72, dependsOn: ["ob_offer_signed"], policyRefs: ["relocation-policy#allowance"], actor: "owner", journeyType: "onboarding", requestType: "relocation" },
  { key: "ob_visa_application", label: "Visa application submitted", labelAr: "تقديم طلب التأشيرة", stage: "visa_processing", ownerGroup: "Immigration", targetHours: 168, dependsOn: ["ob_passport_upload"], policyRefs: ["immigration-policy#visa"], actor: "owner", journeyType: "onboarding", requestType: "visa" },
  { key: "ob_visa_approval", label: "Visa approved", labelAr: "الموافقة على التأشيرة", stage: "visa_processing", ownerGroup: "Immigration", targetHours: 240, dependsOn: ["ob_visa_application"], policyRefs: ["immigration-policy#timeline"], actor: "owner", journeyType: "onboarding" },
  { key: "ob_flight_booked", label: "Flight to UAE booked", labelAr: "حجز رحلة إلى الإمارات", stage: "visa_processing", ownerGroup: "Mobility", targetHours: 48, dependsOn: ["ob_visa_approval"], policyRefs: ["relocation-policy#travel"], actor: "owner", journeyType: "onboarding" },
  { key: "ob_housing_arranged", label: "Temporary housing arranged", labelAr: "ترتيب السكن المؤقت", stage: "visa_processing", ownerGroup: "Mobility", targetHours: 96, dependsOn: ["ob_visa_approval"], policyRefs: ["relocation-policy#housing"], actor: "owner", journeyType: "onboarding" },
  { key: "ob_kit_issued", label: "Laptop and phone issued", labelAr: "إصدار الكمبيوتر والهاتف", stage: "first_day", ownerGroup: "IT", targetHours: 24, dependsOn: ["ob_visa_approval"], policyRefs: ["it-policy#kit"], actor: "owner", journeyType: "onboarding", requestType: "it_kit" },
  { key: "ob_access_provisioned", label: "Systems access provisioned", labelAr: "توفير الوصول للأنظمة", stage: "first_day", ownerGroup: "IT", targetHours: 48, dependsOn: ["ob_kit_issued"], policyRefs: ["it-policy#access"], actor: "owner", journeyType: "onboarding", requestType: "system_access" },
  { key: "ob_badge_issued", label: "ID badge issued", labelAr: "إصدار بطاقة الهوية", stage: "first_day", ownerGroup: "Facilities", targetHours: 24, dependsOn: ["ob_visa_approval"], policyRefs: ["facilities-policy#badge"], actor: "owner", journeyType: "onboarding", requestType: "facilities" },
  { key: "ob_induction_complete", label: "Induction completed", labelAr: "إكمال التعريف", stage: "first_week", ownerGroup: "HR", targetHours: 48, dependsOn: ["ob_badge_issued"], policyRefs: ["onboarding-policy#induction"], actor: "employee", journeyType: "onboarding" },
  { key: "ob_training_booked", label: "Mandatory training booked", labelAr: "حجز التدريب الإلزامي", stage: "first_week", ownerGroup: "Learning", targetHours: 72, dependsOn: ["ob_access_provisioned"], policyRefs: ["learning-policy#mandatory"], actor: "owner", journeyType: "onboarding", requestType: "training" },
  { key: "ob_buddy_assigned", label: "Buddy assigned", labelAr: "تعيين المرافق", stage: "first_week", ownerGroup: "HR", targetHours: 24, dependsOn: ["ob_induction_complete"], policyRefs: ["onboarding-policy#buddy"], actor: "owner", journeyType: "onboarding" },
  { key: "ob_30day_checkin", label: "30-day check-in", labelAr: "مراجعة 30 يوماً", stage: "first_90", ownerGroup: "HR", targetHours: 720, dependsOn: ["ob_buddy_assigned"], policyRefs: ["onboarding-policy#checkins"], actor: "owner", journeyType: "onboarding" },
  { key: "ob_90day_review", label: "90-day review", labelAr: "مراجعة 90 يوماً", stage: "first_90", ownerGroup: "HR", targetHours: 2160, dependsOn: ["ob_30day_checkin"], policyRefs: ["onboarding-policy#checkins"], actor: "owner", journeyType: "onboarding" },
  { key: "mb_transfer_signed", label: "Transfer approval signed", labelAr: "توقيع موافقة النقل", stage: "transfer_approved", ownerGroup: "HR", targetHours: 24, dependsOn: [], policyRefs: ["mobility-policy#transfer"], actor: "owner", journeyType: "mobility" },
  { key: "mb_release_handover", label: "Releasing manager handover", labelAr: "تسليم المدير السابق", stage: "handover", ownerGroup: "HR", targetHours: 120, dependsOn: ["mb_transfer_signed"], policyRefs: ["mobility-policy#handover"], actor: "owner", journeyType: "mobility", requestType: "manager_handover" },
  { key: "mb_asset_return", label: "Previous team assets returned", labelAr: "إرجاع أصول الفريق السابق", stage: "handover", ownerGroup: "Facilities", targetHours: 240, dependsOn: ["mb_transfer_signed"], policyRefs: ["facilities-policy#assets"], actor: "employee", journeyType: "mobility" },
  { key: "mb_role_access", label: "New role access profile", labelAr: "ملف الوصول للدور الجديد", stage: "effective_date", ownerGroup: "IT", targetHours: 72, dependsOn: ["mb_transfer_signed"], policyRefs: ["it-policy#access"], actor: "owner", journeyType: "mobility", requestType: "system_access" },
  { key: "mb_payroll_change", label: "Payroll change confirmed", labelAr: "تأكيد تغيير الرواتب", stage: "effective_date", ownerGroup: "Payroll", targetHours: 48, dependsOn: ["mb_transfer_signed"], policyRefs: ["payroll-policy#transfer"], actor: "owner", journeyType: "mobility", requestType: "payroll" },
  { key: "mb_training_booked", label: "New role training booked", labelAr: "حجز تدريب الدور الجديد", stage: "settle_new_role", ownerGroup: "Learning", targetHours: 120, dependsOn: ["mb_role_access"], policyRefs: ["learning-policy#role"], actor: "owner", journeyType: "mobility", requestType: "training" },
  { key: "mb_dual_reporting", label: "Dual reporting resolved", labelAr: "حل التقارير المزدوج", stage: "settle_new_role", ownerGroup: "HR", targetHours: 168, dependsOn: ["mb_transfer_signed"], policyRefs: ["mobility-policy#reporting"], actor: "owner", journeyType: "mobility" },
];

export const employees: Employee[] = [
  {
    id: "E-1042",
    ref: "E-1042",
    displayName: "Maria Santos",
    displayNameAr: "ماريا سانتوس",
    journeyType: "onboarding",
    stage: "first_week",
    startDate: "2024-10-14T08:00:00Z",
    location: "DXB",
    timezone: "Asia/Dubai",
    managerId: "MGR-1",
    hrbpId: "HRBP-1",
    locale: "en",
    role: "Cabin Crew Trainee",
    roleAr: "متدربة طاقم المقصورة",
    team: "Cabin Crew DXB",
    nationality: "Filipino",
  },
  {
    id: "E-1043",
    ref: "E-1043",
    displayName: "Daniel Okonkwo",
    displayNameAr: "دانيال أوكونكو",
    journeyType: "onboarding",
    stage: "visa_processing",
    startDate: "2024-11-04T08:00:00Z",
    location: "DXB",
    timezone: "Africa/Lagos",
    managerId: "MGR-1",
    hrbpId: "HRBP-1",
    locale: "en",
    role: "Cabin Crew Trainee",
    roleAr: "متدرب طاقم المقصورة",
    team: "Cabin Crew DXB",
    nationality: "Nigerian",
  },
  {
    id: "E-1044",
    ref: "E-1044",
    displayName: "Aisha Rahman",
    displayNameAr: "عائشة الرحمن",
    journeyType: "mobility",
    stage: "effective_date",
    startDate: "2024-10-01T08:00:00Z",
    effectiveDate: "2024-10-15T08:00:00Z",
    location: "AUH",
    timezone: "Asia/Dubai",
    managerId: "MGR-2",
    hrbpId: "HRBP-2",
    locale: "ar",
    role: "Warehouse Supervisor",
    roleAr: "مشرف المستودع",
    team: "Ground Ops AUH",
    nationality: "Emirati",
  },
  {
    id: "E-1045",
    ref: "E-1045",
    displayName: "James Park",
    displayNameAr: "جيمس بارك",
    journeyType: "onboarding",
    stage: "first_day",
    startDate: "2024-10-18T08:00:00Z",
    location: "DXB",
    timezone: "Asia/Seoul",
    managerId: "MGR-1",
    hrbpId: "HRBP-1",
    locale: "en",
    role: "Cabin Crew Trainee",
    roleAr: "متدرب طاقم المقصورة",
    team: "Cabin Crew DXB",
    nationality: "Korean",
  },
  {
    id: "E-1046",
    ref: "E-1046",
    displayName: "Sara Kovač",
    displayNameAr: "سارة كوفاتش",
    journeyType: "mobility",
    stage: "handover",
    startDate: "2024-09-15T08:00:00Z",
    effectiveDate: "2024-10-29T08:00:00Z",
    location: "DXB",
    timezone: "Europe/Zagreb",
    managerId: "MGR-1",
    hrbpId: "HRBP-2",
    locale: "en",
    role: "Senior Cabin Crew",
    roleAr: "كابينة كبيرة",
    team: "Cabin Crew DXB",
    nationality: "Croatian",
  },
];

export const NOW = new Date("2024-10-19T10:00:00Z");

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3600 * 1000).toISOString();
}
function hoursAhead(h: number): string {
  return new Date(NOW.getTime() + h * 3600 * 1000).toISOString();
}

export const events: JourneyEvent[] = [
  // E-1042 Maria Santos (onboarding, day 5, first_week)
  { id: "EV-001", employeeId: "E-1042", stepKey: "ob_offer_signed", type: "completed", occurredAt: hoursAgo(24 * 12), recordedAt: hoursAgo(24 * 12), source: "hr-system", payloadHash: "h-001" },
  { id: "EV-002", employeeId: "E-1042", stepKey: "ob_passport_upload", type: "completed", occurredAt: hoursAgo(24 * 11), recordedAt: hoursAgo(24 * 11), source: "immigration-portal", payloadHash: "h-002" },
  { id: "EV-003", employeeId: "E-1042", stepKey: "ob_relocation_allowance", type: "completed", occurredAt: hoursAgo(24 * 10), recordedAt: hoursAgo(24 * 10), source: "mobility-system", payloadHash: "h-003" },
  { id: "EV-004", employeeId: "E-1042", stepKey: "ob_visa_application", type: "completed", occurredAt: hoursAgo(24 * 9), recordedAt: hoursAgo(24 * 9), source: "immigration-portal", payloadHash: "h-004" },
  { id: "EV-005", employeeId: "E-1042", stepKey: "ob_visa_approval", type: "completed", occurredAt: hoursAgo(24 * 6), recordedAt: hoursAgo(24 * 6), source: "immigration-portal", payloadHash: "h-005" },
  { id: "EV-006", employeeId: "E-1042", stepKey: "ob_flight_booked", type: "completed", occurredAt: hoursAgo(24 * 5), recordedAt: hoursAgo(24 * 5), source: "mobility-system", payloadHash: "h-006" },
  { id: "EV-007", employeeId: "E-1042", stepKey: "ob_housing_arranged", type: "completed", occurredAt: hoursAgo(24 * 5), recordedAt: hoursAgo(24 * 5), source: "mobility-system", payloadHash: "h-007" },
  { id: "EV-008", employeeId: "E-1042", stepKey: "ob_kit_issued", type: "started", occurredAt: hoursAgo(24 * 3), recordedAt: hoursAgo(24 * 3), source: "it-system", payloadHash: "h-008" },
  { id: "EV-009", employeeId: "E-1042", stepKey: "ob_badge_issued", type: "completed", occurredAt: hoursAgo(24 * 2), recordedAt: hoursAgo(24 * 2), source: "facilities-system", payloadHash: "h-009" },
  { id: "EV-010", employeeId: "E-1042", stepKey: "ob_induction_complete", type: "completed", occurredAt: hoursAgo(24), recordedAt: hoursAgo(24), source: "hr-system", payloadHash: "h-010" },

  // E-1043 Daniel Okonkwo (onboarding, visa_processing, start in 16 days)
  { id: "EV-101", employeeId: "E-1043", stepKey: "ob_offer_signed", type: "completed", occurredAt: hoursAgo(24 * 8), recordedAt: hoursAgo(24 * 8), source: "hr-system", payloadHash: "h-101" },
  { id: "EV-102", employeeId: "E-1043", stepKey: "ob_passport_upload", type: "completed", occurredAt: hoursAgo(24 * 7), recordedAt: hoursAgo(24 * 7), source: "immigration-portal", payloadHash: "h-102" },
  { id: "EV-103", employeeId: "E-1043", stepKey: "ob_visa_application", type: "started", occurredAt: hoursAgo(24 * 7), recordedAt: hoursAgo(24 * 7), source: "immigration-portal", payloadHash: "h-103" },

  // E-1044 Aisha Rahman (mobility, effective_date, 4 days past)
  { id: "EV-201", employeeId: "E-1044", stepKey: "mb_transfer_signed", type: "completed", occurredAt: hoursAgo(24 * 20), recordedAt: hoursAgo(24 * 20), source: "hr-system", payloadHash: "h-201" },
  { id: "EV-202", employeeId: "E-1044", stepKey: "mb_release_handover", type: "completed", occurredAt: hoursAgo(24 * 12), recordedAt: hoursAgo(24 * 12), source: "hr-system", payloadHash: "h-202" },
  { id: "EV-203", employeeId: "E-1044", stepKey: "mb_asset_return", type: "completed", occurredAt: hoursAgo(24 * 10), recordedAt: hoursAgo(24 * 10), source: "facilities-system", payloadHash: "h-203" },
  { id: "EV-204", employeeId: "E-1044", stepKey: "mb_role_access", type: "started", occurredAt: hoursAgo(24 * 4), recordedAt: hoursAgo(24 * 4), source: "it-system", payloadHash: "h-204" },
  { id: "EV-205", employeeId: "E-1044", stepKey: "mb_payroll_change", type: "started", occurredAt: hoursAgo(24 * 4), recordedAt: hoursAgo(24 * 4), source: "payroll-system", payloadHash: "h-205" },
  { id: "EV-206", employeeId: "E-1044", stepKey: "mb_dual_reporting", type: "waiting_owner", occurredAt: hoursAgo(24 * 4), recordedAt: hoursAgo(24 * 4), source: "hr-system", payloadHash: "h-206" },

  // E-1045 James Park (onboarding, first_day, yesterday)
  { id: "EV-301", employeeId: "E-1045", stepKey: "ob_offer_signed", type: "completed", occurredAt: hoursAgo(24 * 18), recordedAt: hoursAgo(24 * 18), source: "hr-system", payloadHash: "h-301" },
  { id: "EV-302", employeeId: "E-1045", stepKey: "ob_passport_upload", type: "completed", occurredAt: hoursAgo(24 * 16), recordedAt: hoursAgo(24 * 16), source: "immigration-portal", payloadHash: "h-302" },
  { id: "EV-303", employeeId: "E-1045", stepKey: "ob_visa_application", type: "completed", occurredAt: hoursAgo(24 * 14), recordedAt: hoursAgo(24 * 14), source: "immigration-portal", payloadHash: "h-303" },
  { id: "EV-304", employeeId: "E-1045", stepKey: "ob_visa_approval", type: "completed", occurredAt: hoursAgo(24 * 9), recordedAt: hoursAgo(24 * 9), source: "immigration-portal", payloadHash: "h-304" },
  { id: "EV-305", employeeId: "E-1045", stepKey: "ob_flight_booked", type: "completed", occurredAt: hoursAgo(24 * 8), recordedAt: hoursAgo(24 * 8), source: "mobility-system", payloadHash: "h-305" },
  { id: "EV-306", employeeId: "E-1045", stepKey: "ob_housing_arranged", type: "completed", occurredAt: hoursAgo(24 * 8), recordedAt: hoursAgo(24 * 8), source: "mobility-system", payloadHash: "h-306" },
  { id: "EV-307", employeeId: "E-1045", stepKey: "ob_kit_issued", type: "completed", occurredAt: hoursAgo(24 * 2), recordedAt: hoursAgo(24 * 2), source: "it-system", payloadHash: "h-307" },
  { id: "EV-308", employeeId: "E-1045", stepKey: "ob_access_provisioned", type: "started", occurredAt: hoursAgo(24 * 2), recordedAt: hoursAgo(24 * 2), source: "it-system", payloadHash: "h-308" },
  { id: "EV-309", employeeId: "E-1045", stepKey: "ob_badge_issued", type: "completed", occurredAt: hoursAgo(24), recordedAt: hoursAgo(24), source: "facilities-system", payloadHash: "h-309" },

  // E-1046 Sara Kovač (mobility, handover, effective in 10 days)
  { id: "EV-401", employeeId: "E-1046", stepKey: "mb_transfer_signed", type: "completed", occurredAt: hoursAgo(24 * 30), recordedAt: hoursAgo(24 * 30), source: "hr-system", payloadHash: "h-401" },
  { id: "EV-402", employeeId: "E-1046", stepKey: "mb_release_handover", type: "started", occurredAt: hoursAgo(24 * 6), recordedAt: hoursAgo(24 * 6), source: "hr-system", payloadHash: "h-402" },
];

export const serviceRequests: ServiceRequest[] = [
  {
    id: "SR-2024-091",
    ref: "SR-2024-091",
    employeeId: "E-1042",
    type: "it_kit",
    ownerGroup: "IT",
    assignee: "O-IT-1",
    status: "in_progress",
    openedAt: hoursAgo(24 * 3),
    slaHours: 24,
    reassignCount: 1,
    returnCount: 0,
    idempotencyKey: "idm-E1042-it_kit-20241016",
  },
  {
    id: "SR-2024-094",
    ref: "SR-2024-094",
    employeeId: "E-1043",
    type: "visa",
    ownerGroup: "Immigration",
    assignee: "O-IMM-1",
    status: "in_progress",
    openedAt: hoursAgo(24 * 7),
    slaHours: 72,
    reassignCount: 0,
    returnCount: 0,
    idempotencyKey: "idm-E1043-visa-20241012",
  },
  {
    id: "SR-2024-098",
    ref: "SR-2024-098",
    employeeId: "E-1044",
    type: "payroll",
    ownerGroup: "Payroll",
    assignee: "O-PAY-1",
    status: "in_progress",
    openedAt: hoursAgo(24 * 4),
    slaHours: 48,
    reassignCount: 0,
    returnCount: 1,
    idempotencyKey: "idm-E1044-payroll-20241015",
  },
  {
    // A fresh IT request in `submitted` state — lets the service owner
    // demonstrate the Acknowledge → Start work flow on a real request.
    id: "SR-2024-099",
    ref: "SR-2024-099",
    employeeId: "E-1045",
    type: "it_kit",
    ownerGroup: "IT",
    assignee: "O-IT-1",
    status: "submitted",
    openedAt: hoursAgo(6),
    slaHours: 24,
    reassignCount: 0,
    returnCount: 0,
    idempotencyKey: "idm-E1045-it_kit-20241019",
  },
];

export const pulseResponses: PulseResponse[] = [
  {
    id: "PS-001",
    employeeId: "E-1042",
    stage: "first_week",
    score: 2,
    commentRef: "PC-001",
    commentText: "Nobody told me my laptop was delayed. I found out by asking.",
    consentId: "CN-001",
    createdAt: hoursAgo(20),
  },
  {
    id: "PS-002",
    employeeId: "E-1045",
    stage: "first_day",
    score: 4,
    consentId: "CN-002",
    createdAt: hoursAgo(6),
  },
];

export const policies: PolicyChunk[] = [
  {
    id: "POL-RELOC-EN-1", docSlug: "relocation-policy", title: "Relocation Policy", titleAr: "سياسة الانتقال",
    section: "allowance", effectiveDate: "2024-01-01", reviewDate: "2025-12-31", lang: "en", pairId: "POL-RELOC-PAIR-1",
    text: "New joiners relocating to the UAE receive a relocation allowance of AED 14,000 for single employees and AED 22,000 for employees with dependants. The allowance is paid in two instalments: 50% within 14 days of arrival, and 50% upon completion of the 90-day check-in. Allowance is forfeited if the employee resigns within 12 months.",
  },
  {
    id: "POL-RELOC-AR-1", docSlug: "relocation-policy", title: "Relocation Policy", titleAr: "سياسة الانتقال",
    section: "allowance", effectiveDate: "2024-01-01", reviewDate: "2025-12-31", lang: "ar", pairId: "POL-RELOC-PAIR-1",
    text: "يحصل الموظفون الجدد الذين ينتقلون إلى الإمارات على بدل انتقال بقيمة 14,000 درهم إماراتي للموظفين العزاب و22,000 درهم إماراتي للموظفين ذوي المعالين. يُدفع البدل على دفعتين: 50% خلال 14 يوماً من الوصول، و50% عند إكمال مراجعة 90 يوماً. يُلغى البدل إذا استقال الموظف خلال 12 شهراً.",
  },
  {
    id: "POL-RELOC-EN-2", docSlug: "relocation-policy", title: "Relocation Policy", titleAr: "سياسة الانتقال",
    section: "housing", effectiveDate: "2024-01-01", reviewDate: "2025-12-31", lang: "en", pairId: "POL-RELOC-PAIR-2",
    text: "Temporary housing is provided for up to 30 days from arrival, free of charge. Permanent housing must be secured by the employee within this window. Extensions beyond 30 days require HRBP approval and incur a daily charge of AED 350 deducted from the relocation allowance.",
  },
  {
    id: "POL-RELOC-AR-2", docSlug: "relocation-policy", title: "Relocation Policy", titleAr: "سياسة الانتقال",
    section: "housing", effectiveDate: "2024-01-01", reviewDate: "2025-12-31", lang: "ar", pairId: "POL-RELOC-PAIR-2",
    text: "يُوفَّر سكن مؤقت لمدة تصل إلى 30 يوماً من تاريخ الوصول، مجاناً. يجب على الموظف تأمين سكن دائم خلال هذه الفترة. التمديد بعد 30 يوماً يتطلب موافقة شريك الموارد البشرية وتترتب عليه رسوم يومية قدرها 350 درهم تُخصم من بدل الانتقال.",
  },
  {
    id: "POL-RELOC-EN-3", docSlug: "relocation-policy", title: "Relocation Policy", titleAr: "سياسة الانتقال",
    section: "travel", effectiveDate: "2024-01-01", reviewDate: "2025-12-31", lang: "en", pairId: "POL-RELOC-PAIR-3",
    text: "The company books and pays for one economy-class flight to the UAE for the employee and each accompanying dependant listed on the visa application. Flight booking is initiated within 48 hours of visa approval. Changes to flight dates within 72 hours of departure incur a personal charge.",
  },
  {
    id: "POL-RELOC-AR-3", docSlug: "relocation-policy", title: "Relocation Policy", titleAr: "سياسة الانتقال",
    section: "travel", effectiveDate: "2024-01-01", reviewDate: "2025-12-31", lang: "ar", pairId: "POL-RELOC-PAIR-3",
    text: "تقوم الشركة بحجز ودفع تكلفة رحلة جوية واحدة من الدرجة الاقتصادية إلى الإمارات للموظف ولكل معالٍ مرافق مُدرَج في طلب التأشيرة. يُباشَر الحجز خلال 48 ساعة من الموافقة على التأشيرة. أي تعديل على موعد الرحلة خلال 72 ساعة من وقت الإقلاع يتحمّل الموظف تكلفتَه.",
  },
  {
    id: "POL-IMM-EN-1", docSlug: "immigration-policy", title: "Immigration Policy", titleAr: "سياسة الهجرة",
    section: "documents", effectiveDate: "2024-03-01", reviewDate: "2025-03-31", lang: "en", pairId: "POL-IMM-PAIR-1",
    text: "Employees must upload a clear scan of their passport (biographical page), passport-sized photograph (white background), and educational certificates attested by the UAE embassy in the issuing country. Dependants' visas require marriage and birth certificates, also attested. Incomplete document uploads delay visa application by up to 5 working days.",
  },
  {
    id: "POL-IMM-AR-1", docSlug: "immigration-policy", title: "Immigration Policy", titleAr: "سياسة الهجرة",
    section: "documents", effectiveDate: "2024-03-01", reviewDate: "2025-03-31", lang: "ar", pairId: "POL-IMM-PAIR-1",
    text: "على الموظفين رفع نسخة واضحة من جواز السفر (الصفحة البيوغرافية)، وصورة شخصية بحجم جواز السفر (بخلفية بيضاء)، وشهاداتهم الأكاديمية مُصدّقة من سفارة الإمارات في بلد الإصدار. أما تأشيرات المعالين فتتطلب شهادات زواج وشهادات ميلاد مُصدّقة أيضاً. أي رفعٍ ناقص للوثائق يؤخّر معاملة التأشيرة بما يصل إلى 5 أيام عمل.",
  },
  {
    id: "POL-IMM-EN-2", docSlug: "immigration-policy", title: "Immigration Policy", titleAr: "سياسة الهجرة",
    section: "visa", effectiveDate: "2024-03-01", reviewDate: "2025-03-31", lang: "en", pairId: "POL-IMM-PAIR-2",
    text: "Visa application is submitted by the Immigration team within 5 working days of complete document upload. Standard processing time is 7-10 working days for residency employment visas. Expediting is available only for roles marked business-critical and requires HRBP approval.",
  },
  {
    id: "POL-IMM-AR-2", docSlug: "immigration-policy", title: "Immigration Policy", titleAr: "سياسة الهجرة",
    section: "visa", effectiveDate: "2024-03-01", reviewDate: "2025-03-31", lang: "ar", pairId: "POL-IMM-PAIR-2",
    text: "يُقدَّم طلب التأشيرة من قِبَل فريق الهجرة خلال 5 أيام عمل من تاريخ اكتمال رفع الوثائق. مدة المعالجة القياسية لتأشيرات الإقامة للعمل تتراوح بين 7 و10 أيام عمل. لا تتاح المعالجة المستعجلة إلا للوظائف المُصنّفة حرجة للأعمال، وتتطلب موافقة شريك الموارد البشرية.",
  },
  {
    id: "POL-IMM-EN-3", docSlug: "immigration-policy", title: "Immigration Policy", titleAr: "سياسة الهجرة",
    section: "timeline", effectiveDate: "2024-03-01", reviewDate: "2025-03-31", lang: "en", pairId: "POL-IMM-PAIR-3",
    text: "Visa approval must be received before flight booking, housing arrangement, ID badge issuance, and IT kit issuance. The Immigration team is the single owner of visa status. Employees should not book personal travel until visa approval is confirmed in writing. Visa rejections are appealable within 14 days.",
  },
  {
    id: "POL-IMM-AR-3", docSlug: "immigration-policy", title: "Immigration Policy", titleAr: "سياسة الهجرة",
    section: "timeline", effectiveDate: "2024-03-01", reviewDate: "2025-03-31", lang: "ar", pairId: "POL-IMM-PAIR-3",
    text: "يجب استلام موافقة التأشيرة قبل حجز الرحلة وتأمين السكن وإصدار بطاقة الهوية وإصدار عُدّة تكنولوجيا المعلومات. فريق الهجرة هو المرجع الوحيد لحالة التأشيرة. لا يُسمح للموظفين بحجز سفرٍ شخصي قبل التأكُّد من الموافقة على التأشيرة كتابةً. تُقبل الطعون على رفض التأشيرة خلال 14 يوماً.",
  },
  {
    id: "POL-IT-EN-1", docSlug: "it-policy", title: "IT Provisioning Policy", titleAr: "سياسة توفير تقنية المعلومات",
    section: "kit", effectiveDate: "2024-02-01", reviewDate: "2025-02-28", lang: "en", pairId: "POL-IT-PAIR-1",
    text: "New joiners receive a standard IT kit on day 1: a Dell Latitude laptop, iPhone 13 (corporate line), and USB-C dock. Cabin Crew receive an iPad mini in addition. Kit is issued at the DXB or AUH IT counter between 08:00 and 16:00. Delays beyond 24 hours from scheduled start time must be reported to the IT Provisioning Lead.",
  },
  {
    id: "POL-IT-AR-1", docSlug: "it-policy", title: "IT Provisioning Policy", titleAr: "سياسة توفير تقنية المعلومات",
    section: "kit", effectiveDate: "2024-02-01", reviewDate: "2025-02-28", lang: "ar", pairId: "POL-IT-PAIR-1",
    text: "يستلم الموظفون الجدد عُدّة تكنولوجيا معلومات قياسية في اليوم الأول: حاسوب محمول Dell Latitude، وهاتف iPhone 13 (بخط الشركة)، ومحطة وصل USB-C. ويستلم طاقم المقصورة جهاز iPad mini إضافياً. تُسلَّم العُدّة في مكتب تقنية المعلومات بدبي أو أبوظبي بين الساعة 08:00 و16:00. يجب إبلاغ مسؤول توفير تقنية المعلومات بأي تأخير يتجاوز 24 ساعة من وقت البدء المجدول.",
  },
  {
    id: "POL-IT-EN-2", docSlug: "it-policy", title: "IT Provisioning Policy", titleAr: "سياسة توفير تقنية المعلومات",
    section: "access", effectiveDate: "2024-02-01", reviewDate: "2025-02-28", lang: "en", pairId: "POL-IT-PAIR-2",
    text: "Systems access is provisioned within 48 hours of kit issuance, based on the role profile defined by HR. Standard access includes email, HR self-service, the cabin crew rostering system, and the learning portal. Elevated access (finance, safety reporting) requires manager approval and is provisioned separately.",
  },
  {
    id: "POL-IT-AR-2", docSlug: "it-policy", title: "IT Provisioning Policy", titleAr: "سياسة توفير تقنية المعلومات",
    section: "access", effectiveDate: "2024-02-01", reviewDate: "2025-02-28", lang: "ar", pairId: "POL-IT-PAIR-2",
    text: "يُتاح الوصول إلى الأنظمة خلال 48 ساعة من تسليم العُدّة، استناداً إلى الملف الوظيفي الذي تحدّده الموارد البشرية. يشمل الوصول القياسي البريد الإلكتروني، والخدمة الذاتية للموارد البشرية، ونظام جداول طاقم المقصورة، ومنصة التعلم. أما الوصول الموسّع (المالية، تقارير السلامة) فيتطلب موافقة المدير ويُتاح بشكل منفصل.",
  },
  {
    id: "POL-OB-EN-1", docSlug: "onboarding-policy", title: "Onboarding Policy", titleAr: "سياسة الالتحاق",
    section: "induction", effectiveDate: "2024-01-15", reviewDate: "2025-06-30", lang: "en", pairId: "POL-OB-PAIR-1",
    text: "All new joiners complete a 2-day induction within their first week. Induction covers company values, code of conduct, safety basics, and an introduction to the buddy programme. Induction is scheduled by HR after the ID badge is issued and must be completed before the first operational shift.",
  },
  {
    id: "POL-OB-AR-1", docSlug: "onboarding-policy", title: "Onboarding Policy", titleAr: "سياسة الالتحاق",
    section: "induction", effectiveDate: "2024-01-15", reviewDate: "2025-06-30", lang: "ar", pairId: "POL-OB-PAIR-1",
    text: "يُكمل جميع الموظفين الجدد برنامج تعريف مدّته يومان خلال أسبوعهم الأول. يغطّي البرنامج قيم الشركة، وميثاق السلوك، وأساسيات السلامة، وتعريفاً ببرنامج المرافق. يُجدول قسم الموارد البشرية البرنامجَ بعد إصدار بطاقة الهوية، ويجب إكماله قبل أول وردية تشغيلية.",
  },
  {
    id: "POL-OB-EN-2", docSlug: "onboarding-policy", title: "Onboarding Policy", titleAr: "سياسة الالتحاق",
    section: "checkins", effectiveDate: "2024-01-15", reviewDate: "2025-06-30", lang: "en", pairId: "POL-OB-PAIR-2",
    text: "Formal check-ins occur at 30, 60, and 90 days. The 30-day check-in is a 30-minute conversation with the assigned HRBP and covers settling-in, role clarity, and any blockers. The 90-day review is with the line manager and HRBP and confirms successful completion of the probation period.",
  },
  {
    id: "POL-OB-AR-2", docSlug: "onboarding-policy", title: "Onboarding Policy", titleAr: "سياسة الالتحاق",
    section: "checkins", effectiveDate: "2024-01-15", reviewDate: "2025-06-30", lang: "ar", pairId: "POL-OB-PAIR-2",
    text: "تجري اللقاءات الرسمية في الأيام 30 و60 و90. لقاء اليوم الثلاثين محادثة مدّتها 30 دقيقة مع شريك الموارد البشرية المُعَيَّن، وتتناول الاستقرار ووضوح الدور وأي عوائق. أما مراجعة اليوم التسعين فتكون مع المدير المباشر وشريك الموارد البشرية وتُؤكد الإكمال الناجح لفترة الاختبار.",
  },
  {
    id: "POL-LRN-EN-1", docSlug: "learning-policy", title: "Learning Policy", titleAr: "سياسة التعلم",
    section: "mandatory", effectiveDate: "2024-04-01", reviewDate: "2025-04-30", lang: "en", pairId: "POL-LRN-PAIR-1",
    text: "Mandatory training must be booked within the first week and completed within 30 days of joining. Mandatory modules for Cabin Crew: Aviation Safety (GCAA-approved), Customer Service Excellence, Emergency Procedures, and Cultural Awareness. Each module is 4-8 hours and delivered in a classroom or simulator setting.",
  },
  {
    id: "POL-LRN-AR-1", docSlug: "learning-policy", title: "Learning Policy", titleAr: "سياسة التعلم",
    section: "mandatory", effectiveDate: "2024-04-01", reviewDate: "2025-04-30", lang: "ar", pairId: "POL-LRN-PAIR-1",
    text: "يجب حجز التدريب الإلزامي خلال الأسبوع الأول وإكماله خلال 30 يوماً من الالتحاق. الوحدات الإلزامية لطاقم المقصورة: السلامة Aviation Safety (معتمدة من الهيئة العامة للطيران المدني)، وتميّز خدمة العملاء، وإجراءات الطوارئ، والوعي الثقافي. مدة كل وحدة من 4 إلى 8 ساعات وتُقدَّم في قاعة دراسية أو محاكاة.",
  },
  {
    id: "POL-MOB-EN-1", docSlug: "mobility-policy", title: "Internal Mobility Policy", titleAr: "سياسة التنقل الداخلي",
    section: "transfer", effectiveDate: "2024-05-01", reviewDate: "2025-05-31", lang: "en", pairId: "POL-MOB-PAIR-1",
    text: "Internal transfers require signed approval from both the releasing and receiving managers, plus HRBP concurrence. The transfer is effective on the first day of the next payroll cycle. Employees retain their tenure, leave balance, and benefits. Probation in the new role is 60 days for lateral moves and 90 days for promotions.",
  },
  {
    id: "POL-MOB-AR-1", docSlug: "mobility-policy", title: "Internal Mobility Policy", titleAr: "سياسة التنقل الداخلي",
    section: "transfer", effectiveDate: "2024-05-01", reviewDate: "2025-05-31", lang: "ar", pairId: "POL-MOB-PAIR-1",
    text: "تتطلب التنقلات الداخلية موافقة موقّعة من المدير المُخلّي والمدير المُستقبِل، إضافةً إلى موافقة شريك الموارد البشرية. يسري التنقل في اليوم الأول من دورة الرواتب التالية. يحتفظ الموظفون بأقدميتهم ورصيد إجازاتهم ومزاياتهم. فترة الاختبار في الدور الجديد هي 60 يوماً للتنقلات الأفقية و90 يوماً للترقيات.",
  },
  {
    id: "POL-MOB-EN-2", docSlug: "mobility-policy", title: "Internal Mobility Policy", titleAr: "سياسة التنقل الداخلي",
    section: "handover", effectiveDate: "2024-05-01", reviewDate: "2025-05-31", lang: "en", pairId: "POL-MOB-PAIR-2",
    text: "The releasing manager must complete a structured handover within 5 working days of transfer approval. The handover includes ongoing projects, key contacts, pending approvals, and team performance notes. Handover is documented in the mobility system and acknowledged by the receiving manager.",
  },
  {
    id: "POL-MOB-AR-2", docSlug: "mobility-policy", title: "Internal Mobility Policy", titleAr: "سياسة التنقل الداخلي",
    section: "handover", effectiveDate: "2024-05-01", reviewDate: "2025-05-31", lang: "ar", pairId: "POL-MOB-PAIR-2",
    text: "يجب على المدير المُخلّي إكمال تسليم منظَّم خلال 5 أيام عمل من تاريخ الموافقة على التنقل. يشمل التسليم المشاريع الجارية، وأبرز جهات الاتصال، والموافقات المعلّقة، وملاحظات أداء الفريق. يُوثَّق التسليم في نظام التنقل ويُقرّ به المدير المُستقبِل.",
  },
  {
    id: "POL-PAY-EN-1", docSlug: "payroll-policy", title: "Payroll Policy", titleAr: "سياسة الرواتب",
    section: "transfer", effectiveDate: "2024-01-01", reviewDate: "2025-12-31", lang: "en", pairId: "POL-PAY-PAIR-1",
    text: "Payroll changes for internal transfers must be confirmed at least 7 calendar days before the payroll cycle cutoff (25th of each month). Changes received after the cutoff apply to the following cycle. Allowance adjustments, banking details, and tax code updates all follow this rule. Payroll cutoffs are non-negotiable.",
  },
  {
    id: "POL-PAY-AR-1", docSlug: "payroll-policy", title: "Payroll Policy", titleAr: "سياسة الرواتب",
    section: "transfer", effectiveDate: "2024-01-01", reviewDate: "2025-12-31", lang: "ar", pairId: "POL-PAY-PAIR-1",
    text: "يجب تأكيد تعديلات الرواتب الخاصة بالتنقلات الداخلية قبل 7 أيام تقويمية على الأقل من موعد قطع دورة الرواتب (اليوم 25 من كل شهر). تُطبَّق التعديلات المُستلَمة بعد موعد القطع على الدورة التالية. تخضع تعديلات البدلات والبيانات المصرفية وتحديثات الرمز الضريبي جميعها لهذه القاعدة. مواعيد قطع الرواتب غير قابلة للتفاوض.",
  },
  {
    id: "POL-FAC-EN-1", docSlug: "facilities-policy", title: "Facilities Policy", titleAr: "سياسة المرافق",
    section: "badge", effectiveDate: "2024-02-01", reviewDate: "2025-02-28", lang: "en", pairId: "POL-FAC-PAIR-1",
    text: "ID badges are issued at the DXB or AUH facilities counter on day 1, between 07:00 and 18:00. Badges require visa approval and a passport-sized photograph. Lost badges incur a AED 50 replacement charge. Badges must be returned on the last working day for leavers and movers.",
  },
  {
    id: "POL-FAC-AR-1", docSlug: "facilities-policy", title: "Facilities Policy", titleAr: "سياسة المرافق",
    section: "badge", effectiveDate: "2024-02-01", reviewDate: "2025-02-28", lang: "ar", pairId: "POL-FAC-PAIR-1",
    text: "تُصدَر بطاقات الهوية في مكتب المرافق بدبي أو أبوظبي في اليوم الأول، بين الساعة 07:00 و18:00. تتطلب البطاقات موافقة التأشيرة وصورة شخصية بحجم جواز السفر. تترتّب على فقدان البطاقة رسوم استبدال قدرها 50 درهماً. يجب إعادة البطاقات في آخر يوم عمل للمغادرين والمتنقلين.",
  },
];

export interface ConsentRecord {
  id: string;
  employeeId: string;
  purpose: "journey_assistance" | "pulse_capture" | "share_pulse_summary" | "comment_retention" | "aggregate_analytics" | "manager_visibility";
  granted: boolean;
  grantedAt: string;
  revokedAt?: string;
  version: string;
  textHash: string;
}

export const consentRecords: ConsentRecord[] = [
  { id: "CN-000-E1042", employeeId: "E-1042", purpose: "journey_assistance", granted: true, grantedAt: hoursAgo(24 * 12), version: "v1", textHash: "th-j" },
  { id: "CN-001", employeeId: "E-1042", purpose: "pulse_capture", granted: true, grantedAt: hoursAgo(20), version: "v1", textHash: "th-p" },
  { id: "CN-001-E1042-share", employeeId: "E-1042", purpose: "share_pulse_summary", granted: false, grantedAt: hoursAgo(20), version: "v1", textHash: "th-s" },
  { id: "CN-001-E1042-comm", employeeId: "E-1042", purpose: "comment_retention", granted: true, grantedAt: hoursAgo(20), version: "v1", textHash: "th-c" },
  { id: "CN-000-E1045", employeeId: "E-1045", purpose: "journey_assistance", granted: true, grantedAt: hoursAgo(24 * 18), version: "v1", textHash: "th-j" },
  { id: "CN-002", employeeId: "E-1045", purpose: "pulse_capture", granted: true, grantedAt: hoursAgo(6), version: "v1", textHash: "th-p" },
];

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  subject: string;
  lawfulBasis: string;
  requestId: string;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export const auditEvents: AuditEvent[] = [];

export function getConsent(employeeId: string, purpose: ConsentRecord["purpose"]): boolean {
  const records = consentRecords
    .filter((r) => r.employeeId === employeeId && r.purpose === purpose)
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  if (records.length === 0) {
    if (purpose === "journey_assistance") return true;
    if (purpose === "manager_visibility") return true;
    if (purpose === "aggregate_analytics") return true;
    return false;
  }
  const latest = records[0];
  return latest.granted && !latest.revokedAt;
}

export function getOwner(id: string): Owner | undefined {
  return [...owners, ...managers, ...hrbps].find((o) => o.id === id);
}

export { hoursAgo, hoursAhead };
