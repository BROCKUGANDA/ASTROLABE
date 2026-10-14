/**
 * ASTROLABE Instrumentation Hook
 * ------------------------------
 * Runs once on server startup (Node runtime only). Validates configuration
 * early so a misconfigured production boot fails fast with a clear message.
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register(): Promise<void> {
  // Only run on the Node.js server runtime, not in the edge build phase.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { validateConfig } = await import("./lib/config");
  validateConfig();

  const { logger } = await import("./lib/logger");
  logger.info("ASTROLABE server starting", {
    phase: "instrumentation.register",
  });
}
