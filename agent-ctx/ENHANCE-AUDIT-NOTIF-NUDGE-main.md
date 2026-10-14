# ENHANCE-AUDIT-NOTIF-NUDGE — Work Record

**Task ID:** ENHANCE-AUDIT-NOTIF-NUDGE
**Agent:** Main (fullstack enhancement)
**Status:** ✅ Complete

## What was built

Three companion features completing the prior worklog's "Priority
recommendations for next phase" (#3, #4, #5). Each feature ships on the
existing role screen — no new routes; everything renders on `/`.

### 1. Audit chain tamper test UI + enhanced viz (PRD §23-451)
**File:** `src/components/astrolabe/admin-screen.tsx` (AuditChainPanel rewritten)

- **Tamper simulation modal** (`Dialog` based) with four selectable
  tamper types — each applied as an immutable re-stamp of the chain:
  - **Alter a hash** — rewrites `ae-003.prevHash` → `0xFAKE…` so the link
    at ae-003 breaks. Matches the spec's exact verification message
    ("Expected prev: 0xdef…, found: 0xFAKE…, last verified: ae-002").
  - **Delete an event** — splices `ae-002` out so `ae-003`'s prevHash
    no longer links to the prior event (`ae-001`).
  - **Reorder events** — swaps `ae-002` ↔ `ae-003`; both become orphans
    in the new ordering.
  - **Inject a fake event** — inserts `ae-fake` between `ae-002` and
    `ae-003` with `hash = 0xDEADBEEF…` and `prevHash = 0xWRONGPREV…`.
- **Verify chain** walks the chain and returns a `VerifyResult` with
  `ok`, `verifiedCount`, `tamperedEventId`, `expectedPrev`,
  `foundPrev`, `lastVerifiedId`. The result banner is teal-steady on
  clean ("Audit chain verified — 5/5 events, no tampering detected.")
  or red-friction on tamper ("⚠ TAMPER DETECTED — Event ae-003 has a
  broken hash link. Expected prev: …, found: …, Last verified event:
  ae-002.").
- **Reset chain** restores the original AUDIT_EVENTS snapshot.
- **Regenerate hashes** toast-only (prototype-only re-stamp).
- **Enhanced vertical timeline** (replaces the old list-of-rows):
  - Continuous spine line (red when tampered).
  - Each event is a card with hash node on the spine + connector segment
    above each node (red + glow when broken).
  - Color coding by action family:
    - system actions (ingestion / assess / escalation) → teal `--brand-400`
    - human actions (read_record / consent) → sand-gold `--accent-500`
    - tampered events → red `--status-friction` with `AlertOctagon` glyph
      + `ast-pulse-ring`-style shadow + red border on the card.
  - Truncated mono hash string `0xabc412…2c1b` (first 8 chars + `…` +
    last 4) for both `prev` and `hash` boxes.
  - "TAMPERED" uppercase chip on affected events.
  - **Copy hash** button per event (`navigator.clipboard.writeText`
    wrapped in try/catch; shows green `Check` for 1.4s + toast).
  - Broken-link glyph (`XCircle`) appears next to the `prev` box when
    the segment above is broken.
- **Color legend** row (System / Human / Tampered) above the timeline.
- Bilingual EN + AR copy throughout (titles, button labels, modal
  description, result messages, toast text).

### 2. Service-owner notification preferences (PRD §07-127)
**File:** `src/components/astrolabe/service-owner-screen.tsx**
(new `NotificationPreferencesPanel` component + renders below the
SLA dashboard).

- **Header:** "How you want to be notified" + plain-language explainer
  ("Choose your channel per category. We'll never spam — only when
  something needs you.").
- **Mute-all kill switch** (BellOff icon, red-tinted) — independent of
  the admin global kill-switch; toast warns
  "All notifications muted. You'll see nothing until you unmute.".
  While muted, the matrix rows dim to 50% opacity and all checkboxes
  disable; a red inline banner explains the state.
- **Matrix table** (categories × channels) with shadcn `Checkbox` cells:
  - Rows (categories): New ticket assigned | Ticket returned to you |
    SLA breach | Daily digest | Weekly digest | Escalation about your
    queue — each with a category glyph.
  - Columns (channels): In-app | Email | Push — each with a channel
    glyph (AppWindow / Mail / Smartphone).
  - 11×11 checkbox hit area (44px touch target, `ast-focus` ring).
  - Default state exactly per spec (in_app / email / push flags).
  - Teal instrument accent on checked state (NOT indigo/blue).
- **Quiet hours** sub-section (teal-tinted `ast-card-2`):
  - shadcn `Switch` "Enable quiet hours" (default on).
  - Time inputs: "From 22:00" "To 07:00" (`<Input type="time">`).
  - Timezone: read-only `<Input>` showing "Asia/Dubai" (auto-detected,
    no edit).
  - Plain-language line: "From 22:00 to 07:00 (Asia/Dubai) — no push
    or email will arrive. In-app messages still land; you'll see them
    when you open the app."
- **Save preferences** button (teal, h-11, 44px touch) → toast
  "Notification preferences saved" + bilingual description.
- Footer micro-copy notes the per-owner vs admin kill-switch separation.

### 3. Manager nudge for own late steps (PRD §11-205)
**File:** `src/components/astrolabe/manager-screen.tsx`

Plus supporting API change in
`src/app/api/v1/manager/cohort/route.ts` — `ownedSteps[]` now also
returns `breachLevel: "none" | "due_soon" | "breached" | "hard"`. This
stays within the schema-boundary (still no sentiment/pulse/friction per
person) — it just lets the manager surface detect SLA-breach lateness
without re-running the engine client-side.

- **Late-step nudge banner** (`LateStepsBanner`) — renders at the top
  of "My obligations" view whenever ≥1 owned step is late.
  - Sand-gold accent rule + sand-gold border = "your next move" trigger
    (the only sand-gold surface on the manager screen).
  - BellRing icon + title "{N} step(s) are waiting on you" + plain
    subtitle: "Your joiners can't move forward until these are done.
    The earlier you act, the less downstream friction."
  - List of late steps: step label + employee name + either
    "was due Thursday 17 Oct · 1 day late" (when dueAt is past) OR
    "SLA breached" (when dueAt is in the future but breachLevel
    breached/hard — handles the engine's calendar-vs-wall-clock
    difference for longer SLAs).
  - **Nudge me daily** button (sand-gold) → toast
    "Daily nudge scheduled. We'll remind you every morning until these
    are done."
  - **Snooze for today** button (neutral) → toast
    "Snoozed until tomorrow 09:00. We'll remind you then." + prepends
    a "snoozed" entry to the live nudge history.
- **Per-step nudge** (`ObligationRow`):
  - Each owned step that's late gets a sand-gold BellRing button next
    to its status chip.
  - Clicking opens a `DropdownMenu`:
    "Remind me in 1 hour / 4 hours / tomorrow / Never" (with
    `AlarmClock` / `AlarmClock` / `Clock3` / `BellOff` glyphs).
    - Selecting 1h / 4h / tomorrow → toast
      "Nudge scheduled — {step} · {employee} · in 1 hour".
    - Selecting "Never" → toast
      "We won't nudge you about this step" + prepends an "ignored"
      entry to the history.
  - Late steps also get a red border + AlertTriangle glyph to visually
    distinguish them from "waiting on owner but not yet late" steps.
- **Nudge history** (`NudgeHistory`) — collapsible `Collapsible` panel
  at the bottom of "My obligations" view:
  - Last 5 nudges (seeded with 5 synthetic entries — buddy assignment /
    HR induction confirmation / probation check-in / visa support letter
    / workstation readiness across the MGR-1 cohort: Daniel Okonkwo,
    Sara Kovač, James Park, Maria Santos).
  - Each entry: date (`d MMM · HH:mm` tabular), step label, employee
    name, and an `ActionChip` (Resolved = steady-green CheckCircle2 /
    Snoozed = amber Clock3 / Ignored = gray X).
  - Two-bar chart (`BarRow`) showing "Nudges sent" (teal) vs "Steps
    resolved after nudge" (steady-green), animated widths on
    framer-motion.
  - Footer line: "X snoozed · Y ignored · Z% success" (success rate
    computed live from history; >0 → steady-green).
  - Numbers update live as the manager snoozes / nudges — the bar chart
    grows in real time.
- **Late detection helper** (`isStepLate`) honors the spec's OR:
  `(status=waiting_owner AND dueAt < NOW) OR breachLevel=breached/hard`.
  This means SLA-breached in_progress steps (e.g., E-1046's
  `mb_release_handover`) also surface as late — verified against the
  live cohort API output.

## Theme compliance (CRITICAL)
- NO indigo, NO blue. All accents are teal `--brand-400` (instrument),
  sand-gold `--accent-500` (reserved for "your next move"), red
  `--status-friction` (tamper / late), steady-green `--status-steady`
  (resolved).
- Sand-gold appears only in sanctioned places:
  1. Audit chain → human-action nodes (read_record / consent).
  2. Manager nudge banner + per-step nudge button + late-step BellRing
     glyph + "Nudge me daily" CTA.
  3. Late-step border accent + ObligationRow sand-gold for waiting_owner
     (unchanged from prior styling).
- Tampered events / broken links / late steps use red `--status-friction`
  with glow shadow — never sand-gold.
- `ast-card`, `ast-card-2`, `ast-brass`, `ast-focus`, `ast-fade-rise`,
  `ast-shimmer`, `ast-dot-steady/-watch/-friction/-blocked` utilities
  used throughout. `.tabular` on every count + date + hash.
- Existing widgets (`StatusChip`) reused; no custom chips invented.

## Verification
- `bun run lint` → EXIT 0 (clean across the full project)
- `bunx tsc --noEmit` → 0 errors in:
  - `src/components/astrolabe/admin-screen.tsx`
  - `src/components/astrolabe/service-owner-screen.tsx`
  - `src/components/astrolabe/manager-screen.tsx`
  - `src/app/api/v1/manager/cohort/route.ts`
  (The only remaining tsc errors are pre-existing issues in
  `examples/websocket/*`, `skills/image-edit/*`, `skills/stock-analysis-skill/*`,
  and `node_modules/z-ai-web-dev-sdk` — none touched by this task.)
- Dev server (per `dev.log`) recompiled successfully after every edit —
  multiple `✓ Compiled in Nms` lines, no errors or warnings logged.
- One fixed import error mid-build: `lucide-react` had no `Snooze`
  export — swapped to `AlarmClockOff` (banner snooze button) and
  `Clock3` (ActionChip snoozed glyph); re-verified clean.

## Accessibility
- All interactive controls are ≥44px touch target (`h-11` / `w-11` /
  `h-9 px-3.5`).
- `ast-focus` rings on every button / checkbox / switch.
- `role="status"` + `aria-live="polite"` on the late-step banner and
  the audit verification result.
- `role="grid"` + `aria-label` on the notification matrix table.
- `sr-only` labels wrapping each matrix checkbox (category · channel
  pair).
- `aria-expanded` / `aria-controls` on the Nudge History collapsible.
- `aria-label` on every icon-only button (copy hash, per-step nudge,
  mute all, regenerate hashes).
- `dir="rtl"` honored on all three role screens via the existing
  `dir={dir}` wrapper; Arabic copy provided for every visible string.
- `tabular` class on all numeric/date/hash spans for monospaced
  alignment.

## Files edited (3 screens + 1 API)
1. `src/components/astrolabe/admin-screen.tsx` — tamper test UI +
   enhanced vertical-timeline visualization for the audit chain.
2. `src/components/astrolabe/service-owner-screen.tsx` — notification
   preferences panel rendered below the SLA dashboard.
3. `src/components/astrolabe/manager-screen.tsx` — late-step nudge
   banner + per-step nudge dropdown + collapsible nudge history with
   live-updating bar chart.
4. `src/app/api/v1/manager/cohort/route.ts` — added `breachLevel` to
   each `ownedSteps[]` entry (one-line schema extension; no
   privacy-boundary change).

## Preview paths
- **Admin → Operability console** → scroll to "Audit chain" section.
  Click "Simulate tamper event" → pick a tamper type → click
  "Verify chain" to see the broken-link detection. Then "Reset chain".
- **Service owner → IT (or any group)** → scroll below the SLA
  dashboard to the "How you want to be notified" panel. Toggle cells,
  mute all, adjust quiet hours, save.
- **Manager → My obligations** tab → late-step banner appears at top
  (MGR-1 has at least one late step: E-1046's `mb_release_handover` is
  breach-level `breached`); per-step nudge BellRing button on the late
  row; collapsible "Nudge history" panel at the bottom with bar chart.

## Unresolved issues / risks
- The `regenerate hashes` button is toast-only (no real re-stamp); this
  matches the prototype-only nature of the audit chain (per the
  existing `AUDIT_EVENTS` synthetic constant).
- Nudge history is in-memory React state (no backend persistence);
  acceptable for the prototype.
- The "Mute all" on the service-owner screen is per-owner (in-memory
  state), distinct from the existing admin global kill-switch — matches
  the spec wording.
