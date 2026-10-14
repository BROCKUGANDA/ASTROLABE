/**
 * ASTROLABE demo video builder — beat-matched narration over UI frames.
 *
 *   bun run scripts/make-demo-video.ts            # writes demo/astrolabe-demo.mp4
 *   bun run scripts/make-demo-video.ts --list     # print the beat sheet and exit
 *
 * Narration is generated with the offline Windows SAPI voices (System.Speech),
 * deliberately not a cloud TTS: the challenge forbids putting pack-derived
 * material on services that retain or train on it, and offline voice needs no
 * account. Each segment's duration is measured from its own audio with ffprobe,
 * so the picture is cut to the narration rather than to a guessed timeline.
 *
 * Frames come from demo/frames/<beat-id>.png. A beat with no frame is rendered as
 * an obvious placeholder card and reported at the end — the script will not pass
 * itself off as a screen recording, because a judge's question about a frame that
 * does not exist is worse than an unfinished video.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Beat {
  id: string;
  at: string;
  title: string;
  say: string;
}

/** Beat sheet mirrors DEMO_SCRIPT.md §"3:00". Keep the two in step. */
const BEATS: Beat[] = [
  {
    id: "01-problem",
    at: "0:00",
    title: "The problem",
    say: "A new joiner passes through seven teams, and nobody holds the whole map. They wait, then they complain, days after the signal was there. Astrolabe holds the map, and does the arithmetic.",
  },
  {
    id: "02-today",
    at: "0:20",
    title: "Today answers what now",
    say: "This is Maria. Day five of onboarding. One next step, who owns it, and the date. Her laptop is three days later than it should be, and the delay is with IT provisioning, not with her.",
  },
  {
    id: "03-blockers",
    at: "0:32",
    title: "Blockers in sentences",
    say: "When something is stuck it says so in plain words. The badge waits on the visa, the visa waits on her passport scan, and you can see how many steps sit behind it.",
  },
  {
    id: "04-ask",
    at: "0:45",
    title: "Cited policy answer",
    say: "Ask a policy question and the answer carries the document, the section and the effective date. Open the source and the exact sentence is highlighted. Ask in Arabic and it answers in Arabic, and says when it is leaning on an English only policy.",
  },
  {
    id: "05-abstain",
    at: "1:00",
    title: "Abstain and hand off",
    say: "Ask about a promotion and it refuses to guess. It names a person and writes the question for you. An abstain is a handoff, not a failure, and that is what makes it safe to put near people's pay.",
  },
  {
    id: "06-request",
    at: "1:10",
    title: "A complete routed request",
    say: "Starting a request is prefilled from her journey, and it says which fields were prefilled. Submit stays blocked until the type schema validates, and this screen shows the exact payload and the named queue before anything is sent. Send it twice and you get the same ticket back, not a second place in the queue.",
  },
  {
    id: "07-visa",
    at: "1:40",
    title: "Early warning, named human",
    say: "Nadia's visa has been open for nine days. The engine raised the stalled authorisation signal, a hard trip, so the band is blocked whatever the arithmetic says. This is the judge trace: every rule that fired, its weight, and the event that proved it. The rules decided this. The model had no way to write a band, an owner or a route.",
  },
  {
    id: "08-escalation",
    at: "1:58",
    title: "Escalation packet",
    say: "The packet is one screen. Situation, top three signals with evidence, target against actual, what it blocks, and the decision asked for. It has a named owner, a backup, and a four working hour acknowledgement deadline. Remove the owner and the server rejects it at the schema layer. Nadia is told this exists, can read it, and her free text was left out by default.",
  },
  {
    id: "09-consent",
    at: "2:15",
    title: "Consent and the manager boundary",
    say: "Switch pulse feedback off and the band recomputes on screen, because consent gates the computation and not just the interface, and the explanation names what was excluded. This is her own record: every field, why it is held, how long, and who has looked at it. Now the manager console. There is no sentiment score in the response, because there is nowhere in the type to put one. This is a companion for the employee, not a monitoring tool for managers.",
  },
  {
    id: "10-stalls",
    at: "2:40",
    title: "Where journeys stall, and reuse",
    say: "The stall view is stage against owner group, with medians and breach rates. Narrow it below five people and the cell disappears with a reason, enforced on the server. The map, the policies, the owner directory and the thresholds are all configuration, so another government entity swaps its own map and gets this product without a code change.",
  },
  {
    id: "11-pilot",
    at: "2:55",
    title: "Pilot line",
    say: "Next quarter: fifty joiners and twenty movers, two locations, three business partners, four named service owners with backups. We measure requests complete on arrival, lead time before a complaint, and zero privacy incidents. There is a stop condition, and someone owns the kill switch.",
  },
];

const ROOT = process.cwd();
const FRAMES = join(ROOT, "demo", "frames");
const WORK = join(ROOT, "demo", ".work");
const OUT = join(ROOT, "demo", "astrolabe-demo.mp4");
const VOICE = process.env.DEMO_VOICE ?? "Microsoft David Desktop";
const RATE = Number(process.env.DEMO_RATE ?? "2");

function sh(cmd: string[], cwd?: string): { code: number; out: string } {
  const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe", cwd });
  return { code: p.exitCode ?? 1, out: p.stdout.toString() + p.stderr.toString() };
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Offline synthesis through Windows SAPI. No network, no upload. */
function synthesise(text: string, wavPath: string): boolean {
  writeFileSync(join(WORK, "speech.txt"), text, "utf8");
  const ps = [
    "powershell",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Add-Type -AssemblyName System.Speech; ` +
      `$text = (Get-Content -Raw -Encoding UTF8 '${join(WORK, "speech.txt").replace(/\\/g, "\\\\")}'); ` +
      `$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
      `$s.Rate = ${RATE}; ` +
      `try { $s.SelectVoice('${VOICE}') } catch { }; ` +
      `$s.SetOutputToWaveFile('${wavPath.replace(/\\/g, "\\\\")}'); ` +
      `$s.Speak($text); $s.Dispose();`,
  ];
  const r = sh(ps);
  return r.code === 0 && existsSync(wavPath);
}

function durationOf(file: string): number {
  const r = sh([
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    file,
  ]);
  const n = parseFloat(r.out.trim());
  return Number.isFinite(n) ? n : 0;
}

function placeholderPng(beat: Beat, pngPath: string): boolean {
  // drawtext cannot take "C:" as an option value without a second level of
  // escaping, and that escaping differs between a shell and a direct spawn. A
  // relative path with no drive colon sidesteps the whole class of problem.
  const localFont = join(WORK, "arialbd.ttf");
  if (!existsSync(localFont)) {
    const candidate = ["C:\\Windows\\Fonts\\arialbd.ttf", "C:\\Windows\\Fonts\\arial.ttf"].find(
      (f) => existsSync(f),
    );
    if (!candidate) {
      console.error("no Windows font to render placeholder cards with");
      return false;
    }
    writeFileSync(localFont, readFileSync(candidate));
  }
  const text = beat.title.replace(/[':,\\]/g, " ");
  const r = sh(
    [
      "ffmpeg",
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x0B111C:s=1920x1080:d=1",
      "-vf",
      `drawtext=fontfile=arialbd.ttf:text=${text}:fontcolor=0xF2F6FB:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2,` +
        `drawtext=fontfile=arialbd.ttf:text=PLACEHOLDER - capture a real screen:fontcolor=0xC9A227:fontsize=34:x=(w-text_w)/2:y=(h/2)+90`,
      "-frames:v",
      "1",
      pngPath,
    ],
    WORK,
  );
  if (r.code !== 0) console.error("drawtext failed:", r.out.slice(-400));
  return r.code === 0 && existsSync(pngPath);
}

function buildSegment(frame: string, wav: string, seconds: number, outMp4: string): boolean {
  // A slow push-in gives a still frame some life without pretending it is motion.
  const frames = Math.max(1, Math.round(seconds * 25));
  const r = sh([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-i",
    frame,
    "-i",
    wav,
    "-vf",
    `scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0B111C,zoompan=z='min(zoom+0.0006,1.10)':d=${frames}:s=1920x1080:fps=25`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-t",
    seconds.toFixed(2),
    outMp4,
  ]);
  return r.code === 0 && existsSync(outMp4);
}

function main(): number {
  if (process.argv.includes("--list")) {
    for (const b of BEATS) console.log(`${b.at}  ${b.id.padEnd(14)} ${b.title}`);
    const total = BEATS.reduce((a, b) => a + b.say.split(/\s+/).length, 0);
    console.log(
      `\n${BEATS.length} beats, ${total} words (~${Math.round((total / 2.6 / 60) * 10) / 10} min at 155 wpm)`,
    );
    return 0;
  }

  mkdirSync(FRAMES, { recursive: true });
  if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  const missing: string[] = [];
  const segments: string[] = [];
  let total = 0;

  for (const beat of BEATS) {
    const wav = join(WORK, `${beat.id}.wav`);
    if (!synthesise(beat.say, wav)) {
      console.error(
        `TTS failed for ${beat.id} — is System.Speech available and is the text non-empty?`,
      );
      return 1;
    }
    const seconds = durationOf(wav) + 0.35;
    if (seconds <= 0.4) {
      console.error(
        `narration for ${beat.id} measured ${seconds}s — refusing to build a silent segment`,
      );
      return 1;
    }
    total += seconds;

    let frame = join(FRAMES, `${beat.id}.png`);
    if (!existsSync(frame)) {
      missing.push(`${beat.id} (${beat.at} ${beat.title})`);
      frame = join(WORK, `${beat.id}.placeholder.png`);
      if (!placeholderPng(beat, frame)) {
        console.error(
          `could not render a placeholder for ${beat.id}; install ffmpeg with drawtext/libfreetype`,
        );
        return 1;
      }
    }

    const seg = join(WORK, `${beat.id}.mp4`);
    if (!buildSegment(frame, wav, seconds, seg)) {
      console.error(`segment encode failed for ${beat.id}`);
      return 1;
    }
    segments.push(seg);
    console.log(
      `${beat.at}  ${beat.id.padEnd(14)} ${seconds.toFixed(2)}s  ${frame.includes("placeholder") ? "PLACEHOLDER" : "frame ok"}`,
    );
  }

  const listFile = join(WORK, "concat.txt");
  writeFileSync(
    listFile,
    segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"),
    "utf8",
  );
  mkdirSync(join(ROOT, "demo"), { recursive: true });
  const mux = sh([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listFile,
    "-c",
    "copy",
    OUT,
  ]);
  if (mux.code !== 0 || !existsSync(OUT)) {
    console.error("final mux failed:", mux.out.slice(-600));
    return 1;
  }

  console.log(`\nwrote ${OUT}  (${total.toFixed(1)}s of narration)`);
  if (missing.length > 0) {
    console.log(`\n${missing.length} beat(s) used PLACEHOLDER cards, not real screens:`);
    for (const m of missing) console.log(`  - ${m}`);
    console.log(`\nCapture each one into demo/frames/<beat-id>.png and re-run.`);
    console.log("This file is a narrated walkthrough of stills. It is not a screen recording,");
    console.log("and DEMO_SCRIPT.md asks for the real capture before submission.");
  } else {
    console.log("All beats have real frames.");
  }
  return 0;
}

if (import.meta.main) process.exit(main());
export { BEATS };
