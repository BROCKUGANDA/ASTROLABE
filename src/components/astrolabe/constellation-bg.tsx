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
  base: number;       // base opacity 0.2–0.6
  twkAmp: number;     // twinkle amplitude
  twkSpd: number;     // twinkle speed (radians / second)
  phase: number;      // twinkle phase
  color: string;      // teal | sand-gold
  nav: boolean;       // navigation star (bigger, glow)
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
    function drawFrame(
      c: CanvasRenderingContext2D,
      ss: Star[],
      t: number,
      dx: number,
      dy: number,
    ) {
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
        const op = Math.max(
          0,
          Math.min(1, s.base + Math.sin(t * s.twkSpd + s.phase) * s.twkAmp),
        );
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

    const step = (ts: number) => {
      if (!running) return;
      if (lastTs === 0) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      // Cumulative drift — wraps around the canvas so stars never leave.
      driftX = (driftX + DRIFT_PX_PER_SEC * dt + w) % w;
      driftY = (driftY + DRIFT_PX_PER_SEC * dt + h) % h;
      const dx = driftX - w;
      const dy = driftY - h;

      if (ts - lastDraw >= FRAME_MS) {
        drawFrame(ctx, stars, ts / 1000, dx, dy);
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
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: -1 }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default ConstellationBg;
