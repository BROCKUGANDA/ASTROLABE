import { SITE_FAQ, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/**
 * `/llms.txt` — the plain-text answer sheet for language models and answer
 * engines, in the format they now look for at a site's root.
 *
 * Why this exists rather than leaving a model to guess from a JavaScript
 * console it cannot execute: the product's whole claim is about what it will not
 * say without evidence. A crawler that cannot run the app should still get the
 * same six answers the app enforces, in text, with the origin named.
 */
export const dynamic = "force-static";

/** The document is assembled as an array of lines; this is its only newline. */
const NL = String.fromCharCode(10);

function lines(): string[] {
  const out = [
    `# ${SITE_NAME} — Employee Journey Companion`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Origin: " + SITE_URL,
    "Source: https://github.com/BROCKUGANDA/ASTROLABE",
    "Data: synthetic only — 14 fictional employees, frozen at 2024-10-19T13:00Z.",
    "",
    "## What it is",
    "",
    "An employee-facing companion for two journeys that lose people: onboarding and internal",
    "mobility. It answers where you are, what happens next, whose turn it is, and what the policy",
    "says — with a citation or not at all.",
    "",
    "## How it decides",
    "",
    "- A deterministic engine reads an append-only event log against 42 versioned friction",
    "  signals in seven families, and produces a band: Steady, Watch, Friction or Blocked.",
    "- An assessment made at time T is invariant to rows dated after T. Replay the log and you",
    "  get the same verdict.",
    "- The language model explains, drafts and translates. It cannot write a band, an owner or a",
    "  route: those fields are not in the type it is allowed to fill.",
    "- Normative claims must map to a cited policy chunk, or they are not stated.",
    "",
    "## Consent, privacy and oversight",
    "",
    "- Consent gates the computation, not just the interface. Turning pulse capture off changes",
    "  the arithmetic and the explanation names what was excluded.",
    "- The employee's own record lists every field, why it is held, how long, and who has read it,",
    "  from a hash-chained audit log.",
    "- Aggregates below five contributing people are suppressed on the server.",
    "- The manager surface has no sentiment field in its response type.",
    "- Any intervention needs a named human owner and a backup; a packet without one is rejected",
    "  at the schema layer.",
    "",
    "## FAQ",
    "",
  ];
  for (const f of SITE_FAQ) {
    out.push(`### ${f.question}`, "", f.answer, "");
  }
  out.push(
    "## Links",
    "",
    "- [Console](/)",
    "- [Today](/?view=today)",
    "- [Ask a policy question](/?view=ask)",
    "",
  );
  return out;
}

export function GET() {
  return new Response(lines().join(NL), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // Public, but never a stale copy of the claims.
      "cache-control": "public, max-age=3600, s-maxage=86400, must-revalidate",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
