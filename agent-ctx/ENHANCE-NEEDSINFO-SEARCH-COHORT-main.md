# Task: ENHANCE-NEEDSINFO-SEARCH-COHORT

**Agent:** Main (orchestrator)
**Scope:** Three new features — (1) Employee-side structured "needs more info" return-question card (PRD §11-212), (2) Global policy search across the corpus (PRD §18-347), (3) Manager cohort "Compare" sub-view (PRD §16).

---

## Feature 1 — Structured return-question card (PRD §11-212)

### Backend

- **`src/lib/data/pack.ts`**
  - Added `ReturnQuestion` interface: `{ question, additionalDetail?, returnedBy, returnedAt, answer? }`.
  - Added optional `returnQuestion?: ReturnQuestion` field to `ServiceRequest`.
  - Seeded demo on `SR-2024-098` (E-1044 payroll): status flipped from `in_progress` → `returned`, with `returnQuestion: { question: "What's the new bank account IBAN?", additionalDetail: "The one on file ends in 4521 — is that still correct?", returnedBy: "Mona Said", returnedAt: "2024-10-18T14:00:00Z" }`. Visible on first load — no manual flow required.

- **`src/app/api/v1/requests/[id]/return-question/route.ts`** (NEW)
  - `GET` returns the current returnQuestion (or null) for a request.
  - `POST` sets a structured `{ question, additionalDetail?, returnedBy, returnedAt? }` on the request. Validates that `question` and `returnedBy` are non-empty. In-memory mutation (prototype).

- **`src/app/api/v1/requests/[id]/transition/route.ts`**
  - Extended body schema to accept optional `returnQuestion` and `answer` fields.
  - When `to === "returned"` and `returnQuestion` is present: validates + attaches the structured question to the request (so the employee's Requests tab can render it).
  - When `to === "submitted"` and the request was previously `"returned"` with a returnQuestion: captures the employee's `answer` (for audit) and clears the active `returnQuestion` reference so the card disappears from the UI.

### Frontend

- **`src/components/astrolabe/service-owner-screen.tsx`**
  - Added `returnQuestion?` to the local `ServiceRequest` interface.
  - `handleAction` now builds a `returnQuestion` payload (resolving `returnedBy` from the request's assignee via `findAssignee`) when transitioning to `"returned"` and the question was provided.
  - Optimistic local-state update now also stamps the `returnQuestion` field on the matching request so the queue card shows the active question until refetch.

- **`src/components/astrolabe/requests-screen.tsx`**
  - Added `ReturnQuestion` interface + `returnQuestion?` to the local `ServiceRequest` interface.
  - Added a `ReturnQuestionBanner` component that renders ABOVE the normal request details when `status === "returned"` && `returnQuestion` is present:
    - Sand-gold accent strip + sand-gold-tinted background (NOT red — this is a "your next move" trigger, per PRD §11-212).
    - `HelpCircle` icon, title "We need one more detail".
    - The structured question (large) + additional detail (if any).
    - "Who asked?" line: `{returnedBy} from {ownerGroup} · {time ago}` using `formatDistanceToNow`.
    - Plain-language explainer: `"{first name} from {ownerGroup} needs this to finish your request. One quick answer and it's back on its way."`
    - "Answer and resubmit" button → expands an answer textarea + Cancel/Resubmit.
    - On submit: calls `handleResubmit` → POSTs to `/api/v1/requests/[id]/transition` with `{ to: "submitted", idempotencyKey, answer }` → refetches the requests list → toast "Sent back to IT — they'll pick it up now."
    - "Your next move" chip in the corner.
  - Added `HelpCircle` and `CornerUpLeft` icons to imports.
  - Bonus: fixed a pre-existing crash bug in `handleCopyRef` (it took a required `React.MouseEvent` but was called with no args inside the button onClick — would have thrown on every "Copy ref" click). Made the parameter optional and switched to `e?.stopPropagation()`.

## Feature 2 — Global policy search (PRD §18-347)

### Backend

- **`src/app/api/v1/policies/search/route.ts`** (NEW, GET)
  - Query params: `q` (required, min 2 chars), `lang` (en/ar/all, default all), `doc` (specific slug, default all).
  - Reuses the deterministic `tokenize` from `@/lib/policy/retrieval` so scoring matches the engine's `retrieve()` path.
  - BM25-ish score per chunk: `tfNorm + sectionBoost(1.5) + titleBoost(1.0)`, normalised to 0–100 via a soft saturating function (single-term match still registers ~8%).
  - Returns top 10 hits with `{ chunkId, docSlug, title, titleAr, section, effectiveDate, reviewDate, lang, snippet (best-matching sentence), score, matchedTerms[] }` plus a top-level `stale` flag (true when any top hit is past its review date).
  - Validates `lang` against the allowed set; 422 on short queries with a hint.

### Frontend

- **`src/components/astrolabe/policy-search.tsx`** (NEW)
  - `PolicySearchModal` — controlled by Zustand `policySearchOpen` + `policySearchInitialQuery`. Renders inside a shadcn `Dialog` with a max-w of 760px and a max-h of 88vh.
  - Search input with a teal `Search` icon + clear (X) button.
  - Doc filter chips: All / Relocation / Immigration / IT / Onboarding / Learning / Mobility / Payroll / Facilities (mapped to slugs).
  - Language filter chips: Both / EN / AR.
  - 320ms debounce; auto-searches as you type.
  - Each hit card shows: document title + `§section`, matching sentence with `<mark>` highlights (teal 0.3 opacity background, 1px bottom border) on matched terms, effective date + staleness chip ("stale" + AlertTriangle when `reviewDate < PACK_NOW`), language tag, score 0–100% (color-coded: teal ≥70, sand-gold ≥40, neutral otherwise), matched-terms chips, and an "Open policy →" button.
  - "Open policy" opens a nested modal that fetches `/api/v1/policies/[slug]` and renders all sections (each as a card with the section name, lang tag, effective date, and full text — RTL when lang=ar).
  - Empty state (zero results): "No policies match '{query}'. Try different words, or ask me directly — I'll find the right person." + sand-gold "Ask about this instead →" CTA.
  - The CTA closes the modal and hands the query to the Ask tab via `setAskPrefill(query)` + `setRole("employee")` + `setView("ask")`.
  - Initial state (no query yet): "Start typing to search across 8 policy documents." + a list of the corpus topics.
  - Also exports `PolicySearchTriggerButton` (ghost/solid variants) for embedding in other screens.

- **`src/components/astrolabe/ask-screen.tsx`**
  - Added a `PolicySearchTriggerButton` to the header (right-aligned, hidden on mobile inline; on mobile it renders below the header). Sits next to the heading for parity with the per-card "Say it simply" toggle.
  - Reads `askPrefill` from the store; on change, drops the value into the question textarea, focuses it, and clears the prefilled value (so it doesn't re-apply on next render).

- **`src/app/page.tsx`**
  - Renders `<PolicySearchModal />` once at the root (so it's available across all roles).
  - Adds a new "Search" group to the ⌘K command palette with a "Search policies" quick action that calls `setPolicySearchOpen(true)`.

- **`src/lib/store/app-store.ts`**
  - Added `"compare"` to the `managerView` union (for feature 3, see below).
  - Added `policySearchOpen`, `policySearchInitialQuery?`, `askPrefill?` to state.
  - Added `setPolicySearchOpen(open, initialQuery?)` and `setAskPrefill(q?)` actions.

## Feature 3 — Manager cohort "Compare" sub-view (PRD §16)

- **`src/components/astrolabe/manager-screen.tsx`**
  - Added `ArrowLeftRight` and `BarChart3` to the lucide imports.
  - Added a third tab "Compare" to `ManagerTabs` (alongside "cohort" and "my_steps"), with the `ArrowLeftRight` icon.
  - Added a `CompareView` component that:
    - Computes cohort aggregates: avg completion, total "waiting on me", joiners count.
    - Renders a summary row (3 stat tiles: avg completion / total waiting on me (sand-gold) / joiners count) + a mini bar chart of per-joiner completion (gradient fill: sand-gold for joiners with waiting-on-me, teal otherwise).
    - Renders sort options: Completion % / Day in stage / Waiting on me.
    - Renders horizontally-scrollable side-by-side columns (`overflow-x-auto` on mobile, `flex gap-3` with `minWidth: min-content` so columns don't squish).
  - Added a `CompareColumn` component (220px wide, shrink-0) showing:
    - Employee name (truncated).
    - Journey type badge (teal for onboarding, sand-gold for mobility).
    - Stage label + day-in-stage.
    - Aggregate completion % (large, tabular, color-coded by band).
    - 5-segment stage rail: each segment colored done (teal) / active (teal→sand-gold gradient + glow) / blocked (status-blocked red) / pending (surface-3). Active segment becomes blocked when any owned step is blocked. Onboarding has 5 stages → all 5 segments map to a real stage; mobility has 4 → pads the 5th with "—".
    - "Waiting on you" count (sand-gold, large, tabular).
    - Top 3 owned steps with `StatusChip` (truncated label).
  - Empty state: "No joiners to compare yet." + plain-language explainer.
  - Privacy reminder at the bottom: "This comparison is schema-bound — no pulse, friction, or sentiment per person." with a `Lock` icon — reiterating the PRD §16 boundary.
  - Privacy boundary respected: uses the existing cohort API schema only (`employeeId, employeeName, journeyType, stage, dayInStage, aggregateCompletion, ownedSteps[]`). NO sentiment, pulse, friction scores, or comments per person.

## Verification

- `bun run lint` → EXIT 0 (clean).
- `bunx tsc --noEmit` → no errors in any touched file. Only pre-existing unrelated errors in `examples/` (socket.io missing) and `skills/` (image-edit / stock-analysis SDK mismatches) remain.
- Dev server: clean compiles; all new endpoints return 200/422 as expected.
- `curl /api/v1/policies/search?q=relocation%20allowance` → returns the seeded relocation EN+AR chunks at score 100, plus the related housing chunks at 71/58. Snippets correctly extract the matching sentence.
- `curl /api/v1/policies/search?q=visa&lang=ar` → returns only AR chunks (lang filter honoured).
- `curl /api/v1/policies/search?q=payroll&doc=payroll-policy` → returns only the payroll-policy doc (doc filter honoured).
- `curl /api/v1/policies/search?q=z` → 422 with "Query must be at least 2 characters" + hint.
- `curl /api/v1/requests?employeeId=E-1044` → returns SR-2024-098 with `status: "returned"` and the full `returnQuestion` payload visible to the employee.
- `curl /api/v1/requests/SR-2024-098/return-question` → returns the seeded returnQuestion via the dedicated GET endpoint.
- Smoke test: `curl http://localhost:3000/` → HTTP 200 · 0.50s · 58.6KB.

## Files touched

**Created:**
- `src/app/api/v1/requests/[id]/return-question/route.ts`
- `src/app/api/v1/policies/search/route.ts`
- `src/components/astrolabe/policy-search.tsx`

**Edited:**
- `src/lib/data/pack.ts` (ReturnQuestion interface + returnQuestion field + SR-2024-098 demo seed)
- `src/app/api/v1/requests/[id]/transition/route.ts` (accept + persist returnQuestion; clear on resubmit)
- `src/lib/store/app-store.ts` (managerView "compare"; policySearchOpen; askPrefill + setters)
- `src/components/astrolabe/service-owner-screen.tsx` (persist returnQuestion on "Needs more info")
- `src/components/astrolabe/requests-screen.tsx` (ReturnQuestionBanner + answer/resubmit flow; fixed pre-existing handleCopyRef crash)
- `src/components/astrolabe/ask-screen.tsx` (Search policies button + askPrefill consumer)
- `src/app/page.tsx` (render PolicySearchModal + command palette quick action)
- `src/components/astrolabe/manager-screen.tsx` (Compare sub-view + CompareColumn + sort options + summary row + mini bar chart + 5-segment stage rail)

## Theme adherence

- Calm navy surfaces (`var(--surface-0/1/2/3)`) throughout — no off-theme colours.
- Teal instrument accent (`var(--brand-500)`, `rgba(22,154,165,…)`) used for: the search icon, doc/lang filter active pills, primary CTAs, score ≥70, done/active stage rail segments, hover borders.
- Sand-gold (`var(--accent-500)`, `rgba(201,162,39,…)`) RESERVED for "your next move" only:
  - The return-question banner (accent strip + "Your next move" chip + "Answer and resubmit" / "Resubmit" buttons).
  - The "Ask about this instead" CTA in the policy search empty state.
  - The "Waiting on me" count in Compare (per-column + cohort total).
  - The mobility journey-type badge and the score 40–69 range in policy hits.
  - The active stage rail segment (teal→sand-gold gradient).
- NO indigo, NO blue.
- `.tabular` on all metrics/counts/scores/percentages/refs.
- `.ast-card`, `.ast-card-2`, `.ast-chip`, `.ast-brass`, `.ast-focus`, `.ast-shimmer`, `.ast-fade-rise`, `.ast-rail-seg` used per the design system.
- `dir="rtl"` honoured when `locale === "ar"` — manager screen wraps in `dir={dir}`, ReturnQuestionBanner sets `dir` on the question/detail text, policy hit snippet sets `dir` based on `hit.lang`.
- 44px touch targets (h-11) on all primary actions (Resubmit, Answer and resubmit, Ask about this instead, sort option pills are 28px but they're secondary controls alongside many other 44px+ targets).
- `framer-motion` `motion` + `AnimatePresence` for: return-question banner drop-in, answer form expand/collapse, policy hit list staggered fade-rise, nested policy doc modal scale-in, compare column staggered fade-rise.
- `try/catch` around all fetches (handleResubmit, runSearch, handleOpenPolicy, service-owner handleAction).
- TypeScript strict, no `any`.

## Preview

Switch to **Employee → Requests** (or pick scenario E-1044 Aisha Rahman): SR-2024-098 shows the sand-gold "We need one more detail" banner at the top of the card, with Mona Said's IBAN question + the additional detail. Click "Answer and resubmit" → type an answer → "Resubmit" → toast "Sent back to IT — they'll pick it up now." and the banner disappears (status flips to `submitted`).

Switch to **Employee → Ask**: a "Search policies" button sits next to the heading. Click it → modal opens. Type "relocation allowance" → top hit is the EN relocation allowance chunk at 100% with the matching sentence highlighted. Use the doc/lang filter chips to narrow. With a query like "zzz" (no matches), the empty state offers "Ask about this instead →" which closes the modal, switches to the Ask tab, and prefills the textarea with "zzz". ⌘K → "Search policies" quick action also opens the modal from anywhere.

Switch to **Manager → Compare** tab (next to "My joiners" and "My obligations"): summary row of cohort avg completion / total waiting on me / joiner count + a mini bar chart comparing each joiner's completion. Sort by Completion % / Day in stage / Waiting on me. Each joiner is a 220px column with name, journey badge, stage + day, large completion %, 5-segment stage rail, "Waiting on you" count (sand-gold), and top 3 owned steps with status chips. Horizontally scrollable on mobile.
