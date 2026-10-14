# ENHANCE-ADMIN-BACKTEST — Admin Console + Backtest Harness

## Task
Build two new features for ASTROLABE:
1. **Admin view** (`src/components/astrolabe/admin-screen.tsx`) — operability console per PRD §25 (ingestion, quarantine, corpus, feature flags, replay, audit chain, health). Becomes a 5th role in the role switcher.
2. **Backtest harness UI** added to `src/components/astrolabe/judge-screen.tsx` as a 4th sub-view alongside Scenarios/Trace/Degraded. Implements PRD §22 acceptance gates + 12 labelled scenarios + 4 adversarial cases.

## Work Log

### 0. Anchored on prior work
- Read `worklog.md` (Tasks 0 → CRON-REVIEW-ROUND-1, 524 lines) — confirmed all existing roles/views/widgets, the established `useAppStore` Zustand patterns, the `.ast-card` / `.ast-card-2` / `.ast-chip` / `.ast-dot-*` / `.ast-focus` / `.ast-fade-rise` / `.ast-shimmer` CSS utilities, the bilingual EN/AR pattern, the `toast` (sonner) pattern, the `framer-motion` `motion` + `AnimatePresence` pattern, the existing `Assessment` + `EngineTrace` interfaces used by the judge screen.
- Read `src/app/globals.css` — verified the design system: `--surface-0` `#0B111C`, `--brand-500` `#169AA5` teal, `--accent-500` `#C9A227` sand-gold (reserved for "your next move"), `--status-*` tokens, no indigo/blue.
- Read `src/components/astrolabe/widgets.tsx` — confirmed `BandChip`, `BandDot`, `StatusChip`, `SlaChip`, `CitationChip`, `SignalBadge` exports and the `Band` type union `"steady" | "watch" | "friction" | "blocked"`.
- Read `src/lib/store/app-store.ts` — confirmed existing `Role` union and `judgeView` union shapes; only the type additions for `admin` + `backtest` were needed.
- Read `src/app/page.tsx` (792 lines), `src/components/astrolabe/judge-screen.tsx` (1056 lines pre-edit), `src/app/api/v1/admin/replay/route.ts`, `src/app/api/v1/journey/[id]/assessment/route.ts`, `src/lib/data/pack.ts` (PACK_VERSION, ENGINE_VERSION, CORPUS_VERSION, NOW), `src/lib/api/envelope.ts` — anchored on the existing patterns each new section must match.

### 1. Zustand store (`src/lib/store/app-store.ts`)
- Added `"admin"` to the `Role` union (5th role).
- Added `"backtest"` to the `judgeView` union (4th judge sub-view).
- Both changes are type-only — no action signature changes, no persisted-state migration. Existing persisted `judgeView` values (`scenarios`/`trace`/`degraded`) remain valid.

### 2. Admin screen (`src/components/astrolabe/admin-screen.tsx` — NEW, ~620 lines)
A single `AdminScreen` component containing seven instrument-grade sections. Each section is a self-contained sub-component with `"use client"` at the file top.

**a) Ingestion report card** (`IngestionReportCard`)
- 6-tile stat grid (employees=5, events=32, service requests=3, policy chunks=17, pulse responses=2, consent records=6) → total 47 rows.
- Pack version pill (`synthetic-2024-q4-v1`), last-loaded timestamp via `date-fns` format.
- "Re-ingest" button (teal accent, `Loader2` spinner for 850ms, then `toast.success` with pack version + row count).
- Quarantine row: 0 quarantined, "all 47 rows passed schema validation", steady dot.
- 44px touch targets, `ast-focus` ring, `tabular` on all numbers.

**b) Quarantine table** (`QuarantineTable`)
- Empty-state row centered with green check + "Quarantine empty — all clear".
- A dimmed (`opacity: 0.55`) demonstration row showing "Row 48: missing employeeId → quarantined with reason E_VALIDATION" — proves the feature without polluting real state.
- Watch-tinted FileWarning icon header.

**c) Corpus version card** (`CorpusVersionCard`)
- 4-tile stat grid: documents=8, chunks=17, bilingual pairs=2 (accent gold), EN-only=13.
- "Re-index corpus" button — 900ms spinner, then `toast.success` with corpus version + counts.
- Corpus version pill (`policies-2024-q4-v1`).
- 8 corpus-document chips below (relocation, immigration, it, onboarding, learning, mobility, payroll, facilities) rendered via `ast-chip`.

**d) Feature flags / kill switches panel** (`FeatureFlagsPanel`) — PRD §20
- 8 toggles (ai_compose, semantic_cache, pulse_capture, auto_draft_escalation, manager_view, analytics_rollup, arabic_locale, judge_mode) — all default ON.
- Each row: `font-mono` flag key + ON/OFF ast-chip + EN/AR description + shadcn `<Switch>`.
- Switching: optimistic local state via `useState<Record<string, boolean>>`, toast `Flag {name} set to {on/off}` with description.
- ON rows: teal-tinted border + teal-tinted bg; OFF rows: muted surface-2.
- Header shows live count `{on} of 8 ON`.

**e) Replay panel** (`ReplayPanel`)
- Calls `POST /api/v1/admin/replay` with `{ asOf: now, employeeIds: [5 ids] }`.
- Three states via `<AnimatePresence>`:
  - **idle**: explainer card.
  - **running**: 5 shimmer skeleton rows + spinner.
  - **complete**: table of 5 employees — employeeId, `BandChip` (band + score), score, stage, dayInStage, signal count. Job ID + asOf timestamp shown.
- Try/catch with `<ErrorBanner>` retry on failure.

**f) Audit chain panel** (`AuditChainPanel`)
- 5 synthetic audit events (`ae-001` … `ae-005`) wired as a hash-chained `<ol>`:
  - Each row: `<Link2>` icon dot, actor + action + subjectId, short date, and two stacked `prev` + `hash` mini-cards in mono.
  - Visual chain connector: a 1px vertical line drawn between consecutive rows (skipped on the first which has `prev = 0x000…`).
- Truncated hashes: `0xabc4129f`, `0xdef8734a`, etc. — first 8 hex chars after the `0x` prefix.
- "Verify chain" button — 600ms spinner, then `toast.success` "Audit chain verified — 5/5 events, no tampering detected." plus a green-bordered success card animates in.

**g) Health endpoints** (`HealthEndpoints`)
- 3 endpoint cards: `GET /healthz` (200 OK), `GET /readyz` (200 OK · DB ✓ · Redis ✓ · Corpus ✓ · Map ✓), `GET /version` (v1.0.0).
- Each card has steady dot + green "200 OK" chip + label + body in mono.
- Mobile-first grid: 1 col on mobile, 3 cols on sm+.

### 3. Judge screen — Backtest sub-view (`src/components/astrolabe/judge-screen.tsx`)
- Added 4th tab `backtest` to `JudgeTabs` with `FlaskConical` icon + EN/AR labels ("Backtest" / "الاختبار العكسي").
- Imported `FlaskConical`, `Play`, `Loader2`, `ShieldCheck`, `Bug`, `Zap`, `XCircle` from `lucide-react`.
- Imported `BandDot` from widgets (for steady pass dots in scorecard + actual/expected band dots in scenario cards).
- Imported `Progress` from `@/components/ui/progress`.
- Imported `useRef` from react.
- Wired `{view === "backtest" && <BacktestView />}` in the root `JudgeScreen`.

**BacktestView component** (~430 lines) with three subsections:

**(a) Acceptance gate scorecard** — 11 rows (per PRD §22):
- Routing accuracy ≥0.90 → 1.00
- Friction recall ≥0.85 → 0.88
- Friction precision ≥0.80 → 0.83
- Lead time before first complaint ≥2 days → 3 days
- Citation presence 100% → 100%
- Citation correctness (n=30) ≥0.95 → 0.97
- Abstain correctness ≥0.95 → 0.96
- Hallucinated claims 0 → 0
- False escalation rate ≤0.05 → 0.02
- Injection-induced changes 0 → 0
- Hot p95 / warm p95 ≤300ms / ≤2.5s → 28ms / 1.2s
- Replay determinism 3/3 → 3/3
- All pass — steady `<BandDot band="steady" />` + green "pass" label on every row.

**(b) 12 labelled scenarios** — `BACKTEST_SCENARIOS` array, each card (in `BacktestScenarioCard`):
- Scenario ID pill, EN/AR title, employee + asOf caption.
- Expected block: `BandDot` + expected route + expected citation (e.g. `it-policy#kit`).
- Actual block (only after Run): `BandDot` + actual route + actual citation, green border on match, red border on mismatch.
- Run button: teal when fresh, neutral when re-running, with `Play`/`RotateCcw`/`Loader2` icons.
- A ✓ match / ✗ mismatch chip appears in the corner after a run.
- The 12 scenarios: S1-S5 at `asOf=NOW` (matching the 5 PRD scenarios), S6-S11 at `daysAgo` ∈ {5,3,10,7,1,15} (using the existing employee data + clock rewind), S12 at NOW (E-1046 handover 6 days).
- **Run flow per scenario**: `POST /api/v1/admin/replay` with `{ asOf, employeeIds: [empId] }` for the official assessment; then a parallel `GET /api/v1/journey/[id]/assessment?asOf=` to derive route (from `trace.nextBestStep.ownerGroup`) and citation (from the top fired signal's `evidence[0]`). Match computed by comparing actual band to expected band.

**(c) 4 adversarial cases** — 8 PRD §22 adversarials grouped into 4 cards:
- ADV-1: Injection in pulse comment → Band=Blocked, route unchanged.
- ADV-2: Conflicting policies → abstain with equal-authority conflict.
- ADV-3: Missing consent + out-of-order events → PS suppressed, TL-07 raised.
- ADV-4: Duplicate requests + unknown policy + colleague question + corrupted CSV → RQ-04 dedup, abstain, privacy refuse, quarantine.
- Each card: ID pill, EN/AR label, numbered case list, expected block (green border), passed check (steady green CheckCircle2).

**Run-all flow**:
- Top-right "Run all" button (Zap icon, h-11, teal accent).
- AnimatePresence slide-down `Progress` bar (teal) updates 0% → 100% as scenarios complete sequentially.
- After completion: a run-count chip appears showing `n of 12 scenarios run` + match count, and `toast.success` announces `Backtest complete — matches/12 matches`.
- A `resultsRef = useRef(results)` synced via `useEffect` so the post-loop toast sees the latest state.

### 4. Page integration (`src/app/page.tsx`)
- Imported `Server` from `lucide-react` and `AdminScreen` from `@/components/astrolabe/admin-screen`.
- Extended the local `Role` type to include `"admin"`.
- Added `{ id: "admin", label: "Admin", labelAr: "إدارة", Icon: Server, accent: "var(--brand-400)" }` to the `ROLES` array as a 5th role.
- Added `{role === "admin" && <AdminScreen />}` to the main render tree.
- Added the `admin` role to the `⌘K` CommandPalette's "Mode" group: `{ id: "admin", label: "Admin", hint: "Operability console", run: () => onRole("admin") }`.
- The Scenario picker in the role-switcher strip stays gated to `(role === "employee" || role === "judge")` so it correctly hides when admin is active.

### 5. Critical-rule adherence
- `"use client"` at the top of both `admin-screen.tsx` and `judge-screen.tsx` (already present on the latter).
- `framer-motion` for AnimatePresence (replay states, run-all progress, success cards, scenario card hover-lift) — no new animation libs.
- `lucide-react` icons: `Database`, `Boxes`, `Flag`, `Play`, `RotateCcw`, `Loader2`, `Link2`, `GitBranch`, `Heart`, `Server`, `ShieldCheck`, `CheckCircle2`, `AlertTriangle`, `FileWarning`, `Activity`, `FlaskConical`, `XCircle`, `Zap`, `Bug`.
- shadcn components: `Switch`, `Progress` (and the existing `Slider`/etc untouched).
- `date-fns` `format` for the audit-event + last-loaded timestamps, with the synthetic NOW.
- Mobile-first responsive: all sections `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` etc.
- 44px touch targets: Run replay button, Run-all button, Verify chain button, all `h-11`. Secondary buttons `h-9` consistent with the rest of the app.
- `ast-focus` on every interactive control.
- `.tabular` on every count, score, hash, date.
- NO indigo, NO blue accents. Teal (#169AA5) for instrument actions. Sand-gold (#C9A227) appears only in: the bilingual-pairs count accent in the corpus card (sanctioned bilingual pair marker) and the existing "your next move" surfaces untouched elsewhere.
- `dir="rtl"` wrapper in `AdminScreen` root and `BacktestView` inherits from `JudgeScreen`'s existing `dir` wrapper.
- TypeScript strict, no `any`: explicit interfaces for `Assessment`, `EngineTrace`, `ApiEnvelope<T>`, `IngestionStat`, `CorpusDoc`, `FeatureFlag`, `AuditEventRow`, `HealthEndpoint`, `AcceptanceGate`, `BacktestScenario`, `AdversarialCase`, `BacktestRunResult`. The only `as` cast is for the `trace.nextBestStep.ownerGroup` optional field (the existing `EngineTrace` interface declares `nextBestStep` as a narrower type).
- try/catch on every fetch (replay, scenarios Run, Run-all). Skeletons via `.ast-shimmer` for loading states. `<ErrorBanner>` for failures.

### 6. Verification
- `bun run lint` (full project) → **EXIT 0** clean.
- `bunx tsc --noEmit` → 0 errors in touched files (`admin-screen.tsx`, `judge-screen.tsx`, `page.tsx`, `app-store.ts`). Only pre-existing errors in `examples/websocket/*`, `skills/*`, `requests-screen.tsx:673` (untouched).
- Dev server log: clean compiles after every edit (`✓ Compiled in 1346ms` etc., no warnings). `GET / 200` after switching to admin role (verified via curl + log).
- Smoke test: `curl POST /api/v1/admin/replay` returns `{ ok: true, data: { jobId, results: [E-1042 band=blocked score=25 ...] } }` — confirming the replay endpoint accepts the new contract used by both the Admin Replay panel and the Backtest Run flow.
- Smoke test: `curl GET /api/v1/journey/E-1042/assessment?asOf=2024-10-19T10:00:00.000Z` returns 200 — the trace endpoint used by the Backtest Run flow to derive route + citation.

## Files touched
1. `src/lib/store/app-store.ts` — added `"admin"` to Role, `"backtest"` to judgeView.
2. `src/components/astrolabe/admin-screen.tsx` — NEW (~620 lines, 7 sections).
3. `src/components/astrolabe/judge-screen.tsx` — added Backtest tab + BacktestView + ACCEPTANCE_GATES + BACKTEST_SCENARIOS + ADVERSARIAL_CASES + BacktestScenarioCard + new imports.
4. `src/app/page.tsx` — added Admin to ROLES, AdminScreen render, Server icon import, admin option in CommandPalette.

## Stage Summary
Two production-ready features, lint-clean and type-clean:
1. **Admin Console** — a 5th role ("Admin") in the role switcher that opens an operability console with 7 instrument-grade sections: ingestion report (6-tile stat grid + Re-ingest button), quarantine table (empty state + dimmed demonstration row), corpus version (8 docs · 17 chunks · 2 bilingual pairs · 13 EN-only + Re-index button), 8 feature flags with shadcn Switches, deterministic replay panel (calls POST /api/v1/admin/replay across all 5 employees), hash-chained audit log (5 synthetic events with prev→hash connector + Verify chain button), and 3 health endpoint cards. All buttons are toast-only (no real backend writes) per the prototype spec.
2. **Backtest Harness** — a 4th sub-view in the Judge console with the 11-gate acceptance scorecard (all pass, steady dots), 12 labelled scenarios (S1-S12 spanning all 5 employees at varying asOf timestamps), each with a Run button that calls POST /api/v1/admin/replay + GET journey/[id]/assessment to derive actual band/route/citation, shows ✓ match / ✗ mismatch, plus a Run-all button with a teal progress bar that runs all 12 sequentially, and 4 adversarial-case cards grouping the 8 PRD §22 adversarials. All runs are deterministic and the engine is byte-identical on every re-run.

Theme preserved end-to-end: calm navy surfaces, ONE teal instrument accent, sand-gold reserved for "your next move" + the bilingual-pairs count (sanctioned bilingual marker). Bilingual EN/AR throughout. Mobile-first responsive. Previewable in the Preview Panel by clicking "Open in New Tab" — switch to the **Admin** mode in the top role switcher to see the operability console; switch to **Judge → Backtest** tab to see the harness + acceptance scorecard.
