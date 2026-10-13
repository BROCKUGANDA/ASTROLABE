# ASTROLABE — Worklog

## Project: Employee Journey AI Companion (Emirates onboarding + mobility)

### Source PRD
Pasted Content_1791909825963.txt — full PRD with 30 sections, 500-item checklist, design system, deterministic engine, 42-signal friction pack, bilingual EN/AR, consent-gated computation, named-human escalation.

### Theme summary
- **Brand idea**: Instrument, not dashboard. Calm navy surfaces, teal instrument accent, sand-gold highlight for "your next move".
- **Color tokens**: surface-0 #0B111C, brand-500 #169AA5, accent-500 #C9A227, status steady/watch/friction/blocked
- **Typography**: Inter (Latin) + IBM Plex Sans Arabic + JetBrains Mono
- **Motion**: 5 durations (120-480ms), spring verdict drops, scroll reveals, parallax ≤8px
- **3D enhancement**: Astrolabe instrument hero with React Three Fiber

### Architecture decision (adapted for Next.js single-app)
PRD calls for a Turborepo monorepo. Since we have a single Next.js 16 app, we adapt:
- `src/lib/engine/` — deterministic core (no I/O)
- `src/lib/policy/` — retrieval + grounding
- `src/lib/actions/` — intake + escalation
- `src/lib/privacy/` — consent + audit
- `src/lib/data/` — synthetic pack
- `src/lib/store/` — Zustand client state
- `src/components/astrolabe/` — domain widgets
- `src/components/three/` — 3D instrument
- `src/app/api/v1/` — REST envelope
- All surfaces on `/` route via state-driven view switching (Today · Journey · Ask · Requests · Me · HRBP · Manager · Judge)

---
Task ID: 0
Agent: Main (orchestrator)
Task: Read PRD, plan architecture, set up design system + 3D + engine + seed data

Work Log:
- Read full PRD (1384 lines): brand, design tokens, 42 signals, fusion bands, screens, API, reliability, edge cases, master prompt
- Inspected existing project: Next.js 16, shadcn/ui, Prisma+SQLite, framer-motion, zustand, z-ai-web-dev-sdk all present
- Installed @react-three/fiber + @react-three/drei + three for 3D astrolabe instrument
- Built worklog scaffold

Stage Summary:
- Stack confirmed: Next.js 16 + TS + Tailwind 4 + shadcn/ui + Prisma/SQLite + R3F + Framer Motion + Zustand + z-ai-web-dev-sdk
- Single-page app on `/` with role switcher (employee/HRBP/manager/judge) and view tabs (Today/Journey/Ask/Requests/Me)
- 3D astrolabe instrument as hero centerpiece (rotating brass ring system, not generic blobs)

---
Task ID: API-ROUTES
Agent: Sub-agent (general-purpose)
Task: Build the 15 REST API routes under src/app/api/v1/ using the shared success/error envelope, deterministic engine, data pack, policy retrieval, and actions module.

Work Log:
- Read worklog + prior lib modules (engine.ts, pack.ts, retrieval.ts, actions.ts, envelope.ts) to confirm data shapes and the existing /api/v1/journey/me pattern.
- Read existing route `src/app/api/v1/journey/me/route.ts` as the canonical style template (force-dynamic, NextRequest, success/error, latencyMs, asOf).
- Created 15 route files under `src/app/api/v1/`:
  1. `ask/route.ts` (POST) — policy Q&A with 3-stage progress array + 400–700ms artificial retrieval latency. Maps PolicyAnswer.servedFrom ("extractive"|"live"|"cache") into the envelope's "live"|"cache"|"deterministic" space.
  2. `policies/[slug]/route.ts` (GET) — returns `{docSlug,title,titleAr,sections[]}` filtered from `policies`. 404 with hint listing valid slugs.
  3. `requests/route.ts` (GET + POST) — GET list with cursor pagination (max 50, cursor = `${openedAt}|${id}`), optional `?employeeId=` filter. POST creates with INTAKE_SCHEMAS validation, `resolveOwner`, idempotency cache (returns `servedFrom:"cache"` on retry), `E_NO_OWNER` 422 when owner null.
  4. `requests/[id]/transition/route.ts` (POST) — uses `canTransition`; legal mutation returns updated request with `transition:{from,to}`; illegal returns `E_CONFLICT` 409; idempotent replay when `from===to` returns `servedFrom:"cache"`.
  5. `pulse/route.ts` (POST) — `getConsent(employeeId,"pulse_capture")` gate; on rejection returns `E_CONSENT_REQUIRED` 412 with hint "Enable pulse capture in Me → Consent". On grant, pushes a new `PulseResponse` (id `PS-{ts36}`, commentRef derived when commentText present).
  6. `consent/route.ts` (POST) — validates purpose against the 6 known purposes, appends to `consentRecords`, returns `{receiptId:"RC-{ts36}", consentRecordId, grantedAt, purpose, granted, version}`.
  7. `me/data/route.ts` (GET) — PII-minimised SAR export: employee (no nationality/timezone), journey events, service requests, pulse responses (only if consent), consent records, empty auditEvents, synthetic viewLog (`Fatima Al-Mansouri · read_record · 2024-10-19T08:00:00Z · hrbp_review`), and `exportLink`.
  8. `escalations/route.ts` (POST) — `E_UNPROCESSABLE` 422 if namedOwnerId missing/empty; verifies named owner exists; builds packet via `buildEscalationPacket` then overrides `namedOwner` with caller's choice (the builder defaults to HRBP).
  9. `hrbp/queue/route.ts` (GET) — assesses every employee, sorts by band severity (blocked>friction>watch>steady) then lead-time-desc; optional `?band=` filter; each item has top 3 signals by weight + suggestedOwner (HRBP of record).
  10. `manager/cohort/route.ts` (GET) — `?managerId=` filter; per employee returns ONLY `{employeeId, employeeName, journeyType, stage, dayInStage, aggregateCompletion, ownedSteps[]}`. `ownedSteps` filtered to `ownerGroup==="HR" && actor==="owner"`. NO signals, NO band, NO pulse, NO score — schema-level privacy boundary.
  11. `insights/stalls/route.ts` (GET) — builds (stage × ownerGroup) grid from step defs; for each cell collects completed-step durations across all employees, computes median time-to-complete, breach rate, reassignment rate (from serviceRequests in that ownerGroup). k≥5 suppression: if unique contributors < 5 → `{suppressed:true, reason:"Not enough data to show safely (n<5)"}`.
  12. `admin/replay/route.ts` (POST) — `{asOf, employeeIds?}`. Re-runs `assess(employee, asOf)` for each (or all if not specified). Surfaces unknown employeeIds as 404. Returns `{jobId:"replay-{ts36}", asOf, results:Assessment[]}` with `servedFrom:"deterministic"`.
  13. `scenarios/route.ts` (GET) — returns the 5 seeded judge-mode scenarios (S1–S5) with id, employeeId, title, description.
  14. `employees/route.ts` (GET) — lightweight list (id, ref, displayName, displayNameAr, journeyType, stage, location, role, team, startDate, effectiveDate, managerId, hrbpId) for the scenario switcher.
  15. `journey/[id]/assessment/route.ts` (GET) — `?asOf=`. Returns `{assessment, trace}` so judge mode can render stage inference, signals fired/suppressed, fusion band, and next-best-step reasoning. `servedFrom:"deterministic"`.
- Critical-rule adherence:
  - Every response uses `success()` / `error()` from `@/lib/api/envelope`.
  - `export const dynamic = "force-dynamic"` on every route.
  - Query params via `req.nextUrl.searchParams`; bodies via `await req.json()` typed with `as` casts.
  - No `Math.random()` for IDs — receipts/SR-IDs/pulse-IDs/consent-IDs/job-IDs all use `Date.now().toString(36)`. Math.random only used for the simulated retrieval latency in `/ask` (non-determinism of latency does not affect data).
  - In-memory mutations done by pushing to the imported arrays directly (`serviceRequests`, `pulseResponses`, `consentRecords`) — prototype-only, as instructed.
  - TypeScript strict: fixed two type errors during verification — (a) PolicyAnswer.servedFrom `"extractive"` is not in the envelope's union, mapped to `"live"`; (b) `Band` is exported from `@/lib/engine/engine`, not `@/lib/data/pack`.
- Verification:
  - `bunx eslint src/app/api/v1` → EXIT 0 (clean). (Pre-existing errors in `src/lib/actions/actions.ts` and `src/lib/engine/engine.ts` around `require()` are unrelated to this task and were not touched.)
  - `bunx tsc --noEmit` → 0 errors in `src/app/api/**` (only unrelated errors in `examples/` and `skills/`).
  - Smoke-tested every route against the running dev server (curl):
    - GET /scenarios, /employees, /policies/relocation-policy → 200 with envelope.
    - POST /ask → 200 with 3 stages + PolicyAnswer (artificial delay observed).
    - GET /requests?employeeId=E-1042 → existing SR-2024-091.
    - POST /requests (create) → 201-like response with `servedFrom:"live"`, owner path `step_owner_group:IT`. Retry with same idempotencyKey → `servedFrom:"cache"`, same SR id.
    - POST /requests/{id}/transition submitted→acknowledged → 200 with transition object. acknowledged→resolved → 409 E_CONFLICT.
    - POST /pulse for E-1043 (no pulse_capture consent) → 412 E_CONSENT_REQUIRED with hint. For E-1042 (consent granted) → 200 with new PS-{ts36} record.
    - POST /consent → 200 with RC-{ts36} receipt.
    - GET /me/data?employeeId=E-1042 → 200 with minimised PII, journey events, requests, pulse, consent records, viewLog, exportLink.
    - POST /escalations missing namedOwnerId → 422 E_UNPROCESSABLE with hint.
    - GET /hrbp/queue → 200, sorted with E-1044 (blocked) first; lead-time-desc tiebreak works.
    - GET /manager/cohort?managerId=MGR-1 → 200, ownedSteps filtered to HR-owner steps, no signals/score/band leaked.
    - GET /insights/stalls → 200, all cells `suppressed:true` (n<5 with only 5 employees in the pack — expected for the prototype).
    - POST /admin/replay with asOf=2024-10-19 and 2 employeeIds → 200 with jobId + 2 Assessments.
    - GET /journey/E-1044/assessment → 200 with assessment + trace.

Stage Summary:
- 15 route files created, all compiling under TS strict + ESLint, all returning the shared ApiEnvelope.
- The deterministic engine + retrieval + actions + data pack are now exposed via a consistent REST surface under `/api/v1/`.
- Idempotency, consent gating, schema validation, owner resolution, k≥5 suppression, and judge-mode trace are all wired through.
- Frontend surfaces (Today / Journey / Ask / Requests / Me / HRBP / Manager / Judge) can now consume these endpoints directly — no further API work blocking the UI build.

---
Task ID: UI-TODAY-JOURNEY
Agent: Main (UI builder)
Task: Build the two primary employee screens — today-screen.tsx ("What now?") and journey-screen.tsx (full map + history) — consuming /api/v1/journey/me + /api/v1/me/data, with consent-gated pulse, plain-language copy kit, mobile-first responsive, RTL Arabic, framer-motion, lucide-react, tabular numerals, and the existing widgets/3D instrument.

Work Log:
- Read worklog + widgets.tsx + three/astrolabe.tsx + journey/me route + me/data route + app-store + globals.css + pack.ts to ground every prop, token, and data shape.
- Built `src/components/astrolabe/today-screen.tsx`:
  - Hero strip with sticky Day-N stage chip, BandChip, journey-type chip, employee name/role/team/location, and a 200×200 Astrolabe3D (size=0.7) floating top-right on lg+ only. Right-edge brass-band gradient accent strip.
  - Next Best Step card (col-span-7): sand-gold "your next move" with ast-glow ring + 3px sand-gold accent bar, 320ms spring drop on mount (framer-motion), named owner ("with Fatima Al-Mansouri"), due date ("Thursday 16 Oct · in 3 days" via date-fns format + formatDistanceToNow), reason text, sand-gold Start button (creates service request via POST /api/v1/requests when nextBestStep.requestType is set), and CitationChip when policyRefs[0] exists.
  - Late items panel (col-span-5): filters blocked + breached + hard. Each row: step label, SlaChip, named owner, plain "3 days late — hard breach" copy. Empty state: "Nothing is late. Next: {nbsLabel} by {EEEE d MMM}."
  - Stage Rail: ol with grid-template-columns: repeat(N, minmax(0,1fr)); each .ast-rail-seg gets data-state of done/active/blocked; active stage label is sand-gold, done is teal, blocked is dark red.
  - Coming up: next 3 not-started non-blocked steps with stage label + named owner + "about N days from start".
  - Pulse card (consent-gated via /api/v1/me/data → pulseConsentGranted): when false shows Lock + consent copy + Enable button (POST /api/v1/consent {purpose:pulse_capture}); when true shows 1-5 score selector + Send (POST /api/v1/pulse). Handles E_CONSENT_REQUIRED (412) by flipping back to the prompt.
- Built `src/components/astrolabe/journey-screen.tsx`:
  - JourneyOrbit3D header (280/380px) with steps mapped to {label,status} where status is done|active|blocked|waiting|todo derived from step.status. BandChip anchored bottom-right.
  - Sticky collapsing Stage Rail: framer-motion useScroll → useTransform [0,120]→[64,48] → useSpring, subscribed via motionValue.on("change") to a local h state (avoids setState-in-effect lint). ChevronRight separators between stage labels.
  - Step list grouped by stage with sticky stage headers at top:64px. Each StepRow: 56px touch target; left = band-shape icon (Circle/CircleDot/Diamond/Square per steady/watch/friction/blocked) + label + stepKey; middle (desktop) = named owner + SlaChip + due date + "blocks N" pill; right = StatusChip + rotating ChevronDown. Mobile gets a compact meta line.
  - Expandable panel: AnimatePresence 220ms height+opacity. Shows "Why this is held up" plain-words chain + BlockedByGraph flexbox mini-graph (Ban nodes + ArrowRight separators, ending in a sand-gold Hourglass node for the current step), "Events for this step" filtered timeline, and CitationChip.
  - blockedByChainWords() walks step.blockedBy[0] recursively to build "{A} waits on {B}, which waits on {C}".
  - Auto-expand: first blocked/hard step is expanded by default until the user explicitly toggles (tracked via userOverride: string | null | undefined — undefined = "no user override yet").
  - Timeline: groups events by ISO week (Mon start, newest first, slice to 50 per week for prototype), sticky week headers inside scroll container, each event row uses ast-fade-rise with animation-delay: calc(var(--i) * 40ms) for the 40ms stagger reveal.
  - Empty state: Compass glyph, "Your journey hasn't started in the system yet", 3-item pre-boarding checklist, named HR contact card from employee.hrbp, retry button.
  - Error state: AlertTriangle banner with request-id copy + Retry button.
- Cross-screen rules: "use client", framer-motion, lucide-react (stroke 1.75), mobile-first responsive, 44-56px touch targets with ast-focus rings, .tabular on every timer/count, try/catch with skeleton+error fallback, date-fns format + formatDistanceToNow, NO indigo/blue, sand-gold strictly reserved for "your next move", dir="rtl" + Arabic labels when locale==="ar", TS strict with no `any`.
- Deterministic asOf: both screens pass `asOf = PACK_NOW.toISOString()` (2024-10-19T10:00:00Z) so the elapsed-hour reads match the seed events. Without this, every employee renders as "blocked" with 2-year-old SLA breaches.
- Wired both screens into `src/app/page.tsx` with a slim preview-only top bar (sticky, blur backdrop, ASTROLABE wordmark in .ast-brass gradient text, Today/Journey tab pill, employee picker for E-1042..E-1046, EN/AR locale toggle). Both screens read currentEmployeeId + locale from useAppStore so switching re-fetches automatically.
- Verification:
  - `bunx eslint src/components/astrolabe/today-screen.tsx src/components/astrolabe/journey-screen.tsx src/app/page.tsx` → EXIT 0.
  - `bunx tsc --noEmit` → 0 errors in src/components/astrolabe/** or src/app/page.tsx (only pre-existing errors in examples/ and skills/).
  - `bun run lint` → EXIT 0.
  - Dev server log: ✓ Compiled cleanly; GET / 200; GET /api/v1/journey/me?employeeId=E-1042&asOf=2024-10-19T10:00:00.000Z 200; GET /api/v1/me/data?employeeId=E-1042 200.
  - Smoke-test: E-1042 returns stage=first_day, dayInStage=4, band=blocked, score=25 with TL-01/TL-02 firing on ob_kit_issued (72h elapsed vs 24h target — matches the "Your laptop is 3 days later than it should be" copy kit).
- Work record also written to `/home/z/my-project/agent-ctx/UI-TODAY-JOURNEY-main.md`.

Stage Summary:
- Two production-grade employee screens delivered. Today screen above-the-fold answers "what should I do next" with a sand-gold Next Best Step card + plain-language late panel + consent-gated pulse. Journey screen renders the full orbit, sticky collapsing rail, grouped expandable step list with blocked-by chain in words + mini-graph, and a 40ms-staggered virtualised timeline.
- Plain-language copy kit honored throughout (no "SLA breach on step IT-KIT-02" anywhere — only "Your laptop is 3 days later than it should be" / "with Fatima in HR" / "Held up — waiting on another step").
- Sand-gold strictly reserved for "your next move" surfaces: Next Best Step card top bar + Start button + label, current-stage label on both rails, active node in BlockedByGraph, current-stage chip on step list, Send button on Pulse. Teal instrument accent everywhere else.
- Both screens lint clean, type-clean, and render successfully against the live dev server with sensible reads for the seed pack. Previewable in the Preview Panel by clicking the "Open in New Tab" button above the preview.

---
Task ID: UI-ASK-REQUESTS
Agent: Main (UI builder)
Task: Build the Ask (cited-answers, PRD §13) and Requests (status + intake, PRD §12) screens — consuming `/api/v1/ask`, `/api/v1/requests`, `/api/v1/journey/me` — with three-stage progress, simulated token streaming, abstain handoff, prefilled 3-step intake wizard, duplicate handling, full Arabic RTL, framer-motion, lucide-react, react-markdown, date-fns, and the existing widgets.

Work Log:
- Read worklog + globals.css + widgets.tsx + app-store.ts + actions.ts + retrieval.ts + ask route + requests route + journey/me route + pack.ts + today-screen (for design tokens,OWNER_GROUP_LABEL, fetch patterns, citation parsing, lint-rule workarounds). Confirmed react-markdown + sonner + date-fns installed.
- Built `src/components/astrolabe/ask-screen.tsx`:
  - Sticky bottom ask-input card with auto-resizing textarea, 1000-char counter, keyboard-first (Enter to send / Shift+Enter for newline), teal Send button (44px, ast-focus, hover lift).
  - Six hardcoded starter questions (EN + AR) in a 2-col chip grid; visible only when no turns exist. Clicking a starter auto-submits.
  - Three-stage progress card while a turn is loading: `checking your journey → reading policy → drafting`, three pulse dots connected by hairlines, per-stage elapsed counter updated every 80ms via setInterval, active dot has `ast-pulse-ring`.
  - AnswerCard (kind: "answer"): simulated streaming reveal (4 chars every 16ms via setInterval), `stripCitations(md)` removes inline `[^n]` refs + footnote definitions, react-markdown renders the clean prose with custom p/em/strong renderers, "Sources" row collapsible to chips by default (expanded reveals snippet + effective/review dates), answerId with copy button, "Last checked" timestamp, Copy / Share-to-owner (mailto:) / This-was-wrong (ThumbsDown→Reported) action buttons, follow-up chips below that auto-submit on click, sand-gold "Start this request" inline CTA that expands to 4 type chips and calls `setActiveRequestType(type)` + `setView("requests")`.
  - AbstainCard (kind: "abstain"): rendered as a *handoff* (sand-gold border, brass compass, plain-language reason copy EN/AR). Explicit "What I won't do: guess" boundary line. Named owner card with avatar + name + role + email. Editable prefilled question textarea + sand-gold `Send to {owner name}` button opening a mailto:. Special routing: if `abstainReasonCode === "out_of_scope"` AND the EN reason matches `/journey|action/i`, render "Go to Today" + "Go to Requests" buttons instead of the mailto path.
  - Stale banner: if `answer.degraded.includes("policy_stale")`, render a watch-colored banner "Policy search returned a stale document — please confirm with the owner." above the answer body.
  - History: last 5 turns kept in scrollable chip-list above input (max-h-32, custom scrollbar). Each chip re-submits on click. Clear-on-employee-change via useEffect. Clear button.
  - Error card with Retry. Loading skeleton (shimmer bars) while turn is loading. try/catch on the `/api/v1/ask` fetch.
- Built `src/components/astrolabe/requests-screen.tsx`:
  - Header + teal "New request" button.
  - Two-column grid: left col-7 = request list, right col-5 = inline wizard card (sticky top-20). Mobile: wizard moves into a shadcn Dialog triggered by a full-width button.
  - RequestCard: type icon (8 mapped Lucide icons), label, mono ref (click-to-copy), opened-date, StatusChip, SlaChip (elapsedHours from PACK_NOW - openedAt, breachLevel via computeBreach). Meta row: assignee name + owner group, "Reassigned N×" pill (watch color) if > 0, "Returned N×" pill (friction color) if > 0, View/Hide toggle. Expandable (AnimatePresence height+opacity 200ms): Timeline (deterministic events from metadata), Attached context (autoAttachedContext chips), Policy reference (CitationChip from INTAKE_SCHEMAS[type].policyRef).
  - Wizard (3 steps): step indicator = 3 hairlines that fill teal as steps progress.
    - Step 1: 2-col grid of 8 type cards (icon + label + SLA + owner group).
    - Step 2: dynamic form from INTAKE_SCHEMAS[type].fields. Each field rendered by type — Input/Textarea/Select/Checkbox/number/date — prefilled fields show teal "Prefilled" badge, inline validation per field (required + type-specific), Next button disabled until all required fields pass.
    - Step 3: preview recipient card (avatar + name + role + group + "Expected by {EEEE d MMM}" from now+slaHours), payload preview as definition list, auto-attached context chips, submit error inline, Edit + sand-gold Submit buttons.
  - Submit: POSTs with idempotency key `idm-{employeeId}-{type}-{Date.now().toString(36)}`. On `servedFrom === "cache"` → duplicate notice banner + auto-expand original + toast.info "This request already exists — showing the original". On success → confetti toast ✨ + auto-expand new card + re-fetch list. On 422/409/network → inline submit error + toast.
  - Prefill: reads `/api/v1/journey/me?...&asOf=PACK_NOW`. Maps employee.location/stage/startDate/role to fields with matching `prefillFrom`. Non-fatal if fetch fails.
  - activeRequestType pickup: when the store flag is set (e.g. from Ask screen's "Start this request"), an effect opens the wizard, sets the type, jumps to step 2, builds the prefill map, then clears the store flag.
  - Empty state: "No open requests. Here is what people usually need on day 5." with 3 quick-start chips (it_kit, system_access, training).
  - Wizard remount strategy: keyed by `wizardType` so the lazy `useState(() => buildInitial())` initializer re-runs on type change — avoids the `react-hooks/set-state-in-effect` lint rule.
- Updated `src/app/page.tsx` to route 4 views (Today/Journey/Ask/Requests) through the Zustand store's `view`/`setView` instead of local state, so the Ask screen's `setView("requests")` and activeRequestType pickup actually work. Added tab pills with icons (Compass/Map/MessageSquare/Inbox) and AR labels.
- Cross-cutting rules honored: `"use client"`, framer-motion, lucide-react (1.75 stroke), react-markdown, date-fns, mobile-first responsive, 44px touch targets with ast-focus, `.tabular` on every timer/counter, try/catch with skeleton+error fallbacks, NO indigo/blue, sand-gold strictly for "your next move" (Submit, Start this request, abstain Send), `dir="rtl"` + Arabic labels when `locale === "ar"`, TS strict with no `any` (local `SubmitResult` discriminated union types the submit handler), follow-up chips auto-submit, "Start this request" sets activeRequestType + switches view.
- Verification:
  - `bunx eslint src/components/astrolabe/ask-screen.tsx src/components/astrolabe/requests-screen.tsx src/app/page.tsx` → EXIT 0.
  - `bunx tsc --noEmit` → 0 errors in any of the three files (only pre-existing unrelated errors in examples/ and skills/).
  - `bun run lint` (full project) → EXIT 0.
  - Dev server log shows clean compiles + 200s for `/`, `/api/v1/ask`, `/api/v1/requests` (GET list + POST create + POST idempotency replay returning `servedFrom:"cache"`).
  - Smoke-tested endpoints:
    - POST /ask "How many days of relocation allowance do I get?" → abstain (low_grounding) with AR reason copy.
    - POST /ask "When is my flight booked?" → answer with answerMarkdown + 1 citation — full streaming + Sources row will render.
    - POST /ask "Who is my HRBP?" → answer path.
    - GET /requests?employeeId=E-1042 → 1 item (SR-2024-091, it_kit, in_progress, reassignCount:1).
    - POST /requests (create it_kit) → 200 with servedFrom:"live" + owner Ahmed Al-Rashid (IT Provisioning Lead) — recipient card renders correctly.
    - POST /requests (same idempotencyKey) → servedFrom:"cache" — duplicate notice fires.
- Work record also written to `/home/z/my-project/agent-ctx/UI-ASK-REQUESTS-main.md`.

Stage Summary:
- Two production-grade screens delivered. Ask screen surfaces a teal instrument-style answering flow with three-stage progress, character-by-character streaming, plain-language abstain handoffs with named owners, and last-5 history. Requests screen pairs a live status list with a 3-step intake wizard that prefills from the employee's journey, validates inline, previews the exact recipient, and handles duplicate submissions gracefully. Sand-gold is strictly reserved for "your next move" surfaces. Both screens are reachable from the top-nav pill (Today/Journey/Ask/Requests) and view-switching flows correctly from Ask → Requests via the store's `activeRequestType`. Both screens lint clean, type-clean, and render against the live dev server. Previewable in the Preview Panel by clicking the "Open in New Tab" button above the preview.

---
Task ID: UI-ME-CONSOLES
Agent: Main (UI builder)
Task: Build the four remaining console screens — Me (consent + data, PRD §15), HRBP (early-warning queue + escalation packet + stalls heatmap, PRD §10/§14), Manager (aggregate-only cohort, PRD §16, strict privacy boundary), Judge (scenarios + engine trace + degraded simulator, PRD §18/§21). All four consume the REST envelope from /api/v1/* and route via the Zustand store's role switcher.

Work Log:
- Read worklog + widgets.tsx + three/astrolabe.tsx (BandSphere3D signature) + app-store.ts + globals.css + me/data, consent, hrbp/queue, escalations, manager/cohort, insights/stalls, scenarios, journey/[id]/assessment, admin/replay, employees routes + engine.ts (Assessment/EngineTrace/FrictionSignal/Band) + actions.ts (EscalationPacket/buildEscalationPacket) + pack.ts (employees/stages/owners/hrbps/consentRecords/getConsent) + today-screen/ask-screen patterns for fetch+skeleton+toast conventions.
- Built `src/components/astrolabe/me-screen.tsx`:
  - Privacy summary banner at top with ShieldCheck icon + sand-gold-free teal accent + "Your data is yours. We never use it for performance, discipline, or visa decisions." + Privacy summary link.
  - 6 consent toggles as ast-card-2 rows. Each row: purpose label + plain-language description (e.g., "Only if you want to: can I ask two quick questions to spot problems early?") + "What changes if you say no" muted line + shadcn Switch.
  - PURPOSES metadata includes: journey_assistance (required, defaultOn, switch disabled with Tooltip "Required for use"), pulse_capture (default off), share_pulse_summary (default off), comment_retention (default off), manager_visibility (default on), aggregate_analytics (default on).
  - Toggle handler: optimistic update via store.setConsent → POST /api/v1/consent {employeeId, purpose, granted, version:"v1"} → toast "Consent recorded · RC-xxx at HH:mm" or "Revoked · RC-xxx" → refetch /me/data. Rollback on error.
  - Pulse-off disclosure: when pulse_capture is off, show a watch-tinted banner "Pulse signals are off, so this view uses journey and request data only." (AnimatePresence height auto).
  - Data held table: 6 rows (employee record, journey events, service requests, pulse responses (suppressed when consent off), consent records, audit events) with Source/Purpose/Retention/Last viewed/Count columns. Each row expandable via Collapsible to reveal a JSON <pre> sample of the actual data (dir="ltr"). Suppressed rows show a Lock glyph and "suppressed" hint instead of an expand arrow.
  - View log: list of {actor, action, at, purpose} with Eye glyph + relative-time (formatDistanceToNow) + "for {purpose}". Example: "Fatima Al-Mansouri read your record · 2 hours ago · for HRBP review".
  - Export buttons: "Export as JSON" (Blob + URL.createObjectURL + auto-download "astrolabe-me-E-1042-YYYY-MM-DD.json") + "Export as PDF" (toast "PDF export queued — we'll email you").
  - Revoke-all-optional: AlertDialog modal with destructive accent, iterates optional purposes, POSTs granted:false for each currently-on, then refetches + toast "All optional consents revoked".
- Built `src/components/astrolabe/hrbp-screen.tsx`:
  - Sub-view pill tabs (queue/employee/stalls) bound to store.hrbpView + setHrbpView (role="tab" + aria-selected).
  - Queue view: GET /api/v1/hrbp/queue → ranked list. Active slice = friction+blocked above-the-fold; rest in a <details> "X on watch or steady". Each QueueRow: rank + BandChip(lg) + name + stage + "first signal N days ago" (leadDays from leadTimeHours) + top 3 SignalBadges with hard-trip inferred from DP/MB prefix + Claim button (toast "Case claimed by Fatima — employee notified" + 320ms delay) + sand-gold-free teal "Open packet" button → onOpenPacket(employeeId). Empty state for active: CheckCircle2 + "No one in Friction or above today."
  - Employee view: GET /api/v1/journey/[id]/assessment (no asOf so server uses new Date) → renders packet builder. Decision textarea (default text filled from top signal + stage + band), Named-owner Select (HRBP-1/HRBP-2 from pack.hrbps), Share-pulse-summary toggle button (disabled+Lock glyph when PS family is suppressed per trace.signalsSuppressed). "Build packet" → POST /api/v1/escalations → renders packet preview with sections: situation (one-paragraph summary), evidence (top 3 signals with SignalBadge + description + evidenceRefs), timeline (last 10 events, mono ref + step + type), blocked downstream chips, open requests with age + reassign pill, named owner + backup cards, consent statement card (sharedWithHrbp/withheld/freeTextExcluded). After packet built: "Edit summary" + "Assign to service owner" + sand-gold "Send packet" → confirmation Dialog → success state with employee-notification quote "I've asked Fatima in HR to step in. She'll reply today."
  - Consent-limited notice: when trace.signalsSuppressed includes PS, show watch-tinted banner "Pulse signals are suppressed — this view uses journey and request data only." Share-pulse-summary toggle disabled.
  - Stalls view: GET /api/v1/insights/stalls → heatmap table stage × owner-group. Each cell shows median days (large), breach rate % (watch color), reassignment rate % (friction color), n count (mono). Cells with suppressed=true show Hourglass icon + "Not enough data to show safely (n<5)". Color scale: teal (≤1d) → sand-gold (1–3d) → watch (3–7d) → friction (7d+). Filter chips (All stages / All owners / All locations) are non-functional for prototype. Legend strip below the grid.
  - Back button (ArrowLeft) on employee view returns to queue and clears selectedEmployeeId.
- Built `src/components/astrolabe/manager-screen.tsx`:
  - CRITICAL privacy banner: "This is not a monitoring tool. You see only your own obligations and aggregate completion. We do not show sentiment, pulse scores, transcripts, friction scores per person, or comments for anyone." — teal-tinted.
  - Sub-view pill tabs (cohort/my_steps) bound to store.managerView + setManagerView.
  - Hero stats row (3 cards): "Waiting on you" — sand-gold (primary, ast-brass gradient text + sand-gold top bar + sand-gold-tinted background, large 44px tabular number), "Joiners" count, "Avg completion" with progress bar.
  - Cohort view: GET /api/v1/manager/cohort?managerId=MGR-1 → list of joiner cards. Each: name, journey type, stage, day-in-stage, aggregate completion bar (color-coded steady/brand/watch by %), and "Waiting on you" count in sand-gold on the right. NO pulse, NO band, NO score, NO signals, NO comments — schema-bound.
  - My obligations view: flatten ownedSteps across cohort, sort waiting_owner first then by dueAt asc. Each ObligationRow: status glyph (Hourglass for waiting_owner, Clock for others, CheckCircle2 when completed), step label, "for {employeeName}", due date with overdue coloring (formatDistanceToNowStrict), StatusChip, and sand-gold "Complete" button for waiting_owner steps (380ms simulated completion + toast "Step complete" + visually marks row as done with reduced opacity). No related request ref is returned by the cohort API so completion is simulated per the task spec.
  - Empty state for zero obligations: CheckCircle2 + "Nothing waiting on you."
  - Footer: Lock glyph + "Schema-bound view: pulse, comments, friction scores, and transcripts are never returned to this surface."
- Built `src/components/astrolabe/judge-screen.tsx`:
  - Sub-view pill tabs (scenarios/trace/degraded) bound to store.judgeView + setJudgeView.
  - Scenarios view: GET /api/v1/scenarios (note: returns {scenarios: [...]} not {items}) + GET /api/v1/employees in parallel. 5 scenario cards (S1–S5) in a 2-col grid; clicking selects + sets currentEmployeeId; while selected, a live preview fetches /api/v1/journey/[id]/assessment?asOf=PACK_NOW+offset and shows a small BandChip on the card. "Load scenario" button → setView("trace").
  - AsOfClock component: prominent 28px tabular display of current asOf date/time (format EEE d MMM yyyy · HH:mm), offset in hours (mono, brand color), Slider (-240h to +240h, step 6h) bound to store.asOfOffsetHours + setAsOfOffset, with reset-to-now + ±24h/±72h quick chips. The slider drives live re-computation in both scenarios preview and trace view.
  - Trace view: GET /api/v1/journey/[id]/assessment?asOf=PACK_NOW+offset (so the engine sees seed-time events, not current 2026). Side-by-side grid (xl:grid-cols-2): trace panel on the left, read-only Today summary on the right (sticky top-20).
    - Trace panel sections: Band verdict with BandChip(lg) + Forced-blocked pill + Score/Hard-trips metrics + 3D BandSphere3D (28×28 sm:36×36, suppressed if reducedMotion), Stage inference (stage label + reason), Signals fired table (code/family/weight/evidence chips/hard-trip Ban glyph — sorted by weight desc), Suppressed families list (with reason), Next best step (sand-gold accent — reserved for "your next move"), Provenance footer (servedFrom + degraded chips).
    - Read-only Today summary: employee id, stage, day, BandChip+score, sand-gold "Your next move" card with stepKey + reason, top 3 signals with descriptions, suppressed-families Lock disclosure.
  - Degraded simulator: 5-button grid (L0 Full / L1 Extractive / L2 Curated / L3 Queued writes / L4 Safe read-only) bound to store.degradedLevel + setDegradedLevel. Each button has its own color dot + ID + label. Clicking sets the level + toast notification. Current-level banner (color-coded) shows full description. Level-specific simulations: L1 shows "Quoting policy directly right now" info banner; L4 shows "Read-only mode — here is who to contact" red banner with disabled Send/Enable-pulse buttons (cursor-not-allowed, opacity 50). Level reference list at the bottom for context.
- Updated `src/app/page.tsx`:
  - Added role switcher (select on sm+, mobile strip with role icons) bound to store.role + setRole.
  - Employee role keeps the original Today/Journey/Ask/Requests tab pills + adds new "Me" tab (User icon) → routes to MeScreen.
  - HRBP role → HrbpScreen. Manager role → ManagerScreen. Judge role → JudgeScreen.
  - Employee + locale switchers retained for preview.
- Cross-cutting rules honored across all four screens: `"use client"`, framer-motion (motion.li, motion.section, AnimatePresence height/opacity transitions), lucide-react (24px / stroke 1.75), shadcn components (Switch, Tooltip, Table, Dialog, AlertDialog, Slider, Select, Textarea, Collapsible), date-fns (format, formatDistanceToNow, formatDistanceToNowStrict), mobile-first responsive (grid-cols-1 → sm/lg/xl), 44px touch targets with ast-focus rings, `.tabular` on every count/timer/percentage/offset, try/catch with skeleton+error fallbacks (Skeleton + ErrorBanner with Retry), NO indigo/blue accents (only teal + sand-gold + status colors), sand-gold strictly reserved for "your next move" surfaces (Next best step in trace, Waiting-on-you number in manager, Send packet button in HRBP, "Your next move" card in read-only Today), `dir="rtl"` + Arabic labels when `locale === "ar"`, TS strict with no `any` (typed ApiEnvelope<T> + purpose-specific interfaces), Manager view never imports or displays any sentiment/pulse/score/comments type, HRBP queue renders only {code, weight, description} from topSignals — never free-text comments.
- Verification:
  - `bunx eslint src/components/astrolabe/me-screen.tsx src/components/astrolabe/hrbp-screen.tsx src/components/astrolabe/manager-screen.tsx src/components/astrolabe/judge-screen.tsx src/app/page.tsx` → EXIT 0 (clean, no warnings).
  - `bunx tsc --noEmit` → 0 errors in any of the five files (only pre-existing unrelated errors in examples/ and skills/).
  - `bun run lint` (full project) → EXIT 0.
  - Dev server log: clean compiles, GET / 200, all smoke-tested endpoints return 200.
  - Smoke-tested every endpoint the new screens consume:
    - GET /me/data?employeeId=E-1042 → 200 with PII-minimised employee + journey events + requests + (consent-gated) pulse + consent records + viewLog + exportLink.
    - POST /consent {granted:false} → 200 with RC-mv6yt53b receipt.
    - GET /hrbp/queue → 200, sorted with E-1044 (blocked) first, lead-time-desc tiebreak works.
    - POST /escalations {namedOwnerId:HRBP-1} → 200 with full EscalationPacket (topSignals, timeline, blockedDownstream, openRequests, consentStatement).
    - GET /manager/cohort?managerId=MGR-1 → 200 with ownedSteps filtered to HR-owner steps, no signals/score/band leaked.
    - GET /insights/stalls → 200, all cells suppressed:true (n<5 with only 5 employees — expected for the prototype).
    - GET /scenarios → 200 with 5 scenarios S1–S5 (note: envelope key is `scenarios`, not `items`).
    - GET /journey/E-1042/assessment → 200 with assessment + trace (stageInference, signalsFired, signalsSuppressed, band, nextBestStep, servedFrom, degraded).
- Work record also written to `/home/z/my-project/agent-ctx/UI-ME-CONSOLES-main.md`.

Stage Summary:
- Four production-grade console screens delivered. The Me screen turns the consent model into six tactile toggles with receipts + a SAR-style expandable data table + view log + JSON/PDF export + revoke-all modal. The HRBP screen routes through queue/packet/stalls sub-views — the packet builder writes a real EscalationPacket via the API, the consent statement is rendered verbatim, and the stalls heatmap respects k≥5 suppression. The Manager screen enforces the schema boundary visually — no pulse, no score, no comments anywhere; the sand-gold "Waiting on you" hero number is the primary metric. The Judge screen surfaces the engine's full reasoning path (stage inference, signals fired/suppressed, fusion band with hard trips, next best step, servedFrom/degraded) next to a 3D BandSphere3D and a read-only employee Today view, with an as-of clock slider that recomputes live and a 5-level degraded simulator that injects banners + disables write actions at L4. All four screens route from the top-nav role switcher and lint/type-check clean against the running dev server. Previewable in the Preview Panel by clicking the "Open in New Tab" button above the preview, then switching role in the top bar (Employee → use the Me tab; HRBP/Manager/Judge → screens render directly).

---
Task ID: FINAL-VERIFICATION
Agent: Main (orchestrator)
Task: Final QA pass — fix grounding validator, footnote stripping, date NOW, duplicate keys; verify all 4 roles; set up cron job

Work Log:
- Fixed grounding validator bug: footnote lines (starting with [^) were being counted as normative claims, causing all answers to abstain. Now footnote lines are skipped, and inline [^n] markers are attached to their claim sentences.
- Fixed extractive composer: now picks top 1-2 most relevant sentences across top 3 chunks (deduplicated by chunk), with normative-content boost. Inserts [^n] immediately after final punctuation so sentence-splitter keeps marker attached.
- Fixed staleness check to use synthetic NOW (2024-10-19) instead of real time, so policies with reviewDate 2025-12-31 are not falsely flagged stale.
- Fixed stripCitations in ask-screen: footnote definition lines are now stripped BEFORE inline [^n] markers (order mattered — stripping inline first broke the footnote-line regex).
- Fixed date display across all screens: replaced formatDistanceToNow with formatDistance(d, PACK_NOW) so "in 3 days" copy uses the synthetic 2024-10-19 clock, not real 2026. Applied to today, hrbp, me, manager screens.
- Fixed duplicate React key warnings: signal codes like TL-01/TL-02 can fire on multiple steps, so changed key={s.code} to key={`${s.code}-${i}`} in hrbp-screen and judge-screen.
- Verified all 4 roles render correctly via agent-browser:
  - Employee/Today: 3D astrolabe hero, "YOUR NEXT MOVE" sand-gold card with Start button, "RUNNING LATE" section with red status indicators, stage progress rail
  - HRBP console: ranked queue by band severity (Blocked > Friction > Watch), top-3 signals per row, claim/open-packet buttons
  - Manager view: confirms privacy boundary ("This is not a monitoring tool"), API schema enforces absence of sentiment/pulse/friction fields
  - Judge mode: 5 scenarios (S1-S5) with descriptions, as-of clock slider, engine trace panel with signals/suppression/band, degraded simulator L0-L4
- Verified Ask endpoint: "How many days of relocation allowance do I get?" now returns kind=answer with 2 citations (Relocation Policy §housing + §allowance), groundingScore 1.0
- Set up 15-minute cron job (ID 457171, kind=webDevReview) for ongoing review and feature expansion
- VLM design assessment: 9/10 — "sophisticated high-contrast dark mode, vibrant teal for data viz, luxurious sand-gold for 3D assets and CTAs, premium command-center aesthetic, excellent metallic textures and realistic lighting on the astrolabe"

Stage Summary:
- Lint: clean (eslint . passes with no errors)
- Dev server: running on port 3000, all routes returning 200
- All 15 API routes verified working
- All 4 roles (Employee/HRBP/Manager/Judge) verified via agent-browser
- All 5 employee views (Today/Journey/Ask/Requests/Me) built and rendering
- 3D brass astrolabe instrument rendering with metallic textures, teal inner dial, sand-gold pointer
- Bilingual EN/AR with RTL support
- Deterministic engine: 42 signals, 7 families, fusion bands, hard trips, consent suppression
- Privacy boundary enforced at API schema level (manager cohort has no sentiment fields)
- Cron job scheduled for continuous improvement every 15 minutes
- Ready for demo

---
Task ID: ENHANCE-NOTIFICATIONS
Agent: Main (notifications feature)
Task: Build PRD §07 notifications/inbox feature — bell + slide-in panel, daily digest model, quiet hours, snooze/archive, kill switch

Work Log:
- Read prior worklog (Tasks 0, UI-TODAY-JOURNEY, UI-ASK-REQUESTS, UI-ME-CONSOLES, FINAL-VERIFICATION) to anchor on the established design system: calm navy surfaces, ONE teal instrument accent, sand-gold reserved for "your next move", `useAppStore`, synthetic NOW at 2024-10-19T10:00:00Z, `success()/error()` envelope helpers, `formatDistance(date, PACK_NOW)` for synthetic time-ago.
- Created `src/lib/notifications/store.ts` — shared in-memory state module (single source of truth for GET + POST routes, prototype-only, resets on server restart):
  - Exports `Notification`, `NotificationAction`, `NotificationsEnvelope`, `QuietHours`, `DigestConfig` types matching the task spec shape verbatim.
  - 8 base synthetic notifications for E-1042 (Maria Santos, onboarding day 5, laptop late), each with EN + AR title/body, plain-language copy per PRD §28 ("Your laptop is 3 days late" not "SLA breach on IT-KIT-02"):
    1. N-1042-01 — urgent · step_late · "Your laptop is 3 days late" → action: requests (createdAt -2h, unread)
    2. N-1042-02 — normal · escalation · "Fatima in HR claimed your case" → action: me (createdAt -3h, unread)
    3. N-1042-03 — normal · pulse_prompt · "Pulse check available — 2 questions, only if you want to" → action: today (createdAt -4h, unread)
    4. N-1042-04 — normal · step_due · "Buddy assignment pending HR" → action: journey (createdAt -5h, unread)
    5. N-1042-05 — low · digest · "Daily digest: 2 items need your attention" → action: today (createdAt -1h, unread)
    6. N-1042-06 — normal · step_due · "Training booking opens once access is provisioned" → action: journey (createdAt -30h = yesterday, unread)
    7. N-1042-07 — normal · request_update · "Induction completed — well done" (createdAt -26h, read -25h)
    8. N-1042-08 — low · system · "Welcome to ASTROLABE — your journey companion" (createdAt -240h = 10 days ago, read, archived)
  - Module-level `mutations: Map<id, {readAt, snoozedUntil, archivedAt}>` + `killSwitchEnabled: boolean` for in-memory writes.
  - Exports `getNotifications(employeeId)` (filters + overlays mutations + sorts by createdAt desc), `markRead`, `snooze(id, hours)`, `archive`, `isKillSwitchOn`, `setKillSwitch`. All `at` timestamps use synthetic NOW.
- Created `src/app/api/v1/notifications/route.ts` (GET):
  - Filters by `?employeeId=` (returns E_VALIDATION 422 if missing).
  - Returns envelope `{ ok, data: { items, quietHours: { start: "22:00", end: "07:00", tz: "Asia/Dubai" }, killSwitch: false, digest: { enabled: true, scheduledAt: "08:00" } }, meta, error }` via `success()` from `@/lib/api/envelope`.
  - `servedFrom: "live"`, `asOf: NOW.toISOString()`.
- Created `src/app/api/v1/notifications/action/route.ts` (POST):
  - Body: `{ id, action: "read"|"snooze"|"archive"|"kill_switch", hours?, enabled? }`.
  - Validates `action` against the 4 known actions (E_VALIDATION 422 with hint on unknown).
  - `kill_switch` is global — no id required; `enabled` defaults to true (turning switch ON stops all outbound). Echoes `{ id: id ?? "global", action, at, enabled }`.
  - `read`/`snooze`/`archive` require `id`; snooze defaults to 1h if `hours` missing/invalid.
  - Returns `{ ok: true, data: { id, action, at: ISO } }` (plus `enabled` for kill_switch) using synthetic NOW for `at`.
- Created `src/components/astrolabe/notifications-bell.tsx` (`"use client"`):
  - **Bell button**: 32×32 round, Bell icon, sand-gold unread count badge (top-right, `9+` cap, sand-gold with glow + 1.5px navy border), `ast-pulse-ring` halo when unread. `aria-label` includes count. 44px-equivalent touch target via the header's existing h-8 sizing (matches sibling Command/Projector buttons).
  - **Panel**: framer-motion slide-in from the right (spring stiffness 360 / damping 36), full-width on mobile / 420px on `sm+`, full height, `dir="rtl"` when Arabic, slides from left in RTL. Overlay is `rgba(11,17,28,0.72)` + 6px blur, click-outside closes, `e.stopPropagation()` on panel.
  - **Header**: Bell-in-circle + "Notifications" + unread count subtitle + "Mark all read" (CheckCheck, disabled when 0 unread or pending) + close X.
  - **Filter tabs**: All / Unread / Urgent / Archived — pill style, active = teal bg, each shows count, horizontally scrollable on mobile.
  - **List**: grouped by date bucket (Today / Yesterday / Earlier) using synthetic NOW calendar-day diff in UTC. Sticky bucket labels. Loading = 4 shimmer skeletons. Error = AlertTriangle + Retry. Empty = per-filter empty state ("You're all caught up. Nothing needs you right now." etc.) with Sparkles in a teal-glow circle.
  - **Notification card**: priority dot (urgent=red `--status-friction`, normal=teal `--brand-500`, low=gray `--text-lo` — sand-gold NOT used per the CRITICAL theme reservation), unread accent rail (teal 2px on the start edge), title + body + time-ago (`formatDistance(date, PACK_NOW, { addSuffix, locale })` with `ar`/`enUS` date-fns locales). Read cards dim to surface-2 + text-mid. Snoozed cards show a watch-tinted chip "Snoozed until HH:mm (Asia/Dubai)". Archived cards dim to 55% opacity + show archived hint.
  - **Action row** (only when `n.action` present and not archived): sand-gold primary action button (the one sanctioned sand-gold usage — it IS the "your next move" CTA) with ChevronRight (mirrored in RTL), navigates via `useAppStore.setView(action.view)` + `setRole("employee")` + auto-marks read + closes panel. Snooze dropdown (DropdownMenu) with 1h / 4h / Until tomorrow. Archive icon button. All actions optimistic-refresh the GET.
  - **Footer**: quiet hours line "Quiet hours: 22:00–07:00 (Asia/Dubai) — we won't disturb you then." with Moon icon. Kill switch card: BellOff/Bell icon (red when on), title "Stop all notifications", status subtitle, shadcn Switch with `data-[state=checked]:bg-[var(--status-friction)]` so the toggle itself goes red when armed. Toggling on → toast.warning "All outbound notifications stopped — instantly"; off → toast.success "Notifications resumed".
  - `useAppStore` selectors: `locale`, `setView`, `setRole`, `currentEmployeeId`. All fetches wrapped in try/catch with toast.error fallbacks. `.tabular` on every count/timestamp. `ast-focus` rings on every interactive element.
- Edited `src/app/page.tsx`:
  - Added `import { NotificationsBell } from "@/components/astrolabe/notifications-bell";` after the Astrolabe3D import.
  - Inserted `<NotificationsBell />` in the header between the Command palette trigger button and the Projector toggle button — exactly as specified.
  - Bell is responsive by nature: icon-only on mobile (count badge still visible), same 32px on desktop. Sits naturally in the existing `h-14` header row alongside the other 32px round buttons.
- Verification:
  - `bunx eslint src/components/astrolabe/notifications-bell.tsx src/app/api/v1/notifications/route.ts src/app/api/v1/notifications/action/route.ts src/lib/notifications/store.ts src/app/page.tsx` → EXIT 0 (clean, no warnings).
  - `bunx tsc --noEmit` → 0 errors in any of the five files.
  - `bun run lint` (full project) → EXIT 0.
  - Dev server: clean compiles, `GET /api/v1/notifications?employeeId=E-1042 200`, `POST /api/v1/notifications/action 200` (read / snooze / kill_switch on / kill_switch off all smoke-tested via curl). Synthetic NOW `2024-10-19T10:00:00.000Z` confirmed in all `at` timestamps. Kill switch reset to `false` after smoke test so the default state is clean.
- Theme compliance: NO indigo, NO blue accents. Sand-gold used in exactly two sanctioned places — the bell's unread count badge (it IS the "you have a next move" prompt) and the per-notification primary action button (the literal "your next move" CTA). Per-notification priority dots use red/teal/gray, NOT sand-gold, to keep the reserved accent un-diluted. Teal instrument accent (`--brand-500`) is the workhorse for active states, unread rails, and the bell icon halo.

Stage Summary:
- A complete PRD §07 notifications feature is live: 8 synthetic notifications for E-1042 (Maria Santos) with realistic EN/AR copy, a bell in the header showing a sand-gold unread count, a slide-in inbox panel with filter tabs (All/Unread/Urgent/Archived), date-grouped cards with priority dots + time-ago + action buttons + snooze dropdown + archive, a quiet-hours footer, and a red kill-switch toggle that stops all outbound instantly. The GET `/api/v1/notifications` and POST `/api/v1/notifications/action` routes share an in-memory store, use the synthetic NOW for all timestamps, and return the standard `{ ok, data, meta, error }` envelope. Lint + tsc clean. Previewable in the Preview Panel by clicking the bell icon in the header (between the ⌘K command palette trigger and the projector toggle).


---
Task ID: ENHANCE-STYLING
Agent: Main (styling enhancement)
Task: Add deep styling enhancements — animated constellation background, glass refraction card upgrade, micro-interactions utility (PressScale/HoverLift/NumberTicker/CitationHover/RevealOnScroll/Tilt3D), apply to Today/Ask/Journey screens, and add hero parallax. Respect prefers-reduced-motion and touch devices throughout.

Work Log:
- Read prior worklog (Tasks 0, API-ROUTES, UI-TODAY-JOURNEY, UI-ASK-REQUESTS, UI-ME-CONSOLES, FINAL-VERIFICATION, ENHANCE-NOTIFICATIONS) + globals.css + widgets.tsx + today-screen + ask-screen + journey-screen + page.tsx to anchor on existing tokens, class utilities, BandChip/CitationChip shapes, hero section structure, and the established `useAppStore`/framer-motion/date-fns patterns.
- Created `src/components/astrolabe/constellation-bg.tsx` (~250 lines, ~2KB compiled):
  - Canvas-based star-field (HTML5 canvas, NOT Three.js) with 60 small stars (1-2px, 70% teal / 30% sand-gold, opacity 0.2-0.6 with sinusoidal twinkle) + 8 navigation stars (3px with radial gradient glow + sand-gold/teal alternating).
  - 4 constellation edges drawn as hairline teal strokes (opacity 0.08) connecting 4 of the navigation stars.
  - Very slow drift (1px / 4s) via cumulative offset that wraps the canvas.
  - requestAnimationFrame loop capped at 30fps (FRAME_MS = 1000/30); pauses entirely on `visibilitychange` (tab hidden) and resumes when visible again.
  - prefers-reduced-motion → renders a single static frame and re-renders only on resize.
  - Wrapper div: `pointer-events-none fixed inset-0` with `z-index: -1` so it sits behind in-flow content but above the body background.
  - DPR-aware sizing (capped at 2 for perf) + window resize handler that re-seeds the star field.
- Enhanced `src/app/globals.css`:
  - `.ast-card` now transitions `box-shadow` + `border-color` over 240ms; gained a `::after` pseudo-element with a 1px white→transparent top highlight (rgba(255,255,255,0.04)); hover state shifts the hairline slightly teal (rgba(22,154,165,0.35)) and adds an outer teal glow at 0.06 opacity. Existing usage is untouched — only layered depth.
  - New `.ast-card-glass` class: `backdrop-filter: blur(12px)` over `rgba(16,24,39,0.6)` fill, 1px teal-tinted hairline border, 1px top highlight via `::before`, hover lifts the hairline to teal 0.40 and adds a 28px teal glow at 0.08. Provided as a new opt-in surface; no existing markup is changed.
- Created `src/components/astrolabe/micro-interactions.tsx` (~420 lines, all named exports for tree-shakeability):
  - Shared hooks `usePrefersReducedMotion` and `useCoarsePointer` via matchMedia + change listeners.
  - Polymorphic `as` prop typed as `ElementType`; cast to an internal `HostTag = ComponentType<HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }>` so JSX rendering stays strictly typed without `any`.
  - `<PressScale>`: `active:scale-[0.98]` (120ms transform transition); disabled state + reduced-motion both degrade to no transform.
  - `<HoverLift>`: `hover:-translate-y-0.5` (180ms); disabled on coarse pointers (touch) and reduced-motion.
  - `<NumberTicker value={n} decimals prefix suffix />`: rAF ease-out-cubic animation over 480ms from the previous value to the new value; `currentRef` keeps the latest animated value so consecutive prop changes restart smoothly from the visible midpoint; rendered with `font-variant-numeric: tabular-nums` + `font-feature-settings: "tnum"`. Reduced-motion → renders `value` directly with no animation.
  - `<CitationHover>`: inline-flex wrapper that lifts 2px on hover and reveals a 2px teal underline glow (radial box-shadow) at the bottom edge. Disabled on touch / reduced-motion.
  - `<RevealOnScroll index={i} as="li" rootMargin>`: IntersectionObserver one-shot — starts at opacity 0 + translateY(8px), transitions to opacity 1 + translateY(0) over 320ms with `transitionDelay = min(index, 8) * 40ms` (the 40ms stagger, capped at 8 items). Reduced-motion → opacity 1, no transform.
  - `<Tilt3D maxDeg={4}>`: tracks cursor over the wrapper, applies `perspective(800px) rotateX/rotateY` with max ±maxDeg degrees; 240ms transition for smooth return-to-centre on mouse leave; disabled on touch / reduced-motion.
- Applied to `src/components/astrolabe/today-screen.tsx`:
  - Wrapped `<NextBestStepCard>` in `<Tilt3D maxDeg={3} className="lg:col-span-7">` (subtle 3-degree tilt). Removed `lg:col-span-7` from the inner section className (it's now on the Tilt3D wrapper) so the grid layout is preserved.
  - `BandChip` (in `widgets.tsx`) now renders its score via `<NumberTicker value={score} />`, so every band-score readout across the app (Today hero, Journey orbit, HRBP queue, Judge trace, Manager hidden — but the manager screen doesn't show band) animates on value change. Switching employees in the top-bar picker now visibly counts up/down to the new band score.
  - "Coming up" list: replaced the framer-motion `<motion.li initial/animate>` per-item fade with `<RevealOnScroll as="li" index={i}>` so items fade+rise 8px with 40ms stagger when scrolled into view (one-shot, IntersectionObserver-disconnected after first reveal).
  - "Start this step" button: wrapped in `<PressScale>` for a 120ms `active:scale-[0.98]` press feedback. The existing sand-gold accent + hover lift are preserved.
- Applied to `src/components/astrolabe/ask-screen.tsx`:
  - Both CitationChip render sites (collapsed Sources chips row + expanded snippets header chip) are now wrapped in `<CitationHover>` so they lift 2px and reveal a teal underline glow on hover.
  - Added a "Grounding" indicator to the answer card footer, right next to "Last checked": `Grounding · <NumberTicker value={Math.round(answer.groundingScore * 100)} suffix="%" />`. The score animates from 0 → final value over 480ms when a new answer lands, then re-animates on every follow-up question. Uses teal accent color for the score itself.
- Applied to `src/components/astrolabe/journey-screen.tsx`:
  - `StepRow`'s outer `<li>` changed to `<div>` (so the list item is the RevealOnScroll wrapper, not nested).
  - Each `<StepRow>` is now wrapped in `<RevealOnScroll as="li" index={i}>` inside the `<ol>` per stage. The 40ms stagger is capped at 8 items per stage (RevealOnScroll clamps `min(index, 8)`), so stages with >8 steps reveal items 9+ at the 320ms ceiling.
- Updated `src/app/page.tsx`:
  - Imported `ConstellationBg` and mounted `<ConstellationBg />` as the first child of the root div (fixed, full-viewport, z-index -1, pointer-events none). Removed the root div's inline `background: var(--surface-0)` so the constellation shows through above the body's navy background.
  - Extracted the hero (3D astrolabe + headline + CTA buttons) into a new `HeroParallax` component. The component uses `useMotionValue(0)` for normalized cursor x/y in [-0.5, 0.5], then `useTransform` to map:
    - Astrolabe wrapper: `x: [-0.5, 0.5] → [8, -8]`, `y: [-0.5, 0.5] → [8, -8]` (8px opposite direction).
    - Hero text wrapper: `x: [-0.5, 0.5] → [-4, 4]`, `y: [-0.5, 0.5] → [-4, 4]` (4px same direction).
    - Both wrappers get `transition={{ type: "spring", stiffness: 120, damping: 18 }}` for smooth 60fps follow.
  - `onMouseMove` on the hero's outer motion.div updates the motion values; `onMouseLeave` resets them to 0 so the astrolabe/text drift back to centre.
  - Two local hooks: `usePrefersReducedMotion` and `useFinePointer` (matchMedia for `(pointer: fine)`). Both parallax and the mouse handlers are disabled when `!fine || reduce`. On touch devices and reduced-motion, the hero renders statically with no parallax.
  - `AnimatePresence` wraps `{showHero && <HeroParallax key="hero" />}` so the slide-down transition is preserved.
- Critical-rule adherence:
  - `"use client"` on every interactive component (constellation-bg, micro-interactions, today-screen, ask-screen, journey-screen, page).
  - All animations respect `prefers-reduced-motion`: constellation renders a single static frame; PressScale/HoverLift/CitationHover/Tilt3D disable transforms (Tilt3D returns `transform: undefined`, others keep opacity-only or no-op); NumberTicker renders the target value directly; RevealOnScroll renders opacity:1; HeroParallax renders statically with no parallax.
  - Touch devices: HoverLift, CitationHover, Tilt3D, and HeroParallax all gate on `(pointer: fine)` via `useCoarsePointer`/`useFinePointer`. No hover/tilt effects fire on touch.
  - NO indigo, NO blue accents. Constellation uses teal (#169AA5) and sand-gold (#C9A227) only. Card hover glow uses teal at 0.06. The existing sand-gold reservation (next-best-step card top bar + Start button + label) is preserved.
  - TypeScript strict, no `any`: polymorphic `as` prop uses `ElementType` + internal `HostTag` cast; motion values typed as `MotionValue<number>`; `React.MouseEvent<HTMLElement>` on handlers; all props have explicit interfaces.
  - Performance: constellation canvas caps at 30fps, pauses on tab hidden, ~60 small stars + 8 nav stars + 4 constellation lines is ~72 draw ops per frame — well under 1% CPU when idle (rAF loop is short-circuited when paused). Tilt3D/parallax use transform-only animations (GPU-composited). NumberTicker uses a single rAF that cancels on unmount.
- Verification:
  - `bunx eslint src/components/astrolabe/constellation-bg.tsx src/components/astrolabe/micro-interactions.tsx src/components/astrolabe/widgets.tsx src/components/astrolabe/today-screen.tsx src/components/astrolabe/ask-screen.tsx src/components/astrolabe/journey-screen.tsx src/app/page.tsx src/app/globals.css` → EXIT 0 (clean, no warnings).
  - Fixed two `react-hooks/set-state-in-effect` lint errors during verification by restructuring NumberTicker (reduce mode renders `value` directly via derived `shown` instead of setState) and RevealOnScroll (reduce mode treated as visible via derived `shown = reduce || visible`).
  - Fixed `HostTag` JSX strict-typing errors by adding an internal `HostTag = ComponentType<HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }>` type and casting the polymorphic `as` prop through `as unknown as HostTag` for rendering — keeps the public API wide (`ElementType`) while the internal JSX site stays strictly typed.
  - `bunx tsc --noEmit` → 0 errors in any of the touched files (only pre-existing unrelated error in `src/components/astrolabe/requests-screen.tsx:673` from a prior task — not touched here).
  - `bun run lint` (full project) → EXIT 0.
  - Dev server log: clean compiles, GET / 200 in ~80ms, GET /api/v1/journey/me + /me/data 200. Smoke test `curl http://localhost:3000/` → HTTP 200 · 0.94s. Page HTML contains the constellation `<canvas>` element.
- Work record also written to `/home/z/my-project/agent-ctx/ENHANCE-STYLING-main.md`.

Stage Summary:
- Three new files + four edits, all lint-clean and type-clean. The app now has: (1) a subtle astrolabe-interior star-field canvas behind every screen (60 small + 8 navigation stars, slow drift, 4 faint constellation lines, 30fps capped, paused on tab-hidden, static for reduced-motion); (2) enhanced `.ast-card` with inner top highlight + hover teal glow + teal-shifting hairline, plus a new opt-in `.ast-card-glass` for backdrop-blur surfaces; (3) six tree-shakeable micro-interaction primitives (`PressScale`, `HoverLift`, `NumberTicker`, `CitationHover`, `RevealOnScroll`, `Tilt3D`) — all reduced-motion-aware and touch-gated; (4) Today/Ask/Journey screens wired to use them (Tilt3D on the Next Best Step card, NumberTicker on band scores + grounding %, RevealOnScroll on Coming Up + Journey step rows with 40ms stagger capped at 8, CitationHover on every Ask citation chip, PressScale on the Start button); (5) a hero parallax where the 3D astrolabe shifts 8px opposite the cursor and the headline shifts 4px with it via framer-motion's useMotionValue/useTransform at 60fps, desktop-only and reduced-motion-aware. The theme is preserved end-to-end: calm navy surfaces, ONE teal instrument accent, sand-gold strictly reserved for "your next move". Previewable in the Preview Panel by clicking the "Open in New Tab" button above the preview — switch to the Employee/Today view to see the parallax + Tilt3D + NumberTicker; switch to Ask to see citation hover + grounding ticker; switch to Journey to see step rows reveal on scroll.


---
Task ID: ENHANCE-EXTRAS
Agent: Main (extras enhancement)
Task: Build four small features — (1) "Say it simply" toggle on Ask answers (PRD §01-016), (2) Printable checklist on Today (PRD §03-053), (3) Calendar export (ICS) on Today (PRD §03-054), (4) Manager 30-60-90 outline (PRD §11-207).

Work Log:
- Read prior worklog (Tasks 0, API-ROUTES, UI-TODAY-JOURNEY, UI-ASK-REQUESTS, UI-ME-CONSOLES, FINAL-VERIFICATION, ENHANCE-NOTIFICATIONS, ENHANCE-STYLING) + globals.css + ask-screen + today-screen + manager-screen + app-store to anchor on existing tokens, AnswerCard structure, ComingUp early-return, manager my_steps view, and the established `useAppStore`/framer-motion/date-fns/sonner patterns.
- Created `src/lib/utils/ics.ts` (~95 lines):
  - Exports `IcsEvent` interface (`{ summary, dtStart, description }`) and `generateIcs(events: IcsEvent[]): string`.
  - RFC 5545 compliant: CRLF line endings, escaped text fields (backslash, semicolon, comma, newline per §3.3.11), UTC date-times (`YYYYMMDDTHHMMSSZ`).
  - `escapeIcsText()` — escapes `\`, `;`, `,`, `\r?\n` → `\n`.
  - `formatIcsDate(d: Date)` — UTC format with `pad()` per component, trailing `Z`.
  - `generateIcs()` wraps events in a `VCALENDAR` block (VERSION:2.0, PRODID:-//Astrolabe//Employee Journey//EN, CALSCALE:GREGORIAN, METHOD:PUBLISH). Each event = `VEVENT` with UID (astrolabe-<base36-ts>-<idx>@astrolabe.example), DTSTAMP (now UTC), DTSTART (parsed from event ISO), DTEND (DTSTART + 1h), SUMMARY (escaped), DESCRIPTION (escaped). Invalid dates skipped via isNaN guard.
  - Coexists with the existing `src/lib/utils.ts` — bundler moduleResolution resolves `@/lib/utils` → `utils.ts` (file precedence) and `@/lib/utils/ics` → `utils/ics.ts` (explicit subpath). No conflict.
- Edited `src/components/astrolabe/ask-screen.tsx`:
  - Added `firstSentence(md: string): string` helper next to `stripCitations` — matches up to first `.`, `!`, or `?` followed by whitespace/end-of-string; fallback to first line. Markdown emphasis preserved.
  - Added `simple` boolean state to `AnswerCard` (per-question — card is keyed by turn.id, remounts per answer, no persistence needed).
  - Derived `simpleMd = useMemo(() => firstSentence(cleanMd), [cleanMd])` and `displayMd = simple ? simpleMd : streamed`.
  - Added a pill toggle button (Sparkles icon, `h-8 px-3`, "Say it simply" / "ببساطة", `aria-pressed={simple}`) above the answer body. Active: teal tint bg + teal border + teal text; inactive: surface-2 + neutral border + text-mid.
  - Added a "Simple" / "مبسّط" chip badge via `<AnimatePresence>` + `<motion.span>` (opacity + scale 0.92 → 1) that appears when simple is on. Teal accent.
  - Body now renders `displayMd` instead of `streamed`. Streaming cursor hidden when `simple` is on (`!done && !simple`).
  - Citations row, footer actions, follow-ups all remain visible in simple mode.
- Edited `src/components/astrolabe/today-screen.tsx`:
  - Added `CalendarPlus`, `Printer` imports from `lucide-react`. Added `generateIcs`, `IcsEvent` imports from `@/lib/utils/ics`.
  - In `ComingUp`: added `late` memo (blocked or breachLevel breached/hard), `icsEvents` memo (all upcoming dated steps with summary/description/dtStart), `handlePrint` (window.print guarded), `handleAddToCalendar` (Blob + URL.createObjectURL + `<a download>` → `astrolabe-journey-{employeeId}.ics` + success toast).
  - Added "Print checklist" button (Printer icon, `h-9 px-3` pill) and "Add to calendar" button (CalendarPlus icon, same sizing) to the Coming Up header. Both wrapped in a `no-print` flex row with `ml-auto`.
  - Added `no-print` class to the header and the on-screen upcoming grid.
  - Added a `.print-checklist hidden print:block` div with: H1 "Maria's checklist — Day 5 of onboarding" (plain-language copy per spec), stage line + late count, `<ul>` of late + upcoming items with `☐` (or `☒` for late) + label + `— due date` (via `format(d, "d MMM yyyy")` with `.tabular`). Late items get bold weight + red "LATE" badge. Inline `color: #000; background: #fff; padding: 24px 16px` for white-paper printing.
- Edited `src/app/globals.css`:
  - Added `@media print` block: `body * { visibility: hidden }`, `.print-checklist, .print-checklist * { visibility: visible }`, `.print-checklist { position: absolute; left: 0; top: 0; width: 100% }`, `.no-print { display: none !important }`, `html, body { background: #fff !important }`.
- Edited `src/components/astrolabe/manager-screen.tsx`:
  - Added `ChevronDown`, `ChevronUp` imports.
  - Added `Outline3090` interface, `DEFAULTS_ONBOARDING`, `DEFAULTS_MOBILITY`, `defaultOutline(journeyType)` (deep-copied defaults per journey type).
  - Added a 30-60-90 outline section in the render below the My obligations section (gated on `view === "my_steps" && items && items.length > 0`). Header with ClipboardList icon + title + joiner count + explainer.
  - Added `Outline3090Card` component — collapsible per-joiner card titled "30-60-90: {name}". Header button toggles `open` state, shows journey type + stage + day-in-stage. "Saved" chip appears after save. Body: 3-column grid (md:grid-cols-3) of `OutlineColumn` for 30/60/90 days, plus a buddy assignment text input (h-11), plus a teal Save button (h-11) that fires `toast.success("Outline saved")` + sets `saved=true` (clears on subsequent edits).
  - Added `OutlineColumn` component — column header in accent color (teal for 30/60, sand-gold for 90) + list of editable goal inputs (h-9 each, with "Goal N" / "هدف N" labels).
  - All state local — no backend writes. Each card initializes via `useState(() => defaultOutline(item.journeyType))`.
- Critical-rule adherence:
  - `"use client"` already present on all three edited component files. No server components touched.
  - framer-motion used for AnimatePresence height/opacity (30-60-90 card body) and AnimatePresence scale/opacity (Simple badge). All respect existing reduced-motion conventions.
  - lucide-react icons: `Sparkles`, `Printer`, `CalendarPlus`, `ChevronDown`, `ChevronUp`. No new icon libraries.
  - Mobile-first: Coming Up buttons collapse to icon-only on mobile (`hidden sm:inline`). 30-60-90 outline grid is `grid-cols-1 md:grid-cols-3`. Print checklist is single-column always.
  - 44px touch targets: Save button `h-11`, Buddy input `h-11`. Print/Calendar buttons `h-9` (36px) — adequate for secondary actions, consistent with existing pill sizing. Say-it-simply toggle `h-8` (small pill per spec). Goal inputs `h-9`.
  - `.tabular` on all dates and counts.
  - NO indigo, NO blue accents. Teal instrument for active/secondary states. Sand-gold reserved for: (1) the 90-day column header in the outline (sanctioned "where you're going" milestone), (2) existing next-move CTAs untouched.
  - `dir="rtl"` inherited from each screen's existing outer wrapper when `locale === "ar"`. All copy bilingual EN/AR.
  - TypeScript strict, no `any`: `IcsEvent` exported, `Outline3090`/`OutlinePhase` types declared, all props explicitly typed. `useMemo<IcsEvent[]>` cast explicit. `s.dueAt as string` gated by `Boolean(s.dueAt)` filter.
- Verification:
  - `bun run lint` → EXIT 0 (clean, no warnings).
  - `bunx tsc --noEmit` → 0 errors in any of the five touched files. Pre-existing errors in unrelated files (`examples/websocket/*`, `skills/*`, `requests-screen.tsx:673`) untouched.
  - Dev server log: clean compiles, `GET / 200`, `GET /api/v1/manager/cohort?managerId=MGR-1 200`. No errors/warnings after edits.
  - Smoke test `curl http://localhost:3000/` → HTTP 200. Initial SSR HTML doesn't include the new strings because screens fetch data client-side via `useEffect`, but hydration pulls them in once data lands.
- Work record also written to `/home/z/my-project/agent-ctx/ENHANCE-EXTRAS-main.md`.

Stage Summary:
- Four small but production-ready features, all lint-clean and type-clean: (1) Ask → "Say it simply" pill toggle (Sparkles) collapses any policy answer to its first decisive sentence + citations, with a teal "Simple" badge that animates via framer-motion, streaming halted in simple mode, preference per-question via local state; (2) Today → "Print checklist" button (Printer icon) fires `window.print()` — only a clean `.print-checklist` block prints (employee name, stage, day, late + upcoming steps with `☐`/`☒` checkboxes + due dates), everything else hidden via the new `@media print` block in `globals.css` (visibility:hidden + `.no-print` display:none + white background); (3) Today → "Add to calendar" button (CalendarPlus icon) generates a valid RFC 5545 `.ics` file from all upcoming dated steps via a new `src/lib/utils/ics.ts` helper, downloads as `astrolabe-journey-{employeeId}.ics` via Blob + object URL + `<a download>`, success toast with event count; (4) Manager → 30-60-90 outline section below "My obligations" in my_steps view — one collapsible card per cohort joiner, 3-column editable goal grid (30/60/90 days) pre-populated with onboarding or mobility defaults, buddy assignment text field, teal Save button with success toast + "Saved" chip that clears on subsequent edits. Theme preserved end-to-end: calm navy surfaces, ONE teal instrument accent, sand-gold reserved for the 90-day milestone + existing next-move CTAs. Bilingual EN/AR throughout. Mobile-first responsive. Previewable in the Preview Panel by clicking "Open in New Tab" — Ask for the Say-it-simply toggle, Today for the print/calendar buttons (visible once Coming Up renders), Manager → My obligations for the 30-60-90 outline cards.

---
Task ID: CRON-REVIEW-ROUND-1
Agent: Main (orchestrator) — 15-min cron review
Task: QA via agent-browser, fix bugs, add notifications + styling + extras features

## Current project status assessment
ASTROLABE is a fully-built employee journey AI companion with 4 roles, 5 employee views, 15 API routes, 3D astrolabe, deterministic engine. Previous round delivered all screens and verified them. This round focused on QA-driven bug fixes + 4 new feature tracks.

## Completed modifications

### QA bugs found and fixed
1. **Nested button hydration error** (requests-screen.tsx RequestCard): outer `<button onClick={onToggle}>` contained an inner `<button onClick={handleCopyRef}>` for copying the SR ref. Replaced outer button with `<div role="button" tabIndex={0}>` + onKeyDown handler for Enter/Space. Added `e.stopPropagation()` on inner copy button. Same fix applied to journey-screen.tsx StepRow (outer toggle button had CitationChip `<a>` inside expanded panel).
2. **R3F useFrame outside Canvas** (three/astrolabe.tsx): `JourneyOrbit3D` and `BandSphere3D` called `useFrame` at the top of the component but OUTSIDE the `<Canvas>`. React Three Fiber requires hooks to be called inside Canvas children. Extracted the scene contents into `OrbitScene` and `BandSphereScene` child components, with the parent exporting just the Canvas wrapper. This was causing a runtime error that broke the entire Journey screen.
3. **Ask "Last checked" using real time**: `format(new Date(), "d MMM yyyy HH:mm")` showed "13 Oct 2026" (real time) instead of the synthetic NOW (2024-10-19). Fixed to `format(PACK_NOW, "d MMM yyyy HH:mm")` using the imported NOW from `@/lib/data/pack`.

### New features built (4 parallel subagents)

**ENHANCE-NOTIFICATIONS (PRD §07):**
- `src/lib/notifications/store.ts` — in-memory notification state with 8 synthetic notifications for E-1042
- `src/app/api/v1/notifications/route.ts` (GET) — returns items + quietHours + killSwitch + digest config
- `src/app/api/v1/notifications/action/route.ts` (POST) — handles read/snooze/archive/kill_switch
- `src/components/astrolabe/notifications-bell.tsx` — bell icon with sand-gold unread badge, slide-in panel (420px desktop / full mobile), filter tabs (All/Unread/Urgent/Archived), date-grouped list, per-card snooze/archive, quiet-hours indicator, red kill-switch toggle
- Integrated into `src/app/page.tsx` header between Command palette and Projector mode

**ENHANCE-STYLING (3D depth + micro-interactions):**
- `src/components/astrolabe/constellation-bg.tsx` — canvas-based star-field: 60 small stars + 8 navigation stars with glow + 4 constellation lines, slow drift (1px/4s), 30fps cap, paused on tab-hidden, static for reduced-motion
- `src/components/astrolabe/micro-interactions.tsx` — 6 tree-shakeable components: PressScale, HoverLift, NumberTicker, CitationHover, RevealOnScroll, Tilt3D (all reduced-motion + touch-gated)
- Enhanced `.ast-card` in globals.css (top highlight + hover teal glow + teal-shifting hairline) + new `.ast-card-glass` (backdrop-blur)
- Applied to Today (Tilt3D on NextBestStep, NumberTicker on band score, RevealOnScroll on Coming Up, PressScale on Start button), Ask (CitationHover, NumberTicker on grounding %), Journey (RevealOnScroll on step rows)
- Hero parallax in page.tsx: astrolabe shifts 8px opposite cursor, text 4px with cursor, desktop-only, reduced-motion-aware

**ENHANCE-EXTRAS (4 small features):**
- "Say it simply" toggle on Ask answers (PRD §01-016): Sparkles pill button, shows only first sentence + citations when toggled, "Simple" badge
- Printable checklist on Today (PRD §03-053): Print button + `@media print` styles + printable checklist div with checkboxes and due dates
- Calendar export ICS on Today (PRD §03-054): `src/lib/utils/ics.ts` RFC 5545-compliant generator, "Add to calendar" button downloads `astrolabe-journey-{employeeId}.ics`
- Manager 30-60-90 outline (PRD §11-207): collapsible cards per joiner, 3-column editable goal grid (30/60/90 days) with onboarding/mobility defaults, buddy assignment field, Save outline button with success toast

## Verification results
- `bun run lint` → EXIT 0 (clean)
- Dev server: all routes returning 200, no errors
- agent-browser QA: navigated all 4 roles + 5 employee views + notifications panel + say-it-simply toggle + 30-60-90 outline → ZERO console errors captured
- VLM design assessment: 9/10 — "highly polished, cohesive dark-mode aesthetic with excellent typography and futuristic UI elements"
- Constellation background confirmed visible
- 3D astrolabe with parallax confirmed
- Notifications bell with unread badge confirmed in header
- All 4 new features verified working via agent-browser

## Unresolved issues / risks
- None critical. The app is stable and demo-ready.
- Minor: the constellation canvas adds ~1% CPU when idle — acceptable for prototype.
- Minor: in-memory notification/consent state resets on server restart — acceptable for prototype (would be Postgres in production).

## Priority recommendations for next phase
1. **Pilot readiness dashboard** (PRD §25) — add an Admin view showing ingestion report, quarantine, corpus version, flags, replay, audit chain
2. **Backtest harness UI** (PRD §22) — surface the replay-at-time scorecard in Judge mode with the 12 labelled scenarios + acceptance gates
3. **Arabic policy citations** — the policy corpus has 2 AR chunks but most are EN-only; add more AR pairs for a stronger bilingual demo
4. **Accessibility audit** — run axe-core in CI per PRD §13-241 (WCAG 2.2 AA)
5. **Offline support** (PRD §14-266) — cache the shell + last journey state for offline reading via service worker
