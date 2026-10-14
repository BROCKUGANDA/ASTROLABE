/**
 * ASTROLABE — Route-level loading state (PRD §17)
 *
 * Shown automatically by Next.js while the route segment is streaming in.
 * One frame of the brand + a slowly spinning compass + "Loading your
 * journey…". Quiet, instrument-like — never a spinner that feels like a
 * dashboard.
 */
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Compass } from "lucide-react";
import "./globals.css";

export default function Loading() {
  const reduceMotion = useReducedMotion();

  const spin = reduceMotion
    ? { animate: { rotate: 0 } }
    : {
        animate: { rotate: 360 },
        transition: { duration: 2.4, ease: "linear" as const, repeat: Infinity },
      };

  const fade = reduceMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 } };

  return (
    <main
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ background: "var(--surface-0)" }}
      aria-busy="true"
      aria-live="polite"
    >
      <motion.div
        initial={fade.initial}
        animate={fade.animate}
        transition={{ duration: 0.32, ease: [0, 0, 0.2, 1] }}
        className="flex flex-col items-center text-center"
      >
        {/* Spinning compass inside a soft teal halo */}
        <div className="relative mb-6" style={{ width: 88, height: 88 }}>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 50%, rgba(22,154,165,0.18), transparent 70%)",
            }}
            aria-hidden
          />
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={spin.animate}
            transition={spin.transition}
          >
            <Compass
              className="h-10 w-10"
              style={{ color: "var(--brand-400)" }}
              strokeWidth={1.5}
            />
          </motion.div>
        </div>

        <span
          className="font-mono tracking-[0.18em] text-sm mb-1"
          style={{ color: "var(--brand-400)" }}
        >
          ASTROLABE
        </span>
        <p
          className="text-sm sm:text-base"
          style={{ color: "var(--text-mid)" }}
        >
          Loading your journey…
        </p>
        <span className="sr-only">Loading ASTROLABE. Please wait.</span>
      </motion.div>
    </main>
  );
}
