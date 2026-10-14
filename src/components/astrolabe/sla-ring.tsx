"use client";

/* ============================================================
   SlaRing — animated circular SLA countdown ring
   A compact 40×40px SVG ring that visualizes SLA elapsed vs
   target ratio. The arc draws in on mount (480ms ease-out),
   shifts color by breach level, shows a center percentage in
   tabular mono, and emits a subtle red pulse ring on hard
   breach. Respects prefers-reduced-motion.
   ============================================================ */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export type BreachLevel = "none" | "due_soon" | "breached" | "hard";

/* Color map — teal (on track) → amber (due soon) → red (breached) → dark red (hard). */
const BREACH_COLORS: Record<
  BreachLevel,
  { stroke: string; track: string; text: string; label: string }
> = {
  none: {
    stroke: "var(--brand-500)",
    track: "rgba(22,154,165,0.10)",
    text: "var(--brand-400)",
    label: "on track",
  },
  due_soon: {
    stroke: "var(--status-watch)",
    track: "rgba(217,119,6,0.10)",
    text: "var(--status-watch)",
    label: "due soon",
  },
  breached: {
    stroke: "var(--status-friction)",
    track: "rgba(220,38,38,0.10)",
    text: "var(--status-friction)",
    label: "breached",
  },
  hard: {
    stroke: "var(--status-blocked)",
    track: "rgba(159,18,57,0.12)",
    text: "var(--status-blocked)",
    label: "hard breach",
  },
};

export function SlaRing({
  elapsedHours,
  targetHours,
  breachLevel,
  size = 40,
}: {
  elapsedHours: number;
  targetHours: number;
  breachLevel: BreachLevel;
  size?: number;
}) {
  const reduce = usePrefersReducedMotion();
  const colors = BREACH_COLORS[breachLevel];

  // Ratio for the ring fill is capped at 1.0 visually (full circle),
  // but the center text shows the actual percentage (which can exceed 100%).
  const ratio =
    targetHours > 0 ? Math.min(Math.max(elapsedHours / targetHours, 0), 1) : 0;
  const pct =
    targetHours > 0 ? Math.round((elapsedHours / targetHours) * 100) : 0;

  // SVG ring geometry — start at 12 o'clock, sweep clockwise.
  const strokeWidth = 3;
  const padding = 2;
  const r = (size - strokeWidth - padding * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - ratio);

  const isHard = breachLevel === "hard";
  const tooltipText = `${elapsedHours.toFixed(1)}h elapsed of ${targetHours}h target · ${pct}% · ${colors.label}`;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={tooltipText}
      title={tooltipText}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        aria-hidden="true"
      >
        {/* Background track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={colors.track}
          strokeWidth={strokeWidth}
        />
        {/* Filled arc — animated via strokeDashoffset */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{
            strokeDasharray: circumference,
            filter: isHard
              ? `drop-shadow(0 0 2.5px ${colors.stroke})`
              : "none",
          }}
          initial={reduce ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={
            reduce
              ? { duration: 0 }
              : { duration: 0.48, ease: [0.2, 0.8, 0.2, 1] as const }
          }
        />
      </svg>

      {/* Center percentage — tabular mono, 9px */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span
          className="font-mono tabular font-semibold"
          style={{
            fontSize: 9,
            color: colors.text,
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          {pct}
        </span>
      </div>

      {/* Hard-breach pulse ring — subtle expanding red ring */}
      {isHard && !reduce && (
        <motion.div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ border: `1px solid ${colors.stroke}` }}
          initial={{ opacity: 0.6, scale: 1 }}
          animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.45, 1] }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/* ---------- shared hook: prefers-reduced-motion ----------
   Mirrors the local hook in micro-interactions.tsx and
   instrument-dial.tsx — kept local to avoid exporting from
   multiple places. Returns false on first render (SSR-safe). */
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
