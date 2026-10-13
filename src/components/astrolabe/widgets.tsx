"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, AlertTriangle, Ban, CircleDot } from "lucide-react";
import { LucideIcon } from "lucide-react";

export type Band = "steady" | "watch" | "friction" | "blocked";

const BAND_CONFIG: Record<Band, { color: string; bg: string; border: string; label: string; labelAr: string; icon: LucideIcon; dotClass: string }> = {
  steady: { color: "var(--status-steady)", bg: "rgba(14,159,110,0.10)", border: "rgba(14,159,110,0.30)", label: "Steady", labelAr: "مستقر", icon: CheckCircle2, dotClass: "ast-dot-steady" },
  watch: { color: "var(--status-watch)", bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.30)", label: "Watch", labelAr: "تحت المراقبة", icon: CircleDot, dotClass: "ast-dot-watch" },
  friction: { color: "var(--status-friction)", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.30)", label: "Friction", labelAr: "احتكاك", icon: AlertTriangle, dotClass: "ast-dot-friction" },
  blocked: { color: "var(--status-blocked)", bg: "rgba(159,18,57,0.12)", border: "rgba(159,18,57,0.40)", label: "Blocked", labelAr: "محظور", icon: Ban, dotClass: "ast-dot-blocked" },
};

export function BandChip({ band, score, locale = "en", size = "md" }: { band: Band; score?: number; locale?: "en" | "ar"; size?: "sm" | "md" | "lg" }) {
  const cfg = BAND_CONFIG[band];
  const Icon = cfg.icon;
  const label = locale === "ar" ? cfg.labelAr : cfg.label;
  const sizes = {
    sm: "h-6 px-2.5 text-[11px] gap-1.5",
    md: "h-7 px-3 text-xs gap-1.5",
    lg: "h-9 px-4 text-sm gap-2",
  };
  return (
    <span
      className={cn("inline-flex items-center rounded-full font-medium tabular whitespace-nowrap", sizes[size])}
      style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}
      aria-label={`${label}${score !== undefined ? ` · score ${score}` : ""}`}
    >
      <span className={cn("ast-dot", cfg.dotClass)} aria-hidden="true" />
      <span>{label}</span>
      {score !== undefined && <span className="opacity-70">· {score}</span>}
    </span>
  );
}

export function BandDot({ band, pulse = false }: { band: Band; pulse?: boolean }) {
  const cfg = BAND_CONFIG[band];
  return (
    <span
      className={cn("ast-dot", cfg.dotClass, pulse && "ast-pulse-ring")}
      style={{ background: cfg.color }}
      aria-label={cfg.label}
    />
  );
}

export function StatusChip({ status, locale = "en" }: { status: string; locale?: "en" | "ar" }) {
  const map: Record<string, { label: string; labelAr: string; color: string; bg: string }> = {
    not_started: { label: "Not started", labelAr: "لم يبدأ", color: "var(--text-lo)", bg: "var(--surface-2)" },
    in_progress: { label: "In progress", labelAr: "قيد التنفيذ", color: "var(--brand-400)", bg: "rgba(22,154,165,0.10)" },
    waiting_employee: { label: "Waiting on you", labelAr: "بانتظارك", color: "var(--accent-500)", bg: "rgba(201,162,39,0.10)" },
    waiting_owner: { label: "Waiting on team", labelAr: "بانتظار الفريق", color: "var(--status-watch)", bg: "rgba(217,119,6,0.10)" },
    blocked: { label: "Blocked", labelAr: "محظور", color: "var(--status-blocked)", bg: "rgba(159,18,57,0.10)" },
    done: { label: "Done", labelAr: "مكتمل", color: "var(--status-steady)", bg: "rgba(14,159,110,0.10)" },
    skipped: { label: "Skipped", labelAr: "تم تخطيه", color: "var(--text-lo)", bg: "var(--surface-2)" },
    submitted: { label: "Submitted", labelAr: "تم الإرسال", color: "var(--brand-400)", bg: "rgba(22,154,165,0.10)" },
    acknowledged: { label: "Acknowledged", labelAr: "تم الاستلام", color: "var(--brand-400)", bg: "rgba(22,154,165,0.10)" },
    resolved: { label: "Resolved", labelAr: "تم الحل", color: "var(--status-steady)", bg: "rgba(14,159,110,0.10)" },
    closed: { label: "Closed", labelAr: "مغلق", color: "var(--text-lo)", bg: "var(--surface-2)" },
    returned: { label: "Returned", labelAr: "تم الإرجاع", color: "var(--status-friction)", bg: "rgba(220,38,38,0.10)" },
    reassigned: { label: "Reassigned", labelAr: "تمت إعادة التعيين", color: "var(--status-watch)", bg: "rgba(217,119,6,0.10)" },
    draft: { label: "Draft", labelAr: "مسودة", color: "var(--text-lo)", bg: "var(--surface-2)" },
    validated: { label: "Validated", labelAr: "تم التحقق", color: "var(--brand-400)", bg: "rgba(22,154,165,0.10)" },
    cancelled: { label: "Cancelled", labelAr: "ملغى", color: "var(--text-lo)", bg: "var(--surface-2)" },
  };
  const cfg = map[status] ?? map.not_started;
  const label = locale === "ar" ? cfg.labelAr : cfg.label;
  return (
    <span
      className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-medium tabular whitespace-nowrap"
      style={{ color: cfg.color, backgroundColor: cfg.bg, border: "1px solid var(--border)" }}
    >
      {label}
    </span>
  );
}

export function SlaChip({ elapsedHours, targetHours, breachLevel, locale = "en" }: { elapsedHours: number; targetHours: number; breachLevel: "none" | "due_soon" | "breached" | "hard"; locale?: "en" | "ar" }) {
  const colors: Record<string, { color: string; bg: string; border: string }> = {
    none: { color: "var(--text-mid)", bg: "var(--surface-2)", border: "var(--border)" },
    due_soon: { color: "var(--status-watch)", bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.30)" },
    breached: { color: "var(--status-friction)", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.30)" },
    hard: { color: "var(--status-blocked)", bg: "rgba(159,18,57,0.12)", border: "rgba(159,18,57,0.40)" },
  };
  const cfg = colors[breachLevel];
  const ratio = targetHours > 0 ? elapsedHours / targetHours : 0;
  const label = locale === "ar"
    ? `${elapsedHours.toFixed(0)}س / ${targetHours}س`
    : `${elapsedHours.toFixed(0)}h / ${targetHours}h`;
  return (
    <span
      className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-medium tabular whitespace-nowrap"
      style={{ color: cfg.color, backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}
      title={`Elapsed ${elapsedHours.toFixed(1)}h of ${targetHours}h target (${(ratio * 100).toFixed(0)}%)`}
    >
      <Clock className="w-3 h-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function CitationChip({ citation, locale = "en" }: { citation: { docSlug: string; title: string; section: string; effectiveDate: string }; locale?: "en" | "ar" }) {
  return (
    <a
      href={`/api/v1/policies/${citation.docSlug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-medium hover:translate-y-[-2px] transition-transform ast-focus"
      style={{
        color: "var(--brand-400)",
        backgroundColor: "rgba(22,154,165,0.08)",
        border: "1px solid rgba(22,154,165,0.25)",
        textDecoration: "none",
      }}
      title={`${citation.title} · §${citation.section} · effective ${citation.effectiveDate}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 12l2 2 4-4" />
        <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.39 0 4.68.94 6.36 2.64" />
      </svg>
      <span className="truncate max-w-[200px]">{citation.title}</span>
      <span className="opacity-60">· §{citation.section}</span>
    </a>
  );
}

export function SignalBadge({ code, weight, hardTrip }: { code: string; weight: number; hardTrip?: boolean }) {
  const family = code.split("-")[0];
  const familyColors: Record<string, string> = {
    TL: "var(--status-watch)",
    DP: "var(--status-friction)",
    RQ: "var(--status-info)",
    EN: "var(--brand-400)",
    PS: "var(--accent-500)",
    MB: "#8B5CF6",
    DQ: "var(--text-lo)",
  };
  const color = familyColors[family] ?? "var(--text-mid)";
  return (
    <span
      className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-mono font-semibold tabular"
      style={{
        color,
        backgroundColor: `${color}15`,
        border: `1px solid ${color}40`,
      }}
      title={`${code} · weight ${weight}${hardTrip ? " · hard trip" : ""}`}
    >
      <span style={{ color, fontWeight: 700 }}>{code}</span>
      <span className="opacity-60">·{weight}</span>
      {hardTrip && <span className="text-[9px] uppercase opacity-80">hard</span>}
    </span>
  );
}
