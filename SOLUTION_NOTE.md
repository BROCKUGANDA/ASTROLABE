# ASTROLABE — Solution Note

**Employee Journey Companion** for onboarding and internal mobility. Two pages: what it does, how
it is built, and how consent, privacy and human oversight are enforced rather than described.

## The problem it attacks

A joining or a transfer passes through HR, IT, Learning, Facilities, Immigration, Payroll and two
managers. The steps exist; the map does not. The employee cannot tell whether silence is normal,
so they wait, then complain — days after the signal was available. Service owners receive
incomplete requests, so the first action on most tickets is to ask for something the employee was
never told to bring. HR business partners find stuck people through escalations, with no structured
handover.

The thesis: **journey intelligence is a state and timing problem, not a chat problem.** Chat is the
surface. A deterministic engine over an append-only event log is the product, and that separation
is what makes it auditable enough to survive HR scrutiny and portable enough to reuse.

## How it works

Six stages, one pass. The event log is the only thing stored; everything else is derived.

1. **State.** The journey map is versioned configuration — stages, steps, owners, target hours,
   dependencies, policy references. Step status and stage are a pure function of events at or
   before the as-of clock. Delete the derived state and replay the log and you get the same answer,
   byte for byte.
2. **Direction.** Today shows exactly one next step, its owner, its due date and whose turn it is,
   ranked by hard breach, downstream steps at risk, nearest due date and whether the employee can
   act on it. Blockers read as sentences — "badge waits on visa, which waits on your passport
   scan" — with the root blocker and the count of steps behind it. SLA clocks follow the location's
   working calendar and pause while the company is waiting on the employee, and the pause is
   labelled so nobody is silently blamed.
3. **Answers.** A policy claim renders with document, section, effective date and a link to the
   quoted span, or it does not render. Amounts and deadlines are quoted verbatim. Conflicts show
   both sources and name the one that governs. Below the grounding threshold — and always on pay,
   legal, medical and disciplinary questions — it abstains, names a human and prefills the question.
   An Arabic answer built on an English-only policy says so.
4. **Requests.** Intake is prefilled from journey state and says which fields were prefilled.
   Submission is blocked until the type schema validates, then the employee sees the exact payload
   and the named recipient queue before it goes. A repeat of the same intent inside 24 hours returns
   the existing ticket rather than a second queue entry. Owner resolution always terminates
   somewhere nameable: step owner, location queue, function, HRBP, or an explicit statement of who
   was told instead.
5. **Detection.** Forty-two signals across seven families — timing, dependencies, request
   telemetry, engagement, opt-in pulse, mobility, data quality — produce four bands. Family caps
   stop pile-on; three hard trips (a visa stalled over a week, an explicit "I need help now", a
   payroll change unconfirmed inside the cutoff) cannot be outvoted by arithmetic. Every signal
   carries evidence references to the events, requests or answers that fired it, so a band explains
   itself. **Rules own the verdict; the model explains, drafts and translates, and never scores.**
6. **Oversight.** An escalation is a one-screen packet — band, top three signals with evidence,
   timeline of target versus actual, what it blocks, open requests, the decision requested — filed
   against a named human with a backup, acknowledged inside four working hours or re-routed.

## Consent, privacy and human oversight

**Consent is a gate on computation, not a banner.** Six purposes, each asked in context, each
defaulting to off except the ones the product cannot work without. With pulse consent off, the PS
family contributes zero inside the engine — not "hidden in the interface" — the assessment payload
lists the suppressed family, and the explanation says "feedback answers are switched off, so this
view uses journey and request data only". Turn it off while the band card is on screen and the band
recomputes in front of you; there is a test asserting that a suppressed family can never raise a
band, including its hard trips.

**The employee owns the record.** "Everything I know about you" is built from the live tables: each
record with its source, purpose and retention, who has viewed it and when (that view log is the
audit chain, not a static list), who it was shared with and what was withheld, plus a JSON export
and a print-ready document. Revocation is a new append-only row with a receipt, never an update;
withdrawing comment retention deletes the comment text and confirms the deletion. Credential and
identifier patterns are stripped before a comment is stored, and again before anything reaches a
model.

**The boundary is in the schema, not the styling.** There is no authentication bypass to find
because the role is not a client-side choice: sessions are signed, httpOnly, twelve-hour, scoped
server-side, and every route denies by default against a permission matrix. An employee token
reading another employee's journey gets 403 — from the data layer, not the component tree. The
manager response is a declared type with nowhere to put a sentiment score, a pulse score, a comment
or a per-person friction band, and the serialisation layer asserts the payload carries none of
them. Aggregate cells below five distinct people return "not enough data to show safely", enforced
where a client cannot widen it.

**Nothing about a person happens without a named human.** An escalation without an owner is a 422
at the schema layer. The employee is told when a packet is created, can read it, add one sentence or
decline. Free-text comments are excluded from packets by default. No escalation triggers an action
on an employee. Purpose limitation — not performance, not discipline, not promotion, not visa
decisions — is a constant checked on every sensitive surface, and every read of sensitive data is
recorded in a hash-chained, append-only audit log whose verification fails loudly if a row is
edited.

**Uncertainty is a first-class answer.** An unanchored sentence is dropped before render and
counted; a wrong citation is a build-blocking defect, not a UX detail.

## Why it can be reused, and how it would be piloted

The map, the policy corpus, the owner directory and the thresholds are configuration. Another
entity swaps its own journey map and documents and gets the same product with no code change —
which is also the portability claim: no per-tenant logic, no model retraining, nothing that keeps
data.

Pilot next quarter: 50 new joiners and 20 movers across two locations, three HR business partners,
four named service owners with backups, one journey map validated by its process owners. Success
metrics: percentage of requests complete on arrival, median lead time before a complaint, stage
breach rate, abstention rate, employee trust score, zero privacy incidents. Weekly review of
abstentions and misroutes with a named owner; change control on the map, the weights and the policy
documents; a documented kill-switch owner and a stop condition. Before access is granted, HRBPs and
service owners are trained on what the tool must never be used for.

## What is honestly not built

Keyword retrieval rather than hybrid vector search; no SSE token streaming; no Redis, queues or
circuit breakers (the hot path is in-process, so its budget holds without them); export is JSON and
print-ready HTML rather than a generated PDF; downstream systems are simulated behind real adapter
interfaces. Each is listed in the README next to what is enforced, because a claim a judge can
falsify is worth more than a claim they cannot test.
