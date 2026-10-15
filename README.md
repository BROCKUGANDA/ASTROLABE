# ASTROLABE — Employee Journey Companion

A navigation instrument for the two journeys that lose people most often: **onboarding** and
**internal mobility**. It tells an employee where they are, what happens next, whose turn it is,
and what the governing policy says — with a citation or not at all. When the rules say a human is
needed, it drafts the packet and names the human. It never decides about a person on its own.

Built for the Emirates challenge. **Synthetic data only** — 14 fictional employees, no real
records, nothing uploaded to a service that retains or trains on data.

```
bun install
bun run dev        # http://localhost:3000 — demo-ready, no configuration needed
```

---

## 1. Run it

Requirements: [bun](https://bun.sh) ≥ 1.2 and Node ≥ 20 (Next 16). No Docker, no external accounts.

```bash
bun install
cp .env.example .env      # optional for `dev`; required values for `start`
bun run dev               # http://localhost:3000
```

`.env.example` documents every variable. `bun run dev` needs nothing; `bun run start`
will not boot a working session unless `SESSION_SECRET` is set — the session layer
refuses to invent a production key, so `/api/v1/auth/sign-in` returns 500 by design.

The app is one page with six consoles. Pick a console and a person in the header; the browser
asks the server for a session for that identity and the server decides what it may see.

| Console | What to look at first |
| --- | --- |
| Employee · Today | One next step, whose turn it is, honest late items, band card |
| Employee · Ask | A cited policy answer, or an abstention that names a human |
| Employee · Requests | Prefilled intake, completeness check, confirm-what-gets-sent preview |
| Employee · Me | Consent toggles, everything held about you, who looked at it |
| HRBP | Ranked early-warning queue with evidence, escalation packet |
| Manager | Only the steps the manager owns. No sentiment, no scores — by schema |
| Judge | Scenario switcher, as-of clock, engine trace, degraded-mode simulator |
| Admin | Ingestion report, kill switches, replay, audit chain, readiness checklist |

### Verify the whole thing

```bash
bun run typecheck    # tsc --noEmit
bun run lint         # eslint .
bun test tests/      # engine, privacy, contract and backtest gates
bun run backtest     # PRD §22 scorecard with every metric gate
bun run verify       # all of the above plus a production build
```

`bun test` is the gate that matters: **92 tests** covering all 42 friction signals at their
boundary values, replay/leakage invariance, consent suppression, band arithmetic, golden
assessment snapshots, and negative authority tests that pass only when the server refuses.

### Environment

Everything runs with defaults. Optional variables, all server-side only:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | dev key in non-production | Signs session cookies. **Required in production** — startup fails without it |
| `ASTROLABE_ADMIN_TOKEN` | `astrolabe-dev-admin` in dev | Admin console key. Unset in production ⇒ admin console closed |
| `ASTROLABE_JUDGE_KEY` | `astrolabe-dev-judge` in dev | Separate, revocable judge-mode key |
| `ASTROLABE_LIVE_CLOCK` | off | Off = the frozen demo clock (2024-10-19). `1` = real wall clock for live data |
| `DATABASE_URL` | `file:./db/custom.db` | Prisma/SQLite. The prototype's source of truth is the append-only pack log in memory |

The clock matters: the synthetic pack is frozen at a fixed instant, so all reads share **one
authoritative clock** (`src/lib/engine/clock.ts`). Point `ASTROLABE_LIVE_CLOCK=1` at real data and
the same engine reads the real time.

## 2. Deploy it

```bash
bun run build && bun run start     # standalone production server on :3000
```

`.github/workflows/ci.yml` runs, in order: typecheck, lint, the full test suite, an assertion that the golden snapshot baseline is committed and that the re-record escape hatch is unset, the backtest metric gates, the production build, a **secret scan of the emitted bundle**, and a **behavioural smoke test against the built server** — readiness all-green, the shell rendered rather than a stranded loading boundary, 401 with no session, a working sign-in that sets a cookie, an authorised journey read, and three refused cross-role calls. Both gate steps live in `scripts/ci-bundle-scan.sh` and `scripts/ci-smoke.sh`, so `bun run verify:prod` runs the identical checks locally. A deployment needs one build artifact, environment-only configuration
and a writable directory for the SQLite file; there are no sticky sessions and no local state that
is not rebuildable from the event log.

> **Where CI runs.** This account is refused GitHub-hosted runner minutes: every `ubuntu-latest`
> job — including an eight-line control that only echoes, and Dependabot's own runs — ended in
> `startup_failure` with zero steps executed. CI therefore runs on a self-hosted runner registered
> on the deployment VPS and labelled `astrolabe`, so it only takes this repo's jobs. Both workflows
> pass there; the backtest scorecard is published to the run's job summary rather than as an
> artifact, because the account is at its Actions artifact-storage quota. One line per workflow
> returns it to `ubuntu-latest` wherever hosted minutes exist.

### Container

```bash
docker build -t astrolabe .
docker run -p 127.0.0.1:3100:3000   -e SESSION_SECRET="$(openssl rand -hex 32)"   -e DATABASE_URL=file:/app/db/custom.db   -v $PWD/data/db:/app/db   astrolabe
```

The image runs Next's standalone output as a non-root user and health-checks
`/api/healthz`. `DATABASE_URL` must be **absolute**: a relative SQLite path is
resolved against `prisma/schema.prisma`, which the standalone bundle does not
carry. Create the schema in the mounted directory once with `bun run db:push`.
`ghcr.io/brockuganda/astrolabe` is published on every `v*` tag.

## 3. How it is put together

```
src/lib/engine/        deterministic core — pure functions, no I/O, injected clock
  calendar.ts          working calendars, SLA arithmetic, pause windows
  graph.ts             journey-map DAG, cycle detection, root blockers, map lint
  state.ts             step status, stage inference, unmapped activity
  signal-catalogue.ts  the 42 signals, their weights, family caps, band thresholds
  signals.ts           42 predicates returning evidence references
  assess.ts            fusion into bands, next-best-step ranking
  engine.ts            public surface + judge trace
src/lib/policy/        retrieval, citation contract, abstain
src/lib/requests/      intake schemas, payload hashing, owner directory (primary + backup)
src/lib/escalations/   packet store, 4-working-hour acknowledgement SLA, re-route
src/lib/privacy/       sessions, permission matrix, row-level scope, purpose claims, audit chain
src/lib/data/pack.ts   the synthetic pack: employees, events, requests, pulse, policies, consent
src/components/astrolabe/  the six consoles and the widgets
src/app/api/v1/        the API surface, one response envelope
tests/                 engine, privacy, contract and backtest gates
scripts/backtest.ts    the PRD §22 scorecard and its merge-blocking gates
```

**The engine decides; the model explains.** Bands, owners and routes come from rules over an
append-only event log. Nothing in the composition layer can write a band, an owner or a route,
because those fields do not exist in its output type. Journey state is a pure function of the event
log plus the versioned map: delete every derived value and replay the log, and you get the same
state back — which is what `bun run backtest` measures on every run.

**Swapping the map swaps the entity.** Stages, steps, targets, owners and policy references are
configuration with a version and a hash. Another government body supplies its own map and corpus;
the engine, the signal pack, the consent model and the API do not change.

## 4. What is real and what is simulated

Judges should be able to tell these apart without asking.

Real and enforced: the engine, the 42 signals and their arithmetic, the working calendars and clock
pauses, citations and abstention, consent-as-a-computation-gate, the audit hash chain, session
authentication, role gating and row-level scope, payload-hash idempotency, the request state
machine, escalation packets with a named owner and a 4-hour acknowledgement deadline, k≥5
aggregate suppression, credential redaction.

Simulated behind production-shaped interfaces: the downstream HR/IT/Learning/Facilities systems
(adapters with timeouts and acknowledgements, no real ticketing system), the owner directory,
the CSV pack (a frozen in-memory constant — ingestion validates, quarantines and dedups, but the
pack ships in code so a clone always demos identically).

Deliberately not built, and named here rather than hidden:

- **No SSE streaming.** `/api/v1/ask` is request/response with staged progress in the payload.
  The staged "checking your journey → reading policy → drafting" UX is real; the transport is not
  token-streamed.
- **Keyword retrieval, not hybrid.** BM25-style scoring with section/title boosts. No embeddings,
  no vector store, no reranker.
- **No Redis, no queues, no circuit breakers.** The hot path is in-process and sub-millisecond, so
  the budgets hold without a cache. The degradation ladder, kill switches and the L0–L4 banner are
  implemented and demonstrable in Judge mode; the distributed plumbing they would drive is not.
- **Export is JSON + a print-ready HTML document**, not a generated PDF binary.
- **Prisma/SQLite is scaffolding from the template.** `/api/readyz` reports `db` honestly; the
  product's durable state is the append-only log the engine replays.

## 5. The guardrails, as behaviour you can click

| The rule | Where you can see it working |
| --- | --- |
| Works for the employee, not on the employee | Manager console returns a declared type with no field for sentiment, scores or comments; the serialisation layer asserts it |
| Opt-in consent gates computation | In Me, switch pulse off: the band recomputes live, the PS family reports 0, and the explanation names the exclusion |
| The employee sees what is held | Me → Everything I know about you, with source, purpose, retention, who viewed it, and an export |
| Nothing about a person without a named human | An escalation with no owner is rejected with 422 at the schema layer, not in the UI |
| Cite or say nothing | Every policy claim carries document, section and effective date; below the grounding threshold the answer abstains and hands off |
| No performance use | Purpose limitation is asserted when a manager or HRBP payload is serialised |

Try the move the judges will test: revoke pulse consent while the band card is on screen, then
open the manager console and look at the network payload.

## 6. Known issues

- **`next start` fails sign-in without `SESSION_SECRET`.** The session layer refuses to
  self-assign a production key, so the API returns 500 on `/api/v1/auth/sign-in` until you set one.
  This is intentional fail-closed behaviour, not a bug to work around — but it means `bun run dev`
  and `bun run start` are not equally turn-key.
- **A route-level `loading.tsx` strands the shell.** React 19 parked the streamed page in a hidden
  boundary (`div#S:0`) that no reveal step ever swapped, so the fallback stayed on screen while the
  app rendered at zero height behind it — silently, in dev and production alike. The file is gone;
  each surface has its own skeleton. Note two traps when changing the shell: the stale prerender in
  `.next` keeps serving the broken HTML until you rebuild clean, and the browser cache serves it
  after that, so verify with a cache-busting URL rather than a reload.
- Golden assessment snapshots drift whenever a weight, threshold or pack row changes. That is the
  gate working: re-record with `UPDATE_SNAPSHOTS=1 bun test tests/engine/snapshot.test.ts` and put
  the change note in the commit.
- `bun run build` needs the dev server stopped so it can own `.next`.
- Admin and judge keys fall back to documented dev values outside production. Rotate both before
  any real pilot — and note that on a production host an unset key closes that console rather than
  opening it, which is why the deployed instance serves the employee, HRBP, manager and service-owner
  surfaces but not the admin or judge consoles.

## 7. Submission artifacts

- `README.md` — this file: what it is, how to run it, what is real.
- `SOLUTION_NOTE.md` — the two-page note: architecture, consent, privacy, human oversight.
- `DEMO_SCRIPT.md` — the three-minute walkthrough, shot by shot, plus the hidden-scenario
  rehearsal and the no-network fallback.
- `tool-results/backtest-scorecard.md` — the metric gates, generated by `bun run backtest`.
- `demo/astrolabe-demo.mp4` — 2:58 narrated walkthrough over eleven real screens of the built app;
  attached to the GitHub release. Frames are captured from the running production build, and
  `scripts/make-demo-video.ts` refuses to present a beat it could not capture as a real screen.
