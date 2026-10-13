# ENHANCE-SERVICEOWNER-DPIA-PILOT — Main agent work record

## Task summary
Three new features for ASTROLABE (Next.js 16 + TS, single `/` route):
1. **Service owner intake console** (PRD §11) — 6th role, queue + structured needs-more-info.
2. **DPIA + retention schedule page** (PRD §15) — modal from Me screen's Privacy summary link.
3. **Pilot plan page** (PRD §25) — modal from Admin screen's Pilot plan button.

## Files created / edited
- CREATE `src/components/astrolabe/service-owner-screen.tsx` (~830 lines)
- CREATE `src/components/astrolabe/privacy-page.tsx` (~370 lines)
- CREATE `src/components/astrolabe/pilot-plan-page.tsx` (~340 lines)
- EDIT `src/lib/store/app-store.ts` — added `"service_owner"` to Role type
- EDIT `src/app/page.tsx` — added 6th role + Service owner render branch + command-palette entry
- EDIT `src/components/astrolabe/me-screen.tsx` — wired Privacy summary link to open privacy modal
- EDIT `src/components/astrolabe/admin-screen.tsx` — added Pilot plan button + modal in header
- EDIT `src/lib/data/pack.ts` — seeded SR-2024-099 (E-1045, it_kit, IT, submitted) so the Acknowledge flow is demonstrable

## Key design decisions
- **Structured needs-more-info, NOT free-text email**: `STANDARD_QUESTIONS` map with 3-4 standard questions per request type (8 types × 3-4 questions = ~28 standard questions). The dialog has a `Select` dropdown of standard questions + ONE clearly-labeled free-text "additional detail" field. This is the only free-text part. The transition is `in_progress → returned`, bumps `returnCount`, and toasts "Employee notified: We need one more detail — check your Requests tab".
- **Zero-clarification rate metric**: computed live from `returnCount` per request (returnCount === 0 means no clarification round-trip was needed). Color shifts from sand-gold (when <100%) to steady-green (when 100%) — this is the PRD §11 key success metric.
- **Payload view**: built from `INTAKE_SCHEMAS[type].fields` + `Employee` row using `prefillFrom` hints to mark prefilled values. Required fields get a sand-gold "required" chip, prefilled fields get a teal "prefilled" chip. Auto-attached context chips + policy-ref CitationChip + named assignee chip all visible in the expanded view.
- **React-hooks lint rule `react-hooks/set-state-in-effect`**: refactored dialog form bodies into separate `NeedsMoreInfoForm` / `ResolveForm` components that mount fresh inside `{open && request && (...)}` conditionals. Radix Dialog unmounts content on close, so state resets naturally — no `useEffect` needed.
- **Sand-gold reservation honored**: sand-gold appears only on (a) the Non-use statement box on the privacy page, (b) the Exit criteria box on the pilot plan page, (c) "required" field badges in the payload view, (d) the Zero-clarification rate when not at 100%, (e) Median time-to-resolve stat. All sanctioned "your next move / this is the line you do not cross" surfaces per theme.
- **No new packages**: only `framer-motion`, `lucide-react`, `date-fns`, shadcn `Dialog/Select/Textarea/Label/Table` — all already in the stack.

## Verification
- `bun run lint` → EXIT 0 (clean).
- `bunx tsc --noEmit` → 0 errors in any touched file (only pre-existing errors in untouched examples/skills/requests-screen).
- agent-browser QA: confirmed Service owner screen renders with 2 IT requests + Acknowledge button on submitted SR-2024-099 + View payload expansion showing full intake fields + CitationChip; Privacy modal opens from Me → Privacy summary link with all 6 sections (summary, non-use, DPIA, retention, data owners, rights); Pilot plan modal opens from Admin header button with all 7 sections (overview, timeline, owners matrix, success metrics, rollback, kill switch, exit criteria); Arabic locale renders RTL with all AR labels.
- Smoke tests: `GET /api/v1/requests` returns 4 items; `POST /api/v1/requests/SR-2024-099/transition` with `to: acknowledged` returns 200 with `transition: { from: "submitted", to: "acknowledged" }`; illegal transitions correctly rejected with 409 E_CONFLICT.
- Dev server: clean compiles, no Fast Refresh runtime errors.
