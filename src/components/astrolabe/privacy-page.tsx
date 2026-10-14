"use client";

/* ============================================================
   ASTROLABE — Privacy Page (DPIA + retention schedule, PRD §15)
   A plain-language privacy surface for non-lawyers: what we hold,
   why, what we never do, retention schedule, data owners, your
   rights, and the structural non-use statement.
   ============================================================ */

import { motion } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Eye,
  Download,
  RotateCcw,
  Edit3,
  MessageSquare,
  Clock,
  FileText,
  Users,
  ChevronRight,
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
import { toast } from "sonner";

/* ---------- Static data ---------- */

interface RetentionRow {
  type: string;
  typeAr: string;
  retention: string;
  retentionAr: string;
  reason: string;
  reasonAr: string;
}

const RETENTION_SCHEDULE: RetentionRow[] = [
  {
    type: "Journey events",
    typeAr: "أحداث الرحلة",
    retention: "24 months",
    retentionAr: "24 شهراً",
    reason: "Journey navigation + audit",
    reasonAr: "ملاحة الرحلة + التدقيق",
  },
  {
    type: "Pulse scores",
    typeAr: "درجات النبضة",
    retention: "12 months",
    retentionAr: "12 شهراً",
    reason: "Trend analysis (consent-gated)",
    reasonAr: "تحليل الاتجاهات (تحت موافقة)",
  },
  {
    type: "Free-text comments",
    typeAr: "التعليقات الحرة",
    retention: "90 days or until revocation",
    retentionAr: "90 يوماً أو حتى السحب",
    reason: "Minimal retention, separate from scores",
    reasonAr: "احتفاظ أدنى، منفصل عن الدرجات",
  },
  {
    type: "Consent records",
    typeAr: "سجلات الموافقة",
    retention: "7 years",
    retentionAr: "7 سنوات",
    reason: "Legal record of consent",
    reasonAr: "سجل قانوني للموافقة",
  },
  {
    type: "Audit events",
    typeAr: "أحداث التدقيق",
    retention: "7 years",
    retentionAr: "7 سنوات",
    reason: "Hash-chained legal trail",
    reasonAr: "سلسلة قانونية متسلسلة",
  },
  {
    type: "Service requests",
    typeAr: "طلبات الخدمة",
    retention: "24 months",
    retentionAr: "24 شهراً",
    reason: "Request history + SLA tracking",
    reasonAr: "سجل الطلبات + تتبع SLA",
  },
];

interface DataOwnerRow {
  type: string;
  typeAr: string;
  owner: string;
  ownerAr: string;
  route: string;
  routeAr: string;
}

const DATA_OWNERS: DataOwnerRow[] = [
  {
    type: "Employee record",
    typeAr: "ملف الموظف",
    owner: "HRBP",
    ownerAr: "شريك الموارد البشرية",
    route: "HR self-service portal",
    routeAr: "بوابة الخدمة الذاتية",
  },
  {
    type: "Journey events",
    typeAr: "أحداث الرحلة",
    owner: "Platform team",
    ownerAr: "فريق المنصة",
    route: "Data file export (Me → Export)",
    routeAr: "تصدير ملف البيانات (حسابي → تصدير)",
  },
  {
    type: "Service requests",
    typeAr: "طلبات الخدمة",
    owner: "Service owner (per group)",
    ownerAr: "مالك الخدمة (لكل مجموعة)",
    route: "Service owner console",
    routeAr: "وحدة مالك الخدمة",
  },
  {
    type: "Pulse responses",
    typeAr: "ردود النبضة",
    owner: "HRBP (consent-gated)",
    ownerAr: "شريك الموارد (تحت موافقة)",
    route: "HRBP queue (summary only)",
    routeAr: "قائمة شريك الموارد (ملخص فقط)",
  },
  {
    type: "Consent records",
    typeAr: "سجلات الموافقة",
    owner: "Privacy office",
    ownerAr: "مكتب الخصوصية",
    route: "Privacy office email",
    routeAr: "بريد مكتب الخصوصية",
  },
  {
    type: "Audit events",
    typeAr: "أحداث التدقيق",
    owner: "Security team",
    ownerAr: "فريق الأمان",
    route: "Audit chain (Admin console)",
    routeAr: "سلسلة التدقيق (وحدة الإدارة)",
  },
];

/* ============================================================
   Component
   ============================================================ */
export function PrivacyPage() {
  const locale = useAppStore((s) => s.locale);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const isAr = locale === "ar";

  const handleCorrect = () => {
    toast.success(isAr ? "بدأ طلب تصحيح البيانات" : "Data correction request started", {
      description: isAr
        ? "سيتواصل معك مكتب الخصوصية خلال 48 ساعة."
        : "The Privacy office will reach you within 48 hours.",
    });
  };

  const rights = [
    {
      icon: Eye,
      labelEn: "Right to view",
      labelAr: "حق الاطلاع",
      descEn: "See every byte we hold about you.",
      descAr: "اطّلع على كل بايت نحتفظ به عنك.",
      ctaEn: "Me → Data held about me",
      ctaAr: "حسابي → البيانات المخزّنة عني",
    },
    {
      icon: Download,
      labelEn: "Right to export",
      labelAr: "حق التصدير",
      descEn: "Take your data with you, anytime.",
      descAr: "خذ بياناتك معك في أي وقت.",
      ctaEn: "Me → Export as JSON / PDF",
      ctaAr: "حسابي → تصدير JSON / PDF",
    },
    {
      icon: RotateCcw,
      labelEn: "Right to revoke",
      labelAr: "حق السحب",
      descEn: "Turn off any optional purpose with one tap.",
      descAr: "أوقف أي غرض اختياري بنقرة واحدة.",
      ctaEn: "Me → Consent toggles",
      ctaAr: "حسابي → مفاتيح الموافقة",
    },
    {
      icon: Edit3,
      labelEn: "Right to correct",
      labelAr: "حق التصحيح",
      descEn: "Ask for a correction — we log it as a request.",
      descAr: "اطلب تصحيحاً — نسجّله كطلب.",
      ctaEn: "Start a correction request",
      ctaAr: "ابدأ طلب تصحيح",
      action: handleCorrect,
    },
    {
      icon: MessageSquare,
      labelEn: "Right to complain",
      labelAr: "حق التظلم",
      descEn: "Named contact: your HRBP. They escalate to the Privacy office.",
      descAr: "جهة الاتصال المُسمّاة: شريك الموارد البشرية. يصعّد للمكتب.",
      ctaEn: "Fatima Al-Mansouri — HRBP",
      ctaAr: "فاطمة المنصوري — شريك الموارد",
    },
  ];

  return (
    <div dir={dir} className="max-w-[800px] mx-auto">
      {/* Header */}
      <header className="mb-5">
        <div
          className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--brand-400)" }}
        >
          <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{isAr ? "الخصوصية بالكامل" : "Privacy in full"}</span>
        </div>
        <h2
          className="mt-2 text-[22px] sm:text-[26px] font-semibold tracking-tight"
          style={{ color: "var(--text-hi)" }}
        >
          {isAr ? "خصوصيتك، ب plain language" : "Your privacy, in plain language"}
        </h2>
      </header>

      {/* Privacy summary — plain language */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <FileText className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "ملخص الخصوصية" : "Privacy summary"}
          </h3>
        </div>
        <div className="space-y-3 text-[13px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
          <p>
            {isAr
              ? "نحتفظ ببيانات رحلتك — الأحداث، الطلبات، ردود النبضة (إن وافقت)، سجلات الموافقة، وأحداث التدقيق. كل سجل له غرض محدد وفترة احتفاظ محددة. لا نخمّن ولا نتجمّع بلا هدف."
              : "We hold your journey data — events, requests, pulse responses (if you opt in), consent records, and audit events. Every record has a defined purpose and a defined retention window. We don't guess, and we don't hoard."}
          </p>
          <p>
            {isAr
              ? "السبب الوحيد للاحتفاظ هو ملاحة رحلتك. نقرأ بياناتك لنخبرك بالخطوة التالية، ونصعد لمسؤول مُسمّى عند الاحتكاك. لا نراقبك ولا نراقب أداءك."
              : "The only reason we hold any of this is to navigate your journey. We read your data to tell you the next step, and to hand you to a named human when there's friction. We don't monitor you, and we don't monitor your performance."}
          </p>
          <p style={{ color: "var(--text-hi)" }}>
            {isAr
              ? "ما لا نفعله أبداً: لا نستخدم خرج الأداة في تقييم الأداء، أو الإجراءات التأديبية، أو قرارات الترقية، أو قرارات التأشيرة. هذا ليس مجرد امتناع مستحب — إنه حظر هيكلي على طبقة الاستعلام."
              : "What we never do: we do not use ASTROLABE output in performance, disciplinary, promotion, or visa decisions. This is not a polite discouragement — it is a structural block enforced at the query layer."}
          </p>
          <p>
            {isAr
              ? "حقوقك: الاطلاع، التصدير، السحب، التصحيح، والتظلم. كل واحد مُدرج أدناه مع جهة الاتصال."
              : "Your rights: view, export, revoke, correct, and complain. Each is listed below with the route to exercise it."}
          </p>
        </div>
      </section>

      {/* Non-use statement — sand-gold accented */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
        className="ast-card p-5 sm:p-6 mb-5"
        style={{
          borderColor: "rgba(201,162,39,0.40)",
          background: "linear-gradient(180deg, rgba(201,162,39,0.06), var(--surface-1))",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full shrink-0"
            style={{ background: "rgba(201,162,39,0.12)", color: "var(--accent-500)" }}
          >
            <ShieldAlert className="w-5 h-5" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--accent-500)" }}>
              {isAr ? "بيان عدم الاستخدام" : "Non-use statement"}
            </h3>
            <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "var(--text-hi)" }}>
              {isAr
                ? "خرج ASTROLABE محظور هيكلياً من الاستخدام في قرارات الأداء أو التأديب أو الترقية أو التأشيرة. هذا يُطبَّق على طبقة الاستعلام، لا يُكتفى بالامتناع عنه."
                : "ASTROLABE output is structurally blocked from use in performance, disciplinary, promotion, or visa decisions. This is enforced at the query layer, not merely discouraged."}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {[
                isAr ? "أداء" : "Performance",
                isAr ? "تأديب" : "Disciplinary",
                isAr ? "ترقية" : "Promotion",
                isAr ? "تأشيرة" : "Visa",
              ].map((tag) => (
                <span
                  key={tag}
                  className="ast-chip text-[11px]"
                  style={{
                    color: "var(--accent-500)",
                    background: "rgba(201,162,39,0.08)",
                    borderColor: "rgba(201,162,39,0.32)",
                  }}
                >
                  <Ban />
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* DPIA summary */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "ملخص تقييم أثر حماية البيانات (DPIA)" : "DPIA summary"}
          </h3>
        </div>
        <div className="space-y-3">
          <div
            className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2.5"
            style={{ borderBottom: "1px solid var(--border-soft)" }}
          >
            <span
              className="text-[11px] uppercase tracking-[0.12em]"
              style={{ color: "var(--text-lo)" }}
            >
              {isAr ? "الغرض" : "Purpose"}
            </span>
            <span className="text-[13px]" style={{ color: "var(--text-hi)" }}>
              {isAr ? "ملاحة رحلة الموظف" : "Employee journey navigation"}
            </span>
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2.5"
            style={{ borderBottom: "1px solid var(--border-soft)" }}
          >
            <span
              className="text-[11px] uppercase tracking-[0.12em]"
              style={{ color: "var(--text-lo)" }}
            >
              {isAr ? "الأساس القانوني" : "Lawful basis"}
            </span>
            <span className="text-[13px]" style={{ color: "var(--text-hi)" }}>
              {isAr
                ? "ضرورة تعاقدية + موافقة صريحة للأغراض الاختيارية"
                : "Contractual necessity + explicit consent for optional purposes"}
            </span>
          </div>
          <div
            className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2.5"
            style={{ borderBottom: "1px solid var(--border-soft)" }}
          >
            <span
              className="text-[11px] uppercase tracking-[0.12em]"
              style={{ color: "var(--text-lo)" }}
            >
              {isAr ? "تقليل البيانات" : "Data minimisation"}
            </span>
            <span className="text-[13px]" style={{ color: "var(--text-hi)" }}>
              {isAr
                ? "نخزّن فقط ما يلزم لملاحة رحلتك — لا أرقام هوية وطنية، لا أرقام رواتب، لا بيانات طبية."
                : "We store only what's needed to navigate your journey — no national IDs, no salary figures, no medical data."}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2.5">
            <span
              className="text-[11px] uppercase tracking-[0.12em]"
              style={{ color: "var(--text-lo)" }}
            >
              {isAr ? "تخفيف المخاطر" : "Risk mitigations"}
            </span>
            <span className="text-[13px]" style={{ color: "var(--text-hi)" }}>
              {isAr
                ? "بوابات موافقة، وسمات تحديد الغرض، وأمان على مستوى الصف، وتدقيق متسلسل، وكتم تحليلي k≥5."
                : "Consent gates, purpose-limitation tags, row-level security, hash-chained audit, k≥5 analytics suppression."}
            </span>
          </div>
        </div>
      </section>

      {/* Retention schedule table */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Clock className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "جدول الاحتفاظ" : "Retention schedule"}
          </h3>
        </div>
        <div
          className="rounded-[10px] overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                <TableHead
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-lo)" }}
                >
                  {isAr ? "نوع البيانات" : "Data type"}
                </TableHead>
                <TableHead
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-lo)" }}
                >
                  {isAr ? "الاحتفاظ" : "Retention"}
                </TableHead>
                <TableHead
                  className="text-[11px] uppercase tracking-[0.12em] hidden sm:table-cell"
                  style={{ color: "var(--text-lo)" }}
                >
                  {isAr ? "السبب" : "Reason"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RETENTION_SCHEDULE.map((row) => (
                <TableRow key={row.type} style={{ borderColor: "var(--border-soft)" }}>
                  <TableCell
                    className="text-[13px] font-medium"
                    style={{ color: "var(--text-hi)" }}
                  >
                    {isAr ? row.typeAr : row.type}
                  </TableCell>
                  <TableCell className="text-[13px] tabular" style={{ color: "var(--brand-400)" }}>
                    {isAr ? row.retentionAr : row.retention}
                  </TableCell>
                  <TableCell
                    className="text-[12px] hidden sm:table-cell"
                    style={{ color: "var(--text-mid)" }}
                  >
                    {isAr ? row.reasonAr : row.reason}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Data owners table */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Users className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "مالكو البيانات" : "Data owners"}
          </h3>
        </div>
        <div
          className="rounded-[10px] overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
        >
          <Table>
            <TableHeader>
              <TableRow style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
                <TableHead
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-lo)" }}
                >
                  {isAr ? "نوع البيانات" : "Data type"}
                </TableHead>
                <TableHead
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: "var(--text-lo)" }}
                >
                  {isAr ? "المالك" : "Owner"}
                </TableHead>
                <TableHead
                  className="text-[11px] uppercase tracking-[0.12em] hidden sm:table-cell"
                  style={{ color: "var(--text-lo)" }}
                >
                  {isAr ? "طريقة الاتصال" : "Contact route"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DATA_OWNERS.map((row) => (
                <TableRow key={row.type} style={{ borderColor: "var(--border-soft)" }}>
                  <TableCell
                    className="text-[13px] font-medium"
                    style={{ color: "var(--text-hi)" }}
                  >
                    {isAr ? row.typeAr : row.type}
                  </TableCell>
                  <TableCell className="text-[13px]" style={{ color: "var(--brand-400)" }}>
                    {isAr ? row.ownerAr : row.owner}
                  </TableCell>
                  <TableCell
                    className="text-[12px] hidden sm:table-cell"
                    style={{ color: "var(--text-mid)" }}
                  >
                    {isAr ? row.routeAr : row.route}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Your rights */}
      <section className="ast-card p-5 sm:p-6 mb-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
            style={{ background: "rgba(22,154,165,0.10)", color: "var(--brand-400)" }}
          >
            <Lock className="w-4 h-4" strokeWidth={1.75} />
          </div>
          <h3 className="text-[16px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {isAr ? "حقوقك" : "Your rights"}
          </h3>
        </div>
        <ul className="space-y-2.5">
          {rights.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.labelEn} className="ast-card-2 p-4 flex items-start gap-3">
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                  style={{ background: "var(--surface-3)", color: "var(--brand-400)" }}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium" style={{ color: "var(--text-hi)" }}>
                    {isAr ? r.labelAr : r.labelEn}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--text-mid)" }}>
                    {isAr ? r.descAr : r.descEn}
                  </p>
                  {r.action ? (
                    <button
                      onClick={r.action}
                      className="ast-focus inline-flex items-center gap-1.5 mt-2 text-[12px] font-medium"
                      style={{ color: "var(--brand-400)" }}
                    >
                      {isAr ? r.ctaAr : r.ctaEn}
                      <ChevronRight className="w-3 h-3" strokeWidth={1.75} />
                    </button>
                  ) : (
                    <p
                      className="text-[11px] mt-2 inline-flex items-center gap-1.5"
                      style={{ color: "var(--text-lo)" }}
                    >
                      <ChevronRight
                        className="w-3 h-3"
                        strokeWidth={1.75}
                        style={{ transform: isAr ? "scaleX(-1)" : undefined }}
                      />
                      {isAr ? r.ctaAr : r.ctaEn}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Footer */}
      <p className="text-[11px] text-center tabular mt-4" style={{ color: "var(--text-lo)" }}>
        {isAr
          ? "هذه الوثيقة هي ملخص غير قانوني. النص الكامل متاح في مكتب الخصوصية."
          : "This is a non-lawyer summary. The full text is held by the Privacy office."}
      </p>
    </div>
  );
}

/* Small inline ban icon for non-use chips */
function Ban() {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  );
}
