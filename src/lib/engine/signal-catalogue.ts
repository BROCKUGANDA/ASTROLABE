/**
 * ASTROLABE friction signal catalogue — PRD §11, the 42 measured signals in 7
 * families, plus band thresholds and family caps.
 *
 * Weights are data, not code: the engine looks every fired signal up here and
 * the composer cannot reach this module at all (PRD §11-092, §23-446). Changing
 * a weight or a threshold requires a version bump and a change note
 * (PRD §19-380), and `SIGNAL_PACK_VERSION` is recorded on every assessment.
 *
 * TL-06 is a modifier (+2) applied to an existing TL breach rather than a
 * standalone signal, and PS-04 has weight 0 because it exists to disclose a
 * suppression, not to raise a score.
 */

export const SIGNAL_PACK_VERSION = "signals-1.1.0";

export type SignalFamily = "TL" | "DP" | "RQ" | "EN" | "PS" | "MB" | "DQ";

export interface SignalSpec {
  code: string;
  family: SignalFamily;
  weight: number;
  /** PRD §11: a weight-≥6 signal forces at least Friction. */
  hardTrip?: boolean;
  /** PRD §11: these force Blocked regardless of the arithmetic. */
  forceBlocked?: boolean;
  /** Fires once per qualifying step/request rather than once per employee. */
  perItem?: boolean;
  /** Modifier applied on top of another signal's weight (TL-06). */
  modifier?: boolean;
  /** Counted as data quality, never as employee friction (PRD §10-193). */
  dataQuality?: boolean;
  /** Nudge the employee only; never enters the HRBP queue (PRD §3-059). */
  nudgeOnly?: boolean;
  /**
   * false = recorded and shown, but contributes nothing to the score. This is
   * how the spec's two rules are reconciled: §11 gives DQ-03 a weight of 1, while
   * §22 requires that an assessment at T be invariant to rows dated after T. A
   * signal whose entire subject is a future-dated event cannot be allowed to move
   * a verdict at T — it would mean a row that has not happened yet can push
   * someone from Steady to Watch. It stays in the payload and the trace as an
   * operator finding.
   */
  scoring?: boolean;
  condition: string;
  rationale: string;
}

export const SIGNAL_CATALOGUE: Record<string, SignalSpec> = {
  /* ---------------- TL · timing (8) ---------------- */
  "TL-01": {
    code: "TL-01",
    family: "TL",
    weight: 3,
    perItem: true,
    condition: "Step past target time",
    rationale:
      "Three points per late step is the smallest signal that still moves a band when several steps slip together; the family cap stops a 14-step map from drowning everything else.",
  },
  "TL-02": {
    code: "TL-02",
    family: "TL",
    weight: 6,
    hardTrip: true,
    perItem: true,
    condition: "Step past 200% of target (hard breach)",
    rationale:
      "Double the target is no longer noise in the queue, it is a broken promise; weight 6 puts a single hard breach at the Friction floor.",
  },
  "TL-03": {
    code: "TL-03",
    family: "TL",
    weight: 5,
    perItem: true,
    condition: "Day-N expectation unmet (e.g. kit not issued by day 2)",
    rationale:
      "Expectation steps are the ones the employee was told out loud, so missing them costs trust rather than time.",
  },
  "TL-04": {
    code: "TL-04",
    family: "TL",
    weight: 4,
    condition: "Start date in ≤5 days and pre-boarding completion < 60%",
    rationale:
      "A joining date is the hardest deadline in the journey; below 60% at T-5 days the arrival itself is at risk.",
  },
  "TL-05": {
    code: "TL-05",
    family: "TL",
    weight: 3,
    condition: "No event for 72h while stage is active",
    rationale:
      "Silence is the most common failure mode and produces no other telemetry; 72h is three working days of nobody touching the case.",
  },
  "TL-06": {
    code: "TL-06",
    family: "TL",
    weight: 2,
    modifier: true,
    condition: "Breach persists after working-calendar adjustment",
    rationale:
      "A breach that survives the location calendar and its holidays cannot be excused by a weekend; +2 on the underlying timing signal.",
  },
  "TL-07": {
    code: "TL-07",
    family: "TL",
    weight: 3,
    perItem: true,
    condition: "Stage sequence skipped (out-of-order completion)",
    rationale:
      "Out-of-order completion means either the map or the source system is wrong, and both mislead the employee about what is left.",
  },
  "TL-08": {
    code: "TL-08",
    family: "TL",
    weight: 1,
    dataQuality: true,
    perItem: true,
    condition: "Required step has no target time in the map",
    rationale:
      "Weight 1 because it is a configuration gap owned by the map maintainer, not friction the employee is experiencing.",
  },

  /* ---------------- DP · dependencies (6) ---------------- */
  "DP-01": {
    code: "DP-01",
    family: "DP",
    weight: 5,
    perItem: true,
    condition: "Incomplete step blocks ≥2 downstream steps",
    rationale:
      "Fan-out is what turns a local delay into a stalled journey; two or more blocked dependents is the point where unblocking pays for itself.",
  },
  "DP-02": {
    code: "DP-02",
    family: "DP",
    weight: 7,
    hardTrip: true,
    forceBlocked: true,
    perItem: true,
    condition: "Visa / work-authorisation step stalled > 7 days",
    rationale:
      "Nothing else in the journey can proceed without authorisation and the lead time is external, so a week of stall is a week of the whole journey. Hard trip to Blocked.",
  },
  "DP-03": {
    code: "DP-03",
    family: "DP",
    weight: 4,
    perItem: true,
    condition: "Access provisioning blocked by missing ID or asset",
    rationale:
      "The employee cannot do their job and cannot fix it themselves; four points reflects a blocker that is one handover away.",
  },
  "DP-04": {
    code: "DP-04",
    family: "DP",
    weight: 3,
    perItem: true,
    condition: "Training booked but prerequisite access missing",
    rationale:
      "The course is scheduled and will be lost if access does not arrive, but a seat can be rebooked.",
  },
  "DP-05": {
    code: "DP-05",
    family: "DP",
    weight: 4,
    perItem: true,
    condition: "Transfer approved, releasing-manager handover absent > 5 days",
    rationale:
      "The new team is waiting on knowledge that only the old manager holds; five working days means the handover is being deferred, not missed.",
  },
  "DP-06": {
    code: "DP-06",
    family: "DP",
    weight: 5,
    perItem: true,
    condition: "Relocation allowance pending with housing deadline < 14 days",
    rationale:
      "Money that has not arrived against a housing deadline a fortnight away is a live risk to the employee's family, not an admin delay.",
  },

  /* ---------------- RQ · request telemetry (7) ---------------- */
  "RQ-01": {
    code: "RQ-01",
    family: "RQ",
    weight: 3,
    perItem: true,
    condition: "Request open beyond its type SLA",
    rationale:
      "The employee asked and the clock has run out; three points is one band-step's worth of 'we are late on this'.",
  },
  "RQ-02": {
    code: "RQ-02",
    family: "RQ",
    weight: 4,
    perItem: true,
    condition: "Request reassigned ≥3 times (queue ping-pong)",
    rationale:
      "Three hops means no queue believes it owns the ticket; this is an organisational failure the employee cannot see or fix.",
  },
  "RQ-03": {
    code: "RQ-03",
    family: "RQ",
    weight: 4,
    perItem: true,
    condition: "Request returned as incomplete ≥2 times",
    rationale:
      "The first return is a missing document, the second means our intake did not ask for what the owner actually needed.",
  },
  "RQ-04": {
    code: "RQ-04",
    family: "RQ",
    weight: 2,
    perItem: true,
    condition: "Duplicate requests, same intent, within 72h",
    rationale:
      "Duplicates are an employee trying twice because nothing said 'we have this' — a communication cost, not a delay.",
  },
  "RQ-05": {
    code: "RQ-05",
    family: "RQ",
    weight: 5,
    perItem: true,
    condition: "Request has no resolvable owner",
    rationale:
      "An unroutable ticket is silently invisible; it will never be worked, so it outranks a late one.",
  },
  "RQ-06": {
    code: "RQ-06",
    family: "RQ",
    weight: 3,
    perItem: true,
    condition: "Request reopened after closure",
    rationale:
      "Closed-too-early is the failure mode employees describe as 'nobody replied'; it costs trust in every future answer.",
  },
  "RQ-07": {
    code: "RQ-07",
    family: "RQ",
    weight: 1,
    nudgeOnly: true,
    perItem: true,
    condition: "waiting_employee > 5 days",
    rationale:
      "The holdup is the employee, so this must never reach a queue or a band on timing alone (PRD §3-059); one point, nudge only.",
  },

  /* ---------------- EN · engagement (5) ---------------- */
  "EN-01": {
    code: "EN-01",
    family: "EN",
    weight: 3,
    condition: "≥3 abstained answers in 24h",
    rationale:
      "Three 'I am not sure' in a day means the corpus cannot help this person and they are being handed off repeatedly.",
  },
  "EN-02": {
    code: "EN-02",
    family: "EN",
    weight: 2,
    condition: "Same topic asked ≥3 times in 7 days",
    rationale:
      "A repeated question is an answer that did not land, or a fact that keeps changing; cheap to detect, real to the employee.",
  },
  "EN-03": {
    code: "EN-03",
    family: "EN",
    weight: 2,
    condition: "Employee checklist untouched 5 days in an active stage",
    rationale:
      "Disengagement is usually the first symptom of a journey the employee has given up on.",
  },
  "EN-04": {
    code: "EN-04",
    family: "EN",
    weight: 3,
    condition: "≥2 help-seeking intents ('who do I talk to', \"I'm stuck\")",
    rationale:
      "Asked-for help is the cheapest possible early warning; treat it as a signal, not an FAQ hit.",
  },
  "EN-05": {
    code: "EN-05",
    family: "EN",
    weight: 2,
    perItem: true,
    condition: "Intake abandoned ≥2 times on the same form",
    rationale:
      "Abandonment is the intake asking for something the employee does not have; the form is the defect.",
  },

  /* ---------------- PS · pulse (5, consent-gated) ---------------- */
  "PS-01": {
    code: "PS-01",
    family: "PS",
    weight: 4,
    perItem: true,
    condition: "Opt-in pulse confidence ≤2/5 at a stage gate",
    rationale:
      "Self-reported low confidence at a gate is the employee telling us the journey is not working; consent-gated, never inferred.",
  },
  "PS-02": {
    code: "PS-02",
    family: "PS",
    weight: 4,
    perItem: true,
    condition: "Two consecutive declines in pulse score",
    rationale:
      "Direction matters more than level: a falling trend at the same stage catches a journey going wrong mid-flight.",
  },
  "PS-03": {
    code: "PS-03",
    family: "PS",
    weight: 3,
    perItem: true,
    condition: "Comment matches the deterministic blocked/ignored lexicon",
    rationale:
      "Lexicon match, not a model sentiment score (PRD §15), so the rule is auditable and the model never weights anything.",
  },
  "PS-04": {
    code: "PS-04",
    family: "PS",
    weight: 0,
    dataQuality: true,
    condition: "Pulse consent absent → family suppressed, surfaced in explanation",
    rationale:
      "Weight zero by design. It exists so the explanation can state that pulse input was excluded, not to move the band.",
  },
  "PS-05": {
    code: "PS-05",
    family: "PS",
    weight: 6,
    hardTrip: true,
    forceBlocked: true,
    condition: "Explicit 'I need help now' flag",
    rationale:
      "A direct request for help is never allowed to be outvoted by arithmetic; it goes to a human. Hard trip to Blocked.",
  },

  /* ---------------- MB · mobility (6) ---------------- */
  "MB-01": {
    code: "MB-01",
    family: "MB",
    weight: 4,
    perItem: true,
    condition: "Effective date set but role access profile unchanged > 3 days",
    rationale:
      "The person is officially in the new role and cannot do it; three days is when the new team starts noticing.",
  },
  "MB-02": {
    code: "MB-02",
    family: "MB",
    weight: 5,
    perItem: true,
    condition: "Location change with no relocation case opened",
    rationale:
      "Someone is moving cities and nobody has funded or housed it — the most expensive omission in mobility.",
  },
  "MB-03": {
    code: "MB-03",
    family: "MB",
    weight: 3,
    perItem: true,
    condition: "Dual reporting unresolved > 7 days after effective date",
    rationale:
      "Two managers is a live conflict for the employee but rarely blocks the journey itself.",
  },
  "MB-04": {
    code: "MB-04",
    family: "MB",
    weight: 6,
    hardTrip: true,
    forceBlocked: true,
    condition: "Payroll/allowance change unconfirmed, cycle cutoff < 7 days",
    rationale:
      "Missing a cutoff means the person is paid wrong for a month and it cannot be fixed inside the window. Hard trip to Blocked.",
  },
  "MB-05": {
    code: "MB-05",
    family: "MB",
    weight: 2,
    perItem: true,
    condition: "Previous-team asset return overdue > 10 days",
    rationale: "Real but small: an asset is outstanding and the old team is chasing it.",
  },
  "MB-06": {
    code: "MB-06",
    family: "MB",
    weight: 3,
    perItem: true,
    condition: "Mandatory role training unbooked > 5 days after effective date",
    rationale:
      "Mandatory means they cannot legally do the job; five days after the effective date it is not a scheduling slip.",
  },

  /* ---------------- DQ · data quality (5) ---------------- */
  "DQ-01": {
    code: "DQ-01",
    family: "DQ",
    weight: 4,
    dataQuality: true,
    perItem: true,
    condition: "Manager or HRBP mapping missing",
    rationale:
      "Without a mapping nothing can be routed and the employee is told nobody owns them; it is a record defect that behaves like friction.",
  },
  "DQ-02": {
    code: "DQ-02",
    family: "DQ",
    weight: 2,
    dataQuality: true,
    perItem: true,
    condition: "Conflicting events (completed then reopened without reason)",
    rationale:
      "Contradictory history must be shown honestly rather than silently resolved, but it is rarely the employee's problem.",
  },
  "DQ-03": {
    code: "DQ-03",
    family: "DQ",
    weight: 1,
    dataQuality: true,
    scoring: false,
    condition: "Future-dated event beyond now (clock skew)",
    rationale:
      "One point: the event is excluded from state, so the employee is unaffected, but an operator must see it.",
  },
  "DQ-04": {
    code: "DQ-04",
    family: "DQ",
    weight: 3,
    dataQuality: true,
    condition: "Employee active in two journeys simultaneously",
    rationale:
      "Ambiguity here produces contradictory next steps, which is the fastest way to lose the employee's trust.",
  },
  "DQ-05": {
    code: "DQ-05",
    family: "DQ",
    weight: 2,
    dataQuality: true,
    perItem: true,
    condition: "Step references a policy absent from the corpus (or unmapped activity)",
    rationale:
      "A citation we cannot resolve is an answer we cannot give; the corpus owner has to fix it.",
  },
};

export const SIGNAL_CODES = Object.keys(SIGNAL_CATALOGUE);

/** PRD §11: family cap 12 prevents pile-on from one family dominating. */
export const FAMILY_CAPS: Record<SignalFamily, number> = {
  TL: 12,
  DP: 12,
  RQ: 12,
  EN: 12,
  PS: 12,
  MB: 12,
  DQ: 12,
};

/** PRD §11 fusion table. Bands are contiguous and exhaustive over integers. */
export const BAND_THRESHOLDS = {
  steady: { min: 0, max: 5 },
  watch: { min: 6, max: 11 },
  friction: { min: 12, max: 19 },
  blocked: { min: 20, max: Number.POSITIVE_INFINITY },
} as const;

/** PRD §11: any signal at or above this weight forces at least Friction. */
export const HARD_TRIP_MIN_WEIGHT = 6;

/** Signals whose mere presence forces the Blocked band. */
export const FORCED_BLOCKED_CODES = Object.values(SIGNAL_CATALOGUE)
  .filter((s) => s.forceBlocked)
  .map((s) => s.code);

export function signalSpec(code: string): SignalSpec | undefined {
  return SIGNAL_CATALOGUE[code];
}
