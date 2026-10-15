/**
 * Renders the brand icon set and the social card from public/icon.svg.
 *
 *   bun run scripts/make-icons.ts
 *
 * Outputs, all committed because they are what browsers and crawlers fetch:
 *   public/icons/favicon-32.png, favicon-64.png
 *   public/icons/apple-touch-icon.png (180, opaque — iOS ignores alpha here)
 *   public/icons/pwa-192.png, pwa-512.png
 *   public/icons/maskable-512.png (mark inside the 80% safe zone)
 *   public/og.png (1200x630 — the Open Graph / Twitter card)
 *
 * It drives an installed browser through puppeteer-core rather than an image
 * library: the SVG uses gradients and a scaled path, and the only renderer that
 * is guaranteed to agree with what the browser will show in a tab is the
 * browser itself. Nothing is downloaded.
 */

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");
const ICONS = join(PUBLIC, "icons");
const SVG = readFileSync(join(PUBLIC, "icon.svg"), "utf8");
const BG = "#0B111C";

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function findBrowser(): string {
  for (const path of BROWSERS) if (Bun.file(path).size > 0) return path;
  throw new Error(`no Chrome or Edge found. Looked in:\n  ${BROWSERS.join("\n  ")}`);
}

const dataUrl = `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`;

/** A page whose only content is the mark at `px`, optionally inset for maskable. */
function markPage(px: number, opts: { inset?: number; background?: string } = {}): string {
  const inset = opts.inset ?? 1;
  const inner = Math.round(px * inset);
  const offset = Math.round((px - inner) / 2);
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0}
    body{width:${px}px;height:${px}px;background:${opts.background ?? "transparent"};
         display:flex;align-items:center;justify-content:center;overflow:hidden}
    img{width:${inner}px;height:${inner}px;margin:${offset}px}
  </style><img src="${dataUrl}" alt="">`;
}

const OG = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0}
  body{width:1200px;height:630px;background:${BG};color:#F2F6FB;overflow:hidden;
       font-family:"Segoe UI",system-ui,-apple-system,sans-serif;
       display:flex;flex-direction:column;justify-content:center;gap:34px;padding:0 92px;box-sizing:border-box;
       background-image:radial-gradient(1100px 620px at 88% -12%, rgba(22,154,165,0.20), transparent 62%),
                        radial-gradient(760px 420px at 4% 108%, rgba(201,162,39,0.12), transparent 60%)}
  .top{display:flex;align-items:center;gap:22px}
  .top img{width:92px;height:92px}
  .mark{font-size:26px;letter-spacing:.34em;text-transform:uppercase;color:#C9A227;font-weight:600}
  .sub{font-size:19px;letter-spacing:.16em;text-transform:uppercase;color:#7C8DA6;margin-top:10px}
  h1{font-size:76px;line-height:1.06;margin:0;font-weight:700;letter-spacing:-1.5px;max-width:940px}
  h1 em{font-style:normal;color:#2FB5BF}
  p{margin:0;font-size:27px;line-height:1.5;color:#A9B8CC;max-width:900px}
  .chips{display:flex;gap:14px;flex-wrap:wrap}
  .chip{border:1px solid rgba(22,154,165,.34);background:rgba(22,154,165,.10);color:#BFE9EE;
        border-radius:999px;padding:12px 22px;font-size:20px}
</style>
<div class="top">
  <img src="${dataUrl}" alt="">
  <div>
    <div class="mark">Astrolabe</div>
    <div class="sub">Emirates journey companion</div>
  </div>
</div>
<h1>We know exactly where you <em>stand on your journey.</em></h1>
<p>A navigation instrument for onboarding and internal mobility. The deterministic engine
   decides; the model explains. Every answer cites its source — and unsure is a first-class answer.</p>
<div class="chips">
  <div class="chip">42 friction signals</div>
  <div class="chip">Consent gates the maths</div>
  <div class="chip">Named human, always</div>
  <div class="chip">Synthetic data only</div>
</div>`;

async function shoot(browser: Browser, html: string, out: string, w: number, h: number) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
  console.log(`wrote ${out.slice(ROOT.length + 1)}  (${w}x${h})`);
}

async function main(): Promise<number> {
  mkdirSync(ICONS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ["--no-sandbox", "--disable-lcd-text"],
  });
  try {
    await shoot(browser, markPage(32), join(ICONS, "favicon-32.png"), 32, 32);
    await shoot(browser, markPage(64), join(ICONS, "favicon-64.png"), 64, 64);
    await shoot(
      browser,
      markPage(180, { background: BG }),
      join(ICONS, "apple-touch-icon.png"),
      180,
      180,
    );
    await shoot(browser, markPage(192, { background: BG }), join(ICONS, "pwa-192.png"), 192, 192);
    await shoot(browser, markPage(512, { background: BG }), join(ICONS, "pwa-512.png"), 512, 512);
    await shoot(
      browser,
      markPage(512, { background: BG, inset: 0.8 }),
      join(ICONS, "maskable-512.png"),
      512,
      512,
    );
    await shoot(browser, OG, join(PUBLIC, "og.png"), 1200, 630);
  } finally {
    await browser.close();
  }
  return 0;
}

if (import.meta.main) process.exit(await main());
