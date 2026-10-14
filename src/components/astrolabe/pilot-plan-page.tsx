"use client";

/* ============================================================
   ASTROLABE — Pilot Plan Page (PRD §25)
   Pilot readiness surface: cohort, 12-week timeline in 4 phases,
   named owners matrix, success metrics, rollback plan, kill switch
   ownership, and exit criteria for scale-up.
   ============================================================ */

import { motion } from "framer-motion";
import {
  ClipboardList,
  Calendar,
  Users,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Power,
  Flag,
  Target,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/* ---------- Static data ---------- */

interface Phase {
  weeks: string;
  weeksAr: string;
  title: string;
  titleAr: string;
  steps: string[];
  stepsAr: string[];
}

const PHASES: Phase[] = [
  {
    weeks: "Weeks 1-2",
    weeksAr: "الأسابيع 1-2",
    title: "Onboarding setup",
    titleAr: "إعداد الالتحاق",
    steps: [
      "Named owners per request type",
      "Journey map validated",
      "Policy corpus owner identified",
    ],
    stepsAr: [
      "مالك مسمّى لكل نوع طلب",
      "التحقق من خريطة الرحلة",
      "تحديد مالك نص السياسات",
    ],
  },
  {
    weeks: "Weeks 3-4",
    weeksAr: "الأسابيع 3-4",
    title: "Dry run",
    titleAr: "تشغيل تجريبي",
    steps: [
      "Synthetic data only",
      "HRBP training",
      "Degraded-mode rehearsal",
    ],
    stepsAr: [
      "بيانات تركيبية فقط",
      "تدريب شركاء الموارد",
      "بروفة الوضع المتدهور",
    ],
  },
  {
    weeks: "Weeks 5-10",
    weeksAr: "الأسابيع 5-10",
    title: "Live pilot",
    titleAr: "التجربة الحية",
    steps: [
      "50 joiners",
      "Daily HRBP review",
      "Weekly threshold tuning",
    ],
    stepsAr: [
      "50 ملتحقاً",
      "مراجعة شريك الموارد يومياً",
      "ضبط العتبات أسبوعياً",
    ],
  },
  {
    weeks: "Weeks 11-12",
    weeksAr: "الأسابيع 11-12",
    title: "Evaluation",
    titleAr: "التقييم",
    steps: [
      "Metrics review",
      "Exit criteria",
      "Scale-up decision",
    ],
    stepsAr: [
      "مراجعة المقاييس",
      "معايير الخروج",
      "قرار التوسّع",
    ],
  },
];

interface OwnerMatrixRow {
  type: string;
  typeAr: string;
  owner: string;
  ownerAr: string;
  backup: string;
  backupAr: string;
  signedOff: boolean;
}

const OWNER_MATRIX: OwnerMatrixRow[] = [
  { type: "it_kit", typeAr: "عُدّة تقنية", owner: "Ahmed Al-Rashid (IT)", ownerAr: "أحمد الراشد (تقنية)", backup: "Priya Nair", backupAr: "بريا ناير", signedOff: true },
  { type: "system_access", typeAr: "وصول الأنظمة", owner: "Priya Nair (IT)", ownerAr: "بريا ناير (تقنية)", backup: "Ahmed Al-Rashid", backupAr: "أحمد الراشد", signedOff: true },
  { type: "visa", typeAr: "تأشيرة", owner: "Saeed Al-Marri (Immigration)", ownerAr: "سعيد المري (هجرة)", backup: "Rania Hassan", backupAr: "رانيا حسن", signedOff: true },
  { type: "relocation", typeAr: "انتقال", owner: "Rania Hassan (Mobility)", ownerAr: "رانيا حسن (تنقل)", backup: "Saeed Al-Marri", backupAr: "سعيد المري", signedOff: true },
  { type: "payroll", typeAr: "رواتب", owner: "Mona Said (Payroll)", ownerAr: "منى سعيد (رواتب)", backup: "Fatima Al-Mansouri", backupAr: "فاطمة المنصوري", signedOff: true },
  { type: "training", typeAr: "تدريب", owner: "Lina Khoury (Learning)", ownerAr: "لينا خوري (تعلم)", backup: "Fatima Al-Mansouri", backupAr: "فاطمة المنصوري", signedOff: true },
  { type: "facilities", typeAr: "مرافق", owner: "Omar Farouk (Facilities)", ownerAr: "عمر فاروق (مرافق)", backup: "Lina Khoury", backupAr: "لينا خوري", signedOff: true },
  { type: "manager_handover", typeAr: "تسليم المدير", owner: "Fatima Al-Mansouri (HR)", ownerAr: "فاطمة المنصوري (موارد)", backup: "Khalid Idris", backupAr: "خالد إدريس", signedOff: true },
];

interface SuccessMetricRow {
  metric: string;
  metricAr: string;
  target: string;
  targetAr: string;
  measurement: string;
  measurementAr: string;
}

const SUCCESS_METRICS: SuccessMetricRow[] = [
  { metric: "Time-to-first-answer", metricAr: "زمن أول إجابة", target: "< 60s", targetAr: "< 60 ث", measurement: "Ask endpoint latency", measurementAr: "زمن استجابة نقطة Ask" },
  { metric: "% requests complete on arrival", metricAr: "% طلبات مكتملة عند الوصول", target: "> 90%", targetAr: "> 90%", measurement: "Zero-clarification rate", measurementAr: "نسبة الصفر-توضيح" },
  { metric: "Median lead time before escalation", metricAr: "وسيط زمن التصعيد", target: "> 2 days", targetAr: "> يومين", measurement: "Engine signal vs complaint event", measurementAr: "إشارة المحرك مقابل حدث الشكوى" },
  { metric: "Stage breach rate", metricAr: "نسبة خرق المرحلة", target: "< 15%", targetAr: "< 15%", measurement: "Assessments in Friction/Blocked", measurementAr: "تقييمات في الاحتكاك/المحظور" },
  { metric: "Employee trust score", metricAr: "درجة ثقة الموظف", target: "> 4.0/5", targetAr: "> 4.0/5", measurement: "Pulse at day 30", measurementAr: "نبضة اليوم 30" },
  { metric: "Zero privacy incidents", metricAr: "صفر حوادث خصوصية", target: "0", targetAr: "0", measurement: "Audit chain verification", measurementAr: "التحقق من سلسلة التدقيق" },
];

const EXIT_CRITERIA = [
  { en: "All success metrics met for 4 consecutive weeks", ar: "تحقيق جميع مقاييس النجاح لمدة 4 أسابيع متتالية" },
  { en: "Zero privacy incidents", ar: "صفر حوادث خصوصية" },
  { en: "HRBP trust score > 4.0/5", ar: "درجة ثقة شريك الموارد > 4.0/5" },
  { en: "Zero-clarification rate > 90%", ar: "نسبة الصفر-توضيح > 90%" },
  { en: "Audit chain verification passes 100%", ar: "التحقق من سلسلة التدقيق بنسبة 100%" },
];

/* ============================================================
   Component
   ============================================================ */
export function PilotPlanPage() {
  const locale = useAppStore((s) => s.locale);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const isAr = locale === "ar";

  return (
    <div dir={dir} className="max-w-[900px] mx-auto">
      {/* Header */}
      <header className="mb-5">
        <div
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--brand-400)" }}
        >
          <ClipboardList className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{isAr ? "خطة التجربة" : "Pilot plan"}</span>
        </div>
        <h2 className="mt-2 text-[22px] sm:text-[26px] font-semibold tracking-tight" style={{ color: "var(--text-hi)" }}>
          {isAr ? "جاهزية التجربة — 12 أسبوعاً" : "Pilot readiness — 12 weeks"}
        </h2>
      </header>

      {/* Overview */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Users className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "نظرة عامة" : "Pilot overview"}
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { labelEn: "New joiners", labelAr: "ملتحقون جدد", value: "50" },
            { labelEn: "Movers", labelAr: "متنقلون", value: "20" },
            { labelEn: "HRBPs", labelAr: "شركاء الموارد", value: "3" },
            { labelEn: "Service owners", labelAr: "مالكو الخدمة", value: "4" },
            { labelEn: "Locations", labelAr: "المواقع", value: "DXB + AUH" },
            { labelEn: "Cohort size", labelAr: "حجم الفوج", value: "70" },
            { labelEn: "Duration", labelAr: "المدة", value: "12 wks" },
            { labelEn: "Phases", labelAr: "المراحل", value: "4" },
          ].map((s) => (
            <div key={s.labelEn} className="ast-card-2 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                {isAr ? s.labelAr : s.labelEn}
              </p>
              <p className="text-[18px] font-semibold tabular mt-1" style={{ color: "var(--text-hi)" }} dir="ltr">
                {s.value}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[13px] mt-4 leading-relaxed" style={{ color: "var(--text-mid)" }}>
          {isAr
            ? "فوج: 50 ملتحقاً جديداً + 20 متنقلاً، 3 شركاء موارد، 4 مالكي خدمة، موقعان (DXB + AUH)."
            : "Cohort: 50 new joiners + 20 movers, 3 HRBPs, 4 service owners, 2 locations (DXB + AUH)."}
        </p>
      </section>

      {/* Timeline */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Calendar className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "الجدول الزمني" : "Timeline"}
          </h3>
        </div>
        <ol className="space-y-3">
          {PHASES.map((p, i) => (
            <motion.li
              key={p.weeks}
              initial={{ opacity: 0, x: isAr ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, delay: i * 0.04 }}
              className="ast-card-2 p-4 flex flex-col sm:flex-row gap-3 sm:gap-4"
            >
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                  style={{ background: "var(--surface-3)", color: "var(--brand-400)" }}
                >
                  <span className="text-[13px] font-semibold tabular">{i + 1}</span>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] tabular" style={{ color: "var(--text-lo)" }}>
                    {isAr ? p.weeksAr : p.weeks}
                  </p>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--text-hi)" }}>
                    {isAr ? p.titleAr : p.title}
                  </p>
                </div>
              </div>
              <ul className="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {(isAr ? p.stepsAr : p.steps).map((s) => (
                  <li key={s} className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-mid)" }}>
                    <CheckCircle2 className="w-3 h-3" strokeWidth={2} style={{ color: "var(--status-steady)" }} />
                    {s}
                  </li>
                ))}
              </ul>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* Named owners matrix */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Users className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "مصفوفة المالكين المسمّين" : "Named owners matrix"}
          </h3>
        </div>
        <div className="rounded-[10px] overflow-x-auto" style={{ border: "1px solid var(--border)" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                <TableHead className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                  {isAr ? "نوع الطلب" : "Request type"}
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                  {isAr ? "المالك" : "Owner"}
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.12em] hidden sm:table-cell" style={{ color: "var(--text-lo)" }}>
                  {isAr ? "البديل" : "Backup"}
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.12em] text-right" style={{ color: "var(--text-lo)" }}>
                  {isAr ? "موقّع" : "Signed off"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {OWNER_MATRIX.map((row) => (
                <TableRow key={row.type} style={{ borderColor: "var(--border-soft)" }}>
                  <TableCell className="text-[12px] font-mono tabular" style={{ color: "var(--brand-400)" }}>
                    {row.type}
                  </TableCell>
                  <TableCell className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                    {isAr ? row.ownerAr : row.owner}
                  </TableCell>
                  <TableCell className="text-[12px] hidden sm:table-cell" style={{ color: "var(--text-mid)" }}>
                    {isAr ? row.backupAr : row.backup}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.signedOff ? (
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--status-steady)" }}>
                        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--status-watch)" }}>
                        <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-[11px] mt-3" style={{ color: "var(--text-lo)" }}>
          {isAr
            ? "كل نوع طلب له مالك مسمّى وبديل. التوقيع مطلوب قبل بدء التجربة الحية."
            : "Every request type has a named owner and a backup. Sign-off is required before the live pilot."}
        </p>
      </section>

      {/* Success metrics */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Target className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "مقاييس النجاح" : "Success metrics"}
          </h3>
        </div>
        <div className="rounded-[10px] overflow-x-auto" style={{ border: "1px solid var(--border)" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                <TableHead className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                  {isAr ? "المقياس" : "Metric"}
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-lo)" }}>
                  {isAr ? "الهدف" : "Target"}
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.12em] hidden sm:table-cell" style={{ color: "var(--text-lo)" }}>
                  {isAr ? "القياس" : "Measurement"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SUCCESS_METRICS.map((row) => (
                <TableRow key={row.metric} style={{ borderColor: "var(--border-soft)" }}>
                  <TableCell className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                    {isAr ? row.metricAr : row.metric}
                  </TableCell>
                  <TableCell className="text-[13px] tabular" style={{ color: "var(--brand-400)" }}>
                    {isAr ? row.targetAr : row.target}
                  </TableCell>
                  <TableCell className="text-[12px] hidden sm:table-cell" style={{ color: "var(--text-mid)" }}>
                    {isAr ? row.measurementAr : row.measurement}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Rollback plan + Kill switch ownership */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <section className="ast-card p-5 sm:p-6">
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
              style={{ background: "rgba(217,119,6,0.10)", color: "var(--status-watch)" }}
            >
              <Power className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {isAr ? "خطة التراجع" : "Rollback plan"}
            </h3>
          </div>
          <ul className="space-y-2">
            {(isAr
              ? [
                  "تراجع بأمر واحد للنشر السابق.",
                  "أعلام الميزات يمكنها قتل أي نظام فرعي فوراً.",
                  "بيانات التجربة معزولة وقابلة للمحو.",
                ]
              : [
                  "One-command rollback to previous deployment.",
                  "Feature flags can kill any subsystem instantly.",
                  "Pilot data is isolated and can be purged.",
                ]
            ).map((s, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-mid)" }}>
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-watch)", transform: isAr ? "scaleX(-1)" : undefined }} />
                {s}
              </li>
            ))}
          </ul>
        </section>

        <section className="ast-card p-5 sm:p-6">
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
              style={{ background: "rgba(220,38,38,0.10)", color: "var(--status-friction)" }}
            >
              <Zap className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {isAr ? "ملكية مفتاح الإيقاف" : "Kill switch ownership"}
            </h3>
          </div>
          <ul className="space-y-2">
            {(isAr
              ? [
                  "كل علم ميزة له مالك مسمّى.",
                  "المفتاح العام للموافقة مملوك لقسم الأمان.",
                  "مفتاح الإيقاف الشامل مملوك لدور الإدارة.",
                ]
              : [
                  "Each feature flag has a named owner.",
                  "The global approval key is owned by Security.",
                  "The global kill switch is owned by the Admin role.",
                ]
            ).map((s, idx) => (
              <li key={idx} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-mid)" }}>
                <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={1.75} style={{ color: "var(--status-friction)", transform: isAr ? "scaleX(-1)" : undefined }} />
                {s}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Exit criteria for scale-up */}
      <section
        className="ast-card p-5 sm:p-6 mb-5"
        style={{ borderColor: "rgba(201,162,39,0.32)", background: "linear-gradient(180deg, rgba(201,162,39,0.04), var(--surface-1))" }}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(201,162,39,0.12)", color: "var(--accent-500)" }}
          >
            <Flag className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--accent-500)" }}>
              {isAr ? "معايير الخروج للتوسّع" : "Exit criteria for scale-up"}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-mid)" }}>
              {isAr
                ? "كل المعايير التالية يجب أن تتحقق قبل التوسّع خارج الفوج."
                : "All criteria below must be met before scaling beyond the cohort."}
            </p>
          </div>
        </div>
        <ul className="space-y-2">
          {EXIT_CRITERIA.map((c, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 text-[13px]"
              style={{ color: "var(--text-hi)" }}
            >
              <span
                className="flex items-center justify-center w-5 h-5 rounded-full shrink-0 mt-0.5"
                style={{ background: "rgba(201,162,39,0.12)", color: "var(--accent-500)" }}
              >
                <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />
              </span>
              {isAr ? c.ar : c.en}
            </li>
          ))}
        </ul>
      </section>

      {/* Footer */}
      <p className="text-[11px] text-center tabular mt-4 inline-flex items-center justify-center gap-1.5 w-full" style={{ color: "var(--text-lo)" }}>
        <ShieldCheck className="w-3 h-3" strokeWidth={1.75} />
        {isAr
          ? "خطة التجربة · 12 أسبوعاً · 4 مراحل · 8 أنواع طلبات موقّعة"
          : "Pilot plan · 12 weeks · 4 phases · 8 request types signed off"}
      </p>
    </div>
  );
}
