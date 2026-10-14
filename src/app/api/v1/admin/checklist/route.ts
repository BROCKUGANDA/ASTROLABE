/**
 * ASTROLABE API — /api/v1/admin/checklist (GET)
 * ------------------------------------------------------------
 * Returns the status of the ASTROLABE PRD §29 50-item checklist
 * (items 01–25 = functionality, items 26–50 = production).
 *
 * This is a SELF-AUDIT, not a CI gate. Each item is honestly marked:
 *   - "pass"    — the feature is demonstrable in the current codebase
 *   - "partial" — some aspects work but not fully (or are stubbed)
 *   - "fail"    — not implemented
 *   - "n/a"     — not applicable to this prototype (real Redis / Postgres /
 *                 k8s / OpenTelemetry collector — this is a SQLite +
 *                 in-memory single-process app)
 *
 * The handler is fast: no external calls, no DB reads, no I/O. The whole
 * list is a module-level constant built once at import.
 *
 * PRD §29 item references like "§03-051" point to PRD §29 group 03, item
 * 051 (i.e. the 51st item in the 500-item checklist). The 50 items here
 * are a curated high-level summary, not a 1-to-1 mapping to the PRD's 500.
 */
import { success } from "@/lib/api/envelope";
import { ENGINE_VERSION, PACK_VERSION, CORPUS_VERSION } from "@/lib/data/pack";

export const dynamic = "force-dynamic";

export type ChecklistStatus = "pass" | "partial" | "fail" | "n/a";
export type ChecklistCategory = "functionality" | "production";

export interface ChecklistItem {
  /** Two-digit zero-padded id, e.g. "01". */
  id: string;
  category: ChecklistCategory;
  /** Short, human-readable title. */
  title: string;
  status: ChecklistStatus;
  /** What proves the status — a feature, file, or behaviour. */
  evidence: string;
  /** Where to look in the codebase (optional). */
  file?: string;
}

/* ----------------------------------------------------------------
 * The 50 items.
 *
 * Functionality (01–25) — what an employee / HRBP / manager / judge
 *   actually feels when using the app.
 * Production (26–50) — operability, security, reliability,
 *   observability. Items that demand real infrastructure (Redis,
 *   Postgres, k8s, OTel collector) are marked "n/a" or "partial"
 *   because this prototype runs on SQLite + in-memory state in a
 *   single Next.js process.
 * ---------------------------------------------------------------- */
const ITEMS: ChecklistItem[] = [
  // ── Functionality 01–25 ──────────────────────────────────────────
  {
    id: "01",
    category: "functionality",
    title: 'Today screen answers "what do I do now?" above the fold',
    status: "pass",
    evidence:
      "today-screen renders NextBestStep card + LateItemsPanel + StageRail above the fold; the decisive sentence is the headline, not buried.",
    file: "src/components/astrolabe/today-screen.tsx",
  },
  {
    id: "02",
    category: "functionality",
    title: "Stage rail / progress indicator with day-in-stage",
    status: "pass",
    evidence:
      "StageRail component renders ordered stages with done/active/blocked/pending segments; day-in-stage shown in headline.",
    file: "src/components/astrolabe/today-screen.tsx",
  },
  {
    id: "03",
    category: "functionality",
    title: "Late items panel with owner + cause + how late",
    status: "pass",
    evidence:
      "LateItemsPanel lists every blocked/breached/hard step with named owner, lateCopy (days late / held up), and SlaChip.",
    file: "src/components/astrolabe/today-screen.tsx",
  },
  {
    id: "04",
    category: "functionality",
    title: "SLA clock pauses visibly when waiting_employee (PRD §03-051)",
    status: "pass",
    evidence:
      "EmptyLateState takes a `waitingOnEmployeeLabel` prop and renders \"Nothing is late — this one is waiting on your {step}.\" with an Hourglass icon + 'SLA clock paused' tag. The engine already freezes elapsedHours when status === 'waiting_employee'.",
    file: "src/components/astrolabe/today-screen.tsx",
  },
  {
    id: "05",
    category: "functionality",
    title: "Journey map shows target vs actual on every step",
    status: "pass",
    evidence:
      "journey-screen renders `{targetHours}h target` on each step and passes elapsedHours/targetHours to SlaChip; HRBP packet timeline carries `targetVsActual`.",
    file: "src/components/astrolabe/journey-screen.tsx",
  },
  {
    id: "06",
    category: "functionality",
    title: "Ask: one input + intent routing + six starter questions",
    status: "pass",
    evidence:
      "ask-screen renders 6 stage-aware starter chips; classifyIntent routes policy/journey/action/smalltalk/out_of_scope.",
    file: "src/components/astrolabe/ask-screen.tsx",
  },
  {
    id: "07",
    category: "functionality",
    title: "Ask: streaming stages + decisive sentence first",
    status: "pass",
    evidence:
      "3-stage progress labels ('checking your journey', 'reading policy', 'drafting') + simulated token streaming (4 chars / 16ms).",
    file: "src/components/astrolabe/ask-screen.tsx",
  },
  {
    id: "08",
    category: "functionality",
    title: "Citations: every normative claim carries a chip (PRD §05-081)",
    status: "pass",
    evidence:
      "validateGrounding enforces ≥0.95 grounding score; ungrounded sentences are dropped pre-render; CitationChip rendered in answer + verdict card.",
    file: "src/lib/policy/retrieval.ts",
  },
  {
    id: "09",
    category: "functionality",
    title: "Abstain looks like a handoff, never a failure (PRD §05-089)",
    status: "pass",
    evidence:
      "PolicyAnswer.kind === 'abstain' carries abstainReasonCode + abstainReasonEn/Ar + ownerHint {name, role, email}; ask-screen renders abstain as a 'hand off to {name}' card, not an error.",
    file: "src/lib/policy/retrieval.ts",
  },
  {
    id: "10",
    category: "functionality",
    title: "Staleness note when policy past its review date (PRD §05-085)",
    status: "pass",
    evidence:
      "answer() checks `new Date(citations[0].reviewDate) < NOW` and appends a visible '*Note: this policy is past its review date…*' line + adds 'policy_stale' to degraded[].",
    file: "src/lib/policy/retrieval.ts",
  },
  {
    id: "11",
    category: "functionality",
    title: "Requests: prefill from journey context (PRD §06-101)",
    status: "pass",
    evidence:
      "requests-screen prefills intake forms from the current employee's journey (employeeId, type-aware fields); labelled prefilled fields stay editable.",
    file: "src/components/astrolabe/requests-screen.tsx",
  },
  {
    id: "12",
    category: "functionality",
    title: 'Requests: structured "needs more info" lifecycle (PRD §11-212)',
    status: "pass",
    evidence:
      "transition route attaches a structured `ReturnQuestion { question, additionalDetail, returnedBy, returnedAt }` on `to=returned` and clears it on `to=submitted` after capturing the answer.",
    file: "src/app/api/v1/requests/[id]/transition/route.ts",
  },
  {
    id: "13",
    category: "functionality",
    title: "Requests: idempotency key on create + transition (PRD §21-404)",
    status: "pass",
    evidence:
      "POST /api/v1/requests rejects without idempotencyKey and returns the cached request on duplicate key (servedFrom='cache'). Transition route also requires idempotencyKey.",
    file: "src/app/api/v1/requests/route.ts",
  },
  {
    id: "14",
    category: "functionality",
    title: "Requests: reassignment + return counts visible (PRD §06-117)",
    status: "pass",
    evidence:
      "ServiceRequest carries reassignCount + returnCount; requests-screen surfaces both to the employee.",
    file: "src/lib/data/pack.ts",
  },
  {
    id: "15",
    category: "functionality",
    title: "Request status is derived (state machine, never written directly)",
    status: "pass",
    evidence:
      "Only `POST /api/v1/requests/[id]/transition` mutates `request.status`, gated by `canTransition(from, to)` against LEGAL_TRANSITIONS. Documented in code.",
    file: "src/lib/actions/actions.ts",
  },
  {
    id: "16",
    category: "functionality",
    title: "Notifications: in-app inbox + rate caps + kill switch",
    status: "pass",
    evidence:
      "notifications-bell.tsx renders an in-app inbox; rate-limit.ts caps ask (30/5min) + requests (10/h); notifications-bell has a 'Stop all notifications' kill switch.",
    file: "src/components/astrolabe/notifications-bell.tsx",
  },
  {
    id: "17",
    category: "functionality",
    title: "Notifications: quiet hours + leave suppression (PRD §07-123/129)",
    status: "partial",
    evidence:
      "Quiet-hours window is displayed in the notifications-bell footer, but no real enforcement logic suppresses sends during the window. Leave suppression is not implemented at all (no `onLeave` flag on Employee).",
    file: "src/components/astrolabe/notifications-bell.tsx",
  },
  {
    id: "18",
    category: "functionality",
    title: "Consent: per-purpose, in-context, reversible, receipted (PRD §08-141)",
    status: "pass",
    evidence:
      "POST /api/v1/consent returns a `receiptId` (RC-…) + consentRecordId; ConsentRecord carries grantedAt + revokedAt + version + textHash. Me-screen shows consent toggles per purpose.",
    file: "src/app/api/v1/consent/route.ts",
  },
  {
    id: "19",
    category: "functionality",
    title: "Consent: free text excluded from model + humans (PRD §08-154)",
    status: "pass",
    evidence:
      "EscalationPacket.consentStatement carries `freeTextExcluded: true` + `withheld: ['free_text_comments']`; retrieval never sends free text to a model slot.",
    file: "src/lib/actions/actions.ts",
  },
  {
    id: "20",
    category: "functionality",
    title: "HRBP queue: rank by band → lead time → deadline (PRD §10-181)",
    status: "pass",
    evidence:
      "hrbp-screen queue view sorts by band (steady → blocked), then lead time, then hard deadlines; every row explains itself in one sentence.",
    file: "src/components/astrolabe/hrbp-screen.tsx",
  },
  {
    id: "21",
    category: "functionality",
    title: "HRBP packet: situation / evidence / decision in one screen (PRD §09-164)",
    status: "pass",
    evidence:
      "buildEscalationPacket returns topSignals (evidence) + timeline + blockedDownstream + openRequests + decisionRequested + namedOwner + consentStatement; hrbp-screen renders all sections.",
    file: "src/lib/actions/actions.ts",
  },
  {
    id: "22",
    category: "functionality",
    title: "Stalls heatmap suppresses cells with n<5 (PRD §11-209)",
    status: "pass",
    evidence:
      "GET /api/v1/insights/stalls returns `suppressed: true, reason: 'Not enough data to show safely (n<5)'` when contributors.size < 5 (distinct employees, not completions).",
    file: "src/app/api/v1/insights/stalls/route.ts",
  },
  {
    id: "23",
    category: "functionality",
    title: 'Manager view: "waiting on you" only, no monitoring (PRD §11-201/203)',
    status: "pass",
    evidence:
      "manager-screen renders only the manager's own steps + 'Nothing waiting on you' empty state + 'This is not a monitoring tool' disclaimer; no per-person scores or sentiment.",
    file: "src/components/astrolabe/manager-screen.tsx",
  },
  {
    id: "24",
    category: "functionality",
    title: "Manager view: 30-60-90 outline per joiner (PRD §11-207)",
    status: "pass",
    evidence:
      "manager-screen renders one collapsible 30-60-90 card per cohort joiner with editable goal grid + buddy assignment field.",
    file: "src/components/astrolabe/manager-screen.tsx",
  },
  {
    id: "25",
    category: "functionality",
    title: "Deterministic core works with model switched off (PRD §17-340)",
    status: "pass",
    evidence:
      "GET /api/v1/journey/me makes ZERO model calls. Every field is produced by pure functions in src/lib/engine/engine.ts (assess, nextBestStep, computeStepState). The engine imports no I/O; the only time source is the asOf parameter.",
    file: "src/app/api/v1/journey/me/route.ts",
  },

  // ── Production 26–50 ─────────────────────────────────────────────
  {
    id: "26",
    category: "production",
    title: "One response envelope everywhere, including errors (PRD §21-401)",
    status: "pass",
    evidence:
      "src/lib/api/envelope.ts: success() + error() always return { ok, data, meta, error }. Every route in /api/v1/* uses these — no raw NextResponse.json except /healthz, /readyz, /version (ops probes by convention).",
    file: "src/lib/api/envelope.ts",
  },
  {
    id: "27",
    category: "production",
    title: "Typed error codes with hints + retryable flag (PRD §21-402)",
    status: "pass",
    evidence:
      "error() takes (code, message, status, { hint, retryable, ownerHint }). Codes used: E_BAD_BODY, E_VALIDATION, E_NOT_FOUND, E_CONFLICT, E_RATE_LIMIT, E_NO_OWNER.",
    file: "src/lib/api/envelope.ts",
  },
  {
    id: "28",
    category: "production",
    title: "Rate limits per user + IP with Retry-After (PRD §21-412)",
    status: "pass",
    evidence:
      "rate-limit.ts: sliding-window limiter, per-(ip+userId) keys. Ask: 30/5min. Requests: 10/hour. 429 carries Retry-After + X-RateLimit-* headers on both success and failure paths.",
    file: "src/lib/rate-limit.ts",
  },
  {
    id: "29",
    category: "production",
    title: "Idempotency key required on every create + transition (PRD §21-404)",
    status: "pass",
    evidence:
      "POST /api/v1/requests: 422 if no idempotencyKey; returns cached request on duplicate. POST /api/v1/requests/[id]/transition: 422 if no idempotencyKey.",
    file: "src/app/api/v1/requests/route.ts",
  },
  {
    id: "30",
    category: "production",
    title: "Cursor pagination with stable sort (PRD §21-406)",
    status: "partial",
    evidence:
      "GET /api/v1/requests implements cursor pagination (openedAt|id, PAGE_SIZE=50). Other list endpoints (hrbp/queue, employees, escalations) return full lists without pagination — fine for the prototype's row counts but not spec-complete.",
    file: "src/app/api/v1/requests/route.ts",
  },
  {
    id: "31",
    category: "production",
    title: "Audit chain: hash-linked + tamper-detectable (PRD §23-451)",
    status: "pass",
    evidence:
      "admin-screen AuditChainPanel renders a hash-linked chain (genesis prevHash=0x0000000000000000); verifyChain() walks prev→cur and detects alter_hash / delete_event / reorder_events / inject_fake tampers.",
    file: "src/components/astrolabe/admin-screen.tsx",
  },
  {
    id: "32",
    category: "production",
    title: "Audit chain: view-log on employee record (PRD §08-150)",
    status: "pass",
    evidence:
      "me-screen renders an audit timeline built from `viewLog` (actor / action / at / purpose) — e.g. 'Fatima Al-Mansouri · read_record · hrbp_review'. GET /api/v1/me/data returns the view log.",
    file: "src/components/astrolabe/me-screen.tsx",
  },
  {
    id: "33",
    category: "production",
    title: "Structured logs with request id + redaction (PRD §24-461)",
    status: "pass",
    evidence:
      "src/lib/logger.ts: one JSON line per call to stdout, AsyncLocalStorage requestId context, recursive redaction of keys matching /(key|secret|token|password|iban|salary)/i.",
    file: "src/lib/logger.ts",
  },
  {
    id: "34",
    category: "production",
    title: "Dedup at ingestion — re-ingest adds no rows (PRD §20-393)",
    status: "pass",
    evidence:
      "The pack is a frozen module-level constant. Re-ingest (admin 'Re-ingest' button, dev hot-reload) re-validates the same in-memory rows; there is no INSERT path. Every event already carries a stable id + payloadHash.",
    file: "src/lib/data/pack.ts",
  },
  {
    id: "35",
    category: "production",
    title: "Quarantine: bad rows visible in Admin (PRD §20-382)",
    status: "partial",
    evidence:
      "admin-screen QuarantineTable is rendered with a '0 quarantined rows' state (all 142 pack rows passed validation). There is no real quarantine pipeline that intercepts bad rows at ingest time — the prototype's pack is pre-validated.",
    file: "src/components/astrolabe/admin-screen.tsx",
  },
  {
    id: "36",
    category: "production",
    title: "Versioned map/corpus/engine/pack stamped on every response (PRD §19-375)",
    status: "pass",
    evidence:
      "envelope.ts success/error stamp `mapVersion` (map-1.0.0) + `corpusVersion` (policies-2024-q4-v1) + `engineVersion` (engine-1.0.0) + `packVersion` (synthetic-2024-q4-v1) on every response, including errors.",
    file: "src/lib/api/envelope.ts",
  },
  {
    id: "37",
    category: "production",
    title: "Health / readiness / version endpoints with dep checks (PRD §21-418)",
    status: "pass",
    evidence:
      "/api/healthz (liveness, 200), /api/readyz (readiness, 200/503 — checks db/corpus/map/engine), /api/version (name + version + engineVersion + packVersion + corpusVersion + buildTime + gitSha).",
    file: "src/app/api/readyz/route.ts",
  },
  {
    id: "38",
    category: "production",
    title: "Kill switches flip without a deploy (PRD §24-467)",
    status: "pass",
    evidence:
      "admin-screen FeatureFlagsPanel: 8 feature flags (ai_compose, semantic_cache, pulse_capture, auto_draft_escalation, manager_view, analytics_rollup, arabic_locale, judge_mode) toggle via local state — no network round-trip, no rebuild. Notifications-bell also has an instant 'Stop all notifications' kill switch.",
    file: "src/components/astrolabe/admin-screen.tsx",
  },
  {
    id: "39",
    category: "production",
    title: "Replay endpoint: pure deterministic re-run (PRD §19-378)",
    status: "pass",
    evidence:
      "POST /api/v1/admin/replay takes { asOf, employeeIds? } and returns assessments from `assess()` — same input always yields byte-identical results (modulo the meta.jobId / meta.latencyMs tracking fields).",
    file: "src/app/api/v1/admin/replay/route.ts",
  },
  {
    id: "40",
    category: "production",
    title: "Bilingual EN/AR with RTL mirror, no hard-coded left/right (PRD §12-221)",
    status: "pass",
    evidence:
      "useAppStore().locale drives all copy; every screen sets `dir={locale === 'ar' ? 'rtl' : 'ltr'}`; Arabic typography uses IBM Plex Sans Arabic via globals.css. No `ml-*` / `mr-*` hard-coded — logical properties only.",
    file: "src/lib/store/app-store.ts",
  },
  {
    id: "41",
    category: "production",
    title: "Untrusted text is data — fenced envelopes (PRD §23-443)",
    status: "pass",
    evidence:
      "retrieval.ts treats policy chunks + questions as opaque strings: tokenised for SCORING ONLY, never eval'd / templated / passed to a system-prompt slot. composeExtractive emits verbatim sentences between citation markers. Documented in retrieval.ts.",
    file: "src/lib/policy/retrieval.ts",
  },
  {
    id: "42",
    category: "production",
    title: "CSP + HSTS + frame-ancestors + security headers (PRD §23-454)",
    status: "pass",
    evidence:
      "src/middleware.ts adds 7 security headers to ALL responses: CSP (default-src 'self'; script 'unsafe-inline'+'unsafe-eval'; frame-ancestors 'none'; base-uri 'self'), X-Content-Type-Options nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS.",
    file: "src/middleware.ts",
  },
  {
    id: "43",
    category: "production",
    title: "PWA: manifest + robots + sitemap (PRD §14-273)",
    status: "pass",
    evidence:
      "src/app/manifest.ts (served at /manifest.webmanifest, theme_color #169AA5, background_color #0B111C), src/app/robots.ts (allow /, disallow /api/), src/app/sitemap.ts (single URL, daily, priority 1).",
    file: "src/app/manifest.ts",
  },
  {
    id: "44",
    category: "production",
    title: "Custom 404 + route error boundary + global error boundary (PRD §17-327)",
    status: "pass",
    evidence:
      "src/app/not-found.tsx (404 with astrolabe illustration + 'Go home'), src/app/error.tsx (route boundary with sanitized message + request-id copy button + retry), src/app/global-error.tsx (global boundary that owns its own <html>).",
    file: "src/app/error.tsx",
  },
  {
    id: "45",
    category: "production",
    title: "Loading state + retry on every async surface (PRD §17-321)",
    status: "partial",
    evidence:
      "loading.tsx (route-level spinner), JourneySkeleton + RequestListSkeleton + Ask 3-stage progress + admin CardSkeleton all exist. Retry buttons exist on the replay error banner + error.tsx, but not every async widget exposes its own retry — some rely on the route boundary.",
    file: "src/app/loading.tsx",
  },
  {
    id: "46",
    category: "production",
    title: "Replay is deterministic — byte-identical for same asOf (PRD §19-378)",
    status: "pass",
    evidence:
      "The engine has no Math.random / no Date.now (PRD §19-377). replay() calls assess(employee, asOf) deterministically. Repeated POSTs with the same asOf return identical `results` arrays; only meta.jobId / meta.latencyMs differ.",
    file: "src/app/api/v1/admin/replay/route.ts",
  },
  {
    id: "47",
    category: "production",
    title: "Reduced motion respected everywhere (PRD §13-251 / §16-316)",
    status: "pass",
    evidence:
      "useReducedMotion() from framer-motion is checked in today-screen, hrbp-screen, admin-screen (PulsingSteadyDot, Tilt3D, RevealOnScroll, Astrolabe3D). When reduced motion is on, animations degrade to no-op / opacity-only.",
    file: "src/components/astrolabe/micro-interactions.tsx",
  },
  {
    id: "48",
    category: "production",
    title: "Mobile-first responsive at 320px (PRD §14-261 / §13-252)",
    status: "partial",
    evidence:
      "All screens use mobile-first Tailwind prefixes (sm: / md: / lg:); grid layouts collapse to single column on mobile; touch targets are ≥44px. Not formally verified at exactly 320px on every screen — some admin tables may horizontally scroll on very narrow viewports.",
    file: "src/components/astrolabe/today-screen.tsx",
  },
  {
    id: "49",
    category: "production",
    title: "Real Postgres / Redis / k8s — stateless instances (PRD §22-436)",
    status: "n/a",
    evidence:
      "Prototype runs on SQLite (prisma + db.ts) + in-memory state (serviceRequests[] + consentRecords[] + rate-limit BUCKETS Map). Multi-instance deployment, RPO/RTO drills, active-active failover are not applicable to a single-process demo. The rate-limit + flag APIs are shaped so a Redis/Postgres swap is a drop-in change.",
    file: "src/lib/db.ts",
  },
  {
    id: "50",
    category: "production",
    title: "OpenTelemetry collector + distributed tracing (PRD §24-462)",
    status: "n/a",
    evidence:
      "Prototype uses the in-process structured logger (src/lib/logger.ts) with AsyncLocalStorage requestId + traceId. No OTel collector, no cross-service spans — there is only one service. Cross-service tracing would be added if the engine / retrieval / compose were split into separate deployables.",
    file: "src/lib/logger.ts",
  },
];

/* ----------------------------------------------------------------
 * Summary + handler.
 * ---------------------------------------------------------------- */
function summarise(items: ChecklistItem[]) {
  const summary = { total: items.length, pass: 0, partial: 0, fail: 0, na: 0 };
  for (const it of items) {
    if (it.status === "pass") summary.pass += 1;
    else if (it.status === "partial") summary.partial += 1;
    else if (it.status === "fail") summary.fail += 1;
    else summary.na += 1;
  }
  return summary;
}

export async function GET() {
  const start = Date.now();
  const items = ITEMS;
  const summary = summarise(items);

  return success(
    { items, summary },
    {
      servedFrom: "live",
      asOf: new Date().toISOString(),
      latencyMs: Date.now() - start,
    },
  );
}

// Re-export the version constants so callers importing from this route can
// see the same source of truth the envelope uses (kept here for type-only
// consumers; the route itself doesn't emit them in the body).
export const CHECKLIST_META = {
  engineVersion: ENGINE_VERSION,
  packVersion: PACK_VERSION,
  corpusVersion: CORPUS_VERSION,
  itemCount: ITEMS.length,
} as const;
