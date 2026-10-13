"use client";

import { useEffect, useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  Compass, Map, MessageSquare, Inbox, User, Users, ClipboardList, Microscope,
  Search, Command, ShieldCheck, Languages, Monitor, Sparkles, X, ArrowRight, Server,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { TodayScreen } from "@/components/astrolabe/today-screen";
import { JourneyScreen } from "@/components/astrolabe/journey-screen";
import { AskScreen } from "@/components/astrolabe/ask-screen";
import { RequestsScreen } from "@/components/astrolabe/requests-screen";
import { MeScreen } from "@/components/astrolabe/me-screen";
import { HrbpScreen } from "@/components/astrolabe/hrbp-screen";
import { ManagerScreen } from "@/components/astrolabe/manager-screen";
import { JudgeScreen } from "@/components/astrolabe/judge-screen";
import { AdminScreen } from "@/components/astrolabe/admin-screen";
import { ServiceOwnerScreen } from "@/components/astrolabe/service-owner-screen";
import { Astrolabe3D } from "@/components/three/astrolabe";
import { NotificationsBell } from "@/components/astrolabe/notifications-bell";
import { ConstellationBg } from "@/components/astrolabe/constellation-bg";
import { PolicySearchModal } from "@/components/astrolabe/policy-search";

type View = "today" | "journey" | "ask" | "requests" | "me";
type Role = "employee" | "hrbp" | "manager" | "judge" | "admin" | "service_owner";

const EMPLOYEE_TABS: { id: View; label: string; labelAr: string; Icon: typeof Compass; hint: string }[] = [
  { id: "today", label: "Today", labelAr: "اليوم", Icon: Compass, hint: "What now?" },
  { id: "journey", label: "Journey", labelAr: "الرحلة", Icon: Map, hint: "Full map & history" },
  { id: "ask", label: "Ask", labelAr: "اسأل", Icon: MessageSquare, hint: "Cited policy answers" },
  { id: "requests", label: "Requests", labelAr: "الطلبات", Icon: Inbox, hint: "Status & intake" },
  { id: "me", label: "Me", labelAr: "حسابي", Icon: User, hint: "Consent & data" },
];

const ROLES: { id: Role; label: string; labelAr: string; Icon: typeof Compass; accent: string }[] = [
  { id: "employee", label: "Employee", labelAr: "موظف", Icon: User, accent: "var(--brand-500)" },
  { id: "hrbp", label: "HRBP", labelAr: "شريك الموارد", Icon: Users, accent: "var(--status-watch)" },
  { id: "manager", label: "Manager", labelAr: "مدير", Icon: ClipboardList, accent: "var(--accent-500)" },
  { id: "judge", label: "Judge", labelAr: "قاضٍ", Icon: Microscope, accent: "#8B5CF6" },
  { id: "admin", label: "Admin", labelAr: "إدارة", Icon: Server, accent: "var(--brand-400)" },
  { id: "service_owner", label: "Service owner", labelAr: "مالك الخدمة", Icon: Inbox, accent: "var(--brand-500)" },
];

const EMPLOYEES = [
  { id: "E-1042", name: "Maria Santos", journey: "Onboarding · Day 5", loc: "DXB" },
  { id: "E-1043", name: "Daniel Okonkwo", journey: "Onboarding · Visa", loc: "DXB" },
  { id: "E-1044", name: "Aisha Rahman", journey: "Mobility · Effective", loc: "AUH" },
  { id: "E-1045", name: "James Park", journey: "Onboarding · Day 1", loc: "DXB" },
  { id: "E-1046", name: "Sara Kovač", journey: "Mobility · Handover", loc: "DXB" },
];

export default function Home() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const role = useAppStore((s) => s.role);
  const setRole = useAppStore((s) => s.setRole);
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const employeeId = useAppStore((s) => s.currentEmployeeId);
  const setEmployee = useAppStore((s) => s.setEmployee);
  const projectorMode = useAppStore((s) => s.projectorMode);
  const toggleProjector = useAppStore((s) => s.toggleProjector);
  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPalette = useAppStore((s) => s.setCommandPalette);
  const degradedLevel = useAppStore((s) => s.degradedLevel);

  const dir = locale === "ar" ? "rtl" : "ltr";
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ⌘K command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPalette(!commandPaletteOpen);
      }
      if (e.key === "Escape") setCommandPalette(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen, setCommandPalette]);

  const showHero = role === "employee" && view === "today" && !scrolled;

  return (
    <div
      dir={dir}
      className={`flex min-h-screen flex-col ${projectorMode ? "projector" : ""}`}
      style={{ color: "var(--text-hi)" }}
    >
      {/* ========== CONSTELLATION BACKGROUND (fixed, behind everything) ========== */}
      <ConstellationBg />

      {/* ========== HEADER ========== */}
      <header
        className="sticky top-0 z-40 backdrop-blur-xl transition-all"
        style={{
          background: scrolled ? "rgba(11,17,28,0.92)" : "rgba(11,17,28,0.62)",
          borderBottom: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
        }}
      >
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-2 sm:gap-3">
          {/* Brand */}
          <button
            onClick={() => { setRole("employee"); setView("today"); }}
            className="ast-focus flex items-center gap-2.5 mr-auto group"
            aria-label="ASTROLABE home"
          >
            <div
              className="relative flex items-center justify-center w-9 h-9 rounded-full transition-transform group-hover:rotate-12"
              style={{
                background: "radial-gradient(circle at 30% 30%, rgba(22,154,165,0.35), rgba(11,17,28,0.4))",
                border: "1px solid rgba(22,154,165,0.35)",
                boxShadow: "0 0 0 1px rgba(201,162,39,0.15), 0 6px 16px rgba(22,154,165,0.18)",
              }}
            >
              <Compass className="w-4 h-4" strokeWidth={1.75} style={{ color: "var(--brand-400)" }} />
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ background: "var(--accent-500)", boxShadow: "0 0 6px rgba(201,162,39,0.6)" }}
              />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span
                className="text-[13px] font-semibold uppercase ast-brass"
                style={{ letterSpacing: "0.22em" }}
              >
                ASTROLABE
              </span>
              <span
                className="text-[9px] uppercase tracking-[0.18em] hidden sm:block"
                style={{ color: "var(--text-lo)" }}
              >
                {locale === "ar" ? "بوصلتك في الرحلة" : "Journey companion"}
              </span>
            </div>
          </button>

          {/* Employee tabs (only in employee role) */}
          {role === "employee" && (
            <nav
              className="flex items-center gap-0.5 p-1 rounded-full overflow-x-auto max-w-[55%] sm:max-w-none"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              aria-label="View switcher"
            >
              {EMPLOYEE_TABS.map((t) => {
                const Icon = t.Icon;
                const isActive = view === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setView(t.id)}
                    aria-pressed={isActive}
                    aria-label={locale === "ar" ? t.labelAr : t.label}
                    title={t.hint}
                    className="ast-focus relative inline-flex items-center gap-1.5 h-7 px-2.5 sm:px-3 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap"
                    style={{
                      color: isActive ? "var(--surface-0)" : "var(--text-mid)",
                    }}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="active-tab-pill"
                        className="absolute inset-0 rounded-full"
                        style={{ background: "var(--brand-500)" }}
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <Icon className="w-3.5 h-3.5 relative z-10" strokeWidth={1.75} />
                    <span className="hidden sm:inline relative z-10">
                      {locale === "ar" ? t.labelAr : t.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Command palette trigger */}
          <button
            onClick={() => setCommandPalette(true)}
            aria-label="Command palette (⌘K)"
            title="⌘K"
            className="ast-focus hidden md:inline-flex items-center gap-2 h-8 px-2.5 rounded-full text-[11px] tabular"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-lo)",
            }}
          >
            <Search className="w-3 h-3" strokeWidth={1.75} />
            <span className="hidden lg:inline">Search…</span>
            <kbd
              className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-mono"
              style={{ background: "var(--surface-3)", color: "var(--text-mid)" }}
            >
              ⌘K
            </kbd>
          </button>

          {/* Notifications bell */}
          <NotificationsBell />

          {/* Projector toggle */}
          <button
            onClick={toggleProjector}
            aria-pressed={projectorMode}
            aria-label="Projector mode"
            title="Projector mode"
            className="ast-focus inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors"
            style={{
              background: projectorMode ? "var(--accent-500)" : "var(--surface-2)",
              color: projectorMode ? "var(--surface-0)" : "var(--text-mid)",
              border: `1px solid ${projectorMode ? "var(--accent-500)" : "var(--border)"}`,
            }}
          >
            <Monitor className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>

          {/* Locale toggle */}
          <button
            onClick={() => setLocale(locale === "en" ? "ar" : "en")}
            className="ast-focus inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-hi)",
            }}
            aria-label="Toggle language"
          >
            <Languages className="w-3 h-3" strokeWidth={1.75} />
            {locale === "en" ? "AR" : "EN"}
          </button>
        </div>

        {/* Role switcher strip */}
        <div className="border-t" style={{ borderColor: "var(--border-soft)" }}>
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center gap-1.5 overflow-x-auto">
            <span
              className="text-[10px] uppercase tracking-[0.14em] mr-1 whitespace-nowrap"
              style={{ color: "var(--text-lo)" }}
            >
              {locale === "ar" ? "وضع" : "Mode"}
            </span>
            {ROLES.map((r) => {
              const Icon = r.Icon;
              const isActive = role === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setRole(r.id)}
                  aria-pressed={isActive}
                  className="ast-focus inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all"
                  style={{
                    background: isActive ? r.accent : "transparent",
                    color: isActive ? "var(--surface-0)" : "var(--text-mid)",
                    border: `1px solid ${isActive ? r.accent : "var(--border)"}`,
                  }}
                >
                  <Icon className="w-3 h-3" strokeWidth={1.75} />
                  {locale === "ar" ? r.labelAr : r.label}
                </button>
              );
            })}

            {/* Employee picker for judge/preview */}
            {(role === "employee" || role === "judge") && (
              <div className="ml-auto flex items-center gap-1.5">
                <span
                  className="text-[10px] uppercase tracking-[0.14em] hidden sm:inline"
                  style={{ color: "var(--text-lo)" }}
                >
                  {locale === "ar" ? "السيناريو" : "Scenario"}
                </span>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployee(e.target.value)}
                  aria-label="Employee scenario"
                  className="ast-focus h-7 px-2 rounded-full text-[11px] tabular"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-hi)",
                  }}
                >
                  {EMPLOYEES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.id} · {e.name} ({e.journey})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Degraded banner */}
        {degradedLevel !== "L0" && (
          <div
            className="px-4 sm:px-6 lg:px-8 py-2 text-[11px] flex items-center gap-2"
            style={{
              background: "rgba(217,119,6,0.10)",
              borderBottom: "1px solid rgba(217,119,6,0.30)",
              color: "var(--status-watch)",
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>
              {degradedLevel === "L1" && (locale === "ar" ? "نقتبس السياسة مباشرة الآن" : "Quoting policy directly right now")}
              {degradedLevel === "L2" && (locale === "ar" ? "بحث السياسة غير متاح — سأحيلك للمالك المناسب" : "Policy search unavailable — handing you to the right owner")}
              {degradedLevel === "L3" && (locale === "ar" ? "طلبك في قائمة الانتظار، لم يُفقد" : "Your request is queued, not lost")}
              {degradedLevel === "L4" && (locale === "ar" ? "وضع القراءة فقط — إليك من تتواصل معه" : "Read-only mode — here is who to contact")}
            </span>
          </div>
        )}
      </header>

      {/* ========== 3D ASTROLABE HERO (Today only, when not scrolled) ========== */}
      <AnimatePresence>
        {showHero && <HeroParallax key="hero" />}
      </AnimatePresence>

      {/* ========== MAIN ========== */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {role === "employee" && (
          <>
            {view === "today" && <TodayScreen />}
            {view === "journey" && <JourneyScreen />}
            {view === "ask" && <AskScreen />}
            {view === "requests" && <RequestsScreen />}
            {view === "me" && <MeScreen />}
          </>
        )}
        {role === "hrbp" && <HrbpScreen />}
        {role === "manager" && <ManagerScreen />}
        {role === "judge" && <JudgeScreen />}
        {role === "admin" && <AdminScreen />}
        {role === "service_owner" && <ServiceOwnerScreen />}
      </main>

      {/* ========== FOOTER (sticky to bottom) ========== */}
      <footer
        className="mt-auto border-t"
        style={{
          borderColor: "var(--border)",
          background: "var(--surface-1)",
        }}
      >
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="flex items-center justify-center w-6 h-6 rounded-full"
                  style={{ background: "var(--g-veil)", color: "var(--brand-400)" }}
                >
                  <Compass className="w-3 h-3" strokeWidth={1.75} />
                </div>
                <span
                  className="text-[11px] font-semibold uppercase ast-brass"
                  style={{ letterSpacing: "0.2em" }}
                >
                  ASTROLABE
                </span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-lo)" }}>
                {locale === "ar"
                  ? "أداة ملاحة للموظف. المحرك يقرر، النموذج يشرح. كل إجابة تستشهد بمصدرها. غير المتأكد إجابة من الدرجة الأولى."
                  : "An employee-side navigation instrument. The engine decides, the model explains. Every answer cites its source. Unsure is a first-class answer."}
              </p>
            </div>

            {/* Engine + versions */}
            <div>
              <h4 className="text-[10px] uppercase tracking-[0.16em] mb-2" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "المحرك" : "Engine"}
              </h4>
              <ul className="space-y-1 text-[11px] tabular" style={{ color: "var(--text-mid)" }}>
                <li className="flex justify-between"><span>{locale === "ar" ? "إصدار المحرك" : "Engine"}</span><span style={{ color: "var(--text-hi)" }}>1.0.0</span></li>
                <li className="flex justify-between"><span>{locale === "ar" ? "إصدار الخريطة" : "Map"}</span><span style={{ color: "var(--text-hi)" }}>1.0.0</span></li>
                <li className="flex justify-between"><span>{locale === "ar" ? "إصدار السياسات" : "Corpus"}</span><span style={{ color: "var(--text-hi)" }}>2024-Q4</span></li>
                <li className="flex justify-between"><span>{locale === "ar" ? "حزمة البيانات" : "Data pack"}</span><span style={{ color: "var(--text-hi)" }}>synthetic</span></li>
              </ul>
            </div>

            {/* Privacy + RAI */}
            <div>
              <h4 className="text-[10px] uppercase tracking-[0.16em] mb-2" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "الخصوصية" : "Privacy"}
              </h4>
              <ul className="space-y-1 text-[11px]" style={{ color: "var(--text-mid)" }}>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3" style={{ color: "var(--status-steady)" }} strokeWidth={1.75} />
                  {locale === "ar" ? "الموافقة بوابة" : "Consent is a gate"}
                </li>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3" style={{ color: "var(--status-steady)" }} strokeWidth={1.75} />
                  {locale === "ar" ? "ليس للأداء أو التأديب" : "Not for performance use"}
                </li>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3" style={{ color: "var(--status-steady)" }} strokeWidth={1.75} />
                  {locale === "ar" ? "تصعيد بمسؤول اسمي" : "Named-human escalation"}
                </li>
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3" style={{ color: "var(--status-steady)" }} strokeWidth={1.75} />
                  {locale === "ar" ? "سجل تدقيق متسلسل" : "Hash-chained audit"}
                </li>
              </ul>
            </div>

            {/* Health */}
            <div>
              <h4 className="text-[10px] uppercase tracking-[0.16em] mb-2" style={{ color: "var(--text-lo)" }}>
                {locale === "ar" ? "الصحة" : "Health"}
              </h4>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-mid)" }}>{locale === "ar" ? "الحالة" : "Status"}</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="ast-dot ast-dot-steady" />
                    <span style={{ color: "var(--status-steady)" }}>{locale === "ar" ? "كل الأنظمة تعمل" : "All systems"}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between tabular">
                  <span style={{ color: "var(--text-mid)" }}>{locale === "ar" ? "زمن الاستجابة" : "Hot p95"}</span>
                  <span style={{ color: "var(--text-hi)" }}>28ms</span>
                </div>
                <div className="flex items-center justify-between tabular">
                  <span style={{ color: "var(--text-mid)" }}>{locale === "ar" ? "معدل الامتناع" : "Abstain rate"}</span>
                  <span style={{ color: "var(--text-hi)" }}>12%</span>
                </div>
                <div className="flex items-center justify-between tabular">
                  <span style={{ color: "var(--text-mid)" }}>{locale === "ar" ? "دقة الاستشهاد" : "Citations"}</span>
                  <span style={{ color: "var(--status-steady)" }}>100%</span>
                </div>
              </div>
            </div>
          </div>

          <div
            className="mt-5 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] tabular"
            style={{ borderTop: "1px solid var(--border-soft)", color: "var(--text-lo)" }}
          >
            <span>
              © 2024 ASTROLABE · {locale === "ar" ? "بيانات تركيبية فقط" : "Synthetic data only"} · {locale === "ar" ? "نموذج أولي" : "Prototype build"}
            </span>
            <span className="flex items-center gap-3">
              <span>v1.0.0</span>
              <span>·</span>
              <span>{locale === "ar" ? "آخر تحديث" : "Last refreshed"}: 2s</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <kbd
                  className="px-1 py-0.5 rounded font-mono"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-mid)" }}
                >
                  ⌘K
                </kbd>
                {locale === "ar" ? "للأوامر" : "for commands"}
              </span>
            </span>
          </div>
        </div>
      </footer>

      {/* ========== COMMAND PALETTE ========== */}
      <AnimatePresence>
        {commandPaletteOpen && (
          <CommandPalette
            onClose={() => setCommandPalette(false)}
            onNavigate={(v) => { setView(v); setRole("employee"); setCommandPalette(false); }}
            onRole={(r) => { setRole(r); setCommandPalette(false); }}
            onEmployee={(id) => { setEmployee(id); setCommandPalette(false); }}
            onLocale={() => { setLocale(locale === "en" ? "ar" : "en"); setCommandPalette(false); }}
            onPolicySearch={() => { useAppStore.getState().setPolicySearchOpen(true); setCommandPalette(false); }}
          />
        )}
      </AnimatePresence>

      {/* ========== GLOBAL POLICY SEARCH MODAL (PRD §18-347) ========== */}
      <PolicySearchModal />
    </div>
  );
}

/* ============================================================
   HERO PARALLAX — 3D astrolabe + hero text
   - Astrolabe canvas shifts max 8px opposite the cursor
   - Hero text shifts max 4px with the cursor
   - 60fps via framer-motion useMotionValue + useTransform
   - Disabled on touch devices and when prefers-reduced-motion
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

function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}

function HeroParallax() {
  const locale = useAppStore((s) => s.locale);
  const setView = useAppStore((s) => s.setView);
  const reduce = usePrefersReducedMotion();
  const fine = useFinePointer();
  const enabled = !reduce && fine;

  // Normalised cursor offset from the centre of the hero, in [-0.5, 0.5].
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  // Astrolabe: 8px in the opposite direction of the cursor.
  const astX: MotionValue<number> = useTransform(mx, [-0.5, 0.5], [8, -8]);
  const astY: MotionValue<number> = useTransform(my, [-0.5, 0.5], [8, -8]);
  // Hero text: 4px in the same direction as the cursor.
  const textX: MotionValue<number> = useTransform(mx, [-0.5, 0.5], [-4, 4]);
  const textY: MotionValue<number> = useTransform(my, [-0.5, 0.5], [-4, 4]);

  // Scroll-linked rotation — as the user scrolls down, the astrolabe
  // slowly rotates up to 30deg over the first 200px of scroll. Creates
  // a "the instrument turns as you navigate" effect. Desktop-only and
  // reduced-motion-aware (the rotate MotionValue is only applied when
  // `enabled` is true; under reduced-motion the astrolabe renders
  // static, matching the existing cursor-parallax behavior).
  const { scrollY } = useScroll();
  const astRotate: MotionValue<number> = useTransform(scrollY, [0, 200], [0, 30]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width - 0.5);
    my.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative overflow-hidden"
      style={{ borderBottom: "1px solid var(--border-soft)" }}
      onMouseMove={enabled ? handleMouseMove : undefined}
      onMouseLeave={enabled ? handleMouseLeave : undefined}
    >
      {/* Veil gradient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--g-veil)" }}
        aria-hidden="true"
      />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-center">
        <motion.div
          style={enabled ? { x: textX, y: textY } : undefined}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--accent-500)" }} strokeWidth={1.75} />
            <span
              className="text-[11px] uppercase tracking-[0.18em]"
              style={{ color: "var(--accent-500)" }}
            >
              {locale === "ar" ? "أداة ملاحة، لا أداة مراقبة" : "A navigation instrument, not a surveillance one"}
            </span>
          </div>
          <h1
            className="text-[28px] sm:text-[36px] lg:text-[44px] font-semibold leading-[1.08] tracking-[-0.02em]"
            style={{ color: "var(--text-hi)", maxWidth: "640px" }}
          >
            {locale === "ar"
              ? "نحن نعرف بالضبط أين تقف في رحلتك."
              : "We know exactly where you stand on your journey."}
          </h1>
          <p
            className="mt-3 text-[14px] sm:text-[16px] leading-relaxed max-w-[560px]"
            style={{ color: "var(--text-mid)" }}
          >
            {locale === "ar"
              ? "المحرك الحتمي يملك كل قرار. النموذج يشرح ويصيغ ويترجم — لا يسجّل، لا يقرر، لا يرى ما لم توافق على مشاركته."
              : "The deterministic engine owns every verdict, band, and route. The model explains, drafts, and translates — it never scores, never decides, never acts."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setView("ask")}
              className="ast-focus inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-medium transition-transform hover:translate-y-[-1px]"
              style={{
                background: "var(--accent-500)",
                color: "var(--surface-0)",
                boxShadow: "0 6px 18px rgba(201,162,39,0.30)",
              }}
            >
              {locale === "ar" ? "اسأل سياسة" : "Ask a policy question"}
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
            <button
              onClick={() => setView("journey")}
              className="ast-focus inline-flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-medium"
              style={{
                background: "transparent",
                color: "var(--text-hi)",
                border: "1px solid var(--border)",
              }}
            >
              <Map className="w-3.5 h-3.5" strokeWidth={1.75} />
              {locale === "ar" ? "تصفح رحلتك" : "See your full map"}
            </button>
          </div>
        </motion.div>

        <motion.div
          className="hidden lg:block relative h-[260px]"
          style={enabled ? { x: astX, y: astY, rotate: astRotate } : undefined}
          transition={{ type: "spring", stiffness: 120, damping: 18 }}
        >
          <Astrolabe3D size={1.05} spin />
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.18em] whitespace-nowrap"
            style={{ color: "var(--text-lo)" }}
          >
            {locale === "ar" ? "الأسطرلاب · مكتشف الرحلة" : "Astrolabe · journey instrument"}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ============================================================
   COMMAND PALETTE — ⌘K
   ============================================================ */
function CommandPalette({
  onClose,
  onNavigate,
  onRole,
  onEmployee,
  onLocale,
  onPolicySearch,
}: {
  onClose: () => void;
  onNavigate: (v: View) => void;
  onRole: (r: Role) => void;
  onEmployee: (id: string) => void;
  onLocale: () => void;
  onPolicySearch: () => void;
}) {
  const [query, setQuery] = useState("");
  const locale = useAppStore((s) => s.locale);

  const items = [
    { group: locale === "ar" ? "انتقل" : "Navigate", actions: [
      { id: "today", label: locale === "ar" ? "اليوم" : "Today", hint: "What now?", run: () => onNavigate("today") },
      { id: "journey", label: locale === "ar" ? "الرحلة" : "Journey", hint: "Full map", run: () => onNavigate("journey") },
      { id: "ask", label: locale === "ar" ? "اسأل" : "Ask", hint: "Cited answers", run: () => onNavigate("ask") },
      { id: "requests", label: locale === "ar" ? "الطلبات" : "Requests", hint: "Intake & status", run: () => onNavigate("requests") },
      { id: "me", label: locale === "ar" ? "حسابي" : "Me", hint: "Consent & data", run: () => onNavigate("me") },
    ]},
    { group: locale === "ar" ? "الوضع" : "Mode", actions: [
      { id: "employee", label: locale === "ar" ? "موظف" : "Employee", hint: "Journey companion", run: () => onRole("employee") },
      { id: "hrbp", label: "HRBP", hint: "Early warning queue", run: () => onRole("hrbp") },
      { id: "manager", label: locale === "ar" ? "مدير" : "Manager", hint: "Aggregate view", run: () => onRole("manager") },
      { id: "judge", label: locale === "ar" ? "قاضٍ" : "Judge", hint: "Engine trace", run: () => onRole("judge") },
      { id: "admin", label: locale === "ar" ? "إدارة" : "Admin", hint: "Operability console", run: () => onRole("admin") },
      { id: "service_owner", label: locale === "ar" ? "مالك الخدمة" : "Service owner", hint: "Intake queue + payload", run: () => onRole("service_owner") },
    ]},
    { group: locale === "ar" ? "بحث" : "Search", actions: [
      { id: "policy-search", label: locale === "ar" ? "ابحث في السياسات" : "Search policies", hint: locale === "ar" ? "عبر كل الوثائق" : "Across all docs", run: onPolicySearch },
    ]},
    { group: locale === "ar" ? "السيناريو" : "Scenario", actions: EMPLOYEES.map((e) => ({
      id: e.id, label: `${e.id} · ${e.name}`, hint: e.journey, run: () => onEmployee(e.id),
    }))},
    { group: locale === "ar" ? "إجراءات" : "Actions", actions: [
      { id: "locale", label: locale === "ar" ? "تبديل اللغة" : "Toggle language", hint: "EN ⇄ AR", run: onLocale },
    ]},
  ];

  const filtered = items
    .map((g) => ({
      ...g,
      actions: g.actions.filter((a) =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        a.hint.toLowerCase().includes(query.toLowerCase())
      ),
    }))
    .filter((g) => g.actions.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
      style={{ background: "rgba(11,17,28,0.70)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -8 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="ast-card-glass w-full max-w-[560px] overflow-hidden"
        style={{
          boxShadow: "var(--e3)",
        }}
      >
        {/* Input */}
        <div
          className="flex items-center gap-2.5 px-4 h-12 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <Command className="w-4 h-4" style={{ color: "var(--text-lo)" }} strokeWidth={1.75} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={locale === "ar" ? "ابحث عن إجراء، صفحة، سيناريو…" : "Search actions, views, scenarios…"}
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:opacity-50"
            style={{ color: "var(--text-hi)" }}
          />
          <button
            onClick={onClose}
            className="ast-focus inline-flex items-center justify-center w-6 h-6 rounded-md"
            style={{ background: "var(--surface-2)", color: "var(--text-mid)" }}
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[420px] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--text-lo)" }}>
              {locale === "ar" ? "لا نتائج" : "No results"}
            </div>
          )}
          {filtered.map((g) => (
            <div key={g.group} className="mb-1">
              <div
                className="px-4 py-1.5 text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--text-lo)" }}
              >
                {g.group}
              </div>
              {g.actions.map((a) => (
                <button
                  key={a.id}
                  onClick={a.run}
                  className="ast-focus w-full flex items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="text-[13px] font-medium" style={{ color: "var(--text-hi)" }}>
                    {a.label}
                  </span>
                  <span className="text-[11px] ml-auto" style={{ color: "var(--text-lo)" }}>
                    {a.hint}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2 text-[10px] tabular border-t"
          style={{ borderColor: "var(--border)", color: "var(--text-lo)" }}
        >
          <span className="flex items-center gap-2">
            <kbd className="px-1 py-0.5 rounded font-mono" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>↑↓</kbd>
            {locale === "ar" ? "تنقل" : "navigate"}
            <kbd className="px-1 py-0.5 rounded font-mono ml-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>↵</kbd>
            {locale === "ar" ? "اختيار" : "select"}
          </span>
          <span>ASTROLABE v1.0.0</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
