# PROD-HEALTH-MIDDLEWARE — Work Record

**Agent:** Main
**Task ID:** PROD-HEALTH-MIDDLEWARE
**Theme:** "Instrument, not dashboard." Calm navy + teal + sand-gold. NO indigo, NO blue.

## Summary
Built the production reliability backbone for ASTROLABE: three health endpoints, a hardened security middleware, startup config validation, and a structured (secret-redacting) logger. All TypeScript strict, no `any`, no indigo/blue.

## Files created
1. `src/lib/logger.ts` — structured JSON logger (stdout) + dev pretty-print (stderr). `AsyncLocalStorage` request-id context. Recursive redaction of keys matching `/(key|secret|token|password|iban|salary)/i`.
2. `src/lib/config.ts` — `validateConfig()` + `config` singleton. Fatal on missing `DATABASE_URL` in prod. Logs state (no secrets) once.
3. `src/instrumentation.ts` — Next.js startup hook; calls `validateConfig()` on Node runtime.
4. `src/middleware.ts` — 7 security headers + `X-Request-Id` (generated or passthrough) on all non-static paths.
5. `src/app/api/healthz/route.ts` — liveness: 200 `{status,uptime,timestamp}`, no dep checks.
6. `src/app/api/readyz/route.ts` — readiness: 200/503 `{status:"ok"|"degraded",checks:{db,corpus,map,engine},timestamp}`.
7. `src/app/api/version/route.ts` — `{name,version,engineVersion,packVersion,corpusVersion,buildTime,gitSha}`.

## Key decisions
- Health endpoints use plain `NextResponse.json` (NOT the API envelope) — probes must be lightweight and not require envelope parsing.
- `db` readiness check runs `db.user.count()` (trivial Prisma query against the existing `User` model + SQLite file).
- Logger writes JSON to `process.stdout` always; pretty-prints to `console.error` (stderr) only in dev so piped stdout stays machine-readable.
- `requestId` resolved as `meta.requestId ?? AsyncLocalStorage.context.requestId`.
- Middleware uses `globalThis.crypto.randomUUID()` (works in edge + node) with a fallback slug.
- Middleware propagates `x-request-id` onto inbound request headers (`NextResponse.next({ request: { headers } })`) so route handlers can read it.

## Verification
- `bun run lint` → 0 errors, 0 warnings.
- `curl /api/healthz` → 200 + all security headers + x-request-id.
- `curl /api/readyz` → 200, all 4 checks "ok" (Prisma `SELECT COUNT(*) FROM main.User` confirmed in dev.log).
- `curl /api/version` → 200, correct version metadata.
- Custom `X-Request-Id` header passthrough confirmed (echoed verbatim).
- Static `/favicon.ico` excluded from middleware (no security headers) — matcher works.
- Secret redaction confirmed live: `apiKey/userToken/password/salary/nested.secretKey` → `[REDACTED]`; `safe` preserved.
- 503 path: any check "down" → `status:"degraded"` → HTTP 503.

## Notes for downstream agents
- **Next.js 16 deprecation:** `middleware.ts` is deprecated in favor of `proxy.ts` (one-time warning in dev.log). Functionality is identical; kept as `middleware.ts` per task spec. Rename to `proxy.ts` later to silence.
- **Admin screen check labels:** the ADMIN-STYLING agent assumed readyz checks "DB/Redis/Corpus/Map". Authoritative spec = **DB/Corpus/Map/Engine**. Reconcile admin grid labels if needed.
- `buildTime` is per-process (captured at module load), not CI-injected. Inject `BUILD_TIME` env for real releases.
- The logger's `runWithRequestId` helper is available but not yet wired into route handlers — they currently read `x-request-id` from the middleware-propagated header. Wire `runWithRequestId` in a server-side fetch wrapper if you want automatic log correlation without explicit metadata.
