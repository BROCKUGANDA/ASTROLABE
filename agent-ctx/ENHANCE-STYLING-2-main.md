# ENHANCE-STYLING-2 — Work record

**Task ID:** ENHANCE-STYLING-2
**Agent:** Main (styling enhancement — 3D depth + signal weight bars + hover-expand packet preview)
**Status:** ✅ Complete

## Summary

Three styling enhancement tracks layered onto the ASTROLABE instrument theme — extending the prior ENHANCE-STYLING micro-interactions (`Tilt3D`, `NumberTicker`) without introducing new colors (NO indigo, NO blue; teal substitutes for blue-info in signal families).

## Files created

1. **`src/components/astrolabe/signal-weight-bar.tsx`** — Animated horizontal weight bar.
   - Fills from 0 → `weight/12` on mount, 480ms ease-out.
   - Family → colour map: TL=amber, DP=red, **RQ=teal (NOT blue)**, EN=teal-500, PS=sand-gold, MB=purple #8B5CF6, DQ=gray.
   - Two variants: `compact` (6px) and `detailed` (10px + label row with code/description/HARD TRIP badge).
   - Exports `FAMILY_MAX`, `FAMILY_COLOR`, `SignalFamily` type.
   - `role="meter"` with full ARIA. Respects `prefers-reduced-motion` via derivation pattern (`shown = reduce || animateW !== null ? frac : 0`).

2. **`src/components/astrolabe/timeline-sparkline.tsx`** — Compact 16px-tall event sparkline.
   - Up to 10 small dots (6px) coloured by event type (completed=teal, started=teal-light, blocked=red, waiting_employee=sand-gold, waiting_owner=amber).
   - Hover reveals tooltip with type label + `d MMM HH:mm` time.
   - Hovered dot scales 1.5× + glow (160ms).
   - Bilingual (EN/AR) labels.

## Files edited

3. **`src/app/api/v1/hrbp/queue/route.ts`** — added `recentEvents` (last 10 events) to each queue item. Additive, backwards-compatible.

4. **`src/components/astrolabe/hrbp-screen.tsx`** — Track 1 + Track 2 (packet) + Track 3 (hover-expand).
   - Imports: `Tilt3D`, `NumberTicker`, `SignalWeightBar`, `TimelineSparkline`.
   - `QueueItem` type extended with optional `recentEvents`.
   - `QueueRow` gains `index` prop for spring stagger.
   - `QueueRow` restructured:
     - `<motion.li>` spring drop-in (stiffness 220, damping 26, delay `min(index*0.04, 0.3)`).
     - `<Tilt3D maxDeg={2}>` wraps the card.
     - `var(--e3)` shadow on hover/preview-open vs `var(--e2)` off-hover, 180ms transition.
     - Band-coloured left accent bar (3px, glow, rounded-left).
     - Explicit `score <NumberTicker value={item.score}/>` in meta line.
     - Hover-expand preview via `AnimatePresence` + `height: auto` spring (stiffness 240, damping 28, 240ms):
       - Top 3 signals as `<SignalWeightBar variant="detailed" />` with description + HARD TRIP badge.
       - `<TimelineSparkline events={item.recentEvents ?? []} />`.
       - "Open full packet →" teal-glass button.
     - Desktop hover triggers preview; mobile chevron toggles `isTapped`.
   - Evidence section in EmployeeView: compact `<SignalWeightBar>` under each top signal.

5. **`src/components/astrolabe/judge-screen.tsx`** — Track 2 in trace table.
   - Weight column replaces plain `{s.weight}` with `<SignalWeightBar variant="compact" />`. Cell `min-w-[160px]`. Header changed to `text-left`.

6. **`src/components/astrolabe/verdict-card.tsx`** — Track 2 in verdict card.
   - Below the top-3 `<SignalBadge>` chips, a compact-bar stack (`max-w-[460px]`) renders one `<SignalWeightBar variant="compact" />` per top signal.

## Track-by-track verification

### Track 1 — 3D depth on HRBP queue rows ✅
- `<Tilt3D maxDeg={2}>` wraps each row.
- Band-coloured left accent bar (3px, glow).
- `var(--e3)` on hover, `var(--e2)` off, 180ms.
- Spring drop-in: stiffness 220, damping 26, delay `min(index*0.04, 0.3)`.
- Score uses `<NumberTicker value={score}/>` (in BandChip + explicit meta readout).

### Track 2 — Animated signal weight bars ✅
- `SignalWeightBar` with family-coloured fill, 480ms mount, weight number, HARD TRIP badge, compact + detailed variants.
- Integrated into: Judge trace table (compact), HRBP packet preview Evidence (compact), Today verdict card (compact beneath badges).
- RQ family uses teal (NOT blue).

### Track 3 — Hover-expand packet preview in HRBP queue ✅
- Hover (desktop) / tap chevron (mobile) slides down `AnimatePresence` panel with `height: auto` spring.
- Top 3 signals with `<SignalWeightBar variant="detailed" />` + description.
- Timeline sparkline (last 10 events).
- "Open full packet →" button.
- `.ast-card-glass` frosted glass background.
- Mobile-first: tap-to-expand on coarse pointer.

## Theme compliance
- NO indigo, NO blue. RQ family uses teal.
- Sand-gold reserved: PS-family bars + pre-existing "your next move" surfaces.
- All new components use existing tokens — no new colour variables.

## Accessibility
- `SignalWeightBar` exposes `role="meter"` + ARIA valuenow/min/max.
- `TimelineSparkline` exposes `role="img"` + descriptive aria-label.
- Mobile chevron has `aria-expanded` + AR-aware `aria-label`.
- `prefers-reduced-motion` respected everywhere (width/height/transform animations degrade to 0 duration).
- All interactive elements use `.ast-focus`.

## TypeScript strict
- No `any`. `SignalFamily` union drives colour lookup; `BandT` reused for accent map. `QueueItem.recentEvents` optional.

## Performance
- `SignalWeightBar` width animation is GPU-composited via framer-motion.
- `TimelineSparkline` is pure DOM (10 spans × 6px) — no canvas/rAF.
- Spring drop-in runs once on mount; `startedRef` prevents re-trigger.
- Tilt3D is transform-only (perspective + rotateX/rotateY).

## Verification
- `bun run lint` (full project) → EXIT 0 ✅
- `bunx tsc --noEmit` → 0 errors in touched files (only pre-existing unrelated errors remain in `examples/`, `skills/`, `requests-screen.tsx:673`).
- Dev server: clean compiles 122–487ms; GET / 200 in 107–148ms.
- `curl /api/v1/hrbp/queue` returns `recentEvents` per item.
- Smoke test: `curl /` → HTTP 200 · 0.37s · 58.6KB.

## Lint issue fixed
- `react-hooks/set-state-in-effect` on `SignalWeightBar`'s `setW(frac)` in the reduce branch → restructured with the same derivation pattern used by `NumberTicker`: `const shown = reduce || animateW !== null ? frac : 0;`. setState now only happens inside a `setTimeout` callback.

## Preview
Open the Preview Panel → "Open in New Tab" → switch to:
- **HRBP console → Queue**: hover a row (desktop) or tap the chevron (mobile) to see the spring drop-in, 3D tilt, accent bar, e3 shadow, and the frosted-glass hover-expand preview with weight bars + sparkline + "Open full packet" button.
- **HRBP console → Packet** (Build packet): each evidence item now has a compact `<SignalWeightBar>` below the description.
- **Judge → Trace** (pick a scenario): the Signals Fired table's Weight column renders compact weight bars instead of plain numbers.
- **Employee/Today**: the verdict card now shows compact signal weight bars beneath the top-3 SignalBadge chips.
