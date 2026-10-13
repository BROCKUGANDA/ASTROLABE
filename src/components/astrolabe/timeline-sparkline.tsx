"use client";

/* ============================================================
   ASTROLABE — TimelineSparkline
   Compact 16px-tall sparkline of the last 10 journey events,
   shown as 6px dots coloured by event type. Hovering a dot
   reveals a tooltip with the event type + time.

   Event type palette (no blue / no indigo):
     · completed         = teal (steady)
     · started           = teal-light (brand-100)
     · blocked           = red (friction)
     · waiting_employee  = sand-gold (accent-500)
     · waiting_owner     = amber (watch)
   Unknown types fall back to neutral gray.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export interface TimelineEvent {
  /** ISO timestamp string. */
  occurredAt: string;
  /** Event type, e.g. "completed", "blocked", "waiting_employee". */
  type: string;
}

interface TimelineSparklineProps {
  events: TimelineEvent[];
  /** Locale for tooltip labels. */
  locale?: "en" | "ar";
  className?: string;
}

const TYPE_COLOR: Record<string, string> = {
  completed: "var(--status-steady)",
  started: "var(--brand-400)",
  blocked: "var(--status-friction)",
  waiting_employee: "var(--accent-500)",
  waiting_owner: "var(--status-watch)",
  done: "var(--status-steady)",
  acknowledged: "var(--brand-400)",
  submitted: "var(--brand-400)",
  resolved: "var(--status-steady)",
  skipped: "var(--text-lo)",
};

const TYPE_LABEL_EN: Record<string, string> = {
  completed: "Completed",
  started: "Started",
  blocked: "Blocked",
  waiting_employee: "Waiting on employee",
  waiting_owner: "Waiting on owner",
  done: "Done",
  acknowledged: "Acknowledged",
  submitted: "Submitted",
  resolved: "Resolved",
  skipped: "Skipped",
};

const TYPE_LABEL_AR: Record<string, string> = {
  completed: "مكتمل",
  started: "بدأ",
  blocked: "محظور",
  waiting_employee: "بانتظار الموظف",
  waiting_owner: "بانتظار المسؤول",
  done: "منجز",
  acknowledged: "تم الاستلام",
  submitted: "تم الإرسال",
  resolved: "تم الحل",
  skipped: "تم تخطيه",
};

function colorFor(type: string): string {
  return TYPE_COLOR[type] ?? "var(--text-lo)";
}

function labelFor(type: string, locale: "en" | "ar"): string {
  if (locale === "ar") return TYPE_LABEL_AR[type] ?? type.replace(/_/g, " ");
  return TYPE_LABEL_EN[type] ?? type.replace(/_/g, " ");
}

export function TimelineSparkline({
  events,
  locale = "en",
  className,
}: TimelineSparklineProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Take the last 10 (most recent) events, oldest → newest left→right.
  const slice = useMemo(() => {
    const arr = [...events].slice(-10);
    return arr;
  }, [events]);

  return (
    <div
      className={cn("relative inline-flex items-center gap-1.5 h-4", className)}
      role="img"
      aria-label={
        locale === "ar"
          ? `${slice.length} أحداث أخيرة`
          : `${slice.length} recent events`
      }
    >
      {slice.length === 0 && (
        <span
          className="text-[10px]"
          style={{ color: "var(--text-lo)" }}
        >
          {locale === "ar" ? "لا أحداث" : "No events"}
        </span>
      )}
      {slice.map((e, i) => {
        const color = colorFor(e.type);
        const isHover = hoverIdx === i;
        return (
          <span
            key={`${i}-${e.occurredAt}`}
            className="relative inline-flex items-center justify-center"
            style={{ width: 6, height: 16 }}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            onFocus={() => setHoverIdx(i)}
            onBlur={() => setHoverIdx(null)}
            tabIndex={0}
          >
            <span
              className="block rounded-full"
              style={{
                width: 6,
                height: 6,
                background: color,
                boxShadow: isHover ? `0 0 8px ${color}` : `0 0 4px ${color}55`,
                transform: isHover && !reduce ? "scale(1.5)" : "scale(1)",
                transition: reduce
                  ? "none"
                  : "transform 160ms var(--ease-standard), box-shadow 160ms var(--ease-standard)",
              }}
              aria-hidden="true"
            />
            {isHover && (
              <span
                className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md whitespace-nowrap pointer-events-none"
                style={{
                  background: "var(--surface-3)",
                  border: "1px solid var(--border)",
                  color: "var(--text-hi)",
                  fontSize: 10,
                  lineHeight: 1.3,
                  fontFamily: "var(--font-jetbrains), monospace",
                  fontVariantNumeric: "tabular-nums",
                  boxShadow: "var(--e2)",
                }}
                role="tooltip"
              >
                <span style={{ color }}>{labelFor(e.type, locale)}</span>
                <span
                  className="mx-1"
                  style={{ color: "var(--text-lo)" }}
                  aria-hidden="true"
                >
                  ·
                </span>
                <span dir="ltr">
                  {(() => {
                    try {
                      return format(new Date(e.occurredAt), "d MMM HH:mm");
                    } catch {
                      return e.occurredAt;
                    }
                  })()}
                </span>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default TimelineSparkline;
