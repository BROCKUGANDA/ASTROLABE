# UI-ASK-REQUESTS — Ask + Requests screens

Agent: Main (UI builder)
Task: Build `ask-screen.tsx` (cited-answers, PRD §13) and `requests-screen.tsx` (status + intake, PRD §12) consuming `/api/v1/ask`, `/api/v1/requests`, `/api/v1/journey/me`, with three-stage progress, simulated streaming, abstain handoff, prefilled intake, duplicate handling, and full Arabic RTL.

## Files written
1. `src/components/astrolabe/ask-screen.tsx` (~880 lines)
2. `src/components/astrolabe/requests-screen.tsx` (~1820 lines)
3. `src/app/page.tsx` (updated to route 4 views — Today/Journey/Ask/Requests — through the Zustand store)

## Ask screen — design
- **Sticky ask input area** (bottom of viewport). Large auto-resizing textarea with placeholder `Ask a policy question…`. Keyboard-first: Enter sends, Shift+Enter inserts a newline (handled in `onKeyDown`). 1000-char limit with live counter. Teal send button (44px touch target, ast-focus, hover lift).
- **Six starter questions** drawn as a 2-col chip grid above the input when no turns exist yet. EN + AR versions hardcoded per PRD §13.
- **Three-stage progress**: while a question is in flight, render three pulse-dot stages connected by hairlines: `checking your journey → reading policy → drafting`. Each stage has a live per-stage elapsed counter (`ms`/`s`) updated every 80ms via `setInterval`. Active dot has `ast-pulse-ring`, past dots are solid teal, future dots are surface-3.
- **Answer card** (`kind: "answer"`):
  - **Streaming**: reveal 4 chars every 16ms via `setInterval`. Derived `done = revealed >= cleanMd.length` (no setState-in-effect — the lint rule is satisfied by deriving instead of storing).
  - **Citation handling**: `stripCitations(md)` removes inline `[^n]` refs AND the footnote definitions, leaving clean prose. Citation chips render in a "Sources" row below the answer, collapsed to chips by default. Expanding reveals the snippet + effective/review dates per citation.
  - **Footer**: `answerId` (mono, click-to-copy via `navigator.clipboard`), `Last checked {timestamp}`, plus three action buttons — Copy (full answer), Share to owner (mailto: with subject+body prefilled), This was wrong (ThumbsDown → on click shows toast + flips to "Reported" check state).
  - **Stale banner**: if `answer.degraded.includes("policy_stale")`, render a sand-gold-bordered banner above the answer body: "Policy search returned a stale document — please confirm with the owner."
  - **Start this request**: sand-gold inline CTA at the bottom of the answer card. Expands to show 4 related request types (it_kit, system_access, relocation, training). Clicking calls `setActiveRequestType(type)` + `setView("requests")` — the Requests screen picks it up and jumps straight to step 2 of the wizard.
  - **Follow-ups**: rendered as small chips below the answer. Clicking a follow-up auto-submits it as a new question (PRD requirement).
- **Abstain / handoff card** (`kind: "abstain"`): rendered as a *handoff*, not a failure. Sand-gold border. Brass-compass icon. Plain-language reason copy (EN/AR). Explicit "What I won't do: guess" boundary line. Named owner card with avatar + name + role + email. Editable prefilled question textarea + sand-gold `Send to {owner name}` button that opens a `mailto:` link. If `abstainReasonCode === "out_of_scope"` AND the EN reason matches `/journey|action/i`, render routing buttons to Today and Requests instead of the mailto path (this is the "intent classification → route" path from retrieval.ts).
- **History**: last 5 turns kept in state, rendered as a scrollable chip-list above the input (max-h-32 with overflow-y-auto). Each chip is clickable to re-submit. Clear-on-employee-change (useEffect reset). Clear button to wipe history. There is no separate "clear on tab switch" effect — but switching to Ask remounts the component (since `view === "ask"` is conditional in page.tsx), which naturally resets the state.
- **Error card**: AlertTriangle banner with request-id style mono text and Retry button that re-submits the failed question.
- **Loading skeleton**: while a turn is `loading`, show three shimmer bars instead of an answer.

## Requests screen — design
- **Header**: title + subtitle + teal "New request" button (top-right).
- **Two-column grid** (col-7 / col-5 on desktop, single-column on mobile):
  - **Left col-7**: Request list — see below.
  - **Right col-5 (desktop)**: Inline wizard card (`sticky top-20`).
  - **Mobile**: Trigger button opens a shadcn Dialog containing the wizard.

### Request list cards
- Each card: type icon (8 icons mapped to RequestType), type label (`INTAKE_SCHEMAS[type].label`), mono ref with click-to-copy, opened-date (date-fns `format(d, "d MMM")`), `StatusChip` (top-right), `SlaChip` (computes `elapsedHours` from `PACK_NOW - openedAt`, `breachLevel` via `computeBreach` — same formula as today-screen).
- Meta row: assignee name + owner group label (with User icon). If `reassignCount > 0`: "Reassigned N×" pill in watch color. If `returnCount > 0`: "Returned N×" pill in friction color. "View" / "Hide" toggle at the right.
- **Expandable** (AnimatePresence height+opacity 200ms): three sections — Timeline (deterministic events built from request metadata), Attached context (autoAttachedContext as chips), Policy reference (CitationChip built from `INTAKE_SCHEMAS[type].policyRef`).

### New request wizard (3 steps)
- **Step indicator**: three horizontal hairlines that fill teal as steps progress.
- **Step 1 — Type grid**: 2-col grid of all 8 type cards. Each card: icon + label + SLA + owner group. Hover lift + teal border on hover.
- **Step 2 — Dynamic form**: generated from `INTAKE_SCHEMAS[type].fields`. Each field renders based on its `type`:
  - `text`/`textarea`/`number`/`date` → shadcn `Input`/`Textarea` with appropriate `type`.
  - `select` → shadcn `Select` with options from the schema.
  - `checkbox` → custom row with shadcn `Checkbox` on the right + label/help on the left (touch-friendly 44px height).
  - Prefilled fields (those with `prefillFrom`) show a teal "Prefilled" badge inline with the label. Fields are still editable.
  - Inline validation: `validateField()` per field type. Required check, number validity, date validity. Errors appear under the field with friction color. "Preview" button is disabled until all required fields pass.
  - `allValid` derived (not stored) so the Next button enables reactively.
- **Step 3 — Preview**: shows recipient card (avatar + name + role + owner group + "Expected by {EEEE d MMM}" computed from `now + slaHours`), payload preview (definition list of every field's submitted value), auto-attached context chips, submit error inline (if any), and "Edit" (back) + sand-gold "Submit request" buttons.
- **Submit**: POSTs to `/api/v1/requests` with idempotency key `idm-{employeeId}-{type}-{Date.now().toString(36)}`. On `servedFrom === "cache"` (idempotency replay): shows duplicate notice banner "This request already exists — showing the original" + auto-expands the original card + toast.info. On success: confetti-style `toast.success` with the new ref ✨ + auto-expands the new card.
- **Wizard remount strategy**: the Wizard is keyed by `wizardType` (`key={wizardType ?? "none"}`), so changing the type remounts it. The lazy `useState(() => buildInitial())` initializer then re-runs and seeds the payload from the prefill map. This avoids the `react-hooks/set-state-in-effect` lint rule.
- **activeRequestType pickup**: when the store's `activeRequestType` is set (e.g. from the Ask screen's "Start this request" CTA), an effect detects it on mount, opens the wizard modal, sets the type, jumps to step 2, builds the prefill map, then clears the store flag (`setActiveRequestType(undefined)`).

### Prefill
- Reads employee record from `/api/v1/journey/me?employeeId=...&asOf=PACK_NOW`.
- Prefill mapping per `field.prefillFrom`:
  - `employee.location` → `employee.location` ("DXB"/"AUH")
  - `employee.stage` → top-level `stage` from journey response
  - `employee.startDate` → `employee.startDate` (sliced to YYYY-MM-DD for date inputs)
  - `employee.role` → `employee.role`
- If the journey fetch fails (non-fatal), prefill simply doesn't populate.

### Empty state
- "No open requests. Here is what people usually need on day 5." with three quick-start chips (it_kit, system_access, training) that jump straight to step 2 of the wizard.

## Cross-cutting requirements verified
- `"use client"` at top of both screen files.
- `framer-motion` for all animations (initial/animate/exit, spring drops, height+opacity for collapsibles).
- `lucide-react` icons at 1.75 stroke throughout. Type icons mapped per RequestType.
- `react-markdown` for rendering the streamed answer (with custom `p`/`em`/`strong` renderers to apply our color tokens).
- `date-fns` (`format`, `addDays`, `formatDistanceToNow`) for all date formatting.
- Mobile-first responsive: grids collapse to single column on mobile, wizard switches from inline-card to modal Dialog, type grid stays 2-col even on mobile, send/submit buttons are 44px touch targets.
- `ast-focus` rings on every interactive element.
- `.tabular` on every timer/counter (stage elapsed, char count, SLA chip, ref, dates, IDs).
- All fetches wrapped in try/catch with skeleton loaders (shimmer bars) and error fallbacks with Retry buttons.
- NO indigo, NO blue accents. Teal `--brand-500` for primary, sand-gold `--accent-500` strictly reserved for "your next move" surfaces (Submit button in step 3, "Start this request" CTA, abstain Send button).
- Arabic: `dir="rtl"` set on the root wrapper via `page.tsx`. Every label/CTA has an AR variant. Arabic typography uses `var(--font-plex-arabic)` automatically via `[dir="rtl"]` selector in globals.css.
- TypeScript strict, no `any`. All API envelopes explicitly typed. The submit handler is typed via a local `SubmitResult` discriminated union.
- Follow-up chips auto-submit on click.
- "Start this request" inside an answer sets `activeRequestType` and switches view to "requests".

## Lint + type-check verification
- `bunx eslint src/components/astrolabe/ask-screen.tsx src/components/astrolabe/requests-screen.tsx src/app/page.tsx` → EXIT 0 (clean).
- `bunx tsc --noEmit` → 0 errors in any of the three files (only pre-existing unrelated errors in examples/ and skills/).
- `bun run lint` (full project) → EXIT 0.
- Dev server log shows clean compiles + 200s for `/`, `/api/v1/ask`, `/api/v1/requests` (both GET list and POST create + idempotency replay returning `servedFrom: "cache"`).

## Smoke tests (curl against dev server)
- `POST /api/v1/ask` with "How many days of relocation allowance do I get?" → 200 with `kind: "abstain"` (`low_grounding`) and Arabic reason copy — abstain card will render.
- `POST /api/v1/ask` with "When is my flight booked?" → 200 with `kind: "answer"`, `answerMarkdown` populated, citations array — answer card will render with streaming + Sources row.
- `POST /api/v1/ask` with "Who is my HRBP?" → 200 with `kind: "answer"` — same path.
- `GET /api/v1/requests?employeeId=E-1042` → 200 with 1 item (SR-2024-091, it_kit, in_progress, reassignCount:1).
- `POST /api/v1/requests` (create it_kit) → 200 with `servedFrom: "live"` + owner `{name: "Ahmed Al-Rashid", role: "IT Provisioning Lead"}` — recipient card will render correctly.
- `POST /api/v1/requests` (same idempotencyKey) → 200 with `servedFrom: "cache"` — duplicate notice will fire.

## Stage Summary
Two production-grade screens delivered. Ask screen surfaces a teal instrument-style answering flow with three-stage progress, character-by-character streaming, plain-language abstain handoffs with named owners, and last-5 history. Requests screen pairs a live status list with a 3-step intake wizard that prefills from the employee's journey, validates inline, previews the exact recipient, and handles duplicate submissions gracefully. Sand-gold is strictly reserved for "your next move" surfaces (Submit, Start this request, abstain Send). Both screens are reachable from the top-nav pill (Today/Journey/Ask/Requests) and view-switching flows correctly from Ask → Requests via the store's `activeRequestType`.
