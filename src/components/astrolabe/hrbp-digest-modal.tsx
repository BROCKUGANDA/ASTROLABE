"use client";

/* ============================================================
   ASTROLABE — Weekly HRBP digest "Where journeys stalled"
   (PRD §10-198)
   A weekly digest modal summarising where onboarding / mobility
   journeys got stuck in the last 7 days — broken down by owner
   group and by stage, with a top-3 action checklist. Closes
   with an "Email me this digest" button and a "Schedule weekly"
   switch.
   ============================================================ */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Mail,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Clock,
  Inbox,
  Loader2,
  ListChecks,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { NOW as PACK_NOW } from "@/lib/data/pack";

/* ---------- Types ---------- */

interface OwnerStallRow {
  group: string;
  groupAr: string;
  newStalls: number;
  stillOpen: number;
  medianDays: number | null;
  topReason: string;
  topReasonAr: string;
}

interface StageStallRow {
  key: string;
  label: string;
  labelAr: string;
  count: number;
  band: "steady" | "watch" | "friction";
}

interface WeeklyAction {
  id: string;
  text: string;
  textAr: string;
  done: boolean;
}

/* ---------- Prototype digest data ----------
   For the prototype we ship a fixed weekly snapshot. In
   production this would come from `/api/v1/hrbp/digest?week=…`.
   Counts are tiny and bounded — they reflect the seed pack. */

const OWNER_STALL_ROWS: OwnerStallRow[] = [
  {
    group: "IT",
    groupAr: "تقنية المعلومات",
    newStalls: 2,
    stillOpen: 1,
    medianDays: 2,
    topReason: "Kit delayed",
    topReasonAr: "تأخر العُدّة",
  },
  {
    group: "Immigration",
    groupAr: "الهجرة",
    newStalls: 1,
    stillOpen: 1,
    medianDays: 7,
    topReason: "Visa processing",
    topReasonAr: "معالجة التأشيرة",
  },
  {
    group: "Payroll",
    groupAr: "الرواتب",
    newStalls: 0,
    stillOpen: 0,
    medianDays: null,
    topReason: "—",
    topReasonAr: "—",
  },
];

const STAGE_STALL_ROWS: StageStallRow[] = [
  {
    key: "pre_boarding",
    label: "Pre-boarding",
    labelAr: "ما قبل الالتحاق",
    count: 0,
    band: "steady",
  },
  {
    key: "visa_processing",
    label: "Visa Processing",
    labelAr: "معالجة التأشيرة",
    count: 1,
    band: "watch",
  },
  { key: "first_day", label: "First Day", labelAr: "اليوم الأول", count: 2, band: "friction" },
  { key: "first_week", label: "First Week", labelAr: "الأسبوع الأول", count: 0, band: "steady" },
  { key: "first_90", label: "First 90 Days", labelAr: "أول 90 يوماً", count: 0, band: "steady" },
];

const INITIAL_ACTIONS: Omit<WeeklyAction, "done">[] = [
  {
    id: "act-1",
    text: "Follow up with IT on E-1042 laptop kit (3 days late)",
    textAr: "تابع مع تقنية المعلومات عُدّة E-1042 (تأخر 3 أيام)",
  },
  {
    id: "act-2",
    text: "Check with Immigration on E-1043 visa (7 days stalled)",
    textAr: "تحقق مع الهجرة بشأن تأشيرة E-1043 (توقف 7 أيام)",
  },
  {
    id: "act-3",
    text: "Confirm payroll change for E-1044 before cutoff",
    textAr: "أكّد تغيير الرواتب لـ E-1044 قبل موعد القطع",
  },
];

const STAGE_BAND_COLOR: Record<StageStallRow["band"], string> = {
  steady: "var(--status-steady)",
  watch: "var(--status-watch)",
  friction: "var(--status-friction)",
};

const STAGE_BAND_BG: Record<StageStallRow["band"], string> = {
  steady: "rgba(14,159,110,0.10)",
  watch: "rgba(217,119,6,0.10)",
  friction: "rgba(220,38,38,0.10)",
};

const STAGE_BAND_DOT: Record<StageStallRow["band"], string> = {
  steady: "ast-dot-steady",
  watch: "ast-dot-watch",
  friction: "ast-dot-friction",
};

const MAX_STAGE_COUNT = Math.max(...STAGE_STALL_ROWS.map((r) => r.count), 1);

/* ---------- Modal ---------- */

export interface HrbpDigestModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function HrbpDigestModal({ open, onOpenChange }: HrbpDigestModalProps) {
  const locale = useAppStore((s) => s.locale);
  const [actions, setActions] = useState<WeeklyAction[]>(
    INITIAL_ACTIONS.map((a) => ({ ...a, done: false })),
  );
  const [scheduled, setScheduled] = useState(false);
  const [emailing, setEmailing] = useState(false);

  /* Date range — week ending at PACK_NOW (synthetic 13-19 Oct 2024). */
  const weekEnd = PACK_NOW;
  const weekStart = subDays(weekEnd, 6);
  const rangeLabel = `${format(weekStart, "d MMM")} – ${format(weekEnd, "d MMM yyyy")}`;

  const summaryMetrics = useMemo(() => {
    return [
      {
        label: locale === "ar" ? "حالات احتكاك جديدة" : "New friction cases",
        value: "3",
        sub: locale === "ar" ? "هذا الأسبوع" : "this week",
        icon: AlertTriangle,
        color: "var(--status-watch)",
        bg: "rgba(217,119,6,0.10)",
      },
      {
        label: locale === "ar" ? "حالات محلولة" : "Resolved cases",
        value: "2",
        sub: locale === "ar" ? "خلال 3 أيام وسطياً" : "median 3 days",
        icon: CheckCircle2,
        color: "var(--status-steady)",
        bg: "rgba(14,159,110,0.10)",
      },
      {
        label: locale === "ar" ? "وسيط زمن الانتقال" : "Median lead time",
        value: "3d",
        sub: locale === "ar" ? "من الاختناق للحل" : "stall → resolved",
        icon: Clock,
        color: "var(--brand-400)",
        bg: "rgba(22,154,165,0.10)",
      },
      {
        label: locale === "ar" ? "صفر حوادث خصوصية" : "Zero privacy incidents",
        value: "0",
        sub: locale === "ar" ? "هذا الأسبوع" : "this week",
        icon: ShieldCheck,
        color: "var(--status-steady)",
        bg: "rgba(14,159,110,0.10)",
      },
    ];
  }, [locale]);

  const doneCount = actions.filter((a) => a.done).length;

  const handleEmail = async () => {
    setEmailing(true);
    try {
      // Prototype — there's no email API. Just simulate the send.
      await new Promise((r) => setTimeout(r, 380));
      toast.success(
        locale === "ar"
          ? "أُرسل الملخّص إلى fatima.hrbp@astrolabe.internal"
          : "Digest sent to fatima.hrbp@astrolabe.internal",
      );
    } catch (e) {
      toast.error(locale === "ar" ? "تعذّر الإرسال" : "Couldn't send the digest", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setEmailing(false);
    }
  };

  const handleSchedule = (checked: boolean) => {
    setScheduled(checked);
    if (checked) {
      toast.success(
        locale === "ar"
          ? "تمت جدولة الملخّص الأسبوعي — كل اثنين 09:00 آسيا/دبي"
          : "Weekly digest scheduled for Mondays at 09:00 Asia/Dubai",
      );
    } else {
      toast.success(locale === "ar" ? "أُلغت جدولة الملخّص" : "Weekly digest schedule cleared");
    }
  };

  const toggleAction = (id: string) => {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, done: !a.done } : a)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[820px] max-h-[92vh] overflow-y-auto"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          color: "var(--text-hi)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2 flex-wrap"
            style={{ color: "var(--text-hi)" }}
          >
            <Inbox className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
            <span>
              {locale === "ar"
                ? "أين توقفت الرحلات هذا الأسبوع"
                : "Where journeys stalled this week"}
            </span>
            <span
              className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-mono tabular"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-mid)",
              }}
              dir="ltr"
            >
              <Calendar className="w-3 h-3" strokeWidth={1.75} />
              {rangeLabel}
            </span>
          </DialogTitle>
          <DialogDescription style={{ color: "var(--text-mid)" }}>
            {locale === "ar"
              ? "إليك حيث علقت الرحلات هذا الأسبوع — ومن يمكنه المساعدة في فك الاعتصار."
              : "Here's where your journeys got stuck this week — and who can help unblock them."}
          </DialogDescription>
        </DialogHeader>

        {/* Summary metrics row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {summaryMetrics.map((m) => {
            const Icon = m.icon;
            return (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
                className="ast-card-2 p-3"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                    style={{ background: m.bg, color: m.color }}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </div>
                  <p
                    className="text-[10px] uppercase tracking-[0.10em] leading-tight"
                    style={{ color: "var(--text-lo)" }}
                  >
                    {m.label}
                  </p>
                </div>
                <p
                  className="text-[22px] font-semibold tabular mt-2"
                  style={{ color: m.color }}
                  dir="ltr"
                >
                  {m.value}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-lo)" }}>
                  {m.sub}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Stall breakdown by owner */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "تفصيل الاختناقات حسب المالك" : "Stall breakdown by owner"}
            </h3>
            <span className="text-[11px]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "(k≥5 كبت إخفاء صغير)" : "(k≥5 suppression applies)"}
            </span>
          </div>
          <div className="ast-card-2 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "var(--border)" }}>
                  <TableHead
                    className="text-[11px] uppercase tracking-[0.10em]"
                    style={{ color: "var(--text-lo)" }}
                  >
                    {locale === "ar" ? "المجموعة المالكة" : "Owner group"}
                  </TableHead>
                  <TableHead
                    className="text-[11px] uppercase tracking-[0.10em] text-right"
                    style={{ color: "var(--text-lo)" }}
                  >
                    {locale === "ar" ? "جديدة" : "New"}
                  </TableHead>
                  <TableHead
                    className="text-[11px] uppercase tracking-[0.10em] text-right"
                    style={{ color: "var(--text-lo)" }}
                  >
                    {locale === "ar" ? "لا تزال مفتوحة" : "Still open"}
                  </TableHead>
                  <TableHead
                    className="text-[11px] uppercase tracking-[0.10em] text-right"
                    style={{ color: "var(--text-lo)" }}
                  >
                    {locale === "ar" ? "وسيط الأيام" : "Median days"}
                  </TableHead>
                  <TableHead
                    className="text-[11px] uppercase tracking-[0.10em]"
                    style={{ color: "var(--text-lo)" }}
                  >
                    {locale === "ar" ? "السبب الأعلى" : "Top reason"}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {OWNER_STALL_ROWS.map((row) => (
                  <TableRow key={row.group} style={{ borderColor: "var(--border-soft)" }}>
                    <TableCell
                      className="text-[13px] font-medium"
                      style={{ color: "var(--text-hi)" }}
                    >
                      {locale === "ar" ? row.groupAr : row.group}
                    </TableCell>
                    <TableCell
                      className="text-[13px] tabular text-right"
                      style={{ color: "var(--text-hi)" }}
                      dir="ltr"
                    >
                      {row.newStalls}
                    </TableCell>
                    <TableCell
                      className="text-[13px] tabular text-right"
                      style={{ color: "var(--text-hi)" }}
                      dir="ltr"
                    >
                      {row.stillOpen}
                    </TableCell>
                    <TableCell
                      className="text-[13px] tabular text-right"
                      style={{ color: "var(--text-hi)" }}
                      dir="ltr"
                    >
                      {row.medianDays !== null ? `${row.medianDays}d` : "—"}
                    </TableCell>
                    <TableCell className="text-[12px]" style={{ color: "var(--text-mid)" }}>
                      {locale === "ar" ? row.topReasonAr : row.topReason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Stall breakdown by stage — bar chart */}
        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-hi)" }}>
            {locale === "ar" ? "تفصيل الاختناقات حسب المرحلة" : "Stall breakdown by stage"}
          </h3>
          <div className="ast-card-2 p-4 space-y-2.5">
            {STAGE_STALL_ROWS.map((row, i) => {
              const color = STAGE_BAND_COLOR[row.band];
              const bg = STAGE_BAND_BG[row.band];
              const dotClass = STAGE_BAND_DOT[row.band];
              const pct = (row.count / MAX_STAGE_COUNT) * 100;
              return (
                <div key={row.key} className="flex items-center gap-3">
                  <div className="w-[110px] sm:w-[140px] shrink-0 flex items-center gap-2">
                    <span className={cn("ast-dot", dotClass)} aria-hidden="true" />
                    <span className="text-[12px]" style={{ color: "var(--text-hi)" }}>
                      {locale === "ar" ? row.labelAr : row.label}
                    </span>
                  </div>
                  <div
                    className="flex-1 h-6 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-3)" }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.32, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
                      className="h-full rounded-full"
                      style={{ background: color, opacity: row.count === 0 ? 0.18 : 0.85 }}
                    />
                  </div>
                  <div className="w-[60px] text-right shrink-0 flex items-center justify-end gap-1.5">
                    <span
                      className="inline-flex items-center justify-center h-5 px-1.5 rounded-full text-[11px] font-mono tabular"
                      style={{ background: bg, color, border: `1px solid ${color}33` }}
                      dir="ltr"
                    >
                      {row.count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 3 actions this week */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ListChecks
              className="w-4 h-4"
              strokeWidth={1.75}
              style={{ color: "var(--accent-500)" }}
            />
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-hi)" }}>
              {locale === "ar" ? "أهم 3 إجراءات هذا الأسبوع" : "Top 3 actions this week"}
            </h3>
            <span
              className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-mono tabular"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text-mid)",
              }}
              dir="ltr"
            >
              {doneCount}/{actions.length}
            </span>
          </div>
          <ul className="space-y-2">
            {actions.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 p-3 rounded-[10px]"
                style={{
                  background: a.done ? "rgba(14,159,110,0.06)" : "var(--surface-2)",
                  border: `1px solid ${a.done ? "rgba(14,159,110,0.25)" : "var(--border)"}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleAction(a.id)}
                  aria-pressed={a.done}
                  className="ast-focus inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 transition-colors mt-0.5"
                  style={{
                    background: a.done ? "var(--status-steady)" : "var(--surface-3)",
                    color: a.done ? "white" : "var(--text-lo)",
                    border: `1px solid ${a.done ? "var(--status-steady)" : "var(--border)"}`,
                  }}
                  aria-label={
                    a.done
                      ? locale === "ar"
                        ? "تم"
                        : "Done"
                      : locale === "ar"
                        ? "اضغط لإنهاء"
                        : "Mark done"
                  }
                >
                  {a.done && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />}
                </button>
                <p
                  className="text-[13px] flex-1"
                  style={{
                    color: a.done ? "var(--text-mid)" : "var(--text-hi)",
                    textDecoration: a.done ? "line-through" : "none",
                  }}
                >
                  {locale === "ar" ? a.textAr : a.text}
                </p>
              </li>
            ))}
          </ul>
        </div>

        {/* Schedule + email row */}
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-[10px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
              style={{ background: "rgba(201,162,39,0.10)", color: "var(--accent-500)" }}
            >
              <Calendar className="w-4 h-4" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                {locale === "ar" ? "جدولة هذا الملخّص أسبوعياً" : "Schedule this digest weekly"}
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "كل اثنين 09:00 آسيا/دبي" : "Every Monday 09:00 Asia/Dubai"}
              </p>
            </div>
          </div>
          <Switch
            checked={scheduled}
            onCheckedChange={handleSchedule}
            aria-label={locale === "ar" ? "جدولة أسبوعية" : "Schedule weekly"}
          />
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-hi)",
            }}
          >
            {locale === "ar" ? "إغلاق" : "Close"}
          </button>
          <button
            type="button"
            onClick={handleEmail}
            disabled={emailing}
            className="ast-focus inline-flex items-center gap-2 h-11 px-4 rounded-full text-[13px] font-medium disabled:opacity-60"
            style={{
              background: "var(--brand-500)",
              color: "var(--surface-0)",
              border: "1px solid var(--brand-500)",
            }}
          >
            {emailing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
            ) : (
              <Mail className="w-3.5 h-3.5" strokeWidth={1.75} />
            )}
            {locale === "ar" ? "أرسل لي الملخّص" : "Email me this digest"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
