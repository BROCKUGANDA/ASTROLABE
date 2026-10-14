# PRD-CHECKLIST-VERIFY — Main agent

## Task
Verify and document the PRD §29 50-item checklist (items 01–25 functionality, 26–50 production). Audit each item, fix gaps, create the checklist endpoint at `src/app/api/v1/admin/checklist/route.ts`, and add a Production-readiness card to the Admin screen.

## What this agent did

### 1. Quick fixes (the 8 items explicitly called out in the task)

| Item | What I did | File(s) |
| --- | --- | --- |
| 04 — SLA clock pauses visibly | Added a `waitingOnEmployeeLabel` prop to `EmptyLateState`. When a step is `waiting_employee`, the today-screen now renders "Nothing is late — this one is waiting on your {step}." with an Hourglass icon + "SLA clock paused" tag (sand-gold `--accent-500`, reserved for next-move). Bilingual EN/AR. | `src/components/astrolabe/today-screen.tsx` |
| 15 — Request status is derived | Documented (a) at the state-machine site in `actions.ts` that no handler writes `request.status` directly — the transition route is the only mutation site, and (b) at the top of `transition/route.ts` that it enforces VALID_STATUSES + `canTransition` + idempotency-key + return-question lifecycle. | `src/lib/actions/actions.ts`, `src/app/api/v1/requests/[id]/transition/route.ts` |
| 22 — Aggregates suppress below k threshold | Expanded the doc-comment on `stalls/route.ts` to spell out the k=5 rule, that the check is on `contributors.size` (distinct employees), and that one employee with many completions cannot fool it. Inline comment at the suppression branch. | `src/app/api/v1/insights/stalls/route.ts` |
| 25 — Deterministic core works with model switched off | Added a doc-comment to `journey/me/route.ts` documenting that the handler makes ZERO model calls — every field is produced by the pure functions in `src/lib/engine/engine.ts`; the only time source is the `asOf` parameter. | `src/app/api/v1/journey/me/route.ts` |
| 34 — Dedup at ingestion | Added a doc-block at the top of `pack.ts` documenting that the pack is a frozen module-level constant — there is no INSERT path, so re-ingestion is idempotent by construction. Added a matching comment on the `handleReingest` handler in `admin-screen.tsx` and updated the success toast to "(no duplicates)". | `src/lib/data/pack.ts`, `src/components/astrolabe/admin-screen.tsx` |
| 38 — Kill switches flip without a deploy | Added a section header comment to `FeatureFlagsPanel` documenting that flag state propagates synchronously to every subscribing surface — no network round-trip, no rebuild, no server restart. | `src/components/astrolabe/admin-screen.tsx` |
| 41 — Untrusted text is data | Added a doc-block at the top of `retrieval.ts` documenting that policy chunks + questions are opaque strings: tokenised for SCORING ONLY, never `eval`'d / templated / passed to a system-prompt slot; composer emits verbatim sentences between citation markers; future model path keeps chunks in the `data:` envelope. | `src/lib/policy/retrieval.ts` |
| 46 — Replay is deterministic | Expanded the doc-comment on `replay/route.ts` to spell out that the engine has no Math.random / no Date.now inside `src/lib/engine`, so `POST /admin/replay { asOf: T }` always yields byte-identical `results` for the same `asOf` (+ same `employeeIds` filter); the only non-deterministic fields (`jobId`, `latencyMs`) live in `meta`, not in `results`. | `src/app/api/v1/admin/replay/route.ts` |

### 2. New endpoint — `GET /api/v1/admin/checklist`

`src/app/api/v1/admin/checklist/route.ts` (159 lines). Returns the standard envelope:

```ts
{ ok, data: { items: ChecklistItem[], summary: { total: 50, pass, partial, fail, na } }, meta, error }
```

Each item carries `{ id, category: "functionality" | "production", title, status: "pass" | "partial" | "fail" | "n/a", evidence, file? }`. The list is a module-level constant — zero I/O, zero DB reads, returns in <10ms. Verified live: `200` in 9ms, summary = `{ total: 50, pass: 43, partial: 5, fail: 0, na: 2 }`.

The 50 items are a curated high-level summary of PRD §29 (not a 1-to-1 mapping to the 500). Items 01–25 = functionality (Today/Journey/Ask/Citations/Requests/Notifications/Consent/Escalation/HRBP/Manager/Determinism). Items 26–50 = production (envelope/errors/rate-limit/idempotency/pagination/audit-logging/structured-logs/dedup/quarantine/versioning/health/kill-switches/replay/bilingual/fenced-text/CSP/PWA/404+errors/loading/replay-determinism/reduced-motion/mobile/real-infra/OTel).

The honest assessment:
- **43 pass** — features demonstrable in the current codebase.
- **5 partial** — item 17 (quiet hours shown but no real enforcement + no leave suppression), item 30 (cursor pagination on requests only — other lists return full), item 35 (QuarantineTable renders but no real quarantine pipeline), item 45 (loading.tsx + skeletons exist but not every async widget exposes its own retry), item 48 (mobile-first responsive throughout but not formally verified at exactly 320px on every screen).
- **0 fail** — nothing is outright missing.
- **2 n/a** — item 49 (real Postgres/Redis/k8s — prototype runs SQLite + in-memory), item 50 (OpenTelemetry collector — prototype uses in-process structured logger only).

### 3. New Admin-screen card — "Production readiness"

Added a `ProductionReadinessCard` component rendered at the **top** of the Admin console (above the Ingestion report). It:

- Fetches `/api/v1/admin/checklist` on mount (with cancellation).
- Renders a **progress bar** with `NumberTicker` showing "X of 50 checks pass" + a percentage that colour-shifts (green ≥80% / amber ≥50% / red <50%).
- Renders a **10×5 grid of 50 status dots** — green (pass) / amber (partial) / red (fail) / gray (n/a) — each with a tooltip "#NN · {title} — {status}" and a coloured glow. Skeleton shimmer while loading.
- Shows a 4-item legend (Pass / Partial / Fail / N/A) + the `GET /api/v1/admin/checklist` mono footer.
- A **"View details"** button opens a Dialog with the full list, split into "Functionality (01–25)" + "Production (26–50)" sections. Each row shows the id, title, status pill, evidence, and file path. Bilingual EN/AR throughout.

Also added a `ChecklistSection` sub-component for the modal list. No new shadcn/ui components needed (Dialog, Progress already imported).

## Files created
- `src/app/api/v1/admin/checklist/route.ts` (159 lines, GET only)

## Files edited
- `src/components/astrolabe/today-screen.tsx` — `EmptyLateState` got `waitingOnEmployeeLabel` + pause indicator; `LateItemsPanel` finds the first `waiting_employee` step + passes it through.
- `src/components/astrolabe/admin-screen.tsx` — added `ProductionReadinessCard` + `ChecklistSection` components (≈280 lines) + rendered `<ProductionReadinessCard />` at the top of `<AdminScreen />`; added dedup comment on `handleReingest`; added kill-switch comment on `FeatureFlagsPanel`.
- `src/lib/actions/actions.ts` — added "status is derived" doc-block on the state-machine section.
- `src/app/api/v1/requests/[id]/transition/route.ts` — expanded the route's top doc-comment.
- `src/app/api/v1/insights/stalls/route.ts` — expanded the route's top doc-comment + inline comment at the k<5 suppression branch.
- `src/app/api/v1/journey/me/route.ts` — added a top doc-comment documenting zero model calls.
- `src/lib/data/pack.ts` — added a top doc-block on dedup-at-ingestion.
- `src/lib/policy/retrieval.ts` — added a top doc-block on "untrusted text is data".
- `src/app/api/v1/admin/replay/route.ts` — expanded the route's top doc-comment.

## Verification

- `bun run lint` → EXIT 0, 0 errors, 0 warnings (clean).
- `curl /api/v1/admin/checklist` → `200` in 9ms; summary `{ total: 50, pass: 43, partial: 5, fail: 0, na: 2 }`; 50 items returned with `id`, `category`, `title`, `status`, `evidence`, `file`.
- Dev server log: no compile errors, no runtime errors. `/api/v1/admin/checklist 200` lines visible.
- TypeScript strict: no `any` used in the new code. The `ChecklistStatus` / `ChecklistCategory` / `ChecklistItem` / `ChecklistSummary` / `ChecklistResponse` interfaces are all explicit.
- Theme compliance: only the existing ASTROLABE tokens are used (`--status-steady` green, `--status-watch` amber, `--status-friction` red, `--text-lo` gray for n/a, `--brand-400` teal for accents, `--accent-500` sand-gold for the pause indicator's "next move" semantics). NO indigo, NO blue introduced.

## Unresolved issues / risks
- The 50-item list is a curated high-level summary, not the literal 500 items from PRD §29. If the team wants the full 500-item check, the endpoint's `ITEMS` array can be extended in place — the schema already supports it.
- The "partial" / "n/a" assessments are honest but subjective. The endpoint is a self-audit, not a CI gate; reviewers should read the `evidence` field for each item and verify the cited file.
- The Production-readiness card fetches on mount; if the endpoint is ever slow, it shows a 50-dot shimmer. In practice it returns in <10ms.
