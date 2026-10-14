# ENHANCE-STYLING — Work record

**Task ID:** ENHANCE-STYLING
**Agent:** Main (styling enhancement)
**Status:** ✅ Complete

## Summary

Added deep styling enhancements with 3D depth and micro-interactions to the ASTROLABE employee journey app, all while respecting the existing "instrument, not dashboard" theme (calm navy + ONE teal accent + sand-gold reserved for "your next move").

## Files created

1. **`src/components/astrolabe/constellation-bg.tsx`** — Canvas-based star-field background.
   - 60 small stars (1-2px, teal/sand-gold, opacity 0.2-0.6 with sinusoidal twinkle)
   - 8 navigation stars (3px with radial glow)
   - 4 constellation edges (teal hairline at 0.08 opacity)
   - Very slow drift (1px / 4s, wraps the canvas)
   - requestAnimationFrame capped at 30fps
   - Pauses entirely on `visibilitychange`
   - prefers-reduced-motion → single static frame
   - Wrapper: `pointer-events-none fixed inset-0` with `z-index: -1`

2. **`src/components/astrolabe/micro-interactions.tsx`** — Six tree-shakeable named exports.
   - `<PressScale>` — `active:scale-[0.98]` (120ms)
   - `<HoverLift>` — `hover:-translate-y-0.5` (180ms); disabled on touch
   - `<NumberTicker value decimals prefix suffix />` — rAF ease-out-cubic over 480ms; tabular numerals
   - `<CitationHover>` — lifts 2px + teal underline glow on hover
   - `<RevealOnScroll index as>` — IntersectionObserver one-shot fade+rise 8px with `min(index, 8) * 40ms` stagger
   - `<Tilt3D maxDeg>` — `perspective(800px) rotateX/rotateY` max ±maxDeg; disabled on touch
   - All respect `prefers-reduced-motion`. All touch-gated where relevant.
   - Polymorphic `as` prop typed via `ElementType` + internal `HostTag = ComponentType<HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }>` cast. No `any`.

## Files edited

3. **`src/app/globals.css`**
   - Enhanced `.ast-card`: added `::after` 1px top highlight (white 0.04 → transparent), hover teal glow at 0.06 opacity, hairline shifts to teal 0.35 on hover, transitions box-shadow + border-color over 240ms. Existing markup untouched.
   - New `.ast-card-glass` class: `backdrop-filter: blur(12px)` over `rgba(16,24,39,0.6)`, 1px teal hairline, top highlight, hover teal glow.

4. **`src/components/astrolabe/widgets.tsx`**
   - `BandChip` now renders its score via `<NumberTicker value={score} />` so every band-score readout animates on value change.

5. **`src/components/astrolabe/today-screen.tsx`**
   - `<NextBestStepCard>` wrapped in `<Tilt3D maxDeg={3} className="lg:col-span-7">` (inner section's `lg:col-span-7` removed)
   - "Coming up" `<motion.li>` per-item fade replaced with `<RevealOnScroll as="li" index={i}>` (40ms stagger, one-shot)
   - "Start this step" button wrapped in `<PressScale>`

6. **`src/components/astrolabe/ask-screen.tsx`**
   - Both CitationChip render sites (collapsed chips + expanded snippets) wrapped in `<CitationHover>`
   - Added "Grounding · `<NumberTicker value={Math.round(answer.groundingScore * 100)} suffix="%" />`" indicator next to "Last checked" in the answer card footer

7. **`src/components/astrolabe/journey-screen.tsx`**
   - `StepRow`'s outer `<li>` changed to `<div>`
   - Each `<StepRow>` wrapped in `<RevealOnScroll as="li" index={i}>` (40ms stagger capped at 8 items per stage)

8. **`src/app/page.tsx`**
   - Imported and mounted `<ConstellationBg />` as the first child of the root div
   - Removed the root's inline `background: var(--surface-0)` so the constellation shows through above the body's navy
   - Extracted the hero into a new `HeroParallax` component using `useMotionValue` + `useTransform`:
     - Astrolabe wrapper: 8px shift opposite cursor
     - Hero text wrapper: 4px shift with cursor
     - Spring transition (stiffness 120, damping 18) for smooth 60fps follow
     - `onMouseMove` updates motion values; `onMouseLeave` resets to 0
     - Two local hooks: `usePrefersReducedMotion`, `useFinePointer` (matchMedia `(pointer: fine)`)
     - Both parallax + mouse handlers disabled when `!fine || reduce`

## Theme compliance

- NO indigo, NO blue accents.
- Sand-gold strictly reserved for "your next move" (Next Best Step card top bar + Start button + label) — not introduced anywhere new.
- Teal instrument accent (`--brand-500`) is the workhorse for hover glows, citation underlines, grounding score, constellation stars.
- Constellation uses teal + sand-gold stars only.

## Performance

- Constellation canvas: ~72 draw ops per frame (60 small + 8 nav + 4 lines), capped at 30fps, paused on tab-hidden → well under 1% CPU when idle.
- Tilt3D / HeroParallax: transform-only animations (GPU-composited).
- NumberTicker: single rAF that cancels on unmount; `currentRef` keeps the latest animated value for smooth restarts.
- RevealOnScroll: IntersectionObserver disconnects after first reveal (one-shot).

## Verification

- `bunx eslint <all touched files>` → EXIT 0
- `bunx tsc --noEmit` → 0 errors in any touched file (only pre-existing unrelated error in `requests-screen.tsx:673` from a prior task — not touched here)
- `bun run lint` (full project) → EXIT 0
- Dev server: clean compiles, GET / 200 in ~80ms, GET /api/v1/journey/me + /me/data 200
- Smoke test: `curl http://localhost:3000/` → HTTP 200 · 0.94s; HTML contains the constellation `<canvas>` element

## Two lint issues encountered and fixed

1. `react-hooks/set-state-in-effect` on NumberTicker's `setDisplay(value)` in the reduce branch → restructured so reduce mode renders `value` directly via derived `shown = reduce ? value : display`, no setState needed.
2. Same rule on RevealOnScroll's `setVisible(true)` in the reduce branch → restructured so reduce mode is treated as visible via derived `shown = reduce || visible`, no setState needed.

## TypeScript strict typing

The polymorphic `as` prop pattern needed care to stay strict without `any`:
- Public prop type: `ElementType` (accepts both `"li"` strings and component refs)
- Internal render type: `HostTag = ComponentType<HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }>`
- Bridge: `const Tag = (as ?? "div") as unknown as HostTag;`

This keeps the public API wide while the JSX render site stays strictly typed (TS knows Tag accepts className/style/children/onMouseEnter/ref).

## Preview

Open the Preview Panel → "Open in New Tab" → switch to Employee/Today to see:
- Constellation canvas drifting behind the app
- Hero parallax (move your mouse — astrolabe shifts opposite, text shifts with)
- Tilt3D on the Next Best Step card (move mouse over it)
- NumberTicker on the band score (switch employees to see it count)
- PressScale on the Start button (click and hold)
- RevealOnScroll on Coming Up items (scroll down)

Switch to Ask → ask any question → see:
- CitationHover on citation chips
- NumberTicker on the Grounding score in the answer footer

Switch to Journey → scroll through step rows → see RevealOnScroll stagger.
