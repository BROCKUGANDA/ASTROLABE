"use client";

/* ============================================================
   ASTROLABE — Notifications bell + inbox panel
   PRD §07 — fewest notifications that keep a journey moving.
   One daily digest unless genuinely urgent. Quiet hours
   respected. One tap to the exact step. In-app inbox mirrors
   every message. Snooze or archive in every non-critical
   message. One kill switch stops all outbound.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistance } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  Archive,
  X,
  ChevronRight,
  Moon,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "@/lib/store/app-store";
import { NOW as PACK_NOW } from "@/lib/data/pack";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { Locale } from "date-fns";

/* ---------- Types (mirror the API envelope) ---------- */

type NotificationType =
  | "step_due"
  | "step_late"
  | "request_update"
  | "escalation"
  | "pulse_prompt"
  | "digest"
  | "system";

type NotificationPriority = "urgent" | "normal" | "low";

type NotificationView = "today" | "journey" | "ask" | "requests" | "me";

interface NotificationAction {
  label: string;
  labelAr: string;
  view: NotificationView;
  stepKey?: string;
}

interface Notification {
  id: string;
  employeeId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  action?: NotificationAction;
  createdAt: string;
  readAt?: string;
  snoozedUntil?: string;
  archivedAt?: string;
  category: "journey" | "request" | "hrbp" | "pulse" | "system";
}

interface QuietHours {
  start: string;
  end: string;
  tz: string;
}

interface DigestConfig {
  enabled: boolean;
  scheduledAt: string;
}

interface NotificationsData {
  items: Notification[];
  quietHours: QuietHours;
  killSwitch: boolean;
  digest: DigestConfig;
}

type Filter = "all" | "unread" | "urgent" | "archived";

/* ---------- priority config ---------- */
// Sand-gold is RESERVED for "your next move" surfaces (PRD theme).
// Per-notification priority uses red (urgent) / teal (normal) / gray (low).
// The bell's unread badge uses sand-gold because "you have something to act on"
// IS the next-move prompt.
const PRIORITY_DOT: Record<
  NotificationPriority,
  { color: string; glow: string; label: string; labelAr: string }
> = {
  urgent: {
    color: "var(--status-friction)",
    glow: "0 0 8px rgba(220,38,38,0.55)",
    label: "Urgent",
    labelAr: "عاجل",
  },
  normal: {
    color: "var(--brand-500)",
    glow: "0 0 8px rgba(22,154,165,0.45)",
    label: "Normal",
    labelAr: "عادي",
  },
  low: {
    color: "var(--text-lo)",
    glow: "none",
    label: "Low",
    labelAr: "منخفض",
  },
};

/* ---------- time helpers (synthetic NOW, not real time) ---------- */

function timeAgo(iso: string, locale: Locale): string {
  return formatDistance(new Date(iso), PACK_NOW, {
    addSuffix: true,
    locale,
  });
}

function dateBucket(iso: string): "today" | "yesterday" | "earlier" {
  const d = new Date(iso);
  const now = PACK_NOW;
  const dayMs = 24 * 3600 * 1000;
  // Compare calendar days in UTC (synthetic data is UTC).
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const startOfThat = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate()
  );
  const diffDays = Math.round((startOfToday - startOfThat) / dayMs);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "earlier";
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export function NotificationsBell() {
  const locale = useAppStore((s) => s.locale);
  const setView = useAppStore((s) => s.setView);
  const setRole = useAppStore((s) => s.setRole);
  const employeeId = useAppStore((s) => s.currentEmployeeId);

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const isAr = locale === "ar";
  const dateLocale: Locale = isAr ? arLocale : enUS;

  /* ---------- fetch ---------- */
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/notifications?employeeId=${encodeURIComponent(employeeId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { ok: boolean; data: NotificationsData | null; error?: { message?: string } | null };
      if (!json.ok || !json.data) {
        throw new Error(json.error?.message ?? "Failed to load notifications");
      }
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  // Fetch on mount + whenever the panel is opened (refresh state).
  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);
  useEffect(() => {
    if (open) void fetchNotifications();
  }, [open, fetchNotifications]);

  /* ---------- derived ---------- */
  const items = data?.items ?? [];
  const unreadCount = useMemo(
    () => items.filter((n) => !n.readAt && !n.archivedAt).length,
    [items]
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "unread":
        return items.filter((n) => !n.readAt && !n.archivedAt);
      case "urgent":
        return items.filter((n) => n.priority === "urgent" && !n.archivedAt);
      case "archived":
        return items.filter((n) => !!n.archivedAt);
      case "all":
      default:
        return items.filter((n) => !n.archivedAt);
    }
  }, [items, filter]);

  const grouped = useMemo(() => {
    const buckets: Record<"today" | "yesterday" | "earlier", Notification[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const n of filtered) {
      buckets[dateBucket(n.createdAt)].push(n);
    }
    return buckets;
  }, [filtered]);

  /* ---------- actions ---------- */
  const postAction = useCallback(
    async (id: string, action: "read" | "snooze" | "archive", hours?: number) => {
      setPendingAction(`${id}:${action}`);
      try {
        const res = await fetch("/api/v1/notifications/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action, hours }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { ok: boolean };
        if (!json.ok) throw new Error("Action failed");
        // Optimistic refresh
        await fetchNotifications();
      } catch (e) {
        toast.error(isAr ? "تعذّر تنفيذ الإجراء" : "Couldn't apply that action");
      } finally {
        setPendingAction(null);
      }
    },
    [fetchNotifications, isAr]
  );

  const markAllRead = useCallback(async () => {
    const unread = items.filter((n) => !n.readAt && !n.archivedAt);
    if (unread.length === 0) return;
    setPendingAction("mark-all");
    try {
      await Promise.all(
        unread.map((n) =>
          fetch("/api/v1/notifications/action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: n.id, action: "read" }),
          })
        )
      );
      await fetchNotifications();
      toast.success(
        isAr ? `تمّ تعليم ${unread.length} كمقروء` : `Marked ${unread.length} as read`
      );
    } catch {
      toast.error(isAr ? "تعذّر التحديث" : "Couldn't mark all read");
    } finally {
      setPendingAction(null);
    }
  }, [items, fetchNotifications, isAr]);

  const toggleKillSwitch = useCallback(
    async (enabled: boolean) => {
      try {
        const res = await fetch("/api/v1/notifications/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: "global", action: "kill_switch", enabled }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { ok: boolean };
        if (!json.ok) throw new Error("Action failed");
        setData((d) => (d ? { ...d, killSwitch: enabled } : d));
        if (enabled) {
          toast.warning(
            isAr
              ? "تمّ إيقاف كل الإشعارات الصادرة فوراً"
              : "All outbound notifications stopped — instantly"
          );
        } else {
          toast.success(
            isAr ? "استؤنفت الإشعارات" : "Notifications resumed"
          );
        }
      } catch {
        toast.error(isAr ? "تعذّر تبديل المفتاح" : "Couldn't toggle the switch");
      }
    },
    [isAr]
  );

  const handleActionClick = useCallback(
    (n: Notification) => {
      if (!n.action) return;
      setRole("employee");
      setView(n.action.view);
      // mark read on tap-through
      if (!n.readAt) void postAction(n.id, "read");
      setOpen(false);
    },
    [postAction, setRole, setView]
  );

  const killSwitchOn = data?.killSwitch ?? false;

  /* ============================================================
     RENDER
     ============================================================ */
  return (
    <>
      {/* ---------- BELL BUTTON ---------- */}
      <button
        onClick={() => setOpen(true)}
        aria-label={
          isAr
            ? `الإشعارات${unreadCount > 0 ? `، ${unreadCount} غير مقروء` : ""}`
            : `Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`
        }
        title={isAr ? "الإشعارات" : "Notifications"}
        className="ast-focus relative inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: unreadCount > 0 ? "var(--text-hi)" : "var(--text-mid)",
        }}
      >
        <Bell className="w-3.5 h-3.5" strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full inline-flex items-center justify-center text-[9px] font-bold tabular"
            style={{
              background: "var(--accent-500)",
              color: "var(--surface-0)",
              boxShadow: "0 0 6px rgba(201,162,39,0.55)",
              border: "1.5px solid var(--surface-0)",
            }}
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {unreadCount > 0 && (
          <span
            className="ast-pulse-ring absolute inset-0 rounded-full pointer-events-none"
            aria-hidden="true"
          />
        )}
      </button>

      {/* ---------- PANEL ---------- */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50"
            style={{ background: "rgba(11,17,28,0.72)", backdropFilter: "blur(6px)" }}
            onClick={() => setOpen(false)}
            dir={isAr ? "rtl" : "ltr"}
          >
            <motion.div
              key="notif-panel"
              initial={{ x: isAr ? "-100%" : "100%" }}
              animate={{ x: 0 }}
              exit={{ x: isAr ? "-100%" : "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
              onClick={(e) => e.stopPropagation()}
              className="ast-card-glass absolute top-0 bottom-0 w-full sm:w-[420px] flex flex-col"
              style={{
                [isAr ? "left" : "right"]: 0,
                borderRadius: 0,
                borderInlineStart: "1px solid rgba(22, 154, 165, 0.18)",
                boxShadow: "var(--e3)",
              }}
              role="dialog"
              aria-modal="true"
              aria-label={isAr ? "صندوق الإشعارات" : "Notifications inbox"}
            >
              {/* ===== Header ===== */}
              <div
                className="flex items-center gap-2 px-4 h-14 shrink-0 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center justify-center w-7 h-7 rounded-full"
                    style={{
                      background: "rgba(22,154,165,0.12)",
                      border: "1px solid rgba(22,154,165,0.30)",
                      color: "var(--brand-400)",
                    }}
                  >
                    <Bell className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </div>
                  <div className="flex flex-col leading-none">
                    <span
                      className="text-[14px] font-semibold"
                      style={{ color: "var(--text-hi)" }}
                    >
                      {isAr ? "الإشعارات" : "Notifications"}
                    </span>
                    <span
                      className="text-[10px] tabular mt-0.5"
                      style={{ color: "var(--text-lo)" }}
                    >
                      {unreadCount > 0
                        ? isAr
                          ? `${unreadCount} غير مقروء`
                          : `${unreadCount} unread`
                        : isAr
                        ? "كل شيء مقروء"
                        : "All caught up"}
                    </span>
                  </div>
                </div>

                <div className="ms-auto flex items-center gap-1">
                  <button
                    onClick={markAllRead}
                    disabled={unreadCount === 0 || pendingAction === "mark-all"}
                    aria-label={isAr ? "تعليم الكل كمقروء" : "Mark all read"}
                    title={isAr ? "تعليم الكل كمقروء" : "Mark all read"}
                    className="ast-focus inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[11px] font-medium transition-colors disabled:opacity-40"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-mid)",
                    }}
                  >
                    <CheckCheck className="w-3 h-3" strokeWidth={1.75} />
                    <span className="hidden sm:inline">
                      {isAr ? "قراءة الكل" : "Mark all"}
                    </span>
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label={isAr ? "إغلاق" : "Close"}
                    className="ast-focus inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-mid)",
                    }}
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {/* ===== Filter tabs ===== */}
              <div
                className="flex items-center gap-1 px-3 py-2 shrink-0 border-b overflow-x-auto"
                style={{ borderColor: "var(--border-soft)" }}
              >
                {(
                  [
                    { id: "all", label: "All", labelAr: "الكل" },
                    { id: "unread", label: "Unread", labelAr: "غير مقروء" },
                    { id: "urgent", label: "Urgent", labelAr: "عاجل" },
                    { id: "archived", label: "Archived", labelAr: "مؤرشف" },
                  ] as { id: Filter; label: string; labelAr: string }[]
                ).map((t) => {
                  const isActive = filter === t.id;
                  const count =
                    t.id === "all"
                      ? items.filter((n) => !n.archivedAt).length
                      : t.id === "unread"
                      ? unreadCount
                      : t.id === "urgent"
                      ? items.filter((n) => n.priority === "urgent" && !n.archivedAt).length
                      : items.filter((n) => !!n.archivedAt).length;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setFilter(t.id)}
                      aria-pressed={isActive}
                      className="ast-focus relative inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors"
                      style={{
                        background: isActive ? "var(--brand-500)" : "transparent",
                        color: isActive ? "var(--surface-0)" : "var(--text-mid)",
                        border: `1px solid ${isActive ? "var(--brand-500)" : "var(--border)"}`,
                      }}
                    >
                      {isAr ? t.labelAr : t.label}
                      {count > 0 && (
                        <span
                          className="tabular text-[10px] opacity-80"
                          aria-hidden="true"
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ===== List (scrollable) ===== */}
              <div className="flex-1 overflow-y-auto">
                {loading && !data ? (
                  <div className="p-4 space-y-3" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="ast-shimmer h-[88px] rounded-xl"
                        style={{ border: "1px solid var(--border-soft)" }}
                      />
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-6 text-center">
                    <AlertTriangle
                      className="w-6 h-6 mx-auto mb-2"
                      style={{ color: "var(--status-friction)" }}
                      strokeWidth={1.75}
                    />
                    <p
                      className="text-[12px] mb-3"
                      style={{ color: "var(--text-mid)" }}
                    >
                      {error}
                    </p>
                    <button
                      onClick={fetchNotifications}
                      className="ast-focus inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px]"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        color: "var(--text-hi)",
                      }}
                    >
                      {isAr ? "إعادة المحاولة" : "Retry"}
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <EmptyState isAr={isAr} filter={filter} />
                ) : (
                  <div className="py-2">
                    {(["today", "yesterday", "earlier"] as const).map((bucket) => {
                      const list = grouped[bucket];
                      if (list.length === 0) return null;
                      const label =
                        bucket === "today"
                          ? isAr
                            ? "اليوم"
                            : "Today"
                          : bucket === "yesterday"
                          ? isAr
                            ? "أمس"
                            : "Yesterday"
                          : isAr
                          ? "أقدم"
                          : "Earlier";
                      return (
                        <section key={bucket} className="mb-1">
                          <div
                            className="px-4 py-1.5 text-[10px] uppercase tracking-[0.16em] sticky top-0"
                            style={{
                              color: "var(--text-lo)",
                              background: "var(--surface-1)",
                            }}
                          >
                            {label}
                          </div>
                          {list.map((n) => (
                            <NotificationCard
                              key={n.id}
                              n={n}
                              isAr={isAr}
                              dateLocale={dateLocale}
                              pendingAction={pendingAction}
                              onActionClick={handleActionClick}
                              onSnooze={(hours) => postAction(n.id, "snooze", hours)}
                              onArchive={() => postAction(n.id, "archive")}
                            />
                          ))}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ===== Footer: quiet hours + kill switch ===== */}
              <div
                className="shrink-0 border-t px-4 py-3 space-y-3"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface-2)",
                }}
              >
                {/* Quiet hours */}
                <div
                  className="flex items-center gap-2 text-[11px]"
                  style={{ color: "var(--text-mid)" }}
                >
                  <Moon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: "var(--brand-400)" }}
                    strokeWidth={1.75}
                  />
                  <span className="leading-snug">
                    {isAr ? "ساعات الهدوء: " : "Quiet hours: "}
                    <span className="tabular" style={{ color: "var(--text-hi)" }}>
                      {data?.quietHours.start}–{data?.quietHours.end}
                    </span>{" "}
                    <span style={{ color: "var(--text-lo)" }}>
                      ({data?.quietHours.tz})
                    </span>
                    {isAr
                      ? " — لن نزعجك خلالها."
                      : " — we won't disturb you then."}
                  </span>
                </div>

                {/* Kill switch */}
                <div
                  className="flex items-center gap-3 p-2.5 rounded-lg"
                  style={{
                    background: killSwitchOn
                      ? "rgba(220,38,38,0.08)"
                      : "var(--surface-3)",
                    border: `1px solid ${
                      killSwitchOn ? "rgba(220,38,38,0.30)" : "var(--border)"
                    }`,
                  }}
                >
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
                    style={{
                      background: killSwitchOn
                        ? "rgba(220,38,38,0.14)"
                        : "var(--surface-2)",
                      color: killSwitchOn
                        ? "var(--status-friction)"
                        : "var(--text-mid)",
                    }}
                  >
                    {killSwitchOn ? (
                      <BellOff className="w-4 h-4" strokeWidth={1.75} />
                    ) : (
                      <Bell className="w-4 h-4" strokeWidth={1.75} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[12px] font-semibold leading-tight"
                      style={{
                        color: killSwitchOn
                          ? "var(--status-friction)"
                          : "var(--text-hi)",
                      }}
                    >
                      {isAr ? "إيقاف كل الإشعارات" : "Stop all notifications"}
                    </div>
                    <div
                      className="text-[10px] leading-tight mt-0.5"
                      style={{ color: "var(--text-lo)" }}
                    >
                      {killSwitchOn
                        ? isAr
                          ? "كل الإشعارات الصادرة متوقفة الآن."
                          : "All outbound notifications are off right now."
                        : isAr
                        ? "مفتاح إيقاف فوري لكل الرسائل."
                        : "Instant kill switch for every outbound message."}
                    </div>
                  </div>
                  <Switch
                    checked={killSwitchOn}
                    onCheckedChange={toggleKillSwitch}
                    aria-label={
                      isAr ? "مفتاح إيقاف الإشعارات" : "Notification kill switch"
                    }
                    className="data-[state=checked]:bg-[var(--status-friction)]"
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ============================================================
   NOTIFICATION CARD
   ============================================================ */
function NotificationCard({
  n,
  isAr,
  dateLocale,
  pendingAction,
  onActionClick,
  onSnooze,
  onArchive,
}: {
  n: Notification;
  isAr: boolean;
  dateLocale: Locale;
  pendingAction: string | null;
  onActionClick: (n: Notification) => void;
  onSnooze: (hours: number) => void;
  onArchive: () => void;
}) {
  const dot = PRIORITY_DOT[n.priority];
  const isRead = !!n.readAt;
  const isArchived = !!n.archivedAt;
  const isSnoozed = !!n.snoozedUntil;
  const title = isAr ? n.titleAr : n.title;
  const body = isAr ? n.bodyAr : n.body;
  const actionLabel = n.action ? (isAr ? n.action!.labelAr : n.action!.label) : "";

  const isPending =
    pendingAction === `${n.id}:read` ||
    pendingAction === `${n.id}:snooze` ||
    pendingAction === `${n.id}:archive`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className="px-3 py-1.5"
    >
      <div
        className="relative rounded-xl p-3 transition-opacity"
        style={{
          background: isRead ? "var(--surface-2)" : "var(--surface-3)",
          border: `1px solid ${isRead ? "var(--border-soft)" : "rgba(22,154,165,0.22)"}`,
          opacity: isArchived ? 0.55 : 1,
        }}
      >
        {/* unread accent rail */}
        {!isRead && !isArchived && (
          <span
            aria-hidden="true"
            className="absolute top-3 bottom-3 w-[2px] rounded-full"
            style={{
              insetInlineStart: 0,
              background: "var(--brand-500)",
            }}
          />
        )}

        <div className="flex items-start gap-2.5">
          {/* priority dot */}
          <span
            className="mt-1.5 shrink-0 w-2 h-2 rounded-full"
            style={{ background: dot.color, boxShadow: dot.glow }}
            aria-label={isAr ? dot.labelAr : dot.label}
            title={isAr ? dot.labelAr : dot.label}
          />

          <div className="flex-1 min-w-0">
            {/* title row */}
            <div className="flex items-start gap-2">
              <h4
                className="text-[13px] font-semibold leading-snug flex-1"
                style={{
                  color: isRead ? "var(--text-mid)" : "var(--text-hi)",
                }}
              >
                {title}
              </h4>
              <span
                className="text-[10px] tabular shrink-0 mt-0.5"
                style={{ color: "var(--text-lo)" }}
              >
                {timeAgo(n.createdAt, dateLocale)}
              </span>
            </div>

            {/* body */}
            <p
              className="text-[12px] leading-relaxed mt-1"
              style={{ color: "var(--text-mid)" }}
            >
              {body}
            </p>

            {/* snoozed badge */}
            {isSnoozed && (
              <div className="mt-2">
                <span
                  className="ast-chip"
                  style={{
                    color: "var(--status-watch)",
                    background: "rgba(217,119,6,0.10)",
                    borderColor: "rgba(217,119,6,0.30)",
                  }}
                >
                  <Clock className="w-3 h-3" strokeWidth={1.75} />
                  {isAr ? "مؤجّل حتى" : "Snoozed until"}{" "}
                  <span className="tabular">
                    {new Date(n.snoozedUntil!).toLocaleTimeString(isAr ? "ar" : "en", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Dubai",
                    })}
                  </span>
                </span>
              </div>
            )}

            {/* action row */}
            {n.action && !isArchived && (
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => onActionClick(n)}
                  disabled={isPending}
                  className="ast-focus inline-flex items-center gap-1 h-8 px-3 rounded-full text-[11px] font-medium transition-transform hover:-translate-y-px disabled:opacity-50"
                  style={{
                    background: "var(--accent-500)",
                    color: "var(--surface-0)",
                    boxShadow: "0 4px 12px rgba(201,162,39,0.25)",
                  }}
                >
                  {actionLabel}
                  <ChevronRight
                    className="w-3 h-3"
                    strokeWidth={2}
                    style={{ transform: isAr ? "scaleX(-1)" : undefined }}
                  />
                </button>

                {/* snooze dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={isPending}
                      aria-label={isAr ? "تأجيل" : "Snooze"}
                      title={isAr ? "تأجيل" : "Snooze"}
                      className="ast-focus inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors disabled:opacity-50"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        color: "var(--text-mid)",
                      }}
                    >
                      <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    sideOffset={4}
                    className="w-[140px]"
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    {[
                      { h: 1, label: isAr ? "ساعة واحدة" : "1 hour" },
                      { h: 4, label: isAr ? "4 ساعات" : "4 hours" },
                      { h: 24, label: isAr ? "حتى غداً" : "Until tomorrow" },
                    ].map((opt) => (
                      <DropdownMenuItem
                        key={opt.h}
                        onSelect={() => onSnooze(opt.h)}
                        className="text-[12px] tabular cursor-pointer"
                        style={{ color: "var(--text-hi)" }}
                      >
                        <Clock className="w-3 h-3 me-2" strokeWidth={1.75} />
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* archive */}
                <button
                  onClick={onArchive}
                  disabled={isPending}
                  aria-label={isAr ? "أرشفة" : "Archive"}
                  title={isAr ? "أرشفة" : "Archive"}
                  className="ast-focus inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors disabled:opacity-50"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text-mid)",
                  }}
                >
                  <Archive className="w-3.5 h-3.5" strokeWidth={1.75} />
                </button>
              </div>
            )}

            {/* archived-only: restore hint */}
            {isArchived && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-lo)" }}>
                <Archive className="w-3 h-3" strokeWidth={1.75} />
                {isAr ? "مؤرشف" : "Archived"}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ============================================================
   EMPTY STATE
   ============================================================ */
function EmptyState({ isAr, filter }: { isAr: boolean; filter: Filter }) {
  const messages: Record<Filter, { title: string; titleAr: string; sub: string; subAr: string }> = {
    all: {
      title: "You're all caught up.",
      titleAr: "لا شيء يحتاجك الآن.",
      sub: "Nothing needs you right now.",
      subAr: "كل شيء تحت السيطرة.",
    },
    unread: {
      title: "Inbox zero.",
      titleAr: "صفر غير مقروء.",
      sub: "Nothing new since you last looked.",
      subAr: "لا جديد منذ آخر زيارة.",
    },
    urgent: {
      title: "No urgent items.",
      titleAr: "لا عناصر عاجلة.",
      sub: "If something becomes urgent, we'll tell you.",
      subAr: "إن أصبح شيء عاجلاً، سنخبرك.",
    },
    archived: {
      title: "Nothing archived.",
      titleAr: "لا مؤرشف.",
      sub: "Archived messages will collect here.",
      subAr: "تتجمع الرسائل المؤرشفة هنا.",
    },
  };
  const m = messages[filter];
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="relative flex items-center justify-center w-14 h-14 rounded-full mb-4"
        style={{
          background: "radial-gradient(circle at 35% 35%, rgba(22,154,165,0.18), rgba(11,17,28,0.4))",
          border: "1px solid rgba(22,154,165,0.28)",
        }}
      >
        <Sparkles
          className="w-5 h-5"
          style={{ color: "var(--brand-400)" }}
          strokeWidth={1.75}
        />
      </div>
      <h3
        className="text-[14px] font-semibold mb-1"
        style={{ color: "var(--text-hi)" }}
      >
        {isAr ? m.titleAr : m.title}
      </h3>
      <p className="text-[12px]" style={{ color: "var(--text-lo)" }}>
        {isAr ? m.subAr : m.sub}
      </p>
    </div>
  );
}
