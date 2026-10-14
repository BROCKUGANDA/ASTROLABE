import { describe, expect, test } from "bun:test";
import {
  axisFill,
  fitDistance,
  BAND_RADIUS,
  CANVAS_BOXES,
  FILL,
  INSTRUMENT_FIT_RADIUS,
  MOTION_MARGIN,
  ORBIT_FIT_RADIUS,
  ORBIT_RADIUS,
  orbitNodePosition,
} from "@/components/three/fit";

const FOV = 40;

/** What each instrument is fitted to, mirroring the components. */
const FRAMES = [
  { box: "hero", radius: INSTRUMENT_FIT_RADIUS + MOTION_MARGIN },
  { box: "todayMini", radius: INSTRUMENT_FIT_RADIUS + MOTION_MARGIN },
  { box: "journeySm", radius: ORBIT_FIT_RADIUS },
  { box: "journeyLg", radius: ORBIT_FIT_RADIUS },
  { box: "bandDial", radius: BAND_RADIUS + 0.05 },
] as const;

describe("3D camera fitting", () => {
  test("every instrument fits inside the box it is rendered into", () => {
    for (const { box, radius } of FRAMES) {
      const { width, height } = CANVAS_BOXES[box];
      const distance = fitDistance({ fovDeg: FOV, width, height, radius });
      expect(Number.isFinite(distance)).toBe(true);
      expect(distance).toBeGreaterThan(0);
      // Fitted means the drawing lands at FILL of the tighter axis, so the
      // spare (1 - FILL) of that axis is the room the parallax and the
      // scroll-linked rotation are allowed to move it.
      expect(axisFill({ fovDeg: FOV, width, height, radius, distance })).toBeCloseTo(FILL, 9);
      expect(axisFill({ fovDeg: FOV, width, height, radius, distance })).toBeLessThan(1);
    }
  });

  test("a degenerate canvas is refused rather than fitted", () => {
    expect(() => fitDistance({ fovDeg: FOV, width: 0, height: 0, radius: 2 })).toThrow(
      "canvas has no size yet",
    );
  });

  test("extreme aspect ratios still frame the instrument", () => {
    for (const [width, height] of [
      [1200, 200],
      [120, 900],
      [640, 640],
    ]) {
      const radius = INSTRUMENT_FIT_RADIUS + MOTION_MARGIN;
      const distance = fitDistance({ fovDeg: FOV, width, height, radius });
      expect(axisFill({ fovDeg: FOV, width, height, radius, distance })).toBeCloseTo(FILL, 9);
    }
  });

  /* The regression this replaces: each Canvas carried a hand-picked camera
     distance, and the drawing's true extent was never checked against it. */
  test("the old hand-picked camera distances clipped the instrument and the orbit", () => {
    const hero = CANVAS_BOXES.hero;
    expect(
      axisFill({
        fovDeg: FOV,
        width: hero.width,
        height: hero.height,
        radius: INSTRUMENT_FIT_RADIUS,
        distance: 5, // <Canvas camera={{ position: [0, 0, 5] }}>
      }),
    ).toBeGreaterThan(1);

    const journey = CANVAS_BOXES.journeyLg;
    expect(
      axisFill({
        fovDeg: FOV,
        width: journey.width,
        height: journey.height,
        radius: ORBIT_FIT_RADIUS,
        distance: 6, // <Canvas camera={{ position: [0, 0, 6] }}>
      }),
    ).toBeGreaterThan(1);

    // The band dial was never clipped, only crammed edge-to-edge.
    const dial = CANVAS_BOXES.bandDial;
    expect(
      axisFill({
        fovDeg: FOV,
        width: dial.width,
        height: dial.height,
        radius: BAND_RADIUS,
        distance: 3,
      }),
    ).toBeGreaterThan(0.9);
  });

  test("the fit radius actually bounds the drawing", () => {
    // Crown top and mater edge are the two candidates; if either grows past the
    // recorded maximum the fit would start clipping again.
    expect(INSTRUMENT_FIT_RADIUS).toBeGreaterThanOrEqual(1.995);
    expect(ORBIT_FIT_RADIUS).toBeGreaterThan(INSTRUMENT_FIT_RADIUS);
  });

  test("orbit nodes stay on the ring while they bob", () => {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      for (const t of [0, 0.7, 1.9, 3.4, 5.1]) {
        const { x, y } = orbitNodePosition(angle, ORBIT_RADIUS, t);
        const r = Math.hypot(x, y);
        expect(r).toBeGreaterThanOrEqual(ORBIT_RADIUS - 0.05);
        expect(r).toBeLessThanOrEqual(ORBIT_RADIUS + 0.05);
      }
    }
    // The bob used to be assigned to y rather than added to it, which pulled
    // every node onto the horizontal diameter — a node at 12 o'clock landed at
    // the centre of the instrument.
    const top = orbitNodePosition(Math.PI / 2, ORBIT_RADIUS, 0);
    expect(Math.hypot(top.x, top.y)).toBeGreaterThan(1);
  });
});
