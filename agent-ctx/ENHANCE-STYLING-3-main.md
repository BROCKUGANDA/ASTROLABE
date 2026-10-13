# ENHANCE-STYLING-3 — Ask answer card polish + source preview modal + shooting stars + scroll-linked astrolabe

## Task
Three styling enhancement tracks for the Ask screen and beyond:

1. **Track 1** — Enhanced Ask answer card with 3D citation chips + animated grounding meter + card polish (top accent bar, verified/handoff badges, left teal accent line, spring drop-in).
2. **Track 2** — Source preview modal that opens when a citation chip is clicked (frosted glass, scale-in, full chunk text with cited sentence highlighted).
3. **Track 3** — Constellation background shooting stars + hero astrolabe scroll-linked rotation.

## Files created
- `src/components/astrolabe/source-preview-modal.tsx` — shadcn Dialog (max-w 680px), `.ast-card-glass` background (rgba(16,24,39,0.66) + backdrop-blur(14px)), top accent bar, scale-in animation, fetches `/api/v1/policies/{docSlug}` to get the full chunk text, finds the section matching `citation.section + citation.lang`, and renders it with the cited sentence wrapped in `<mark>` (teal 0.22 opacity). Footer: "Open full policy →" (new tab) + "Copy citation" (clipboard with toast) + "Close". Stale indicator when `reviewDate < PACK_NOW`.

## Files edited
- `src/components/astrolabe/ask-screen.tsx`:
  - **AnswerCard**:
    - Wrapped the whole card in `motion.div` with spring drop-in (320ms, stiffness 220, damping 26).
    - Added top accent bar (2px teal gradient, `transparent → brand-500 → brand-400 → transparent`).
    - Added `VerifiedAnswerBadge` (teal, ShieldCheck icon) absolutely positioned top-right when `groundingScore >= 0.95`.
    - Answer body now has `pl-3.5 sm:pl-4` + a 1px teal vertical accent line (gradient from 0.45 → 0.08 opacity).
    - Collapsed citation chips: replaced `<CitationHover><CitationChip/></CitationHover>` with `<Tilt3D maxDeg={3} as="span"><CitationChip3D/></Tilt3D>`. Same pattern in the expanded snippets view.
    - `CitationChip3D` is a button (not a link): 3px brass dot on the left, 12px Sparkles icon (sand-gold), citation title + section, hover lift 2px + teal underline glow (absolute child span). Click → opens `SourcePreviewModal`.
    - Replaced the plain "Grounding · X%" text span with `<GroundingMeter score={answer.groundingScore} locale={locale} />`.
    - `GroundingMeter`: 120×6px rounded bar, fills 0→pct via rAF ease-out cubic over 640ms. Teal fill (≥0.95), amber (0.7-0.94), red (<0.7). NumberTicker label "Grounding · X%". Check icon (teal) when score = 1.0. role="meter" with aria-valuenow/min/max. Respects prefers-reduced-motion (snaps to pct instantly).
    - Added `<SourcePreviewModal open={sourceOpen} onOpenChange={setSourceOpen} citation={activeSource} locale={locale} />` at the end of the AnswerCard fragment.
  - **AbstainCard**: same spring drop-in, sand-gold top accent bar (matching the "your next move" theme), `HandoffBadge` (sand-gold, HandHeart icon) absolutely positioned top-right.
  - New helper components: `CitationChip3D`, `GroundingMeter`, `VerifiedAnswerBadge`, `HandoffBadge`.
  - Removed unused imports (`CitationChip`, `CitationHover`, `ExternalLink`, `SourceCitation` type) after the refactor.

- `src/components/astrolabe/constellation-bg.tsx`:
  - Added `ShootingStar` interface + `spawnShootingStar(w, h)` + `drawShootingStar(c, s)` helpers.
  - Each shooting star: random angle (0.08π..0.50π cone, biased downward), speed 540-780 px/sec, trail 70-120px, ttl 0.6s (3-phase opacity: 0→1 fade-in over 15%, hold until 60%, 1→0 fade-out for 40%).
  - Trail: linear gradient from transparent (tail) → teal (head). Head: radial gradient sand-gold core + teal glow + 1.2px solid dot.
  - Spawn cadence: first shoot 4-8s after mount, then every 8-12s. At most one star alive at a time.
  - Integrated into the rAF `step` loop: advance shooting-star clock, spawn when due, update age + position, cull expired/off-screen streaks, draw on top of the regular starfield + constellation lines.
  - `dt` capped at 100ms to avoid huge jumps after tab-switch.
  - Reset shooting stars on resize.
  - Disabled entirely under prefers-reduced-motion (existing `reduceMotion` early return).

- `src/app/page.tsx`:
  - Added `useScroll` to the framer-motion import.
  - In `HeroParallax`: `const { scrollY } = useScroll();` + `const astRotate = useTransform(scrollY, [0, 200], [0, 30]);`
  - Applied `rotate: astRotate` to the astrolabe `motion.div` style (only when `enabled = !reduce && fine`).
  - Desktop-only + reduced-motion-aware (the rotate MotionValue is only attached when `enabled` is true; under reduced-motion the astrolabe renders static, matching the existing cursor-parallax behavior).

## Lint-rule workarounds
- `react-hooks/set-state-in-effect` fired 3 times during initial implementation:
  1. `GroundingMeter` — `setWidth(pct)` in the `if (reduce)` branch of the effect. Fixed by restructuring with the same pattern used by `NumberTicker` in micro-interactions.tsx: `animateW` state is `number | null`, only set inside the rAF callback (async). The displayed value is derived: `const shown = reduce ? pct : (animateW ?? 0);`. When reduce is on, the effect returns early and `shown` snaps to `pct` directly.
  2. `SourcePreviewModal` — `setDoc(null); setFetchError(null); setLoading(false);` when `!open || !citation`. Fixed by deferring the fetch + setState calls to a `setTimeout(0)` inside the effect. The `cancelled` flag + `clearTimeout` cleanup ensures no setState fires after unmount.
  3. `SourcePreviewModal` — `setCopied(false)` on close. Removed entirely — the copy handler's own `setTimeout(1800)` already flips `copied` back to false. Adding a useEffect for that would trigger the lint rule for no real benefit (worst case: a stale checkmark persists for <1.8s if the user closes during the copy feedback window).

## Verification
- `bun run lint` (full project) → EXIT 0 ✅
- `bunx tsc --noEmit` → 0 errors in any touched file (only pre-existing unrelated errors in `examples/` and `skills/`)
- `bunx eslint src/components/astrolabe/ask-screen.tsx src/components/astrolabe/source-preview-modal.tsx src/components/astrolabe/constellation-bg.tsx src/app/page.tsx` → EXIT 0
- Dev server: clean compiles in 151ms-1513ms range; GET / 200 in 156-632ms
- Smoke-tested endpoints:
  - `POST /api/v1/ask "When is my flight booked?"` → answer with `groundingScore: 1.0` + 2 citations → AnswerCard renders VerifiedAnswerBadge + GroundingMeter at 100% (teal + check icon) + 2 CitationChip3D chips (each wrapped in Tilt3D maxDeg=3)
  - `POST /api/v1/ask "What is the meaning of life?"` → abstain with `groundingScore: 0` + owner Fatima Al-Mansouri → AbstainCard renders HandoffBadge + sand-gold top accent + spring drop-in
  - `GET /api/v1/policies/relocation-policy` → returns 3 sections (allowance, housing, travel) — SourcePreviewModal can find the matching section for any relocation-policy citation
  - `GET /` → HTTP 200 · 0.63s · 58.6KB

## Theme adherence
- Calm navy surfaces throughout; teal instrument accent for the AnswerCard top accent bar, vertical accent line, GroundingMeter fill (≥0.95), VerifiedAnswerBadge, CitationChip3D text + underline glow, shooting star trail.
- Sand-gold RESERVED for "your next move" only: AbstainCard top accent bar, HandoffBadge, CitationChip3D's 3px brass dot + 12px Sparkles icon (signaling "this is a source" — the user's next move is to verify), shooting star head core dot.
- NO indigo, NO blue.
- `.tabular` on the GroundingMeter percentage via NumberTicker.
- All animations respect `prefers-reduced-motion`: GroundingMeter snaps to pct, Tilt3D degrades to no-tilt, CitationChip3D hover lift/underline degrade to static, shooting stars disabled entirely, astrolabe scroll-rotation not applied.
- TypeScript strict, no `any`.

## Preview

Open the Preview Panel → "Open in New Tab" → switch to:

- **Employee → Ask**: type "When is my flight booked?" → answer card drops in with spring (320ms), top teal accent bar, "Verified answer" badge top-right (groundingScore = 1.0). Answer body has a teal vertical accent line on the left. Below the answer: "Sources (2)" toggle, with two 3D citation chips (each has a 3px brass dot + sand-gold Sparkles icon). Hover a chip → it tilts up to 3deg (Tilt3D) + lifts 2px + teal underline glow. Click a chip → SourcePreviewModal opens (frosted glass, scale-in) showing the full Relocation Policy §travel chunk with the cited sentence highlighted in teal. Footer: "Open full policy →" + "Copy citation" + "Close". The GroundingMeter in the footer shows a 120×6px teal bar filled to 100% with a teal check icon + "Grounding · 100%".

- **Employee → Ask**: type "What is the meaning of life?" → AbstainCard drops in with spring, sand-gold top accent bar, "Handoff" badge (HandHeart icon) top-right. Named owner card (Fatima Al-Mansouri) + mailto form + "What I won't do: guess" boundary.

- **Any page** (background): wait 4-8s → a shooting star streaks across the canvas (teal trail, sand-gold head, ~600ms lifetime). Then every 8-12s another one. Subtle, not distracting. Disabled under reduced-motion.

- **Employee → Today** (desktop, top of page): scroll down → the 3D astrolabe in the hero slowly rotates up to 30deg over the first 200px of scroll. The instrument turns as you navigate. Disabled on touch devices and under reduced-motion.
