# Task UI-TODAY-JOURNEY — Agent: Main (UI builder)

## Scope
Build the two primary ASTROLABE employee screens:
1. `src/components/astrolabe/today-screen.tsx` — "What now?" surface (Hero, Next Best Step, Late items, Stage Rail, Coming up, consent-gated Pulse).
2. `src/components/astrolabe/journey-screen.tsx` — full map + history (JourneyOrbit3D, sticky collapsing Stage Rail, grouped expandable Step list with blocked-by chain in words + mini-graph, virtualised Timeline with sticky week headers + 40ms stagger reveal).

Also wired both screens into `src/app/page.tsx` with a slim preview-only top bar (Today/Journey tab switch, employee picker, EN/AR locale toggle) so the result is visible in the Preview Panel.

## What I read first (grounding)
- `worklog.md` (prior API-ROUTES task — confirmed `/api/v1/journey/me` and `/api/v1/me/data` envelopes).
- `src/components/astrolabe/widgets.tsx` — `BandChip`, `BandDot`, `StatusChip`, `SlaChip`, `CitationChip`, `SignalBadge`, `Band` exports and their prop shapes.
- `src/components/three/astrolabe.tsx` — `Astrolabe3D({size, spin, interactive})`, `JourneyOrbit3D({steps: {label,status}[]})` with status union `done|active|blocked|waiting|todo`, `BandSphere3D({band})`.
- `src/lib/store/app-store.ts` — `useAppStore` with `currentEmployeeId`, `locale`, `view`, etc.
- `src/app/globals.css` — confirmed token names (`--surface-0/1/2/3`, `--brand-500`, `--accent-500`, `--status-*`, `--g-horizon`, `--g-veil`, `--g-glass`, `--g-brass`) and utility classes (`.ast-card`, `.ast-card-2`, `.ast-glow`, `.ast-brass`, `.ast-horizon-text`, `.ast-ring`, `.ast-chip`, `.ast-dot-steady/-watch/-friction/-blocked`, `.ast-focus`, `.ast-rail-seg[data-state]`, `.ast-verdict`, `.ast-fade-rise`, `.ast-spin-slow`, `.ast-pulse-ring`, `.ast-shimmer`, `.tabular`).
- `src/app/api/v1/journey/me/route.ts` — confirmed envelope `{ ok, data: { employee, stage, dayInStage, band, score, signals, suppressedFamilies, nextBestStep, steps[], engineVersion, mapVersion, corpusVersion }, meta, error }` and step shape.
- `src/app/api/v1/me/data/route.ts` — confirmed `pulseConsentGranted` boolean and `journeyEvents[]` (id, stepKey, type, occurredAt, recordedAt, source) are surfaced.
- `src/app/api/v1/{requests,consent,pulse}/route.ts` — confirmed POST shapes for `Start this step` (creates a service request when `nextBestStep.requestType` is set), consent grant (`purpose:"pulse_capture", granted:true, version:"v1"`), and pulse submission (`employeeId, stage, score 1-5, consentId`).
- `src/lib/data/pack.ts` — confirmed `stages[]`, `owners[]`, `steps[]`, `getConsent`, `NOW = 2024-10-19T10:00:00Z`, owner group enum, employee seeds (E-1042 Maria blocked/onboarding, E-1044 Aisha blocked/mobility, etc.).

## Today screen — design decisions
- **Hero strip** — full-width `ast-card` with a 6px right-edge brass-band gradient (`var(--g-horizon)`) on `sm+` and a 3px top strip on mobile. Sticky stage chip on the left: `Day {n} of {stageLabel}` using `Calendar` icon + `tabular` numerals. `BandChip` for band + journey-type chip with `Compass` icon. Employee name (24-28px), role · team · location truncates on small screens. 200×200 `Astrolabe3D` (size=0.7) floating top-right on `lg+` only (`hidden lg:block`).
- **Next Best Step card** (col-span-7 desktop) — sand-gold "your next move" with `ast-glow` ring + a 3px sand-gold accent bar at the top. Framer-motion `motion.section` with 320ms spring drop on mount (stiffness 220, damping 26). Shows: step label (20-22px), named owner ("with Fatima Al-Mansouri" via `owners[]` lookup), due date (`format(d, "EEEE d MMM") + " · " + formatDistanceToNow(d)`), reason text from `nextBestStep.reason`. Primary button "Start this step" with sand-gold background + 4px upward hover lift. If `nextBestStep.policyRefs[0]` exists, render `CitationChip` (parsed from `docSlug#section`).
- **Late items panel** (col-span-5) — title `Running late` with `Ban` icon and a count badge. Filters steps where `status==="blocked" || breachLevel==="breached" || breachLevel==="hard"`. Each row: step label, `SlaChip`, named owner, plain late copy (`"3 days late"` / `"3 days late — hard breach"` / `"Held up — waiting on another step"`). Empty state: `CheckCircle2` glyph + `Nothing is late. Next: {nbsLabel} by {EEEE d MMM}.`
- **Stage Rail** — `ol` with `grid-template-columns: repeat(N, minmax(0,1fr))` so segments flex evenly. Each `.ast-rail-seg` gets `data-state` of `done|active|blocked` (or no attribute + `--surface-3` background when pending). Active stage label is sand-gold; done is teal; blocked is dark red; pending is text-lo. Shows `Day {n}` under the active segment.
- **Coming up** — next 3 not-started, non-blocked steps with no remaining dependencies. Each as a numbered card with stage label, step label, owner named, and `"about N days from start"` plain copy computed from `step.targetHours`.
- **Pulse card (consent-gated)** — calls `/api/v1/me/data` to read `pulseConsentGranted`. When false: shows a `Lock` icon + plain-language consent copy ("Sharing how you feel is opt-in. You can revoke consent any time, and it's never shared without your say-so.") + `Enable pulse capture` button that POSTs to `/api/v1/consent`. When true: shows the 1-5 score selector (5 buttons, active = teal background, scale-105 on hover/active) + `Send` button (sand-gold) that POSTs to `/api/v1/pulse` with `stage` from data. Receipt id is toasted on success. Handles `E_CONSENT_REQUIRED` (412) by flipping the consent gate back to the prompt.
- **Plain-language copy** — used the kit ("3 days late — hard breach", "with {named owner}", "about N days from start", "Held up — waiting on another step"). No "SLA breach on step IT-KIT-02" anywhere.
- **Tabular numerals** — `.tabular` on all timers, day counts, SLA chips, score buttons, version strings.

## Journey screen — design decisions
- **Top: JourneyOrbit3D** — 280px mobile / 380px desktop. Maps each step to `{ label, status }` where status is derived: `done|skipped → done`, `blocked → blocked`, `waiting_employee|waiting_owner → waiting`, `in_progress → active`, else `todo`. Wrapped in `ast-card` with a `var(--g-veil)` overlay behind the canvas. `BandChip` is anchored bottom-right.
- **Sticky collapsing Stage Rail** — `position: sticky; top: 0; z-30`. Uses framer-motion `useScroll().scrollY` → `useTransform([0,120] → [64,48])` → `useSpring(stiffness 220, damping 28)`. Subscribes via `motionValue.on("change")` to update a local `h` state (avoids setState-in-effect lint). Renders `ChevronRight` separators between stage labels; active = sand-gold, done = teal, blocked = dark red, pending = text-lo.
- **Step list grouped by stage** — sticky stage headers at `top: 64px` (under the rail). Each header shows stage label, `done/total` count, and a `Current` chip when it's the active stage. Within each stage, an `ol` of `StepRow`s.
- **StepRow** — 56px min-height touch target. Left: band-shape icon (steady ○ `Circle`, watch ◔ `CircleDot`, friction ◆ `Diamond`, blocked ■ `Square`) + step label + tiny mono `stepKey`. Middle (desktop only): named owner, `SlaChip` (only if started & not done), due date (`EEEE d MMM`), and a `blocks N` pill (`ListTree` icon, status-watch color) when `downstreamAtRisk > 0`. Right: `StatusChip` + rotating `ChevronDown`. Mobile gets a compact meta line below the row.
- **Expandable panel** — `AnimatePresence` with 220ms height+opacity tween. Shows three blocks: (a) "Why this is held up" — plain-words blocked-by chain + `BlockedByGraph` flexbox mini-graph with `ArrowRight` separators (red `Ban` nodes ending in a sand-gold `Hourglass` node for the current step), (b) "Events for this step" — filtered timeline of journey events for this step, (c) `CitationChip` for `policyRefs[0]`.
- **Blocked-by chain in words** — `blockedByChainWords()` walks `step.blockedBy[0]` recursively via `ALL_STEPS`, building phrases like `"{firstDep} waits on {secondDep}, which waits on {thirdDep}"` or `"{firstDep} needs to finish first"` for a single dep.
- **Auto-expand** — the first blocked or hard-breached step is expanded by default until the user makes an explicit choice (tracked via `userOverride: string | null | undefined` state — `undefined` means "no user override yet", avoiding setState-in-effect). This pattern was required to pass `react-hooks/set-state-in-effect` lint.
- **Timeline** — groups events by ISO week (week starts Monday), newest first, slices to 50 per week for prototype. Each week has a sticky header (`position: sticky; top: 0` inside the scroll container). Each event row: mono timestamp (7rem fixed width for alignment), step label (truncated, max 40%), event-type pill, source label. Stagger reveal via `ast-fade-rise` animation with `animation-delay: calc(var(--i) * 40ms)` and a global index counter.
- **Empty state** — `Compass` glyph in a `var(--g-veil)` circle, "Your journey hasn't started in the system yet", pre-boarding checklist (3 numbered items: sign offer, upload passport scan, confirm relocation allowance), named HR contact card (uses `employee.hrbp` from the API), and a `Check again` retry button.
- **Error state** — `ErrorBanner` with `AlertTriangle` glyph, the error message, the request-id (`meta.requestId`) in mono, and a `Retry` button that re-runs `load()`.

## Cross-screen implementation rules honored
- `"use client"` at the top of both files.
- `framer-motion` imported as `import { motion, AnimatePresence } from "framer-motion"` (plus `useScroll, useSpring, useTransform` in journey-screen for the collapsing rail).
- `lucide-react` icons at `w-4 h-4` / `w-5 h-5` with `strokeWidth={1.75}` throughout.
- Mobile-first responsive with `sm:`, `md:`, `lg:` breakpoints.
- All interactive elements (buttons, step rows, score buttons) are at least 44px / 56px touch targets with visible `ast-focus` focus rings.
- `.tabular` on every timer, count, score, version string.
- Fetches wrapped in try/catch — `Promise.all([journey, me])` with per-call best-effort fallback for the consent fetch (consent failure doesn't block the screen).
- `date-fns` `format(date, "EEEE d MMM")` for "Thursday 16 Oct" and `formatDistanceToNow` for "in 3 days" / "3 days ago".
- NO indigo, NO blue accents. Only `--status-info` would have been used for info chips (none were needed). The teal `--brand-*` is the only instrument accent and `--accent-500` (sand-gold) is reserved strictly for "your next move" surfaces (Next Best Step card top bar + button + label, current-stage label on rails, active node in BlockedByGraph, current-stage chip on step list).
- Arabic: when `locale === "ar"`, `dir="rtl"` is set on the root wrapper of each screen; Arabic labels (`displayNameAr`, `roleAr`, `labelAr`, `reasonAr`, `labelAr` from stages/owners) are used throughout. RTL font cascade is handled in `globals.css` already.
- TypeScript strict, no `any`. All API shapes mirrored as local interfaces (avoided importing `ApiEnvelope` from server module to keep client bundle clean).

## Deterministic asOf
Both screens pass `asOf = PACK_NOW.toISOString()` (2024-10-19T10:00:00Z) to `/api/v1/journey/me` instead of `new Date()`. Without this, the elapsed-hour readouts would be 2 years (the seed events are from 2024-10) and every employee would render as "blocked". With the pack's NOW, E-1042 Maria reads as "Day 4 of first_day · blocked · laptop 72h late vs 24h target" which matches the PRD's intended demo state.

## Wiring into /
`src/app/page.tsx` rewritten to render a slim preview-only top bar (sticky, blur backdrop, ASTROLABE wordmark in `.ast-brass` gradient text) with:
- Today/Journey tab pill switcher.
- Employee picker (`<select>`) for E-1042 / E-1043 / E-1044 / E-1045 / E-1046 (writes to `useAppStore.setEmployee`).
- EN/AR locale toggle (writes to `useAppStore.setLocale`).

Both screens read `currentEmployeeId` and `locale` from the store, so switching employee or locale re-fetches and re-renders automatically.

## Verification
- `bunx eslint src/components/astrolabe/today-screen.tsx src/components/astrolabe/journey-screen.tsx src/app/page.tsx` → EXIT 0 (clean).
- `bunx tsc --noEmit` → no errors in `src/components/astrolabe/**` or `src/app/page.tsx` (only pre-existing unrelated errors in `examples/` and `skills/`).
- `bun run lint` → EXIT 0.
- Dev server log shows successful compile + `GET / 200` + `GET /api/v1/journey/me?employeeId=E-1042&asOf=2024-10-19T10:00:00.000Z 200` + `GET /api/v1/me/data?employeeId=E-1042 200`.
- Smoke-tested the API: E-1042 returns `stage: "first_day"`, `dayInStage: 4`, `band: "blocked"`, `score: 25` with TL-01/TL-02 signals firing on `ob_kit_issued` (72h elapsed vs 24h target — 3 days late, matches the "Your laptop is 3 days later than it should be" copy kit).

## Files written
- `src/components/astrolabe/today-screen.tsx` (~960 lines)
- `src/components/astrolabe/journey-screen.tsx` (~1100 lines)
- `src/app/page.tsx` (rewritten to host both screens for preview)
