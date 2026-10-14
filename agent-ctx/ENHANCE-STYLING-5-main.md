# ENHANCE-STYLING-5 — Me screen: 3D consent cards + animated privacy meter + audit timeline

**Task ID:** ENHANCE-STYLING-5
**Agent:** Main (styling enhancement)
**Date:** 2026-10-13
**Status:** ✅ Complete

## Scope
Three styling enhancement tracks for the Me screen (`src/components/astrolabe/me-screen.tsx`):

1. **Track 1** — 6 consent toggles become premium 3D cards: Tilt3D wrapper (maxDeg=2), spring drop-in (stiffness 220, damping 26, 40ms stagger capped at 6), status-based left accent bar (teal/sand-gold/gray), recessed opacity-70 for OFF, granted teal inset glow, hover lift 2px, ripple on toggle (teal for grant / muted gray for revoke, 400ms scale 0→4), receipt chip below the toggle (fades in 320ms when latest consent record changes; mono + tabular; copy-to-clipboard).

2. **Track 2** — New `<PrivacyScoreCard>` above the consent toggles: SVG semicircle gauge (220×124, no third-party lib, hand-built `describeArc`), 0-100 score, color bands (teal ≥80 / amber 50-79 / red <50), 640ms ease-out pathLength animation, tick marks at 0/25/50/75/100, drop-shadow glow, big `<NumberTicker>` count-up + "/100", plain-language subtext, status legend (journey_assistance always on + data-export viewed indicator), "Improve my privacy" button (scrolls to consent section + flashes first OFF-able currently-ON toggle with a 1.5s sand-gold ring). Live: score recomputes via `useMemo([data, overrides, hasExportedData])` — toggling any consent updates the score live.

3. **Track 3** — Audit timeline replaces the flat View log: vertical timeline (RTL-aware spine via `insetInlineStart`), 12px colored event nodes per action type (`read_record` teal, `consent_change` sand-gold, `export` purple #8B5CF6, `escalation` red, `ingestion` gray), event cards with actor + role + plain-language verb + purpose + time-ago chip (formatDistance to PACK_NOW) + lawful basis chip, spring reveal (40ms stagger via `<RevealOnScroll>`), filter chips (All/Reads/Consents/Exports/Escalations), "Who has seen my data?" summary bar, empty state, and 5 synthetic entries covering every action type.

## Files edited
- `src/components/astrolabe/me-screen.tsx` — rewritten end-to-end (~1740 lines).

## Key implementation details

- `ACTION_META` (typed `Record<AuditAction, ActionMeta>`) centralizes action color, background, border, Lucide icon, EN/AR verb, filter label. The same meta drives node color, event-card border color, lawful-basis chip color, and the actor icon background — so every action type reads consistently across the timeline.
- `buildAuditTimeline(viewLog)` combines the 1 server entry with 5 synthetic events (anchored to PACK_NOW timestamps for realistic `formatDistance` output) and sorts descending by `at`.
- `computePrivacyScore` reads the live consent state via the existing `purposeGranted(records, overrides, meta)` helper — so optimistic store updates propagate to the score immediately, and the post-fetch snapshot from `/api/v1/me/data` recomputes with the latest server state.
- The "Improve my privacy" flash is a `<motion.span>` overlay with `pointer-events-none` that animates `boxShadow` through keyframes (`0 0 0 0 → 0 0 0 6px rgba(201,162,39,0.50) → 0 0 0 0`) over 1.5s ease-out. State is set in the click handler (no effect) and cleared via `window.setTimeout(1500)` — no `react-hooks/set-state-in-effect` violation.
- The ripple state is a `Record<Purpose, RippleState | null>` keyed by `ts`. `triggerRipple()` sets the entry and schedules a 500ms self-cleanup that checks the timestamp before clearing (so a re-trigger during cleanup doesn't wipe a newer ripple).
- Receipt chip uses `<AnimatePresence mode="wait">` with `key={latest.id}` so a receipt change re-runs the 320ms fade-in. `handleCopyReceipt` uses `navigator.clipboard.writeText` with a Sonner toast.
- The `<PrivacyMeter>` SVG is a `<motion.path>` with `pathLength` animated from 0 to `score/100` over 640ms ease-out-cubic. Background track is a static `<path>` in `var(--surface-3)`. Tick marks (0/25/50/75/100) use 1px lines + tabular `<text>` labels positioned via trigonometry (`angle = π - pct/100 · π`, points at `cx ± r·cos(angle)`, y inverted for SVG y-down).
- The timeline spine uses a vertical CSS gradient (teal 0% → border 30% → border 70% → sand-gold 100%) so the line itself reads as "instrument". Position is `insetInlineStart: 0.625rem` so RTL mirrors correctly.
- Reduced-motion: every motion primitive (`Tilt3D`, `NumberTicker`, `RevealOnScroll` from `@/components/astrolabe/micro-interactions`) already handles `prefers-reduced-motion`. New motion in this file uses `initial={reducedMotion ? false : ...}` patterns; spring drop-ins degrade to `{ duration: 0 }`; the SVG arc uses `initial={reducedMotion ? false : { pathLength: 0 }}`; ripple + highlight still run (framer-motion honors the global `prefers-reduced-motion` CSS overrides in globals.css that limit transition-duration to 120ms).

## Theme adherence

- Calm navy surfaces throughout; ONE teal instrument accent (privacy meter ≥80, granted consent accent, granted inset glow, read_record node + chip, active consent chip, audit timeline spine top, selected filter chip).
- Sand-gold RESERVED for "your next move" only: journey_assistance required accent + Required chip + Lock icon, "Improve my privacy" button + flash ring, consent_change node + chip + accent, audit timeline spine bottom.
- Purple `#8B5CF6` used only for the `export` action node + chip (per spec).
- NO indigo, NO blue.

## Verification

- `bunx eslint src/components/astrolabe/me-screen.tsx` → EXIT 0 (no warnings)
- `bunx tsc --noEmit` → 0 errors in me-screen.tsx (only pre-existing unrelated errors in `examples/websocket/`, `skills/image-edit/`, `skills/stock-analysis-skill/`)
- `bun run lint` (full project) → EXIT 0
- Dev server: clean compiles after the write ("✓ Compiled in 291ms", "✓ Compiled in 224ms"); no errors in dev.log

## Preview

Open the Preview Panel → "Open in New Tab" → Employee → Me:

1. Privacy score card drops in. SVG arc fills from 0 → ~55 (default state: pulse/share/comment-retention OFF, manager_visibility+aggregate_analytics ON, no export yet = 40 + 15×3 = 85 → actually 85, in teal band). Big number ticks up via NumberTicker. Click "Improve my privacy" → smooth-scroll to consent toggles + the first ON non-required toggle (manager_visibility or aggregate_analytics) flashes a 1.5s sand-gold ring.

2. Each consent card: tilt on mouse move (2deg), spring drop-in (40ms stagger), accent bar by status, ripple on toggle (teal grant / gray revoke), receipt chip fade-in below the toggle (320ms). Toggle pulse_capture on → privacy score drops to 70 (amber band), arc retweens pathLength. Toggle manager_visibility off → score climbs to 85 (teal band).

3. Audit timeline at the bottom: vertical spine with 6 colored nodes. Top summary "3 people have accessed your record: Fatima Al-Mansouri (HRBP, 2), You (Employee, 2), System (Automated engine, 2)". Filter by Consents → only the consent_change event remains. Each event card reveals with 40ms stagger as you scroll. Time-ago labels are anchored to PACK_NOW (2024-10-19T10:00Z).
