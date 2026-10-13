/**
 * ASTROLABE Client State — Zustand
 * Drives the single-page app on `/` route.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "employee" | "hrbp" | "manager" | "judge" | "admin" | "service_owner";
export type View = "today" | "journey" | "ask" | "requests" | "me";
export type Locale = "en" | "ar";
export type DegradedLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export interface AppState {
  // Identity
  role: Role;
  currentEmployeeId: string; // for employee view + judge scenario switcher
  locale: Locale;
  view: View;
  hrbpView: "queue" | "employee" | "stalls";
  managerView: "cohort" | "my_steps" | "compare";
  judgeView: "scenarios" | "trace" | "degraded" | "backtest";

  // Display prefs
  projectorMode: boolean;
  reducedMotion: boolean;
  theme: "dark" | "light";

  // Consent (live-flipped in UI; mirrored from server)
  consentOverrides: Record<string, boolean>;

  // Degraded mode (judge simulator)
  degradedLevel: DegradedLevel;
  asOfOffsetHours: number; // for judge as-of clock

  // Command palette
  commandPaletteOpen: boolean;

  // Active escalation packet
  activeEscalationId?: string;

  // Active request being intaked
  activeRequestType?: string;

  // PRD §18-347 — global policy search modal (opens from Ask screen header
  // and the ⌘K command palette).
  policySearchOpen: boolean;
  policySearchInitialQuery?: string;

  // PRD §18-347 — prefilled question for the Ask tab (set when the user
  // clicks "Ask about this instead" inside the policy search modal).
  askPrefill?: string;

  // Actions
  setRole: (r: Role) => void;
  setEmployee: (id: string) => void;
  setLocale: (l: Locale) => void;
  setView: (v: View) => void;
  setHrbpView: (v: AppState["hrbpView"]) => void;
  setManagerView: (v: AppState["managerView"]) => void;
  setJudgeView: (v: AppState["judgeView"]) => void;
  toggleProjector: () => void;
  toggleReducedMotion: () => void;
  toggleTheme: () => void;
  setConsent: (purpose: string, granted: boolean) => void;
  setDegradedLevel: (l: DegradedLevel) => void;
  setAsOfOffset: (h: number) => void;
  setCommandPalette: (open: boolean) => void;
  setActiveEscalation: (id?: string) => void;
  setActiveRequestType: (t?: string) => void;
  setPolicySearchOpen: (open: boolean, initialQuery?: string) => void;
  setAskPrefill: (q?: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      role: "employee",
      currentEmployeeId: "E-1042",
      locale: "en",
      view: "today",
      hrbpView: "queue",
      managerView: "cohort",
      judgeView: "scenarios",
      projectorMode: false,
      reducedMotion: false,
      theme: "dark",
      consentOverrides: {},
      degradedLevel: "L0",
      asOfOffsetHours: 0,
      commandPaletteOpen: false,
      policySearchOpen: false,

      setRole: (r) => set({ role: r }),
      setEmployee: (id) => set({ currentEmployeeId: id }),
      setLocale: (l) => set({ locale: l }),
      setView: (v) => set({ view: v }),
      setHrbpView: (v) => set({ hrbpView: v }),
      setManagerView: (v) => set({ managerView: v }),
      setJudgeView: (v) => set({ judgeView: v }),
      toggleProjector: () => set((s) => ({ projectorMode: !s.projectorMode })),
      toggleReducedMotion: () => set((s) => ({ reducedMotion: !s.reducedMotion })),
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setConsent: (purpose, granted) => set((s) => ({ consentOverrides: { ...s.consentOverrides, [purpose]: granted } })),
      setDegradedLevel: (l) => set({ degradedLevel: l }),
      setAsOfOffset: (h) => set({ asOfOffsetHours: h }),
      setCommandPalette: (open) => set({ commandPaletteOpen: open }),
      setActiveEscalation: (id) => set({ activeEscalationId: id }),
      setActiveRequestType: (t) => set({ activeRequestType: t }),
      setPolicySearchOpen: (open, initialQuery) =>
        set({ policySearchOpen: open, policySearchInitialQuery: open ? initialQuery : undefined }),
      setAskPrefill: (q) => set({ askPrefill: q }),
    }),
    {
      name: "astrolabe-state",
      partialize: (s) => ({
        role: s.role,
        currentEmployeeId: s.currentEmployeeId,
        locale: s.locale,
        view: s.view,
        projectorMode: s.projectorMode,
        reducedMotion: s.reducedMotion,
        theme: s.theme,
        consentOverrides: s.consentOverrides,
        degradedLevel: s.degradedLevel,
      }),
    }
  )
);
