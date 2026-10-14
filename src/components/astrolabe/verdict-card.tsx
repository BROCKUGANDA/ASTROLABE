"use client";

/* ============================================================
   ASTROLABE — Verdict Card
   The premium "where you stand" readout, shown right after the
   hero strip on the Today screen. A glass card with:
   - InstrumentDial (precision band readout) on the right
   - Band name + score + 1-line plain-language summary on the left
   - Top 3 signal badges
   - Suppressed-families disclosure when pulse capture is off
   - Sand-gold accent ring (the "your next move" trigger) when Blocked
   - Spring drop-in animation (320ms) on mount
   ============================================================ */

import { motion } from "framer-motion";
import { InstrumentDial, ScanLineOverlay } from "@/components/astrolabe/instrument-dial";
import { NumberTicker } from "@/components/astrolabe/micro-interactions";
import { SignalBadge, type Band } from "@/components/astrolabe/widgets";
import { SignalWeightBar } from "@/components/astrolabe/signal-weight-bar";

export interface VerdictSignal {
  code: string;
  weight: number;
  family?: string;
  hardTrip?: boolean;
}

export interface VerdictCardProps {
  band: Band;
  score: number;
  signals: VerdictSignal[];
  suppressedFamilies?: string[];
  locale?: "en" | "ar";
}

interface BandCopy {
  en: string;
  ar: string;
  labelEn: string;
  labelAr: string;
  color: string;
}

const BAND_COPY: Record<Band, BandCopy> = {
  steady: {
    en: "Nothing is late. You're on track.",
    ar: "لا شيء متأخر. أنت على المسار الصحيح.",
    labelEn: "Steady",
    labelAr: "مستقر",
    color: "var(--status-steady)",
  },
  watch: {
    en: "One item needs your attention.",
    ar: "عنصر واحد يحتاج إلى انتباهك.",
    labelEn: "Watch",
    labelAr: "تحت المراقبة",
    color: "var(--status-watch)",
  },
  friction: {
    en: "Two things are late. We're on it.",
    ar: "عنصران متأخران. نحن نتابع الأمر.",
    labelEn: "Friction",
    labelAr: "احتكاك",
    color: "var(--status-friction)",
  },
  blocked: {
    en: "You're blocked. We've asked Fatima in HR to step in.",
    ar: "أنت محظور. طلَبْنا من فاطمة في الموارد البشرية التدخّل.",
    labelEn: "Blocked",
    labelAr: "محظور",
    color: "var(--status-blocked)",
  },
};

export function VerdictCard({
  band,
  score,
  signals,
  suppressedFamilies = [],
  locale = "en",
}: VerdictCardProps) {
  const isAr = locale === "ar";
  const dir: "rtl" | "ltr" = isAr ? "rtl" : "ltr";
  const cfg = BAND_COPY[band];
  const label = isAr ? cfg.labelAr : cfg.labelEn;
  const summary = isAr ? cfg.ar : cfg.en;

  // Top 3 signals by weight (stable when weights tie — preserves API order)
  const topSignals = [...signals]
    .map((s, i) => ({ ...s, _i: i }))
    .sort((a, b) => b.weight - a.weight || a._i - b._i)
    .slice(0, 3);

  const isBlocked = band === "blocked";
  const hasSuppressed = suppressedFamilies.length > 0;

  // Sand-gold accent ring for Blocked — the "your next move" trigger
  const boxShadow = isBlocked ? "0 0 0 1px var(--accent-500), var(--e3)" : "var(--e2)";

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 24, duration: 0.32 }}
      className="ast-card-glass relative overflow-hidden"
      style={{ boxShadow }}
      aria-label={isAr ? "حالتك الآن" : "Your status"}
      dir={dir}
    >
      {/* Scan-line instrument texture */}
      <ScanLineOverlay opacity={0.022} />

      {/* Sand-gold top accent for Blocked — "your next move" surface */}
      {isBlocked && (
        <div
          aria-hidden="true"
          className="absolute top-0 left-0 h-[3px] w-full"
          style={{
            background:
              "linear-gradient(90deg, var(--accent-500), rgba(201,162,39,0.4) 50%, transparent 90%)",
          }}
        />
      )}

      <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4 p-5 sm:p-6">
        {/* ===== Left side (60%) ===== */}
        <div className="flex flex-col gap-3 min-w-0">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: "var(--text-lo)" }}
          >
            {isAr ? "حالتك" : "Your status"}
          </span>

          <div className="flex items-baseline gap-3 flex-wrap">
            <h2
              className="text-[28px] sm:text-[32px] font-semibold leading-none tracking-tight"
              style={{ color: cfg.color }}
            >
              {label}
            </h2>
            <span
              className="text-[22px] sm:text-[26px] font-semibold leading-none tabular"
              style={{ color: "var(--text-hi)" }}
              aria-label={isAr ? `النتيجة ${score}` : `Score ${score}`}
            >
              <NumberTicker value={score} />
            </span>
          </div>

          <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-mid)" }}>
            {summary}
          </p>

          {topSignals.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {topSignals.map((s) => (
                <SignalBadge key={s.code} code={s.code} weight={s.weight} hardTrip={s.hardTrip} />
              ))}
            </div>
          )}

          {/* Compact signal weight bars beneath the badges — instrument readout
              for "how heavy is each top signal relative to its family's max?". */}
          {topSignals.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2 max-w-[460px]">
              {topSignals.map((s) => (
                <SignalWeightBar
                  key={`bar-${s.code}`}
                  code={s.code}
                  weight={s.weight}
                  family={s.family ?? s.code.split("-")[0]}
                  hardTrip={s.hardTrip}
                  variant="compact"
                  locale={locale}
                />
              ))}
            </div>
          )}

          {hasSuppressed && (
            <p className="text-[11px] leading-relaxed mt-1" style={{ color: "var(--text-lo)" }}>
              {isAr
                ? "إشارات النبض متوقّفة، لذا تعتمد هذه الواجهة على بيانات الرحلة والطلبات فقط."
                : "Pulse signals are off, so this view uses journey and request data only."}
            </p>
          )}
        </div>

        {/* ===== Right side (40%) — holographic instrument dial ===== */}
        <div
          className="hidden sm:flex relative h-[200px] w-[200px] place-self-center items-center justify-center"
          aria-hidden="true"
        >
          <InstrumentDial band={band} score={score} maxScore={30} size={200} />
        </div>
      </div>
    </motion.section>
  );
}

export default VerdictCard;
