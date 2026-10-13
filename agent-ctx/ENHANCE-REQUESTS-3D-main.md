# ENHANCE-REQUESTS-3D — Work Record

**Agent**: main (sub-agent for Requests screen 3D enhancement)
**Task ID**: ENHANCE-REQUESTS-3D
**Date**: 2024-10-13

## Task scope
Enhance the ASTROLABE Requests screen (`src/components/astrolabe/requests-screen.tsx`) with three tracks:
1. **3D request cards** — Tilt3D(2°) wrap, status-based depth layering (5 tiers), spring drop-in (k=200, c=24, 40ms stagger cap 8), hover lift (2px / 180ms / e2→e3 shadow), 3D medallion type icon (radial gradient + inner highlight ring + drop shadow)
2. **Animated SLA countdown ring** — new reusable `SlaRing` component (40×40 SVG, 4-color breach mapping, 480ms strokeDasharray draw-in, hard-breach pulse, tooltip). Replaces `SlaChip` in RequestCard main row (SlaChip definition preserved in widgets.tsx).
3. **Enhanced wizard step indicator** — 3-dot horizontal indicator with connecting line, labels (Choose type / Fill details / Preview & submit), spring-animated transitions.

## Files touched
1. **CREATED** `src/components/astrolabe/sla-ring.tsx` — 179 lines, exports `SlaRing` + `BreachLevel` type
2. **EDITED** `src/components/astrolabe/requests-screen.tsx` — 2149 → 2426 lines (+277 net)

No other files modified. `widgets.tsx` untouched (SlaChip definition preserved per spec).

## Key implementation decisions

### Architecture: 3-layer nesting to avoid transform conflicts
The Tilt3D applies `transform: perspective(800px) rotateX(...) rotateY(...)` to its Tag. To add hover lift (`translateY(-2px)`) without clobbering the tilt transform, the structure is:

```
motion.li  (entrance/exit spring)
  └ div    (hover lift: translateY -2px, transition 180ms transform)
    └ Tilt3D as="div"   (3D tilt: perspective + rotateX/Y, transition 240ms transform)
      └ div.ast-card.overflow-hidden   (visual: boxShadow + borderLeft + opacity)
        └ ReturnQuestionBanner + clickable area + AnimatePresence
```

The `ast-card` CSS class provides `transition: box-shadow var(--dur-md) ...` — by placing ast-card on a CHILD of Tilt3D (not on Tilt3D's Tag itself), the box-shadow transition stays intact and isn't overridden by Tilt3D's inline `transition: transform 240ms`. So when `hovered` toggles and `boxShadow` inline value changes from `var(--e1)/var(--e2)+glow` to `var(--e3)+glow`, it animates smoothly via CSS.

### SLA ring geometry
- `circumference = 2πr` where `r = (size - strokeWidth - 2*padding) / 2`
- `strokeDasharray = circumference` (single dash = full circle)
- `strokeDashoffset` animates from `circumference` (no fill) → `circumference * (1 - ratio)` (filled to ratio)
- Ring cap is 100% visually (full circle at 100%), but center text shows actual % (can exceed 100% for breached/hard)

### Step indicator layout
- `grid grid-cols-3` so dots sit at 1/6, 1/2, 5/6 of total width
- Connecting line is absolutely positioned `left: 16.66%` to `right: 16.66%` (center-of-col-1 to center-of-col-3)
- Filled line animates `width: 0% → progress × 66.66%` (where progress = step/2 → 0/0.5/1.0)
- Labels align by text-align per column (left/center/right) so they visually align with their dots

## Reduced-motion handling
A local `usePrefersReducedMotion()` hook (mirrors the pattern in `micro-interactions.tsx` and `instrument-dial.tsx`). When reduced:
- RequestCard entrance → `{ duration: 0.12 }` opacity-only tween (skips y-translate)
- Hover lift → `"none"` transition (no transform animation)
- SlaRing → `initial={false}` (no mount animation), `transition: { duration: 0 }`, pulse ring suppressed
- StepIndicator → all spring transitions become `{ duration: 0 }`, pulse ring suppressed

## Verification
- `bun run lint` → **EXIT 0** (clean, no warnings)
- `curl http://localhost:3000/` → **200** in 507ms (compile 41ms, render 466ms)
- `curl http://localhost://3000/api/v1/requests?employeeId=E-1042` → **200**, returns one `in_progress` request (triggers e2 + teal glow depth tier)
- Dev log: most recent compile `✓ Compiled in 1807ms` with no errors

## Color palette adherence (NO indigo, NO blue)
Only the existing ASTROLABE palette:
- Surfaces: navy `var(--surface-0..3)` (#0B111C / #101827 / #16202F / #1C2839)
- Brand: teal `var(--brand-500)` (#169AA5)
- Accent: sand-gold `var(--accent-500)` (#C9A227) — reserved for "your next move"
- Status: steady (#0E9F6E green), watch (#D97706 amber), friction (#DC2626 red), blocked (#9F1239 dark red)
- SlaRing breach levels use teal → amber → red → dark red — no blue/indigo

## TypeScript strict
- `DepthConfig` type defined (`{ shadow: string; borderLeft: string; opacity: number; glow: string }`)
- `BreachLevel` exported from sla-ring.tsx
- `WIZARD_STEPS` typed as `ReadonlyArray<{ en: string; ar: string }>`
- `StepIndicator` props typed as `{ step: 0 | 1 | 2; locale: "en" | "ar" }`
- `SlaRing` props typed as `{ elapsedHours: number; targetHours: number; breachLevel: BreachLevel; size?: number }`
- No `any` used anywhere

## Detailed worklog
Full implementation details, line references, and design rationale appended to `/home/z/my-project/worklog.md` under `Task ID: ENHANCE-REQUESTS-3D` (after the priority recommendations list at the end of the file).

## Next-phase recommendations (carried forward)
1. Accessibility audit — run axe-core in CI per PRD §13-241 (WCAG 2.2 AA)
2. Offline support — cache shell + last journey state via service worker
3. Ask voice input — microphone button on Ask input
4. Manager weekly summary email preview modal
