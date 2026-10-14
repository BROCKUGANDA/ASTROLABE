# ASTROLABE — Demo Script (3:00)

Two people do the talking work: **Maria Santos** (day-5 joiner, laptop late) and **Nadia Haddad**
(visa paperwork stalled). Both exist in the pack; nothing here is scripted output.

## Before you present

```bash
bun install && bun run dev          # http://localhost:3000
bun run backtest                    # paste the scorecard into your notes
```

- Open five tabs: **Employee · Today**, **Employee · Ask**, **Employee · Requests**, **Employee · Me**,
  **Judge**. One more for **HRBP** if the room is big.
- Set the display to 125–150% zoom, turn on **projector mode** (header toggle), and check the
  keyboard path: every step below is reachable without a mouse.
- Click through Maria's Today once to warm the path. Do not edit code during the demo.
- If the venue has no network: run the offline recording (see the last section).

---

## 0:00 — The problem (one sentence, no slides)

> "A new joiner passes through seven teams and nobody holds the whole map. They wait, then they
> complain — days after the signal was there. ASTROLABE holds the map and does the arithmetic."

**Say it while showing nothing.** Then land on Today.

## 0:20 — Today answers "what now?" (Maria Santos)

Employee console · Maria Santos · Day 5.

Point at, in order:
1. The stage chip — *Onboarding · day 5* — and the progress line ("X of 14 steps done"). Read the
   number off the screen; do not recite it from memory.
2. **One** next step, with who owns it and the date. "It is not Maria's delay: the laptop is with
   IT Provisioning, and it is three days later than it should be."
3. The blocker sentence — "badge waits on visa, which waits on your passport scan" — root blocker
   plus how many steps sit behind it.
4. The band card: **Friction**, and the number that produced it.

Do not narrate the design. Ask the room: "Would you know what to do next?" Then do the next thing.

## 0:45 — A cited answer (Ask)

Type: **"How many days of temporary housing do I get?"**

Read the citation chip aloud: *Relocation Policy, section "housing", effective 1 January 2024.*
Open **View source** — the quoted span is highlighted. Now switch to Arabic and ask the same
question: same citation, correct RTL, and if the answer rests on an English-only policy it says so.

Then the honesty beat — ask **"can I get a promotion three months early?"** The companion refuses
to guess, names a human and prefills the question. Say: *"An abstain is a handoff, not a failure.
This is the behaviour that lets us ship it near people's pay."*

## 1:10 — A complete, routed request (Requests)

Start *IT kit*. Point at the prefilled fields — employee, location, stage, the existing ticket —
and the label that says they were prefilled. Delete a required field: **submit stays blocked**, and
the message says exactly what is missing. Restore it, then stop on the confirm screen:

> "This is the exact payload and this is the named queue it goes to, with the date we expect news
> by. Nothing leaves this screen that you did not read."

Submit. Duplicate the request immediately — it returns **the same ticket**, not a second queue entry.

## 1:40 — Early warning, then a named human (Nadia Haddad)

Switch employee to **Nadia Haddad**. Her band is **Blocked**, and the trace says why: a visa step
open for nine days.

Open **Judge mode**, load Nadia, and show the engine trace on screen:

- `DP-02` fired — visa stalled over seven days, weight 7, **hard trip**.
- The family arithmetic, capped and summed. This is the moment to say: *"Rules decided this. The
  model has no way to write a band, an owner or a route — those fields do not exist in its output."*

Now file the escalation. The packet is one screen: situation, band, top three signals with evidence,
target versus actual, what it blocks, open requests, the decision requested — and **a named owner
with a backup and a four-working-hour acknowledgement deadline**. Show that removing the owner is
rejected at the schema layer, not by a disabled button. Then show Nadia's own view of the same
packet: what was shared, what was withheld, that her free text is excluded by default, and that she
can add one sentence.

## 2:15 — The privacy move (Me, then Manager)

In **Me**, flip **pulse feedback** off while her band card is visible. The band **recomputes on
screen** and the explanation names the suppressed family:

> "Consent is a gate on computation, not a banner. Her answers are not hidden from the interface —
> they contribute zero inside the engine, and the engine says so."

Open **Everything I know about you**: each record with source, purpose and retention, and the view
log showing who opened it and when. Export it.

Then the manager console. Open the network tab and read the payload: steps the manager owns and a
cohort percentage. There is no field for sentiment, no score per person, no comment — *there is
nowhere in the type to put one.* Say the line the brief asks for: *"This is a companion for the
employee, not a monitoring tool for managers."*

## 2:40 — Where journeys stall, and the reuse claim

HRBP console → **Stalls**. The heatmap is stage by owner group: open steps, the share blocked or
waiting on someone, and the median age of the steps whose start the log actually carries — a cell
with no recorded start says "no start recorded" instead of showing a zero.
Narrow a filter to a cohort of two: it returns **"not enough data to show safely"** — suppressed
server-side, so no client can widen it.

One sentence on reuse: *"The map, the policies, the owner directory and the thresholds are
configuration. Another government body swaps its own map and gets this product without a code
change."*

## 2:55 — Pilot line

> "Fifty joiners and twenty movers, two locations, three HR business partners, four named service
> owners with backups. We measure requests complete on arrival, lead time before a complaint, and
> zero privacy incidents. There is a stop condition and someone owns the kill switch."

**End.** Do not add a Q&A slide.

---

## Handling a hidden scenario live

Judges will hand you a state you have not seen. The procedure:

1. Judge mode → **scenario switcher**, or Admin → **event seeding**: add events for any employee and
   set an **as-of clock**. Any state is constructible, including contradictory ones.
2. Run it. If it is out-of-order or contradictory, the companion shows the contradiction rather than
   hiding it (`TL-07`, `DQ-02`) and still routes correctly.
3. Read the trace to explain the verdict. If a signal you expected did not fire, say so and show
   which one did — the arithmetic is on screen precisely so you can be honest in front of people.
4. If it crashes, do not improvise. Note the request id from the error card, switch to the recorded
   fallback, and own the defect afterwards.

Three rehearsals to run cold before judging: a visa stalled nine days (Nadia Haddad), a payroll
change unconfirmed inside the cutoff (Aisha Rahman), and an employee whose record has **no events
at all** — construct that one in Admin → event seeding by loading a person with the log cleared, and
confirm the companion says "your journey has not started in the system" and names an HR contact
instead of rendering a blank screen or inventing a stage.

## Degraded path — rehearse it once

Judge mode → degraded simulator:

- **L1** model unavailable → policy questions become direct verbatim quotes, banner says
  "quoting policy directly right now", journey features untouched.
- **L2** retrieval unavailable → curated answers and handoffs, banner names the missing layer.
- **L3** downstream degraded → requests are accepted and queued with a reference; the employee sees
  "queued, not lost" and no false success.
- **L4** read-only → journey state from cache, owner directory, contact routes; writes disabled.

The claim to make: **nothing cached or extractive is ever dressed up as a live AI answer.**

## The offline recording

Record the walkthrough above at full screen, 1080p, with the narration read live, and test the file
on the venue machine before you go. Keep it open in a browser tab ready to play: it is the fallback
for a dead network, a dead laptop or a demo that fails on stage. The app itself runs entirely from a
`bun install` with no external service, so a hotspot plus a local server is the primary path and the
recording is the second.

## What not to do

- Do not show the HRBP queue as a leaderboard of people. It is a work queue with evidence.
- Do not answer a pay, legal, medical or disciplinary question from the tool on stage. Let it abstain
  — that is the feature.
- Do not claim streaming, vector search or a PDF binary. The README lists what is not built; if a
  judge asks, say what is simulated and why.

## Capturing the frames the video builder wants

`bun run scripts/make-demo-video.ts` cuts the narration to these beats and expects a
screenshot per beat at `demo/frames/<beat-id>.png` (names printed by
`bun run scripts/make-demo-video.ts --list`). A beat with no frame is rendered as a
labelled placeholder card and listed at the end, so an unfinished capture is visible
rather than hidden.

Capture at 1920×1080 against the built server (`bun run build && bun run start`), from
the same state the live demo uses:

| Beat | What must be on screen |
| --- | --- |
| `02-today` | Employee · Maria Santos · Today, next step card visible |
| `03-blockers` | Journey · the blocked-by sentence and downstream count |
| `04-ask` | Ask · a cited answer with the source panel open |
| `05-abstain` | Ask · the promotion abstain card naming a human |
| `06-request` | Requests · the confirm preview showing payload and recipient |
| `07-visa` | Judge · Nadia with the engine trace expanded |
| `08-escalation` | HRBP · the packet preview with named owner and backup |
| `09-consent` | Me · consent toggles with the recomputed band, then the manager console |
| `10-stalls` | HRBP · the stall heatmap, one cell suppressed |

Then re-run the builder. Narration defaults to a speech rate that keeps the cut at
about 2:51; override with `DEMO_RATE` / `DEMO_VOICE`. **A generated voice is a
placeholder for the real thing — record the walkthrough over the live app before
submitting**, and use this file only as the offline fallback the runbook asks for.
