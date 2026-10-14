/**
 * ASTROLABE — Global error boundary (PRD §17)
 *
 * Catches errors that the route-level error.tsx can't — most importantly,
 * errors thrown by the root layout itself. When this fires, Next.js
 * replaces the entire `<html>` document, so we must render our own
 * `<html>` and `<body>` and pull in globals.css explicitly.
 *
 * Layout is intentionally spare: no header/footer, just the centered
 * error card so the user can still get back to "/" and report the
 * incident.
 */
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Compass, RotateCcw, Home, Copy, Check, LifeBuoy } from "lucide-react";
import "./globals.css";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

function sanitizeMessage(raw: string | undefined): string {
  if (!raw) return "An unrecoverable error occurred while booting ASTROLABE.";
  let msg = raw.trim();
  msg = msg.split(/\r?\n/)[0]?.trim() ?? msg;
  msg = msg.replace(/\s*at\s+[^\s].*$/i, "").trim();
  msg = msg.replace(/(?:\/[\w.-]+)+(?:\?\S*)?/g, "<path>").trim();
  msg = msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<digest>")
    .trim();
  if (msg.length > 180) msg = msg.slice(0, 177) + "...";
  return msg || "An unrecoverable error occurred while booting ASTROLABE.";
}

function makeRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  // Regenerate the request id when a new error object arrives (keyed on
  // the error reference, which React updates on each new throw).
  const requestId = useMemo(() => makeRequestId(), [error]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copied = copiedId === requestId;

  useEffect(() => {
    console.error("[ASTROLABE] global error captured:", {
      message: error?.message,
      digest: error?.digest,
      requestId,
    });
  }, [error, requestId]);

  const handleCopy = useCallback(async () => {
    const text = requestId;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(requestId);
      const id = requestId;
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 2400);
    } catch {
      setCopiedId(null);
    }
  }, [requestId]);

  const handleTryAgain = useCallback(() => {
    reset();
  }, [reset]);

  const handleGoHome = useCallback(() => {
    router.push("/");
  }, [router]);

  const safeMessage = sanitizeMessage(error?.message);

  const container = reduceMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        style={{
          margin: 0,
          background: "var(--surface-0)",
          color: "var(--text-hi)",
          fontFamily:
            "var(--font-inter), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <main
          role="alert"
          aria-live="assertive"
          className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6"
        >
          <motion.section
            initial={container.initial}
            animate={container.animate}
            transition={{ duration: 0.32, ease: [0, 0, 0.2, 1] }}
            className="ast-card-glass w-full max-w-xl p-6 sm:p-8"
            style={{ borderRadius: "var(--radius-lg)" }}
          >
            <header className="flex items-center gap-3 mb-6">
              <span
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  width: 44,
                  height: 44,
                  background: "linear-gradient(135deg, var(--brand-600), var(--brand-400))",
                  boxShadow: "0 0 0 1px rgba(22,154,165,0.45), 0 8px 20px rgba(22,154,165,0.18)",
                }}
                aria-hidden
              >
                <Compass className="h-5 w-5" style={{ color: "var(--surface-0)" }} />
              </span>
              <div className="flex flex-col leading-tight">
                <span
                  className="font-mono tracking-[0.18em] text-sm"
                  style={{ color: "var(--brand-400)" }}
                >
                  ASTROLABE
                </span>
                <span
                  className="font-mono tracking-[0.06em] text-xs"
                  style={{ color: "var(--text-lo)" }}
                >
                  employee journey companion
                </span>
              </div>
            </header>

            <h1
              className="text-2xl sm:text-3xl font-semibold mb-2"
              style={{ color: "var(--text-hi)" }}
            >
              Something went wrong
            </h1>
            <p className="text-sm sm:text-base mb-6" style={{ color: "var(--text-mid)" }}>
              The application hit an unexpected problem. We captured it so the team can investigate.
            </p>

            <div
              className="rounded-md p-4 mb-5"
              style={{
                background: "rgba(220, 38, 38, 0.06)",
                border: "1px solid rgba(220, 38, 38, 0.22)",
              }}
            >
              <p className="text-sm" style={{ color: "var(--text-hi)" }}>
                {safeMessage}
              </p>
            </div>

            <div className="mb-6">
              <div
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex flex-col min-w-0">
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.16em]"
                    style={{ color: "var(--text-lo)" }}
                  >
                    Request id
                  </span>
                  <span
                    className="font-mono text-xs truncate"
                    style={{ color: "var(--brand-400)" }}
                    title={requestId}
                  >
                    {requestId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    color: copied ? "var(--status-steady)" : "var(--brand-400)",
                    background: "rgba(22,154,165,0.08)",
                    border: "1px solid rgba(22,154,165,0.22)",
                    minHeight: 36,
                  }}
                  aria-label="Copy request id to clipboard"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span>{copied ? "Copied" : "Copy request id"}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleTryAgain}
                className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors flex-1"
                style={{
                  background: "var(--brand-500)",
                  color: "var(--surface-0)",
                  boxShadow: "0 0 0 1px rgba(22,154,165,0.45), 0 6px 16px rgba(22,154,165,0.18)",
                  minHeight: 44,
                }}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Try again
              </button>
              <button
                type="button"
                onClick={handleGoHome}
                className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors flex-1"
                style={{
                  background: "transparent",
                  color: "var(--text-hi)",
                  border: "1px solid var(--border)",
                  minHeight: 44,
                }}
              >
                <Home className="h-4 w-4" aria-hidden />
                Go home
              </button>
            </div>

            <footer
              className="mt-6 pt-4 flex items-start gap-2 text-xs"
              style={{
                borderTop: "1px solid var(--border-soft)",
                color: "var(--text-lo)",
              }}
            >
              <LifeBuoy
                className="h-3.5 w-3.5 mt-0.5 shrink-0"
                style={{ color: "var(--brand-400)" }}
                aria-hidden
              />
              <p>
                If this keeps happening, tell Fatima in HR:{" "}
                <a
                  href="mailto:fatima.hrbp@astrolabe.internal"
                  className="font-mono underline-offset-2 hover:underline"
                  style={{ color: "var(--brand-400)" }}
                >
                  fatima.hrbp@astrolabe.internal
                </a>
              </p>
            </footer>
          </motion.section>
        </main>
      </body>
    </html>
  );
}
