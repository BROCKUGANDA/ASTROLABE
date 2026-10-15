/**
 * The public identity of this deployment: one origin, one name, one
 * description, referenced by metadata, robots, the sitemap, the manifest and
 * the structured data.
 *
 * Before this, the origin was the literal `https://astrolabe.internal` pasted
 * into four files. That is not a host that exists, so every canonical URL,
 * every Open Graph URL, the sitemap location and the robots `Sitemap:` line all
 * pointed somewhere a crawler cannot go — and the mismatch is invisible until
 * someone checks. Set `SITE_URL` per deployment; the default is the live
 * submission host.
 */

export const SITE_URL = (process.env.SITE_URL ?? "https://astrolabe.svalley.tech").replace(
  /\/+$/,
  "",
);

export const SITE_NAME = "ASTROLABE";

export const SITE_TITLE = "ASTROLABE · Employee Journey Companion";

export const SITE_DESCRIPTION =
  "A navigation instrument for onboarding and internal mobility at Emirates. It tells an employee where they are, what happens next, whose turn it is, and what the governing policy says — with a citation or not at all.";

/** Absolute URL for a path, so metadata never emits a root-relative href. */
export function absolute(path = "/"): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The claims answer engines are asked about this product, stated the way the
 * code enforces them. Each one is checkable in the repository — an FAQ that
 * describes behaviour the app does not have is worse than no FAQ at all.
 */
export const SITE_FAQ: { question: string; answer: string }[] = [
  {
    question: "Does ASTROLABE score or rank employees?",
    answer:
      "No. It scores the process, not the person. A band — Steady, Watch, Friction or Blocked — is computed from journey events against 42 versioned friction signals, and it describes how far a step has run past its own target. The payload carries an explicit statement that the data is never used for performance or disciplinary purposes, and a serialisation guard refuses any response body that adds a performance or manager-attribution field.",
  },
  {
    question: "Is the employee's sentiment feedback required?",
    answer:
      "No, and it is not optional in name only. Consent gates the computation: when pulse capture is off, the engine's arithmetic changes and the explanation names which signal families were excluded. The employee's own record page lists every field held, why it is held, how long it is kept, and who has read it, taken from a hash-chained audit log rather than a summary.",
  },
  {
    question: "Can a manager see how an employee feels?",
    answer:
      "No. The manager surface returns cohort aggregates about steps their own team owns. There is no sentiment field in the response type, so there is nowhere in the contract to put one, and aggregate cells are suppressed below five contributing people on the server rather than in the interface.",
  },
  {
    question: "What happens when the assistant does not know the answer?",
    answer:
      "It abstains and hands off. Normative claims — amounts, durations, eligibility, requirements — must map to a cited policy chunk or they are not stated. An abstain names a human, drafts the question for them, and records the referral. Compensation, legal, pay-dispute and questions about another colleague are refused on purpose.",
  },
  {
    question: "Who decides whether an employee gets help?",
    answer:
      "A named human. The engine can raise a signal and prepare an escalation packet, but a packet without an owner and a backup is rejected at the schema layer, and the employee is told the packet exists and can read it.",
  },
  {
    question: "Is the data in the prototype real employee data?",
    answer:
      "No. Everything is synthetic: 14 fictional employees, their journey events, requests, pulse responses and consent records, frozen at a reference time so a replay produces the same verdict. No real record was used, and nothing was uploaded to a service that retains or trains on it.",
  },
];
