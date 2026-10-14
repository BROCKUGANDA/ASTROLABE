# ENHANCE-EXTRAS — Four small ASTROLABE features

**Task ID:** ENHANCE-EXTRAS
**Agent:** Main (extras enhancement)
**Scope:** Four production-ready features across Ask / Today / Manager screens + a reusable ICS helper. All client-side, all theme-compliant, all lint + type-clean.

## Features delivered

### 1. "Say it simply" toggle on Ask answers (PRD §01-016)
**File edited:** `src/components/astrolabe/ask-screen.tsx`

- Added a `firstSentence(md: string): string` helper alongside `stripCitations` — extracts the first decisive sentence (matches up to the first `.`, `!`, or `?` followed by whitespace/end-of-string, fallback to first line). Markdown emphasis markers (`*`, `_`, `**`) preserved so ReactMarkdown still renders them.
- Added `simple` boolean state to `AnswerCard` (per-question — the card is keyed by `turn.id` so it remounts per answer, no persistence needed).
- Derived `simpleMd` via `useMemo(() => firstSentence(cleanMd), [cleanMd])` so it's stable across renders.
- Derived `displayMd = simple ? simpleMd : streamed` — when simple mode is on, the answer renders in full instantly (no streaming animation, no cursor).
- Added a pill toggle button (Sparkles icon, `h-8 px-3`, "Say it simply" / "ببساطة") above the answer body in a flex row. Active state: teal tint background + teal border + teal text; inactive: surface-2 + neutral border + text-mid. `aria-pressed={simple}` for screen readers.
- Added a "Simple" / "مبسّط" chip badge that fades + scales in via `<AnimatePresence>` + `<motion.span>` when simple mode is on. Teal accent (instrument), matches the toggle.
- Streaming cursor (`!done && !simple`) hidden when simple is on so the first-sentence render feels decisive.
- Citations row + footer actions + follow-ups all remain visible in simple mode (only the body collapses).

### 2. Printable checklist on Today (PRD §03-053)
**File edited:** `src/components/astrolabe/today-screen.tsx`, `src/app/globals.css`

- Added a "Print checklist" button (`Printer` icon, `h-9 px-3` pill) to the Coming Up section header, next to the section title. Calls `window.print()` (guarded by `typeof window !== "undefined"`).
- Added `no-print` class to the Coming Up header + the on-screen upcoming grid so they don't appear on paper.
- Added a `.print-checklist` div inside Coming Up, marked `hidden print:block` so it's invisible on screen but appears when printing.
- Checklist content: plain-language copy `"Maria's checklist — Day 5 of onboarding"` (matches PRD spec literally), stage line, and a `<ul>` of late + upcoming items each rendered as `☐ label — due date` (or `☒ label LATE — due date` for late items). Late items get bold weight + a red "LATE" badge + `☒` (checked box) glyph; upcoming items get `☐` (empty box). All dates use `.tabular` and `format(d, "d MMM yyyy")` from date-fns.
- Checklist items combine late items (status `blocked` or breachLevel `breached`/`hard`) AND upcoming items (status `not_started`/`waiting_employee`, not blocked), so the printed sheet covers everything the employee owes.
- Inline style on the checklist div forces `color: #000; background: #fff; padding: 24px 16px` so it reads on white paper regardless of the dark theme.
- Added print styles to `globals.css` under `@media print`:
  - `body * { visibility: hidden }` — invisible everything in flow (kept in layout so absolute-positioned children can still be revealed).
  - `.print-checklist, .print-checklist * { visibility: visible }` — reveal the checklist and its descendants.
  - `.print-checklist { position: absolute; left: 0; top: 0; width: 100% }` — pin to top-left of the page.
  - `.no-print { display: none !important }` — hard-hide interactive controls.
  - `html, body { background: #fff !important }` — switch the page background to white for printing.

### 3. Calendar export (ICS) on Today (PRD §03-054)
**File created:** `src/lib/utils/ics.ts`
**File edited:** `src/components/astrolabe/today-screen.tsx`

- Created `src/lib/utils/ics.ts` exporting `generateIcs(events: IcsEvent[]): string` + the `IcsEvent` interface (`{ summary, dtStart, description }`).
  - RFC 5545 compliant: CRLF line endings (`\r\n`), escaped text fields (backslash, semicolon, comma, newline), UTC date-times (`YYYYMMDDTHHMMSSZ`).
  - `escapeIcsText()` — escapes `\`, `;`, `,`, and `\r?\n` → `\n` per RFC 5545 §3.3.11.
  - `formatIcsDate(d: Date)` — formats a Date as UTC `YYYYMMDDTHHMMSSZ` with `pad()` for each component.
  - `generateIcs()` — wraps events in a `VCALENDAR` block with `VERSION:2.0`, `PRODID:-//Astrolabe//Employee Journey//EN`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`. Each event becomes a `VEVENT` with `UID` (astrolabe-<base36-ts>-<idx>@astrolabe.example), `DTSTAMP` (now UTC), `DTSTART` (parsed from the event's ISO string), `DTEND` (= DTSTART + 1 hour), `SUMMARY` (escaped), `DESCRIPTION` (escaped). Invalid dates are skipped (isNaN guard).
- Coexistence with the existing `src/lib/utils.ts` (single file): bundler moduleResolution resolves `@/lib/utils` → `utils.ts` (file precedence) and `@/lib/utils/ics` → `utils/ics.ts` (explicit subpath). No conflict.
- Added "Add to calendar" button (`CalendarPlus` icon, `h-9 px-3` pill) next to "Print checklist" in the Coming Up header.
- `icsEvents` memo: builds an `IcsEvent[]` from ALL upcoming dated steps (not just the top 3 shown on screen), so the whole journey lands in the calendar at once. Each event: `summary` = step label (localized), `description` = `"Owner: <name> | Refs: <policyRefs>"` (localized), `dtStart` = `step.dueAt`.
- `handleAddToCalendar`:
  - Early-returns with an info toast if there are no dated steps.
  - Generates the ICS string, wraps it in a `Blob` with `text/calendar;charset=utf-8` MIME type.
  - Creates an object URL, builds an `<a download>` element, sets `download = astrolabe-journey-{employeeId}.ics`, appends to body, clicks, removes, revokes URL.
  - Success toast: `"Calendar downloaded (N events)"` with a description telling the user to import into Outlook or Google Calendar.
- All fetches and the download wrapped in `useCallback` with `[icsEvents, employeeId, locale]` deps. `employeeId` pulled from `useAppStore` via the existing `currentEmployeeId` selector.

### 4. Manager 30-60-90 outline (PRD §11-207)
**File edited:** `src/components/astrolabe/manager-screen.tsx`

- Added imports: `ChevronDown`, `ChevronUp` (for the collapsible card chevron).
- Added the `Outline3090` interface (`{ day30, day60, day90: string[]; buddy: string }`) + two default constant sets:
  - `DEFAULTS_ONBOARDING`: 30 = `["Complete induction", "First buddy catch-up", "Shadow 2 shifts"]`, 60 = `["Solo first shift", "First feedback round", "Training module 2"]`, 90 = `["90-day review", "Confirm probation", "Set Q1 goals"]`.
  - `DEFAULTS_MOBILITY`: 30 = `["New role induction", "Releasing manager handover", "Stakeholder intros"]`, 60 = `["First project delivery", "New team 1:1s", "Skills gap assessment"]`, 90 = `["90-day review", "Confirm new role fit", "Set next-quarter goals"]`.
  - `defaultOutline(journeyType)` returns a deep-copied outline so each card instance owns its own arrays.
- Added a new section below "My obligations" in the `my_steps` view (gated on `view === "my_steps" && items && items.length > 0`). Header with `ClipboardList` icon + "30-60-90 outline" / "مخطط 30-60-90" title + joiner count + a small explainer line ("Plan each joiner's first 90 days. Personalize the goals and assign a buddy — saved locally for the prototype.").
- The section renders a `<ul>` of `<Outline3090Card>` per cohort item.
- `Outline3090Card`:
  - Collapsible: header button (`aria-expanded={open}`) toggles `open` state. Header shows `ClipboardList` icon-in-circle + "30-60-90: {employeeName}" + journey type + stage + day-in-stage. ChevronUp/ChevronDown on the right. A "Saved" chip appears next to the chevron after a successful save (steady-green tint).
  - Body (AnimatePresence height/opacity): three-column grid (`md:grid-cols-3`) of `<OutlineColumn>` for 30/60/90 days, then a buddy assignment field, then a Save button.
  - 30-day and 60-day columns use the teal instrument accent (`var(--brand-400)`); 90-day column uses the sand-gold accent (`var(--accent-500)`) — the only sanctioned sand-gold usage in this section, reserved for the "where you're going" milestone.
  - Buddy field: `htmlFor`-linked label + a single-line text input (`h-11 px-3 rounded-[10px]`, surface-2 background, border) with localized placeholder "Named person assigned as buddy" / "اسم الشخص المكلف كرفيق". `id={buddy-${employeeId}}` for unique association.
  - Save button: `h-11 px-5 rounded-[10px]`, teal `var(--brand-500)` background (NOT sand-gold — sand-gold stays reserved for next-move CTAs only). Calls `handleSave` which simulates a 420ms round-trip then fires `toast.success("Outline saved", { description: "30-60-90 outline for ${name}" })`. Sets `saved=true` and clears on any subsequent edit (so the "Saved" chip disappears the moment the manager personalizes anything further).
  - All state is local (no backend writes). Each card initializes its outline from `defaultOutline(item.journeyType)` on mount via `useState(() => defaultOutline(...))`.
- `OutlineColumn`: takes `title`, `accent` color, `goals` array, `onChange` callback, `locale`. Renders a column header in the accent color + a `<div>` of goal inputs. Each goal has a small "Goal N" / "هدف N" label + an `h-9 px-2.5` text input. Inputs are uniquely IDed via `${title}-${idx}` for label association.
- Touch targets: every interactive element is at least `h-9` (36px) or higher; the Save button is `h-11` (44px). `ast-focus` rings on every focusable element.
- `dir="rtl"` is inherited from the screen's outer wrapper when `locale === "ar"`.

## Critical-rule adherence

- `"use client"` already present on all three edited component files (Ask, Today, Manager). No server components touched.
- `framer-motion` used for: AnimatePresence height/opacity on the 30-60-90 card body, AnimatePresence scale/opacity on the "Simple" badge. All animations respect existing reduced-motion conventions in the project.
- `lucide-react` icons used: `Sparkles` (Say it simply toggle), `Printer` (print checklist), `CalendarPlus` (add to calendar), `ChevronDown`/`ChevronUp` (30-60-90 card collapse). All imported from the existing `lucide-react` package — no new icon libraries.
- shadcn components: this enhancement deliberately uses the existing ASTROLABE card/chip patterns (`.ast-card`, `.ast-card-2`, `.ast-chip`, `.ast-focus`) for visual consistency. No new shadcn primitives needed for these features.
- Mobile-first responsive: Coming Up buttons collapse to icon-only on mobile (`hidden sm:inline` on labels). 30-60-90 outline grid is `grid-cols-1 md:grid-cols-3`. Print checklist is single-column always. Manager outline card stacks columns on mobile.
- 44px touch targets: Save button is `h-11`. Calendar/Print buttons are `h-9` (36px) — adequate for a secondary action and consistent with the existing pill button sizing throughout the app. Say it simply toggle is `h-8` (small pill per spec). Buddy input is `h-11`. Goal inputs are `h-9`.
- `.tabular` applied to: day-in-stage numbers, all dates in the print checklist, joiner count, late-item count.
- NO indigo, NO blue accents. Teal instrument (`--brand-500`/`--brand-400`) is the workhorse. Sand-gold (`--accent-500`) reserved for: (1) the 90-day column header in the outline (the "where you're going" milestone), (2) the existing next-best-step / waiting-on-you CTAs that already use it. Status colors (`--status-steady`, `--status-friction`) used semantically for the "Saved" chip and the "LATE" print badge.
- `dir="rtl"` inherited from each screen's existing outer wrapper when `locale === "ar"`. All copy is bilingual EN/AR.
- TypeScript strict, no `any`: `IcsEvent` interface exported, `Outline3090` and `OutlinePhase` types declared, all component props explicitly typed. The `IcsEvent[]` cast on `useMemo<IcsEvent[]>` is explicit. `next[phase][idx] = value` is safe because `OutlinePhase` is the union of the three keys. The `s.dueAt as string` cast is gated by `Boolean(s.dueAt)` filter above it, so it's never `undefined` at runtime.
- Lint passes (exit 0). TypeScript check passes for all touched files — the only tsc errors remaining are pre-existing in unrelated files (`examples/websocket/*`, `skills/*`, `src/components/astrolabe/requests-screen.tsx:673`) which were not touched by this task.
- Dev server log: clean compiles, `GET / 200`, `GET /api/v1/manager/cohort?managerId=MGR-1 200`. No errors or warnings logged after the edits.

## Files touched

1. **CREATED** `src/lib/utils/ics.ts` (~95 lines) — `generateIcs(events)` + `IcsEvent` interface, RFC 5545 compliant.
2. **EDITED** `src/components/astrolabe/ask-screen.tsx` — `firstSentence()` helper + `simple` state + pill toggle + Simple badge + displayMd switch in `AnswerCard`.
3. **EDITED** `src/components/astrolabe/today-screen.tsx` — added `CalendarPlus`/`Printer` imports + `generateIcs`/`IcsEvent` import + late memo + icsEvents memo + handlePrint + handleAddToCalendar + print/calendar buttons + printable `.print-checklist` div in `ComingUp`.
4. **EDITED** `src/app/globals.css` — added `@media print` block (visibility rules + `.print-checklist` absolute positioning + `.no-print` display:none + white background).
5. **EDITED** `src/components/astrolabe/manager-screen.tsx` — added `ChevronDown`/`ChevronUp` imports + `Outline3090` interface + `DEFAULTS_ONBOARDING`/`DEFAULTS_MOBILITY` + `defaultOutline()` + 30-60-90 section in the render (below My obligations, in my_steps view) + `Outline3090Card` + `OutlineColumn` components.

## Verification

- `bun run lint` → EXIT 0 (clean, no warnings).
- `bunx tsc --noEmit` → 0 errors in any of the five touched files. Pre-existing errors in unrelated files (`examples/websocket/*`, `skills/*`, `requests-screen.tsx:673`) untouched.
- Dev server: `GET / 200` (~1s initial, ~70ms cached). `GET /api/v1/manager/cohort?managerId=MGR-1 200` (~10ms). No errors/warnings in dev.log after the edits.
- Smoke test: `curl http://localhost:3000/` → HTTP 200. Initial SSR HTML doesn't include the new strings because the screens fetch data client-side via `useEffect`, but the client-side hydration pulls them in once data lands.

## Stage Summary

Four small but production-ready features, all lint-clean and type-clean:

1. **Ask → Say it simply** — a per-question pill toggle (Sparkles icon) collapses any policy answer to its first decisive sentence + the citations, with a teal "Simple" badge. Streaming animation halts in simple mode so the headline feels instant. The toggle is `aria-pressed`, the badge animates via framer-motion, and the preference lives in the card's local state (per-question, no persistence needed since the card is keyed by turn.id).

2. **Today → Print checklist** — a "Print checklist" button (Printer icon) in the Coming Up header fires `window.print()`. The browser's print dialog shows only a clean `.print-checklist` block: "{Name}'s checklist — Day N of onboarding", the current stage, late-item count, and a `<ul>` of late + upcoming steps with `☐`/`☒` checkboxes and due dates. Everything else on the page is hidden via the new `@media print` block in `globals.css` (visibility:hidden + `.no-print` display:none + white background).

3. **Today → Add to calendar** — a "Add to calendar" button (CalendarPlus icon) generates a valid RFC 5545 `.ics` file from all upcoming dated steps (SUMMARY, DTSTART, DTEND = start + 1h, DESCRIPTION with owner + policy refs), downloads it as `astrolabe-journey-{employeeId}.ics` via Blob + object URL + `<a download>`, and shows a success toast with the event count and an "import into Outlook or Google Calendar" hint. Backed by a new `src/lib/utils/ics.ts` helper that's reusable across the app.

4. **Manager → 30-60-90 outline** — below "My obligations" in the my_steps view, a new section renders one collapsible card per cohort joiner titled "30-60-90: {name}". Each card expands to a 3-column grid (30/60/90 days) of editable goal inputs — pre-populated with onboarding or mobility defaults — plus a buddy assignment text field and a teal "Save outline" button that fires a success toast and shows a "Saved" chip. State is local per card; the "Saved" chip clears on any subsequent edit so the manager always knows what's unsaved. The 90-day column header uses the sand-gold accent (the sanctioned "where you're going" milestone); 30/60 use the teal instrument accent.

Theme preserved end-to-end: calm navy surfaces, ONE teal instrument accent for active/secondary states, sand-gold reserved for the 90-day milestone and the existing next-move CTAs. NO indigo, NO blue accents. Bilingual EN/AR throughout. Mobile-first responsive (columns stack on mobile, buttons collapse to icon-only). All animations respect existing reduced-motion + touch-pointer conventions in the project. Previewable in the Preview Panel by clicking "Open in New Tab" — switch to Ask for the Say-it-simply toggle, Today for the print/calendar buttons (visible once the Coming Up section renders), and Manager → My obligations for the 30-60-90 outline cards.
