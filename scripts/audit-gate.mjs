/**
 * Dependency gate. Blocks on high/critical advisories in the PRODUCTION tree
 * unless the advisory is listed, with a reason, in audit-allowlist.json
 * (PRD §24-457). Dev-only chains are reported but not blocking: what ships is the
 * built server and the client bundle, so that is what has to be clean.
 *
 * `bun audit --production --json` yields { "<package>": [ { severity, title,
 * vulnerable_versions, url } ] }, so the check is a flat pass over that map.
 */

import { readFileSync } from "node:fs";

const proc = Bun.spawnSync(["bun", "audit", "--production", "--json"], {
  stdout: "pipe",
  stderr: "pipe",
});

const raw = proc.stdout.toString().trim();
if (!raw) {
  console.error(`bun audit --production produced no JSON (exit ${proc.exitCode})`);
  console.error(proc.stderr.toString().slice(0, 500));
  process.exit(1);
}

let report;
try {
  report = JSON.parse(raw);
} catch (err) {
  console.error(`could not parse audit JSON: ${err}`);
  console.error(raw.slice(0, 300));
  process.exit(1);
}

/**
 * Allowlist entries match on package name, and optionally on advisory id or a
 * substring of the title so a waiver cannot silently cover a *different*, worse
 * advisory in the same package later.
 */
const allowList = JSON.parse(readFileSync("audit-allowlist.json", "utf8")).entries ?? [];

function waivedBy(pkgName, advisory) {
  return allowList.find(
    (e) =>
      e.package === pkgName &&
      (e.advisoryId === undefined ||
        String(e.advisoryId) === String(advisory.id) ||
        (typeof e.titleIncludes === "string" && String(advisory.title ?? "").includes(e.titleIncludes)))
  );
}

const blocking = [];
const waived = [];

for (const [pkg, advisories] of Object.entries(report)) {
  for (const advisory of Array.isArray(advisories) ? advisories : []) {
    const severity = String(advisory.severity ?? "").toLowerCase();
    if (severity !== "high" && severity !== "critical") continue;
    const waiver = waivedBy(pkg, advisory);
    if (waiver) {
      waived.push(`${pkg} ${severity} — ${waiver.reason}`);
    } else {
      blocking.push(`${pkg}@${advisory.vulnerable_versions ?? "?"} ${severity}: ${advisory.title} (${advisory.url ?? "no url"})`);
    }
  }
}

for (const w of waived) console.log(`waived by policy: ${w}`);
if (blocking.length > 0) {
  console.error("");
  console.error("UNACCEPTED high/critical advisories in the production tree:");
  for (const b of blocking) console.error(`  - ${b}`);
  console.error("");
  console.error("Either add an override / upgrade, or add a scoped entry (package + advisoryId)");
  console.error("to audit-allowlist.json with a reason and a review point, and have it reviewed.");
  process.exit(1);
}

const total = Object.keys(report).length;
console.log(
  `Dependency gate passed: ${blocking.length} unaccepted, ${waived.length} waived across ${total} package(s) with advisories in the production tree.`
);
