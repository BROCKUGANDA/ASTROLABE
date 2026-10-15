"use client";

/* ============================================================
   ASTROLABE — Constellation background
   A subtle canvas star-field that sits behind the whole app.
   Feels like the inside of an astrolabe: tiny teal + sand-gold
   pinpricks, a few brighter navigation stars with a faint glow,
   and hairline constellation lines connecting 3-4 of them.

   Performance budget: <1% CPU when idle.
   - requestAnimationFrame loop capped at 30fps
   - pauses entirely when the tab is hidden
   - prefers-reduced-motion → renders a single static frame
   ============================================================ */

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  base: number; // base opacity 0.2–0.6
  twkAmp: number; // twinkle amplitude
  twkSpd: number; // twinkle speed (radians / second)
  phase: number; // twinkle phase
  color: string; // teal | sand-gold
  nav: boolean; // navigation star (bigger, glow)
}

/* ---------- Shooting stars (occasional, subtle) ----------
   Every 8–12 seconds, one shooting star streaks across the canvas
   in a random direction. Teal trail (~200ms visible streak), then
   fades. Disabled entirely under prefers-reduced-motion.
   Performance: at most ONE star alive at any time, so the per-frame
   cost is negligible (a single linear-gradient stroke + a 1.5px
   arc head). */
interface ShootingStar {
  x: number; // current head x (CSS px)
  y: number; // current head y (CSS px)
  vx: number; // velocity x (px/sec)
  vy: number; // velocity y (px/sec)
  age: number; // seconds since spawn
  ttl: number; // total lifetime (seconds)
  trailLen: number; // trail length (px)
  speed: number; // |v| (px/sec) — cached for trail math
}

const SHOOT_MIN_INTERVAL = 14; // seconds
const SHOOT_MAX_INTERVAL = 22; // seconds
const SHOOT_TTL = 0.6; // total streak lifetime (fade-in + hold + fade-out)
const SHOOT_SPEED_MIN = 540; // px/sec
const SHOOT_SPEED_MAX = 780; // px/sec
const SHOOT_TRAIL_MIN = 70; // px
const SHOOT_TRAIL_MAX = 120; // px

function spawnShootingStar(w: number, h: number): ShootingStar {
  // Random direction: anywhere in a 0..90deg cone from horizontal-right,
  // biased downward so the streak appears to "fall" across the sky.
  const angle = Math.PI * (0.08 + Math.random() * 0.42);
  const speed = SHOOT_SPEED_MIN + Math.random() * (SHOOT_SPEED_MAX - SHOOT_SPEED_MIN);
  // Spawn somewhere in the top-left 70% × 50% of the canvas so the
  // streak has room to travel before exiting.
  return {
    x: Math.random() * w * 0.7,
    y: Math.random() * h * 0.5,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    age: 0,
    ttl: SHOOT_TTL,
    trailLen: SHOOT_TRAIL_MIN + Math.random() * (SHOOT_TRAIL_MAX - SHOOT_TRAIL_MIN),
    speed,
  };
}

/**
 * Draw a single shooting star with a fading teal trail and a small
 * bright head. Opacity follows a 3-phase curve: 0→1 fade-in over
 * the first 15% of ttl, hold at 1 until 60%, then 1→0 fade-out for
 * the remainder.
 *
 * The whole streak is capped at low opacity: at full brightness it
 * crossed headline text and read as a rendering glitch, not a star.
 */
function drawShootingStar(c: CanvasRenderingContext2D, s: ShootingStar) {
  const t = s.age / s.ttl; // 0..1
  let opacity: number;
  if (t < 0.15) {
    opacity = t / 0.15;
  } else if (t < 0.6) {
    opacity = 1;
  } else {
    opacity = Math.max(0, 1 - (t - 0.6) / 0.4);
  }
  opacity *= 0.38;
  if (opacity <= 0) return;

  // Trail — linear gradient from transparent (tail) to teal (head).
  const inv = 1 / s.speed;
  const tailX = s.x - s.vx * inv * s.trailLen;
  const tailY = s.y - s.vy * inv * s.trailLen;
  const grad = c.createLinearGradient(tailX, tailY, s.x, s.y);
  grad.addColorStop(0, "rgba(22, 154, 165, 0)");
  grad.addColorStop(0.6, `rgba(22, 154, 165, ${(opacity * 0.35).toFixed(3)})`);
  grad.addColorStop(1, `rgba(22, 154, 165, ${(opacity * 0.85).toFixed(3)})`);
  c.strokeStyle = grad;
  c.lineWidth = 1;
  c.lineCap = "round";
  c.beginPath();
  c.moveTo(tailX, tailY);
  c.lineTo(s.x, s.y);
  c.stroke();

  // Head — soft sand-gold pinprick with a faint teal glow.
  const headGrad = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, 2.5);
  headGrad.addColorStop(0, `rgba(246, 236, 201, ${opacity.toFixed(3)})`);
  headGrad.addColorStop(0.5, `rgba(22, 154, 165, ${(opacity * 0.5).toFixed(3)})`);
  headGrad.addColorStop(1, "rgba(22, 154, 165, 0)");
  c.fillStyle = headGrad;
  c.beginPath();
  c.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
  c.fill();

  // Solid core dot for crispness.
  c.fillStyle = `rgba(246, 236, 201, ${opacity.toFixed(3)})`;
  c.beginPath();
  c.arc(s.x, s.y, 1, 0, Math.PI * 2);
  c.fill();
}

const COLOR_TEAL = "rgba(22, 154, 165, ";
const COLOR_GOLD = "rgba(201, 162, 39, ";

const SMALL_STAR_COUNT = 60;
const NAV_STAR_COUNT = 8;
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;
const DRIFT_PX_PER_SEC = 1 / 4; // 1px every 4 seconds

function makeStars(w: number, h: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < SMALL_STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1 + Math.random(), // 1–2px
      base: 0.2 + Math.random() * 0.4,
      twkAmp: 0.1 + Math.random() * 0.18,
      twkSpd: 0.2 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      color: Math.random() < 0.7 ? COLOR_TEAL : COLOR_GOLD,
      nav: false,
    });
  }
  for (let i = 0; i < NAV_STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 2.4 + Math.random() * 0.8, // ~3px
      base: 0.4 + Math.random() * 0.2,
      twkAmp: 0.18 + Math.random() * 0.14,
      twkSpd: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      color: i % 2 === 0 ? COLOR_TEAL : COLOR_GOLD,
      nav: true,
    });
  }
  return stars;
}

// Pre-picked constellation edges between NAV stars (by index into the
// `nav` subset of the stars array). We connect 4 of them.
const CONSTELLATION_EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];

export function ConstellationBg() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let stars: Star[] = [];

    const setup = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = makeStars(w, h);
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      drawFrame(ctx, stars, 0, 0, 0);
    };

    // Returns the [x,y] of the i-th navigation star.
    const navPos = (i: number): { x: number; y: number } => {
      const navs = stars.filter((s) => s.nav);
      const s = navs[i % navs.length];
      return { x: s.x, y: s.y };
    };

    // Draw a single frame at the given virtual time t (seconds) and
    // cumulative drift offset (dx, dy) in CSS pixels.
    function drawFrame(c: CanvasRenderingContext2D, ss: Star[], t: number, dx: number, dy: number) {
      c.clearRect(0, 0, w, h);

      // Faint constellation lines (drawn first, behind stars)
      c.lineWidth = 1;
      c.strokeStyle = `${COLOR_TEAL}0.08)`;
      c.beginPath();
      for (const [a, b] of CONSTELLATION_EDGES) {
        const pa = navPos(a);
        const pb = navPos(b);
        c.moveTo(pa.x + dx, pa.y + dy);
        c.lineTo(pb.x + dx, pb.y + dy);
      }
      c.stroke();

      for (const s of ss) {
        const op = Math.max(0, Math.min(1, s.base + Math.sin(t * s.twkSpd + s.phase) * s.twkAmp));
        const x = s.x + dx;
        const y = s.y + dy;

        if (s.nav) {
          // Soft glow for navigation stars
          const grad = c.createRadialGradient(x, y, 0, x, y, s.r * 4);
          grad.addColorStop(0, `${s.color}${(op * 0.6).toFixed(3)})`);
          grad.addColorStop(1, `${s.color}0)`);
          c.fillStyle = grad;
          c.beginPath();
          c.arc(x, y, s.r * 4, 0, Math.PI * 2);
          c.fill();
        }

        c.fillStyle = `${s.color}${op.toFixed(3)})`;
        c.beginPath();
        c.arc(x, y, s.r, 0, Math.PI * 2);
        c.fill();
      }
    }

    setup();

    if (reduceMotion) {
      drawStatic();
      // Still re-render on resize, but no animation.
      const onResize = () => {
        setup();
        drawStatic();
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    // Animated path — rAF, capped at 30fps, paused when tab hidden.
    let raf = 0;
    let lastDraw = 0;
    let lastTs = 0;
    let driftX = 0;
    let driftY = 0;
    let running = true;

    // Shooting star state — at most one alive at a time. The first
    // spawn happens 4–8s after mount so the user sees one quickly,
    // then on the 8–12s cadence thereafter.
    let shootingStars: ShootingStar[] = [];
    let elapsedSec = 0;
    let nextShootAt = 4 + Math.random() * 4;

    const step = (ts: number) => {
      if (!running) return;
      if (lastTs === 0) lastTs = ts;
      const dt = Math.min(0.1, (ts - lastTs) / 1000); // cap dt at 100ms to avoid huge jumps after tab-switch
      lastTs = ts;

      // Cumulative drift — wraps around the canvas so stars never leave.
      driftX = (driftX + DRIFT_PX_PER_SEC * dt + w) % w;
      driftY = (driftY + DRIFT_PX_PER_SEC * dt + h) % h;
      const dx = driftX - w;
      const dy = driftY - h;

      // Advance shooting-star clock + maybe spawn a new streak.
      elapsedSec += dt;
      if (elapsedSec >= nextShootAt && shootingStars.length === 0) {
        shootingStars.push(spawnShootingStar(w, h));
        nextShootAt =
          elapsedSec +
          SHOOT_MIN_INTERVAL +
          Math.random() * (SHOOT_MAX_INTERVAL - SHOOT_MIN_INTERVAL);
      }
      // Update active shooting stars (age + position).
      for (const s of shootingStars) {
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      // Cull expired or off-screen streaks.
      if (shootingStars.length > 0) {
        shootingStars = shootingStars.filter((s) => s.age < s.ttl && s.x < w + 60 && s.y < h + 60);
      }

      if (ts - lastDraw >= FRAME_MS) {
        drawFrame(ctx, stars, ts / 1000, dx, dy);
        // Draw shooting stars ON TOP of the regular starfield + lines.
        for (const s of shootingStars) {
          drawShootingStar(ctx, s);
        }
        lastDraw = ts;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        lastTs = 0;
        raf = requestAnimationFrame(step);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onResize = () => {
      setup();
      lastDraw = 0;
      // Clear any in-flight shooting stars on resize so they don't
      // appear to teleport across the new canvas dimensions.
      shootingStars = [];
    };
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ zIndex: -1 }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default ConstellationBg;
