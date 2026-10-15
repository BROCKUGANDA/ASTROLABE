"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/* ============================================================
   ScanLine Overlay — subtle CRT/instrument display texture
   Adds a faint moving scan-line + noise overlay to any element.
   Respects prefers-reduced-motion (static if reduced).
   ============================================================ */

export function ScanLineOverlay({ opacity = 0.025 }: { opacity?: number }) {
  const reduce = usePrefersReducedMotion();
  if (reduce) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{ opacity }}
      aria-hidden="true"
    >
      {/* Horizontal scan lines */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(22,154,165,0.06) 2px, rgba(22,154,165,0.06) 3px)",
        }}
      />
      {/* Moving scan beam */}
      <motion.div
        className="absolute left-0 right-0 h-[60px]"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(22,154,165,0.08), transparent)",
        }}
        initial={{ top: "-60px" }}
        animate={{ top: "100%" }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
}

/* ============================================================
   Instrument Dial — holographic radial gauge for the verdict card
   Replaces the flat BandSphere3D with a precision instrument readout:
   - Concentric glowing rings (teal for steady → gold for next-move)
   - Tick marks around the outer edge (0, 25, 50, 75, 100)
   - Sweeping arc colored by band
   - Central score number with NumberTicker
   ============================================================ */

type Band = "steady" | "watch" | "friction" | "blocked";

const BAND_COLORS: Record<Band, { arc: string; glow: string; ring: string }> = {
  steady: { arc: "#0E9F6E", glow: "rgba(14,159,110,0.35)", ring: "#0E9F6E" },
  watch: { arc: "#D97706", glow: "rgba(217,119,6,0.35)", ring: "#D97706" },
  friction: { arc: "#DC2626", glow: "rgba(220,38,38,0.35)", ring: "#DC2626" },
  blocked: { arc: "#9F1239", glow: "rgba(159,18,57,0.40)", ring: "#9F1239" },
};

export function InstrumentDial({
  band,
  score,
  maxScore = 30,
  size = 200,
}: {
  band: Band;
  score: number;
  maxScore?: number;
  size?: number;
}) {
  const colors = BAND_COLORS[band];
  const reduce = usePrefersReducedMotion();
  const radius = size / 2 - 20;
  const cx = size / 2;
  const cy = size / 2;
  const scoreRatio = Math.min(score / maxScore, 1);
  const arcAngle = scoreRatio * 270; // sweep 270 degrees max
  const arcEnd = -135 + arcAngle; // start from -135 (top-left)

  // Tick marks
  const ticks = Array.from({ length: 21 }, (_, i) => {
    const angle = -135 + (i / 20) * 270;
    const rad = (angle * Math.PI) / 180;
    const isMajor = i % 5 === 0;
    const inner = radius - (isMajor ? 8 : 4);
    const outer = radius;
    return {
      x1: cx + inner * Math.cos(rad),
      y1: cy + inner * Math.sin(rad),
      x2: cx + outer * Math.cos(rad),
      y2: cy + outer * Math.sin(rad),
      isMajor,
      label: isMajor ? ((i / 20) * maxScore).toFixed(0) : null,
      labelX: cx + (radius + 14) * Math.cos(rad),
      labelY: cy + (radius + 14) * Math.sin(rad),
    };
  });

  // Arc path
  const arcRad = (arcEnd * Math.PI) / 180;
  const arcStartRad = (-135 * Math.PI) / 180;
  const largeArc = arcAngle > 180 ? 1 : 0;
  const arcPath = `M ${cx + radius * Math.cos(arcStartRad)} ${cy + radius * Math.sin(arcStartRad)} A ${radius} ${radius} 0 ${largeArc} 1 ${cx + radius * Math.cos(arcRad)} ${cy + radius * Math.sin(arcRad)}`;

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-label={`Band: ${band}, score: ${score}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <filter id={`glow-${band}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius + 2}
          fill="none"
          stroke="rgba(34,48,63,0.6)"
          strokeWidth="1"
        />

        {/* Inner concentric rings */}
        <circle
          cx={cx}
          cy={cy}
          r={radius - 14}
          fill="none"
          stroke="rgba(22,154,165,0.08)"
          strokeWidth="1"
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius - 24}
          fill="none"
          stroke="rgba(22,154,165,0.06)"
          strokeWidth="1"
        />

        {/* Background track arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="rgba(34,48,63,0.5)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Animated score arc */}
        <motion.path
          d={arcPath}
          fill="none"
          stroke={colors.arc}
          strokeWidth="4"
          strokeLinecap="round"
          filter={`url(#glow-${band})`}
          initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.64, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ boxShadow: `0 0 12px ${colors.glow}` }}
        />

        {/* Tick marks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.isMajor ? "var(--text-lo)" : "var(--border)"}
              strokeWidth={t.isMajor ? 1.5 : 0.8}
            />
            {t.label && (
              <text
                x={t.labelX}
                y={t.labelY}
                fill="var(--text-lo)"
                fontSize="8"
                fontFamily="var(--font-jetbrains), monospace"
                textAnchor="middle"
                dominantBaseline="middle"
                className="tabular"
              >
                {t.label}
              </text>
            )}
          </g>
        ))}

        {/* No center hub: the score reads through the middle of the dial, and
            a pivot dot behind the digits renders in the gap between glyphs —
            at 28px it looked like a glitch character inside the number. */}
      </svg>

      {/* Center label overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="text-[10px] uppercase tracking-[0.16em] font-mono"
          style={{ color: "var(--text-lo)", marginTop: -10 }}
        >
          {band}
        </span>
        <span
          className="text-[28px] font-bold tabular"
          style={{ color: colors.arc, fontFamily: "var(--font-jetbrains), monospace" }}
        >
          {score}
        </span>
        <span
          className="text-[9px] uppercase tracking-[0.12em] font-mono"
          style={{ color: "var(--text-lo)", marginBottom: -8 }}
        >
          / {maxScore}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   usePrefersReducedMotion hook
   ============================================================ */

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
