# UI-ME-CONSOLES — Agent work record

**Task ID:** UI-ME-CONSOLES
**Agent:** Main (UI builder)
**Date:** 2026-10-13

## Scope
Build the four remaining console screens for ASTROLABE — Me (consent + data), HRBP (queue + escalation packet + stalls heatmap), Manager (aggregate-only cohort, strict privacy boundary), Judge (scenarios + engine trace + degraded simulator).

## Files written
1. `src/components/astrolabe/me-screen.tsx` (~640 lines)
2. `src/components/astrolabe/hrbp-screen.tsx` (~840 lines)
3. `src/components/astrolabe/manager-screen.tsx` (~530 lines)
4. `src/components/astrolabe/judge-screen.tsx` (~780 lines)
5. `src/app/page.tsx` (updated — role switcher + Me tab + role-routed screens)

## Key decisions
- All four screens consume the existing REST envelope via fetch with try/catch + skeleton + error-banner-with-retry fallbacks.
- Zustand store drives sub-view routing (hrbpView, managerView, judgeView) and cross-cutting state (consentOverrides, degradedLevel, asOfOffsetHours, currentEmployeeId, locale).
- Sand-gold strictly reserved for "your next move" surfaces: Manager Waiting-on-you hero number, HRBP Send-packet button, Judge Next-best-step card + read-only Today "Your next move" card.
- Manager screen never imports any sentiment/pulse/score/comments type — schema boundary enforced at the type level.
- HRBP queue renders only {code, weight, description} from topSignals — never free-text comments.
- Judge as-of clock uses PACK_NOW (2024-10-19T10:00:00Z) + offsetHours so the engine sees seed-time events correctly (otherwise everything renders as 2-year-overdue blocked).
- Pulse-suppression disclosure rendered on both Me and HRBP employee views when PS family is suppressed.

## Verification
- `bunx eslint` on all 5 files → EXIT 0 (no warnings).
- `bunx tsc --noEmit` → 0 errors in any of the 5 files (only pre-existing errors in examples/skills/).
- `bun run lint` (full project) → EXIT 0.
- Dev server log: clean compiles, GET / 200, all 6 smoke-tested endpoints return 200.
- Endpoints smoke-tested: /me/data, /consent (POST), /hrbp/queue, /escalations (POST), /manager/cohort, /insights/stalls, /scenarios, /journey/E-1042/assessment.

## Known limitations
- Manager "Complete" button is a 380ms simulated completion (no related request ref is returned by the cohort API per the privacy boundary — no transition can be called).
- HRBP "Claim" button writes a fake audit event (no admin audit endpoint exists in the API yet).
- Stalls heatmap will show all cells as suppressed (n<5) because the prototype pack has only 5 employees — this is the expected k≥5 behavior.
- As-of slider step is 6 hours (not 1 hour) to keep the trace recomputation cheap.
