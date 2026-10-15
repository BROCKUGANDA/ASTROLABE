/**
 * Captures the demo beat frames from a RUNNING build of the app.
 *
 *   bun run scripts/capture-demo-frames.ts                 # against :3000
 *   bun run scripts/capture-demo-frames.ts http://host:3100
 *
 * Writes demo/frames/<beat-id>.png, which is what scripts/make-demo-video.ts
 * reads. The beat ids come from that file's BEATS table, so the two cannot
 * drift apart.
 *
 * It drives a real browser (Chrome or Edge, whichever is installed — it uses
 * puppeteer-core, which downloads nothing) rather than a DOM simulation, because
 * the point of the frames is what the instrument and the layout actually look
 * like when rendered. Every click is asserted: a beat that could not be reached
 * fails the run instead of quietly producing a placeholder card.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { BEATS } from "./make-demo-video";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT_DIR = join(process.cwd(), "demo", "frames");
const VIEWPORT = { width: 1920, height: 1080, deviceScaleFactor: 1 };

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findBrowser(): string {
  for (const path of BROWSERS) if (Bun.file(path).size > 0) return path;
  throw new Error(
    `no Chrome or Edge found. Looked in:\n  ${BROWSERS.join("\n  ")}\n` +
      "This script uses puppeteer-core and downloads nothing on purpose.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const problems: string[] = [];

let browser: Browser;
let page: Page;

/** Click the smallest visible control whose text matches; fall back to the
 * largest matching container, because some rows carry the handler themselves. */
async function click(target: string | RegExp): Promise<string | null> {
  const hit = await page.evaluate(
    (arg: { label?: string; source?: string; flags?: string }) => {
      const matches = (t: string) =>
        arg.label
          ? t === arg.label || t.startsWith(`${arg.label} `)
          : new RegExp(arg.source ?? "", arg.flags).test(t);
      const collect = (selectors: string) => {
        const found: { el: Element; text: string; area: number }[] = [];
        for (const el of document.querySelectorAll(selectors)) {
          const b = el.getBoundingClientRect();
          if (b.width < 8 || b.height < 8) continue;
          const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
          if (!text || text.length > 220) continue;
          if (matches(text)) found.push({ el, text, area: b.width * b.height });
        }
        return found;
      };
      let cands = collect("button, a, [role='button'], summary, label");
      const viaContainer = cands.length === 0;
      if (viaContainer) cands = collect("li, article, div");
      if (!cands.length) return null;
      cands.sort((a, b) => a.area - b.area);
      const pick = viaContainer ? cands[cands.length - 1] : cands[0];
      pick.el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
      const r = pick.el.getBoundingClientRect();
      return {
        text: pick.text.slice(0, 60),
        synthetic: !viaContainer,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      };
    },
    typeof target === "string" ? { label: target } : { source: target.source, flags: target.flags },
  );
  if (!hit) {
    problems.push(`no click target for ${target}`);
    return null;
  }
  if (!hit.synthetic) await page.mouse.click(hit.x, hit.y);
  else
    await page.evaluate((t: string) => {
      for (const el of document.querySelectorAll("button, a, [role='button'], summary, label")) {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
        if (text === t || text.startsWith(`${t} `)) {
          (el as HTMLElement).click();
          return;
        }
      }
    }, hit.text);
  await sleep(700);
  return hit.text;
}

async function waitText(re: RegExp, ms = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const seen = await page.evaluate(
      (s: string, f: string) => new RegExp(s, f).test(document.body.innerText),
      re.source,
      re.flags,
    );
    if (seen) return true;
    await sleep(250);
  }
  problems.push(`text ${re} never appeared`);
  return false;
}

async function scrollToText(re: RegExp): Promise<void> {
  const found = await page.evaluate(
    (s: string, f: string) => {
      const rx = new RegExp(s, f);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (rx.test(walker.currentNode.textContent ?? "")) {
          walker.currentNode.parentElement?.scrollIntoView({ block: "center" });
          return true;
        }
      }
      return false;
    },
    re.source,
    re.flags,
  );
  if (!found) problems.push(`nothing matched scroll target ${re}`);
  await sleep(400);
}

async function ask(question: string): Promise<void> {
  const selector = "textarea[aria-label='Ask a policy question']";
  await page.waitForSelector(selector, { timeout: 15000 });
  await page.evaluate((s: string) => {
    const el = document.querySelector(s) as HTMLTextAreaElement | null;
    if (el) el.value = "";
  }, selector);
  await page.type(selector, question, { delay: 4 });
  await page.keyboard.press("Enter");
}

async function frame(id: string): Promise<void> {
  await sleep(900);
  await page.screenshot({ path: join(OUT_DIR, `${id}.png`) });
  console.log(`captured ${id}.png`);
}

/** One beat: perform its steps, then shoot. A throw is recorded, not fatal, so
 * a single unreachable beat still leaves the other ten frames. */
async function beat(id: string, steps: () => Promise<void>): Promise<void> {
  try {
    await steps();
  } catch (e) {
    problems.push(`${id}: ${(e as Error).message}`);
  }
  await frame(id);
}

async function main(): Promise<number> {
  const missing = BEATS.filter((b) => !CAPTURES[b.id]);
  if (missing.length) {
    console.error(`no capture step defined for: ${missing.map((b) => b.id).join(", ")}`);
    return 1;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"],
  });
  page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  page.on("pageerror", (e: unknown) => problems.push(`pageerror: ${String(e)}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));

  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 90000 });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await sleep(2500);
  console.log(`capturing ${Object.keys(CAPTURES).length} beats from ${BASE}`);

  for (const id of Object.keys(CAPTURES)) await CAPTURES[id]();

  await browser.close();
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`\nall beats captured from ${BASE}`);
  return 0;
}

/** Each step drives the real UI to the screen the beat narrates. */
const CAPTURES: Record<string, () => Promise<void>> = {
  "01-problem": async () => {},
  "02-today": async () => {
    await scrollToText(/Your next move/i);
  },
  "03-blockers": async () => {
    await click("Journey");
    await waitText(/blocked|waiting/i);
    await click(/blocked/i);
    await scrollToText(/needs to finish first|waits on/i);
  },
  "04-ask": async () => {
    await click("Ask");
    await waitText(/Ask a policy question|Enter to send/);
    // A question the corpus really answers: relocation policy carries the
    // allowance and its effective date. (Medical insurance is deliberately
    // absent from the corpus, so it abstains — that is beat 05's story.)
    await ask("When is the relocation allowance paid?");
    await waitText(/effective|source|section/i);
  },
  "05-abstain": async () => {
    await ask("Will I get a promotion this year?");
    await waitText(/hand|owner|can't|cannot|outside/i);
  },
  "06-request": async () => {
    await click("Requests");
    await click(/Start a new request|New request/i);
    await waitText(/prefill|What do you need/i);
  },
  "07-visa": async () => {
    await click("Judge");
    await click("Scenarios");
    await click(/Nadia|E-1047/i);
    await sleep(1500);
    await click(/trace/i);
    await scrollToText(/hard trip|signal/i);
  },
  "08-escalation": async () => {
    await click("HRBP");
    await click("Queue");
    await click("Open packet");
    await click("Packet");
    await click("Build packet");
    await waitText(/acknowledg|deadline|situation|packet/i);
  },
  "09-consent": async () => {
    await click("Employee");
    await click("Me");
    await waitText(/consent|held about you|retention|privacy/i);
  },
  "10-stalls": async () => {
    await click("HRBP");
    await click("Stalls");
    await waitText(/stall|median|breach|blocked/i);
  },
  "11-pilot": async () => {
    await click("Admin");
    await waitText(/checklist|gate|pass/i);
    await click("Pilot plan");
    await waitText(/pilot|kill switch|cohort/i);
  },
};

if (import.meta.main) process.exit(await main());
