/**
 * The unit space every 3D instrument is drawn in, plus the camera arithmetic
 * that frames it. The drawing components and the framing tests both read these
 * constants, so a radius that is smaller than what is actually drawn — which is
 * how the crown came off the top of the hero — fails a test instead of shipping.
 */

/** Brass ring (the "mater") — its outer edge is the widest horizontal point. */
export const Mater = { radius: 1.65, tube: 0.06 } as const;
/** Suspension crown — the tallest point of the drawing. */
export const Crown = { y: 1.85, radius: 0.12, tube: 0.025 } as const;
/** JourneyOrbit nodes ride this ring; the active halo bounds them. */
export const ORBIT_RADIUS = 2.4;
export const ORBIT_NODE = 0.22;
/** The band dial is an icosahedron of unit radius. */
export const BAND_RADIUS = 1;
/** Float swings the whole group; the fit has to reserve room for it. */
export const MOTION_MARGIN = 0.25;

/** Farthest drawn point of the astrolabe from the origin. */
export const INSTRUMENT_FIT_RADIUS = Math.max(
  Mater.radius + Mater.tube,
  Crown.y + Crown.radius + Crown.tube,
);
/** Farthest drawn point of the journey orbit from the origin. */
export const ORBIT_FIT_RADIUS = ORBIT_RADIUS + ORBIT_NODE;

/** Share of the tighter canvas axis a drawing is allowed to occupy. */
export const FILL = 0.72;

/**
 * Distance from the origin at which `radius` covers FILL of the tighter axis
 * of a `width` x `height` canvas.
 */
export function fitDistance({
  fovDeg,
  width,
  height,
  radius,
}: {
  fovDeg: number;
  width: number;
  height: number;
  radius: number;
}): number {
  if (!(width > 0) || !(height > 0)) throw new Error("canvas has no size yet");
  const halfVertical = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const halfHorizontal = halfVertical * (width / height);
  return radius / (Math.min(halfVertical, halfHorizontal) * FILL);
}

/**
 * How much of the tighter axis a drawing covers from `distance`. Above 1 it is
 * clipped by the canvas — this is the number the old hand-picked camera
 * positions got wrong.
 */
export function axisFill({
  fovDeg,
  width,
  height,
  radius,
  distance,
}: {
  fovDeg: number;
  width: number;
  height: number;
  radius: number;
  distance: number;
}): number {
  const halfVertical = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const halfHorizontal = halfVertical * (width / height);
  return radius / (Math.min(halfVertical, halfHorizontal) * distance);
}

/**
 * A journey-orbit step node at time `t`: on the ring, bobbing along its own
 * radius. The bob used to be assigned to y instead of added, which pulled every
 * node onto the horizontal diameter and left the orbit as scattered pairs.
 */
export function orbitNodePosition(angle: number, radius: number, t: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius + Math.sin(t * 0.8 + angle) * 0.05,
  };
}

/** The boxes the instruments are actually rendered into (measured in-browser). */
export const CANVAS_BOXES = {
  /** Hero column: 320px wide, 248px of canvas once the caption row takes 24px. */
  hero: { width: 320, height: 248 },
  /** Today-screen mini-astrolabe. */
  todayMini: { width: 168, height: 168 },
  /** Journey card orbit just above the sm breakpoint. */
  journeySm: { width: 600, height: 280 },
  /** Journey card orbit at a 1440px viewport. */
  journeyLg: { width: 1114, height: 380 },
  /** Judge-screen band dial at its smallest size. */
  bandDial: { width: 112, height: 112 },
} as const;
