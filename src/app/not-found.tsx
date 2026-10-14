/**
 * ASTROLABE — Custom 404 (PRD §17)
 *
 * "Page not found" with the ASTROLABE theme: a large brass astrolabe ring
 * with the Compass icon at its center, a friendly nudge toward the Today
 * tab (or the Ask box), and a Go home button.
 */
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Compass, Home, Search } from "lucide-react";
import "./globals.css";

export default function NotFound() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const handleGoHome = useCallback(() => {
    router.push("/");
  }, [router]);

  // The brass ring slowly rotates one full turn every 18 seconds — a
  // subtle "astrolabe is still turning" cue. Skipped under reduced motion.
  const ringAnimation = reduceMotion
    ? { animate: { rotate: 0 } }
    : {
        animate: { rotate: 360 },
        transition: { duration: 18, ease: "linear" as const, repeat: Infinity },
      };

  const container = reduceMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  // Tick marks rendered around the brass ring.
  const ticks = Array.from({ length: 24 }, (_, i) => i);

  return (
    <main
      className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6"
      style={{ background: "var(--surface-0)" }}
    >
      <motion.section
        initial={container.initial}
        animate={container.animate}
        transition={{ duration: 0.32, ease: [0, 0, 0.2, 1] }}
        className="ast-card-glass w-full max-w-xl p-6 sm:p-10 flex flex-col items-center text-center"
        style={{ borderRadius: "var(--radius-lg)" }}
      >
        {/* Astrolabe illustration — brass ring + compass center */}
        <div
          className="relative mb-8"
          style={{ width: 184, height: 184 }}
          aria-hidden
        >
          {/* Outer halo */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 50%, rgba(201,162,39,0.18), transparent 70%)",
            }}
          />
          {/* Brass ring (rotating) */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, #8A6F1A, #C9A227 25%, #F6ECC9 50%, #C9A227 75%, #8A6F1A)",
              WebkitMask:
                "radial-gradient(circle, transparent 56%, black 58%, black 70%, transparent 72%)",
              mask: "radial-gradient(circle, transparent 56%, black 58%, black 70%, transparent 72%)",
              boxShadow: "0 0 0 1px rgba(201,162,39,0.35), 0 0 32px rgba(201,162,39,0.18)",
            }}
            animate={ringAnimation.animate}
            transition={ringAnimation.transition}
          >
            {/* Tick marks sit on top of the brass ring */}
            {ticks.map((i) => {
              const angle = (i / ticks.length) * 360;
              const isMajor = i % 6 === 0;
              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    transform: `rotate(${angle}deg) translateY(-78px)`,
                    transformOrigin: "center",
                    width: isMajor ? 2 : 1,
                    height: isMajor ? 10 : 6,
                    background: isMajor ? "#3A2E0C" : "rgba(58,46,12,0.55)",
                    marginLeft: isMajor ? -1 : -0.5,
                    borderRadius: 1,
                  }}
                />
              );
            })}
          </motion.div>
          {/* Inner disc — calm navy center */}
          <div
            className="absolute rounded-full flex items-center justify-center"
            style={{
              inset: "22%",
              background:
                "radial-gradient(circle at 30% 30%, var(--surface-3), var(--surface-1) 70%)",
              border: "1px solid rgba(22,154,165,0.28)",
              boxShadow: "inset 0 0 16px rgba(0,0,0,0.45)",
            }}
          >
            <Compass
              className="h-10 w-10"
              style={{ color: "var(--brand-400)" }}
              strokeWidth={1.5}
            />
          </div>
        </div>

        <span
          className="font-mono tracking-[0.18em] text-xs mb-3"
          style={{ color: "var(--accent-400)" }}
        >
          404 · OFF-COURSE
        </span>

        <h1
          className="text-2xl sm:text-3xl font-semibold mb-3"
          style={{ color: "var(--text-hi)" }}
        >
          Page not found
        </h1>
        <p
          className="text-sm sm:text-base mb-6 max-w-md"
          style={{ color: "var(--text-mid)" }}
        >
          This page isn&apos;t on the journey map. Try the{" "}
          <span style={{ color: "var(--brand-400)" }}>Today</span> tab, or ask
          me a question and I&apos;ll point you to the right step.
        </p>

        {/* Search suggestion chip */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-7 text-xs font-mono"
          style={{
            color: "var(--text-mid)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <Search className="h-3.5 w-3.5" style={{ color: "var(--brand-400)" }} aria-hidden />
          <span>Try the Today tab, or ask me a question.</span>
        </div>

        <div className="w-full flex justify-center">
          <button
            type="button"
            onClick={handleGoHome}
            className="inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: "var(--brand-500)",
              color: "var(--surface-0)",
              boxShadow: "0 0 0 1px rgba(22,154,165,0.45), 0 6px 16px rgba(22,154,165,0.18)",
              minHeight: 44,
              minWidth: 160,
            }}
          >
            <Home className="h-4 w-4" aria-hidden />
            Go home
          </button>
        </div>
      </motion.section>
    </main>
  );
}
