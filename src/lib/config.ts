/**
 * ASTROLABE Configuration
 * -----------------------
 * Centralised, validated, immutable config object.
 *
 * Required env:
 *   - DATABASE_URL          (fatal in production if missing)
 *
 * Optional env (with defaults):
 *   - NODE_ENV              default "development"
 *   - ASTROLABE_VERSION     default "1.0.0"
 *   - LOG_LEVEL             default "debug" in dev, "info" in prod
 *
 * The config is validated once on first access and cached. The validation
 * state (without secrets) is logged via the structured logger so operators
 * can confirm the process booted with the right environment.
 */

import { logger } from "./logger";

export interface AppConfig {
  /** Resolved NODE_ENV. */
  nodeEnv: string;
  /** True when nodeEnv === "production". */
  isProd: boolean;
  /** True when not production. */
  isDev: boolean;
  /** Application version (ASTROLABE_VERSION or "1.0.0"). */
  version: string;
  /** Raw DATABASE_URL value (never logged). Empty string if unset. */
  databaseUrl: string;
  /** Whether DATABASE_URL was provided. */
  databaseUrlSet: boolean;
}

let cached: AppConfig | null = null;

/**
 * Validate environment variables and return the cached config singleton.
 * Throws a clear, fatal error if DATABASE_URL is missing in production.
 * Safe to call repeatedly — only validates + logs on the first invocation.
 */
export function validateConfig(): AppConfig {
  if (cached) return cached;

  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";
  const isDev = !isProd;
  const version = process.env.ASTROLABE_VERSION ?? "1.0.0";
  const databaseUrl = process.env.DATABASE_URL ?? "";

  if (isProd && !databaseUrl) {
    logger.error("FATAL: DATABASE_URL is required. Set it in your environment.");
    throw new Error("FATAL: DATABASE_URL is required. Set it in your environment.");
  }

  cached = {
    nodeEnv,
    isProd,
    isDev,
    version,
    databaseUrl,
    databaseUrlSet: Boolean(databaseUrl),
  };

  // Log config state without secrets. databaseUrl itself is never logged —
  // only a boolean indicating whether it was set.
  logger.info("ASTROLABE config validated", {
    nodeEnv: cached.nodeEnv,
    version: cached.version,
    databaseUrlSet: cached.databaseUrlSet,
    logLevel: process.env.LOG_LEVEL ?? "(default)",
  });

  return cached;
}

/**
 * The validated, immutable config. Importing this module triggers validation
 * once on first load (server-side).
 */
export const config: AppConfig = validateConfig();
