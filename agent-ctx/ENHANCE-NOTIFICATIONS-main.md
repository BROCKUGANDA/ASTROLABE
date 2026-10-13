# ENHANCE-NOTIFICATIONS — Work Record

**Task ID:** ENHANCE-NOTIFICATIONS
**Agent:** Main (notifications feature)
**Status:** ✅ Complete

## What was built

A complete PRD §07 notifications/inbox feature for the ASTROLABE employee journey companion.

### Files created
1. `src/lib/notifications/store.ts` — shared in-memory state module (single source of truth for GET + POST routes). 8 base synthetic notifications for E-1042 (Maria Santos) with EN + AR copy, plain-language per PRD §28. Exports `getNotifications`, `markRead`, `snooze`, `archive`, `isKillSwitchOn`, `setKillSwitch`. All timestamps use synthetic NOW (2024-10-19T10:00:00Z).
2. `src/app/api/v1/notifications/route.ts` — GET endpoint. Returns `{ items, quietHours: { start: "22:00", end: "07:00", tz: "Asia/Dubai" }, killSwitch, digest: { enabled: true, scheduledAt: "08:00" } }` via `success()` envelope. Filters by `?employeeId=`.
3. `src/app/api/v1/notifications/action/route.ts` — POST endpoint. Body `{ id, action: "read"|"snooze"|"archive"|"kill_switch", hours?, enabled? }`. Returns `{ id, action, at: ISO }` (plus `enabled` for kill_switch). Uses synthetic NOW for `at`.
4. `src/components/astrolabe/notifications-bell.tsx` — `"use client"` bell + slide-in panel. framer-motion, lucide-react, shadcn Switch + DropdownMenu. Filter tabs, date-grouped list, priority dots, action buttons, snooze dropdown, archive, quiet-hours footer, red kill-switch toggle.

### Files edited
- `src/app/page.tsx` — added import + `<NotificationsBell />` in the header between the Command palette trigger and the Projector toggle.

## The 8 synthetic notifications (E-1042)
1. N-1042-01 — urgent · step_late · "Your laptop is 3 days late" → requests (createdAt -2h, unread)
2. N-1042-02 — normal · escalation · "Fatima in HR claimed your case" → me (createdAt -3h, unread)
3. N-1042-03 — normal · pulse_prompt · "Pulse check available — 2 questions, only if you want to" → today (createdAt -4h, unread)
4. N-1042-04 — normal · step_due · "Buddy assignment pending HR" → journey (createdAt -5h, unread)
5. N-1042-05 — low · digest · "Daily digest: 2 items need your attention" → today (createdAt -1h, unread)
6. N-1042-06 — normal · step_due · "Training booking opens once access is provisioned" → journey (createdAt -30h, unread, yesterday bucket)
7. N-1042-07 — normal · request_update · "Induction completed — well done" (createdAt -26h, read at -25h, yesterday bucket)
8. N-1042-08 — low · system · "Welcome to ASTROLABE — your journey companion" (createdAt -240h, read, archived, earlier bucket)

## Theme compliance (CRITICAL)
- NO indigo, NO blue accents.
- Sand-gold (`--accent-500`) used in exactly TWO sanctioned places:
  1. The bell's unread count badge (it IS the "you have a next move" prompt)
  2. The per-notification primary action button (the literal "your next move" CTA)
- Per-notification priority dots use red/teal/gray (NOT sand-gold) to keep the reserved accent un-diluted:
  - urgent → `--status-friction` (red)
  - normal → `--brand-500` (teal instrument)
  - low → `--text-lo` (gray)
- Teal instrument accent is the workhorse for active states, unread rails, bell halo, filter active tab.

## Verification
- `bunx eslint` on all 5 files → EXIT 0
- `bunx tsc --noEmit` → 0 errors in new files
- `bun run lint` (full project) → EXIT 0
- Dev server: `GET /api/v1/notifications?employeeId=E-1042 200`, `POST /api/v1/notifications/action 200` (read / snooze / kill_switch on+off smoke-tested via curl)
- Synthetic NOW confirmed in all `at` timestamps
- Kill switch reset to `false` after smoke test

## Preview
Click the bell icon in the header (between the ⌘K command palette trigger and the projector toggle). The slide-in panel opens with 8 notifications grouped by Today / Yesterday / Earlier. Filter tabs switch between All / Unread / Urgent / Archived. Each actionable card has a sand-gold CTA + snooze dropdown + archive. Footer shows quiet hours + red kill-switch toggle. Switch to Arabic via the AR/EN toggle in the header — the panel flips to RTL with Arabic copy.
