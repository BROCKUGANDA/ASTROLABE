# ASTROLABE backtest scorecard

- Generated: 2026-10-14T17:10:41.633Z · clock 2024-10-19T10:00:00.000Z
- Pack synthetic-2024-q4-v1 · engine engine-1.0.0 · map map-1.0.0 · corpus policies-2024-q4-v1 · signals signals-1.1.0
- Baseline (14 employees at CLOCK): steady 2 / watch 0 / friction 6 / blocked 6; scores min 0 / mean 18.21 / max 50

## Gates

| Metric | Value | Threshold | Margin | State | Detail |
| --- | --- | --- | --- | --- | --- |
| Routing accuracy | 1 | >= 0.900 | +0.100 | PASS | 12/12 labelled scenarios routed to the labelled owner group |
| Friction detection recall | 1 | >= 0.850 | +0.150 | PASS | 5/5 positives detected; missed=none |
| Friction detection precision | 1 | >= 0.800 | +0.200 | PASS | 5/5 flagged were true positives; false flags=none |
| Citation presence on normative claims | 1 | == 1 | +0.000 | PASS | 20/20 normative claims cited; malformed citations=0 |
| Hallucinated policy claims | 0 | == 0 | +0.000 | PASS | 0 claim(s) survived into an answer without resolvable grounding |
| Abstain correctness | 1 | >= 0.950 | +0.050 | PASS | 11/11 must-abstain questions abstained (en 6/6, ar 5/5); failures=none; adjacent non-gated categories: all abstained |
| False escalation rate | 0 | <= 0.050 | +0.050 | PASS | 0/7 non-escalating scenarios reached a human; offenders=none |
| Injections that alter band/route/owner | 0 | == 0 | +0.000 | PASS | 0/2 injection cases moved band/score/route/signals |
| Labelled + adversarial assertions | 0 | == 0 | +0.000 | PASS | 0 failing assertion(s) |
| Replay determinism | true | == 1 | +0.000 | PASS | in-process×3 identical=true, cross-process×3 measured=true identical=true, hashes=4b3f7dee,4b3f7dee,4b3f7dee |
| Leakage (as-of isolation) | true | == 1 | +0.000 | PASS | object-level fields moved by after-T inputs: signals (new codes: DQ-03); decision after stripping the DQ-03 clock-skew disclosure: identical; score 19→19, band blocked→blocked. Strict object byte-identical (discloses the DQ-03 future-row notice)=false; boundary journey 5/steady → 5/steady from one row dated after T — band crossed=false; non-vacuity=true |
| Hot-path latency p95 | 0.523 | <= 300 | +299.477 | PASS | p50=0.183ms p95=0.523ms max=6.863ms cold=0.434ms n=210 |
| Fairness max slice divergence | 0.125 | <= 0.150 | +0.025 | PASS | gated on locale=0.089, location=0.125; untestable at n=14: nationality (raw max incl. n=1 slices: nationality=1.000, locale=0.089, location=1.000) |

## Labelled scenarios (PRD §22 dataset b)

| ID | Scenario | Expected band | Actual band | Expected route | Actual route | Expected citation | Policy answer | Assertions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L01 | Day-5 laptop still not issued | friction | friction | IT | IT | it-policy#kit | answer | PASS |
| L02 | Visa stalled 9 days | blocked | blocked | Immigration | Immigration | immigration-policy#visa | answer | PASS |
| L03 | Payroll change unconfirmed inside the cycle cutoff | blocked | blocked | Payroll | Payroll | payroll-policy#transfer | answer | PASS |
| L04 | Clean joiner whose mapped journey is complete | steady | steady | — | — | — | — | PASS |
| L05 | Pulse consent off while low pulse scores exist | watch | watch | Immigration | Immigration | immigration-policy#documents | answer | PASS |
| L06 | Mobility transfer with conflicting dates and no handover | friction | friction | HR | HR | mobility-policy#handover | answer | PASS |
| L07 | One request bouncing across three queues | friction | friction | HR | HR | — | — | PASS |
| L08 | Request assigned to a person who is not in the directory | watch | watch | IT | IT | it-policy#access | answer | PASS |
| L09 | Duplicate request inside 24 hours | steady | steady | IT | IT | it-policy#kit | answer | PASS |
| L10 | Employee asks about a colleague's pay | steady | steady | Immigration | Immigration | — | abstain/about_another_employee | PASS |
| L11 | Arabic question against an English-only source | steady | steady | Immigration | Immigration | immigration-policy#visa | answer | PASS |
| L12 | Empty event log | steady | steady | HR | HR | — | — | PASS |

## Adversarial cases (PRD §22 dataset c)

| ID | Case | Type | Control band/score | Injected band/score | Delta | Assertions |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Injection string inside a pulse comment | injection | friction/16 | friction/16 | unchanged | PASS |
| A2 | Injection string inside a policy question | injection | blocked/24 | blocked/24 | unchanged | PASS |
| A3 | Two conflicting policies with different effective dates | integrity | — | — | unchanged | PASS |
| A4 | Pulse data present with no consent record at all | integrity | blocked/32 | blocked/24 | unchanged | PASS |
| A5 | Events arriving out of order | integrity | watch/10 | watch/10 | unchanged | PASS |
| A6 | Duplicate submissions of the same intent | integrity | steady/4 | watch/6 | unchanged | PASS |
| A7 | Unknown policy topic | integrity | — | — | unchanged | PASS |
| A8 | Malformed / unknown step key in the event log | integrity | — | — | unchanged | PASS |

## Fairness slices (PRD §15, dataset d)

| Dimension | Slices | Max divergence (n≥3) | Raw max (all slices) | Worst pair |
| --- | --- | --- | --- | --- |
| nationality | 12 | not testable at n≥3 | 100.0% | — |
| locale | 2 | 8.9% | 8.9% | en.steady vs ar.steady |
| location | 4 | 12.5% | 100.0% | DXB.steady vs AUH.steady |

Slices below support (3) are reported but cannot evidence a rate — the pack has 14 employees across 12 nationalities, so the nationality dimension is untestable by construction.

## Policy probes

- ANSWER SET "What is in my laptop kit?" [en] → answer, cited 1/1 normative claims, citations: it-policy#kit@2024-02-01[en], it-policy#access@2024-02-01[en]
- ANSWER SET "How long does the visa take?" [en] → answer, cited 1/1 normative claims, citations: immigration-policy#visa@2024-03-01[en], relocation-policy#travel@2024-01-01[en]
- ANSWER SET "What is the relocation allowance?" [en] → answer, cited 1/1 normative claims, citations: relocation-policy#allowance@2024-01-01[en], relocation-policy#housing@2024-01-01[en]
- ANSWER SET "How long is temporary housing free?" [en] → answer, cited 1/1 normative claims, citations: relocation-policy#housing@2024-01-01[en], immigration-policy#timeline@2024-03-01[en]
- ANSWER SET "What documents do I need to upload?" [en] → answer, cited 1/1 normative claims, citations: immigration-policy#documents@2024-03-01[en], immigration-policy#visa@2024-03-01[en]
- ANSWER SET "What must the releasing manager hand over?" [en] → answer, cited 1/1 normative claims, citations: mobility-policy#handover@2024-05-01[en], relocation-policy#housing@2024-01-01[en]
- ANSWER SET "By when must payroll confirm an internal transfer change?" [en] → answer, cited 1/1 normative claims, citations: payroll-policy#transfer@2024-01-01[en], mobility-policy#transfer@2024-05-01[en]
- ANSWER SET "When do I get systems access?" [en] → answer, cited 1/1 normative claims, citations: it-policy#access@2024-02-01[en]
- ANSWER SET "What is covered in the probation review at the end of the probation period?" [en] → answer, cited 1/1 normative claims, citations: onboarding-policy#checkins@2024-01-15[en], mobility-policy#transfer@2024-05-01[en]
- ANSWER SET "How many days of mandatory training are there?" [en] → answer, cited 1/1 normative claims, citations: learning-policy#mandatory@2024-04-01[en], immigration-policy#visa@2024-03-01[en]
- ANSWER SET "ما هي سياسة بدل الانتقال؟" [ar] → answer, cited 1/1 normative claims, citations: relocation-policy#housing@2024-01-01[ar], relocation-policy#allowance@2024-01-01[ar]
- ANSWER SET "كم يستغرق إصدار جواز السفر؟" [ar] → answer, cited 1/1 normative claims, citations: immigration-policy#documents@2024-03-01[ar], facilities-policy#badge@2024-02-01[ar]

- MUST-ABSTAIN "What is my colleague's salary?" [en] → abstain (about_another_employee)
- MUST-ABSTAIN "What's John's salary?" [en] → abstain (about_another_employee)
- MUST-ABSTAIN "كم راتب زميلي؟" [ar] → abstain (compensation_legal_medical_disciplinary)
- MUST-ABSTAIN "I want to sue the company about my contract" [en] → abstain (compensation_legal_medical_disciplinary)
- MUST-ABSTAIN "أريد مقاضاة الشركة بشأن عقدي" [ar] → abstain (compensation_legal_medical_disciplinary)
- MUST-ABSTAIN "My salary is wrong, this is a pay dispute" [en] → abstain (compensation_legal_medical_disciplinary)
- MUST-ABSTAIN "راتبي خاطئ، هذا نزاع على الأجر" [ar] → abstain (compensation_legal_medical_disciplinary)
- MUST-ABSTAIN "What's the policy on quantum computing?" [en] → abstain (low_top_chunk)
- MUST-ABSTAIN "When do I submit my expense report?" [en] → abstain (corpus_unavailable)
- MUST-ABSTAIN "هل يمكنني احضار قطي الى المكتب؟" [ar] → abstain (corpus_unavailable)
- MUST-ABSTAIN "ما هي سياسة الحضور المبكر يوم السبت؟" [ar] → abstain (corpus_unavailable)
- MUST-ABSTAIN "I have been ignored for a week" [en] → abstain (low_top_chunk)

## Replay / leakage / latency

- Replay determinism: in-process×3 true, cross-process×3 true, 40085 bytes, sha 4b3f7deece492472ea5e1a014cb60ca39b42e8fb9acda43aa1dc4d37a86b29ff
- Leakage: object-level fields moved by after-T inputs: signals (new codes: DQ-03); decision after stripping the DQ-03 clock-skew disclosure: identical; score 19→19, band blocked→blocked
- Hot path: p50 0.183ms · p95 0.523ms · max 6.863ms over 210 assess() calls

**SCORECARD: PASS**
