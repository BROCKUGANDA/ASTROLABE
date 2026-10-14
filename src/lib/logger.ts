/**
 * ASTROLABE Structured Logger
 * ---------------------------
 * Emits one JSON line per log to stdout:
 *   { level, message, timestamp, requestId, ...metadata }
 *
 * Guarantees:
 *  - Never logs secrets. Keys matching /(key|secret|token|password|iban|salary)/i
 *    are redacted to "[REDACTED]" recursively.
 *  - requestId is pulled from an AsyncLocalStorage context when available, or
 *    overridden explicitly via metadata.requestId.
 *  - In development, also pretty-prints to stderr for human readability.
 *  - No `any` — metadata is Record<string, unknown>; values are redacted as unknown.
 *
 * Theme note: console colors use teal/cyan for info, amber for warn, red for
 * error, slate for debug. No indigo, no blue.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogMeta = Record<string, unknown>;

const SECRET_KEY_PATTERN = /(key|secret|token|password|iban|salary)/i;

interface LogContext {
  requestId?: string;
}

const context = new AsyncLocalStorage<LogContext>();

/**
 * Run a function (sync or async) within a request-id context so all logs
 * emitted inside it are automatically tagged with the requestId.
 */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return context.run({ requestId }, fn);
}

/** Read the current request id from the async context, if any. */
export function getRequestId(): string | undefined {
  return context.getStore()?.requestId;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-clone + redact any value whose key looks like a secret. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const env = process.env.LOG_LEVEL;
  if (env === "debug" || env === "info" || env === "warn" || env === "error") {
    return env;
  }
  return isDev() ? "debug" : "info";
}

const MIN_LEVEL: LogLevel = resolveMinLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

// ANSI colors — teal/amber/red/slate, never indigo/blue
const COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m", // teal/cyan
  warn: "\x1b[33m", // amber
  error: "\x1b[31m", // red
  debug: "\x1b[90m", // slate gray
};
const RESET = "\x1b[0m";

function emit(level: LogLevel, message: string, meta?: LogMeta): void {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const ctxRequestId = context.getStore()?.requestId;
  const metaRequestId = isPlainObject(meta) ? (meta.requestId as string | undefined) : undefined;
  const requestId = metaRequestId ?? ctxRequestId;

  // Redact metadata, then strip requestId so it is not duplicated in the body.
  const redactedMeta: LogMeta = meta ? (redact(meta) as LogMeta) : {};
  const bodyMeta: LogMeta = { ...redactedMeta };
  delete bodyMeta.requestId;

  const record: LogMeta = {
    level,
    message,
    timestamp,
    requestId: requestId ?? null,
    ...bodyMeta,
  };

  // Structured JSON line to stdout (machine-readable).
  process.stdout.write(JSON.stringify(record) + "\n");

  // Human-readable pretty line to stderr in development (does not pollute
  // piped stdout consumers).
  if (isDev()) {
    const metaStr = Object.keys(bodyMeta).length > 0 ? " " + JSON.stringify(bodyMeta) : "";
    const rid = requestId ? ` [${requestId}]` : "";
    console.error(
      `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET} ${timestamp}${rid} ${message}${metaStr}`,
    );
  }
}

export const logger = {
  info(message: string, meta?: LogMeta): void {
    emit("info", message, meta);
  },
  warn(message: string, meta?: LogMeta): void {
    emit("warn", message, meta);
  },
  error(message: string, meta?: LogMeta): void {
    emit("error", message, meta);
  },
  debug(message: string, meta?: LogMeta): void {
    emit("debug", message, meta);
  },
};

export type Logger = typeof logger;
