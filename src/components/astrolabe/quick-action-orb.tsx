"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Inbox, Map, Sparkles, X } from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import type { View, Role } from "@/lib/store/app-store";

/* ============================================================
   Floating Quick-Action Orb
   A 3D brass orb that floats on the Today screen and expands
   to show quick actions (Ask, Start request, View journey).
   Desktop-only (fixed bottom-right), reduced-motion-aware.
   ============================================================ */

interface QuickAction {
  id: string;
  label: string;
  labelAr: string;
  icon: typeof MessageSquare;
  action: () => void;
  accent: string;
}

export function QuickActionOrb() {
  const [open, setOpen] = useState(false);
  const locale = useAppStore((s) => s.locale);
  const setView = useAppStore((s) => s.setView);
  const setRole = useAppStore((s) => s.setRole);
  const setActiveRequestType = useAppStore((s) => s.setActiveRequestType);

  const actions: QuickAction[] = [
    {
      id: "ask",
      label: "Ask a question",
      labelAr: "اسأل سؤالاً",
      icon: MessageSquare,
      action: () => {
        setView("ask");
        setOpen(false);
      },
      accent: "var(--brand-500)",
    },
    {
      id: "request",
      label: "Start a request",
      labelAr: "ابدأ طلباً",
      icon: Inbox,
      action: () => {
        setActiveRequestType(undefined);
        setView("requests");
        setOpen(false);
      },
      accent: "var(--accent-500)",
    },
    {
      id: "journey",
      label: "View journey",
      labelAr: "اعرض الرحلة",
      icon: Map,
      action: () => {
        setView("journey");
        setOpen(false);
      },
      accent: "var(--brand-400)",
    },
  ];

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="fixed bottom-6 right-6 z-30 hidden lg:block">
      {/* Expanded actions */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute bottom-16 right-0 flex flex-col gap-2"
          >
            {actions.map((a, i) => {
              const Icon = a.icon;
              const label = locale === "ar" ? a.labelAr : a.label;
              return (
                <motion.button
                  key={a.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={a.action}
                  className="ast-focus inline-flex items-center gap-3 h-12 px-4 rounded-full text-[13px] font-medium whitespace-nowrap shadow-lg backdrop-blur-md"
                  style={{
                    background: "rgba(16,24,39,0.88)",
                    border: `1px solid ${a.accent}40`,
                    color: "var(--text-hi)",
                    boxShadow: `0 8px 24px ${a.accent}20`,
                  }}
                >
                  <span
                    className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
                    style={{ background: `${a.accent}20`, color: a.accent }}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </span>
                  {label}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The orb */}
      <motion.button
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="ast-focus relative w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background: "var(--g-brass)",
          boxShadow: "0 8px 24px rgba(201,162,39,0.30), inset 0 1px 2px rgba(255,255,255,0.15)",
          border: "1px solid rgba(201,162,39,0.40)",
        }}
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        aria-expanded={open}
      >
        {/* Inner glow */}
        <div
          className="absolute inset-1 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(246,236,201,0.30), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <AnimatePresence mode="wait">
          {open ? (
            <motion.span
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <X className="w-5 h-5" strokeWidth={2} style={{ color: "var(--surface-0)" }} />
            </motion.span>
          ) : (
            <motion.span
              key="sparkle"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Sparkles
                className="w-5 h-5"
                strokeWidth={1.75}
                style={{ color: "var(--surface-0)" }}
              />
            </motion.span>
          )}
        </AnimatePresence>
        {/* Pulse ring when closed */}
        {!open && (
          <span
            className="absolute inset-0 rounded-full ast-pulse-ring"
            style={{ borderColor: "rgba(201,162,39,0.30)" }}
            aria-hidden="true"
          />
        )}
      </motion.button>
    </div>
  );
}
