"use client";

/* ============================================================
   ASTROLABE — SignalWeightBar
   A horizontal bar showing a friction signal's weight relative
   to the max possible per family (12). Filled to its weight
   fraction on mount (480ms ease-out), with the family's
   instrument colour. Detailed mode shows the code + label;
   compact mode is just the bar + weight number.

   RQ family is teal (NOT blue) per ASTROLABE theme rule.
   ============================================================ */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type SignalFamily = "TL" | "DP" | "RQ" | "EN" | "PS" | "MB" | "DQ";

interface SignalWeightBarProps {
  /** Signal code, e.g. "TL-07". The family prefix (TL/DP/…) drives colour. */
  code: string;
  /** Signal weight (0..12). */
  weight: number;
  /** Optional explicit family override. Defaults to code prefix. */
  family?: string;
  /** Whether this signal is a "hard trip" (forces band into Blocked). */
  hardTrip?: boolean;
  /** Compact (height 6px) or detailed (height 10px + label). */
  variant?: "compact" | "detailed";
  /** Optional description shown under the code in detailed mode. */
  description?: string;
  /** Optional locale for the "HARD TRIP" label. */
  locale?: "en" | "ar";
  className?: string;
  style?: CSSProperties;
}

/** Max possible weight per family — drives bar fill fraction. */
export const FAMILY_MAX = 12;

/** Family → CSS colour token. RQ uses teal (NOT blue) per theme rule. */
export const FAMILY_COLOR: Record<SignalFamily, string> = {
  TL: "var(--status-watch)",
  DP: "var(--status-friction)",
  RQ: "var(--brand-400)",
  EN: "var(--brand-500)",
  PS: "var(--accent-500)",
  MB: "#8B5CF6",
  DQ: "var(--text-lo)",
};

/** Family → human-readable label. */
const FAMILY_LABEL: Record<SignalFamily, { en: string; ar: string }> = {
  TL: { en: "Timing", ar: "التوقيت" },
  DP: { en: "Dependency", ar: "الاعتمادية" },
  RQ: { en: "Request", ar: "طلب" },
  EN: { en: "Engagement", ar: "التفاعل" },
  PS: { en: "Pulse", ar: "النبضة" },
  MB: { en: "Mobility", ar: "التنقل" },
  DQ: { en: "Data quality", ar: "جودة البيانات" },
};

function resolveFamily(family: string | undefined, code: string): SignalFamily {
  const f = (family ?? code.split("-")[0] ?? "").toUpperCase() as SignalFamily;
  if (f in FAMILY_COLOR) return f;
  return "DQ";
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

export function SignalWeightBar({
  code,
  weight,
  family,
  hardTrip = false,
  variant = "detailed",
  description,
  locale = "en",
  className,
  style,
}: SignalWeightBarProps) {
  const reduce = usePrefersReducedMotion();
  const fam = resolveFamily(family, code);
  const color = FAMILY_COLOR[fam];
  const frac = Math.max(0, Math.min(1, weight / FAMILY_MAX));
  const isDetailed = variant === "detailed";
  const barH = isDetailed ? 10 : 6;

  // Animate from 0 to its target width on mount. When reduced motion is on,
  // jump straight to the final width (derived via `shown`, no setState needed).
  const [animateW, setAnimateW] = useState<number | null>(null);
  const startedRef = useRef(false);
  useEffect(() => {
    if (reduce) return; // reduce: `shown` is derived from `frac` directly
    if (startedRef.current) return; // animate only once on mount
    startedRef.current = true;
    const id = window.setTimeout(() => setAnimateW(frac), 16);
    return () => window.clearTimeout(id);
  }, [frac, reduce]);

  // Final width fraction: `frac` when reduced-motion or after animation kicks off.
  const shown = reduce || animateW !== null ? frac : 0;
  const w = shown;

  const famLabel = locale === "ar" ? FAMILY_LABEL[fam].ar : FAMILY_LABEL[fam].en;
  const hardLabel = locale === "ar" ? "صلبة" : "HARD TRIP";

  return (
    <div className={cn("w-full min-w-0", className)} style={style}>
      {/* Detailed mode: label row */}
      {isDetailed && (
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="font-mono text-[11px] font-semibold tabular shrink-0"
              style={{ color }}
              dir="ltr"
            >
              {code}
            </span>
            <span className="text-[11px] truncate" style={{ color: "var(--text-mid)" }}>
              {description ?? famLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hardTrip && (
              <span
                className="inline-flex items-center gap-1 h-4 px-1.5 rounded text-[9px] font-bold uppercase tracking-[0.08em]"
                style={{
                  color: "var(--status-blocked)",
                  background: "rgba(159,18,57,0.12)",
                  border: "1px solid rgba(159,18,57,0.40)",
                }}
              >
                {hardLabel}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bar + weight */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 min-w-0 rounded-full overflow-hidden relative"
          style={{
            height: barH,
            background: "var(--surface-3)",
            border: `1px solid ${color}22`,
          }}
          role="meter"
          aria-valuetext={`${code} weight ${weight} of ${FAMILY_MAX}`}
          aria-valuemin={0}
          aria-valuemax={FAMILY_MAX}
          aria-valuenow={weight}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${color}, ${color}cc)`,
              boxShadow: `0 0 6px ${color}55`,
            }}
            initial={false}
            animate={{ width: `${w * 100}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.48, ease: [0, 0, 0.2, 1] }}
          />
        </div>
        <span
          className="font-mono text-[11px] font-semibold tabular shrink-0"
          style={{ color: "var(--text-hi)", minWidth: 22, textAlign: "right" }}
          dir="ltr"
        >
          {weight}
          <span className="opacity-50">/{FAMILY_MAX}</span>
        </span>
        {hardTrip && !isDetailed && (
          <span
            className="inline-flex items-center h-4 px-1 rounded text-[9px] font-bold uppercase tracking-[0.08em] shrink-0"
            style={{
              color: "var(--status-blocked)",
              background: "rgba(159,18,57,0.12)",
              border: "1px solid rgba(159,18,57,0.40)",
            }}
          >
            {hardLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export default SignalWeightBar;
