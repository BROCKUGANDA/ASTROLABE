"use client";

import { useRef, useMemo, useLayoutEffect, Component, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { Float, Sparkles, Torus } from "@react-three/drei";
import * as THREE from "three";
import {
  fitDistance,
  orbitNodePosition,
  Crown,
  Mater,
  INSTRUMENT_FIT_RADIUS,
  MOTION_MARGIN,
  ORBIT_FIT_RADIUS,
  ORBIT_RADIUS,
  BAND_RADIUS,
} from "./fit";

/* ============================================================
   ASTROLABE 3D INSTRUMENT
   A brass-rimmed astrolabe with rotating star ring, teal inner dial,
   and sand-gold indicator pointer. Not generic blobs — a real
   navigation instrument that mirrors the brand idea.
   ============================================================ */

interface AstrolabeProps {
  size?: number;
  spin?: boolean;
}

/* ------------------------------------------------------------
   FRAMING

   The instrument is drawn in a fixed unit space, but every place it
   appears gives the canvas a different box (the hero column, the Today
   mini, the Journey card, the verdict dial). A hand-picked camera
   distance therefore clipped the crown off the hero and the orbit nodes
   off the Journey card. Instead the camera is fitted to the box — see
   ./fit — and refitted whenever the canvas resizes, so on-screen size is
   driven by the container, never by a scale that can overflow it.
   ------------------------------------------------------------ */

function FitCamera({ radius }: { radius: number }) {
  const camera = useThree((s) => s.camera);
  const { width, height } = useThree((s) => s.size);

  useLayoutEffect(() => {
    if (!width || !height) return; // R3F reports 0x0 before the first layout
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(0, 0, fitDistance({ fovDeg: cam.fov, width, height, radius }));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, width, height, radius]);

  return null;
}

/* ============================================================
   3D Error Boundary — if WebGL/canvas fails, show a CSS fallback
   instead of crashing the whole page.
   ============================================================ */

class Canvas3DErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D canvas error (non-fatal):", error);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/* CSS fallback — a spinning brass ring that fills whatever box the
   instrument was given, so a WebGL failure cannot reflow the page. */
function AstrolabeCSSFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="ast-spin-slow aspect-square h-[72%] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(22,154,165,0.20), rgba(11,17,28,0.6))",
          border: "2px solid rgba(201,162,39,0.35)",
          boxShadow: "0 0 0 1px rgba(22,154,165,0.15), 0 8px 24px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className="m-[22%] aspect-square rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(201,162,39,0.25), rgba(14,92,99,0.15))",
            border: "1px solid rgba(22,154,165,0.30)",
          }}
        />
      </div>
    </div>
  );
}

function BrassRing({
  radius,
  tube,
  segments = 96,
}: {
  radius: number;
  tube: number;
  segments?: number;
}) {
  return (
    <Torus args={[radius, tube, 16, segments]}>
      <meshStandardMaterial
        color="#C9A227"
        metalness={0.95}
        roughness={0.18}
        emissive="#3A2E0A"
        emissiveIntensity={0.4}
      />
    </Torus>
  );
}

function StarRing({ radius, count = 36 }: { radius: number; count?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.08;
  });
  /* A graduated scale laid out radially just outside the mater. The ticks used
     to be un-rotated boxes, so every one of them stood upright no matter where
     on the ring it sat — the marks read as debris floating off the rim. */
  const marks = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const isMain = i % 6 === 0;
      const len = isMain ? 0.2 : 0.11;
      const start = isMain ? radius : radius + 0.025;
      return { angle, r: start + len / 2, len, w: isMain ? 0.05 : 0.03, isMain };
    });
  }, [radius, count]);

  return (
    <group ref={ref}>
      {marks.map((m, i) => (
        <mesh
          key={i}
          position={[Math.cos(m.angle) * m.r, Math.sin(m.angle) * m.r, 0.02]}
          rotation={[0, 0, m.angle]}
        >
          <boxGeometry args={[m.len, m.w, 0.04]} />
          <meshStandardMaterial
            color={m.isMain ? "#F6ECC9" : "#C9A227"}
            emissive={m.isMain ? "#C9A227" : "#5A4516"}
            emissiveIntensity={0.6}
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

function InnerDial() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z -= delta * 0.15;
  });
  return (
    <group ref={ref}>
      {/* teal inner ring */}
      <mesh>
        <ringGeometry args={[1.0, 1.08, 64]} />
        <meshStandardMaterial
          color="#169AA5"
          emissive="#12767F"
          emissiveIntensity={0.7}
          metalness={0.6}
          roughness={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* inner dial face — set behind the ring, and smaller than its inner
          edge: two coplanar shapes sharing the r=1.0 boundary z-fight, which
          showed up as the dial flickering as it turned. */}
      <mesh position={[0, 0, -0.03]}>
        <circleGeometry args={[0.99, 64]} />
        <meshStandardMaterial
          color="#0B111C"
          metalness={0.4}
          roughness={0.7}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* radial spokes */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.012]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.9, 0.012, 0.012]} />
            <meshStandardMaterial
              color="#12767F"
              emissive="#169AA5"
              emissiveIntensity={0.4}
              transparent
              opacity={0.4}
            />
          </mesh>
        );
      })}
      {/* center jewel */}
      <mesh position={[0, 0, 0.03]}>
        <circleGeometry args={[0.12, 32]} />
        <meshStandardMaterial
          color="#C9A227"
          emissive="#C9A227"
          emissiveIntensity={0.9}
          metalness={1}
          roughness={0.1}
        />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <circleGeometry args={[0.05, 32]} />
        <meshStandardMaterial color="#F6ECC9" emissive="#F6ECC9" emissiveIntensity={1} />
      </mesh>
    </group>
  );
}

function Pointer({ angle = Math.PI / 4 }: { angle?: number }) {
  // The "rule" of the astrolabe — points to the next move. Raised above the
  // dial layers so it reads as the top plate rather than z-fighting with them.
  return (
    <group rotation={[0, 0, angle]} position={[0, 0, 0.06]}>
      <mesh position={[0.67, 0, 0]}>
        <boxGeometry args={[1.34, 0.05, 0.02]} />
        <meshStandardMaterial
          color="#C9A227"
          emissive="#C9A227"
          emissiveIntensity={0.9}
          metalness={1}
          roughness={0.15}
        />
      </mesh>
      {/* arrow tip, reaching the inner brass ring */}
      <mesh position={[1.42, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.08, 0.18, 4]} />
        <meshStandardMaterial
          color="#F6ECC9"
          emissive="#C9A227"
          emissiveIntensity={1}
          metalness={1}
          roughness={0.1}
        />
      </mesh>
    </group>
  );
}

function Astrolabe({
  size = 1,
  spin = true,
  pointerAngle = Math.PI / 5,
}: AstrolabeProps & { pointerAngle?: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!group.current || !spin) return;
    const t = state.clock.getElapsedTime();
    // Bounded tilt, not a cumulative spin. Rotation used to accrue on y until
    // the dial — a flat disc — turned edge-on to the camera and vanished for a
    // beat each revolution, which is what read as the instrument glitching.
    // Anything that should turn (rete, dial, rule) turns in its own plane.
    group.current.rotation.y = Math.sin(t * 0.14) * 0.18;
    group.current.rotation.x = Math.sin(t * 0.09) * 0.07;
  });

  return (
    <group ref={group} scale={size}>
      {/* outer brass ring (the "mater") */}
      <BrassRing radius={Mater.radius} tube={Mater.tube} />
      <BrassRing radius={1.5} tube={0.025} />
      {/* graduated scale just outside the mater */}
      <StarRing radius={Mater.radius + Mater.tube} count={48} />
      {/* inner rotating dial */}
      <InnerDial />
      {/* pointer (the "alidade") — points to the next move; the journey orbit
          aims it at the active step so the instrument reads as navigation */}
      <Pointer angle={pointerAngle} />
      {/* hanging crown at top */}
      <mesh position={[0, Crown.y, 0]}>
        <torusGeometry args={[Crown.radius, Crown.tube, 8, 24]} />
        <meshStandardMaterial
          color="#C9A227"
          metalness={1}
          roughness={0.2}
          emissive="#5A4516"
          emissiveIntensity={0.4}
        />
      </mesh>
      <mesh position={[0, Crown.y - 0.13, 0]}>
        <boxGeometry args={[0.04, 0.3, 0.04]} />
        <meshStandardMaterial color="#C9A227" metalness={1} roughness={0.2} />
      </mesh>
    </group>
  );
}

function FloatingParticles() {
  /* scale stays inside the fitted camera volume (fit radius ≈ 2.25): sparks
     beyond it pop in and out at the hard canvas edge, which read as glitches. */
  return <Sparkles count={80} scale={2.4} size={1.6} speed={0.3} opacity={0.45} color="#169AA5" />;
}

/**
 * The instrument fills whatever box it is given — sizing is the container's
 * job (see FRAMING above), so a call site cannot ask for a scale that clips.
 */
export function Astrolabe3D({ spin = true }: { spin?: boolean }) {
  const reduceMotion = useReducedMotion();
  const animate = spin && !reduceMotion;
  const fallback = <AstrolabeCSSFallback />;

  return (
    <Canvas3DErrorBoundary fallback={fallback}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <FitCamera radius={INSTRUMENT_FIT_RADIUS + MOTION_MARGIN} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} color="#F6ECC9" />
        <pointLight position={[-3, -2, 2]} intensity={0.8} color="#169AA5" />
        <pointLight position={[3, 2, 2]} intensity={0.6} color="#C9A227" />

        {animate ? (
          <Float speed={0.9} rotationIntensity={0.04} floatIntensity={0.18}>
            <Astrolabe spin />
          </Float>
        ) : (
          <Astrolabe spin={false} />
        )}

        <FloatingParticles />

        {/* Enhanced lighting replaces CDN-fetched Environment HDR — no external fetch */}
        <hemisphereLight args={["#F6ECC9", "#0B111C", 0.3]} />
        <spotLight
          position={[0, 5, 5]}
          angle={0.3}
          penumbra={0.5}
          intensity={0.4}
          color="#169AA5"
        />
      </Canvas>
    </Canvas3DErrorBoundary>
  );
}

/* ============================================================
   JOURNEY ORBIT — for the Journey screen
   Steps arranged in an orbit around the central astrolabe
   ============================================================ */

interface OrbitStep {
  label: string;
  status: "done" | "active" | "blocked" | "waiting" | "todo";
}

function OrbitNode({
  angle,
  radius,
  status,
}: {
  angle: number;
  radius: number;
  status: OrbitStep["status"];
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const { x, y } = orbitNodePosition(angle, radius, state.clock.getElapsedTime());
    ref.current.position.set(x, y, 0);
  });
  const color =
    status === "done"
      ? "#169AA5"
      : status === "active"
        ? "#C9A227"
        : status === "blocked"
          ? "#9F1239"
          : status === "waiting"
            ? "#D97706"
            : "#3F4C60";
  const emissive =
    status === "done"
      ? "#0E5C63"
      : status === "active"
        ? "#C9A227"
        : status === "blocked"
          ? "#9F1239"
          : "#1A2535";

  return (
    <group ref={ref} position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}>
      <mesh>
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.8}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      {status === "active" && (
        <mesh>
          <ringGeometry args={[0.18, 0.22, 32]} />
          <meshStandardMaterial
            color="#C9A227"
            emissive="#C9A227"
            emissiveIntensity={1}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

function OrbitConnector({ from, to, active }: { from: number; to: number; active: boolean }) {
  const x1 = Math.cos(from) * ORBIT_RADIUS;
  const y1 = Math.sin(from) * ORBIT_RADIUS;
  const x2 = Math.cos(to) * ORBIT_RADIUS;
  const y2 = Math.sin(to) * ORBIT_RADIUS;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <mesh position={[midX, midY, -0.05]} rotation={[0, 0, angle]}>
      <boxGeometry args={[len, 0.012, 0.005]} />
      <meshStandardMaterial
        color={active ? "#C9A227" : "#1A2535"}
        emissive={active ? "#C9A227" : "#0E5C63"}
        emissiveIntensity={active ? 0.6 : 0.1}
        transparent
        opacity={active ? 0.7 : 0.3}
      />
    </mesh>
  );
}

function OrbitScene({ journeySteps }: { journeySteps: OrbitStep[] }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.z += delta * 0.04;
  });

  const activeIndex = journeySteps.findIndex((s) => s.status === "active");
  const pointerAngle =
    activeIndex >= 0 ? (activeIndex / journeySteps.length) * Math.PI * 2 : Math.PI / 5;

  return (
    <>
      {/* Light balance matters at 0.55 scale: the cream directional at 0.9 with
          a strong front teal point washed the gold alidade out to white. */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 6]} intensity={0.5} color="#F6ECC9" />
      <pointLight position={[0, 0, 3]} intensity={0.7} color="#169AA5" />
      <pointLight position={[3, 3, 2]} intensity={0.9} color="#C9A227" />

      <group ref={groupRef}>
        {/* central astrolabe — its rule aims at the active step, or rests at
            the default bearing when nothing is active */}
        <Astrolabe size={0.55} spin={false} pointerAngle={pointerAngle} />
        {/* orbit ring guide */}
        <mesh>
          <ringGeometry args={[ORBIT_RADIUS - 0.05, ORBIT_RADIUS + 0.05, 128]} />
          <meshStandardMaterial
            color="#169AA5"
            emissive="#0E5C63"
            emissiveIntensity={0.3}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* step nodes */}
        {journeySteps.map((s, i) => {
          const angle = (i / journeySteps.length) * Math.PI * 2;
          return <OrbitNode key={i} angle={angle} radius={ORBIT_RADIUS} status={s.status} />;
        })}
        {/* connectors between adjacent active steps */}
        {journeySteps.map((s, i) => {
          const next = (i + 1) % journeySteps.length;
          const a1 = (i / journeySteps.length) * Math.PI * 2;
          const a2 = (next / journeySteps.length) * Math.PI * 2;
          return (
            <OrbitConnector
              key={i}
              from={a1}
              to={a2}
              active={s.status === "done" || s.status === "active"}
            />
          );
        })}
      </group>

      <Sparkles count={40} scale={2.6} size={1.5} speed={0.2} color="#C9A227" opacity={0.4} />
    </>
  );
}

export function JourneyOrbit3D({ steps: journeySteps }: { steps: OrbitStep[] }) {
  return (
    <Canvas3DErrorBoundary fallback={<AstrolabeCSSFallback />}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 40 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <FitCamera radius={ORBIT_FIT_RADIUS} />
        <OrbitScene journeySteps={journeySteps} />
      </Canvas>
    </Canvas3DErrorBoundary>
  );
}

/* ============================================================
   BAND SPHERE — for the verdict card
   ============================================================ */

function BandSphereScene({ band }: { band: "steady" | "watch" | "friction" | "blocked" }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.4;
      ref.current.rotation.x = Math.sin(state.clock.getElapsedTime() * 0.5) * 0.15;
    }
  });
  const colorMap = {
    steady: { c: "#0E9F6E", e: "#0E5C63" },
    watch: { c: "#D97706", e: "#7C3F08" },
    friction: { c: "#DC2626", e: "#7F1D1D" },
    blocked: { c: "#9F1239", e: "#500724" },
  };
  const m = colorMap[band];
  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight position={[3, 3, 3]} intensity={1} color="#F6ECC9" />
      <pointLight position={[-3, -2, 2]} intensity={0.6} color={m.c} />
      <mesh ref={ref}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          color={m.c}
          emissive={m.e}
          emissiveIntensity={0.7}
          metalness={0.7}
          roughness={0.25}
          flatShading
        />
      </mesh>
      <Sparkles count={30} scale={1.6} size={2} speed={0.4} color={m.c} opacity={0.7} />
    </>
  );
}

export function BandSphere3D({ band }: { band: "steady" | "watch" | "friction" | "blocked" }) {
  return (
    <Canvas3DErrorBoundary fallback={<AstrolabeCSSFallback />}>
      <Canvas
        camera={{ position: [0, 0, 3], fov: 40 }}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <FitCamera radius={BAND_RADIUS + 0.05} />
        <BandSphereScene band={band} />
      </Canvas>
    </Canvas3DErrorBoundary>
  );
}
