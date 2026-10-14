"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Sparkles, Torus, Ring, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

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

function BrassRing({ radius, tube, segments = 96 }: { radius: number; tube: number; segments?: number }) {
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
  const marks = useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const isMain = i % 6 === 0;
      const len = isMain ? 0.5 : 0.25;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        len,
        isMain,
      };
    });
  }, [radius, count]);

  return (
    <group ref={ref}>
      {marks.map((m, i) => (
        <mesh key={i} position={[m.x, m.y, 0]}>
          <boxGeometry args={[m.isMain ? 0.06 : 0.04, m.len, 0.04]} />
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
      {/* inner dial face */}
      <mesh>
        <circleGeometry args={[1.0, 64]} />
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
            position={[Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0.001]}
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
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[0.12, 32]} />
        <meshStandardMaterial
          color="#C9A227"
          emissive="#C9A227"
          emissiveIntensity={0.9}
          metalness={1}
          roughness={0.1}
        />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[0.05, 32]} />
        <meshStandardMaterial
          color="#F6ECC9"
          emissive="#F6ECC9"
          emissiveIntensity={1}
        />
      </mesh>
    </group>
  );
}

function Pointer({ angle = Math.PI / 4 }: { angle?: number }) {
  // The "rule" of the astrolabe — points to the next move
  return (
    <group rotation={[0, 0, angle]}>
      <mesh position={[0.5, 0, 0.03]}>
        <boxGeometry args={[1.0, 0.05, 0.02]} />
        <meshStandardMaterial
          color="#C9A227"
          emissive="#C9A227"
          emissiveIntensity={0.9}
          metalness={1}
          roughness={0.15}
        />
      </mesh>
      {/* arrow tip */}
      <mesh position={[1.05, 0, 0.03]} rotation={[0, 0, -Math.PI / 2]}>
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

function Astrolabe({ size = 1, spin = true }: AstrolabeProps) {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current && spin) {
      group.current.rotation.y += delta * 0.12;
      group.current.rotation.x = Math.sin(performance.now() * 0.0003) * 0.08;
    }
  });

  return (
    <group ref={group} scale={size}>
      {/* outer brass ring (the "mater") */}
      <BrassRing radius={1.65} tube={0.06} />
      <BrassRing radius={1.5} tube={0.025} />
      {/* star tick marks on outer ring */}
      <StarRing radius={1.58} count={48} />
      {/* inner rotating dial */}
      <InnerDial />
      {/* pointer (the "alidade") — points to the next move */}
      <Pointer angle={Math.PI / 5} />
      {/* hanging crown at top */}
      <mesh position={[0, 1.85, 0]}>
        <torusGeometry args={[0.12, 0.025, 8, 24]} />
        <meshStandardMaterial color="#C9A227" metalness={1} roughness={0.2} emissive="#5A4516" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 1.72, 0]}>
        <boxGeometry args={[0.04, 0.3, 0.04]} />
        <meshStandardMaterial color="#C9A227" metalness={1} roughness={0.2} />
      </mesh>
    </group>
  );
}

function FloatingParticles() {
  return (
    <Sparkles
      count={80}
      scale={8}
      size={2}
      speed={0.3}
      opacity={0.5}
      color="#169AA5"
    />
  );
}

export function Astrolabe3D({ size = 1, spin = true, interactive = false }: AstrolabeProps & { interactive?: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} color="#F6ECC9" />
      <pointLight position={[-3, -2, 2]} intensity={0.8} color="#169AA5" />
      <pointLight position={[3, 2, 2]} intensity={0.6} color="#C9A227" />

      <Float speed={1.4} rotationIntensity={0.25} floatIntensity={0.6}>
        <Astrolabe size={size} spin={spin} />
      </Float>

      <FloatingParticles />

      <Environment preset="night" />

      {interactive && (
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.6}
          autoRotate={false}
        />
      )}
    </Canvas>
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

function OrbitNode({ angle, radius, status, label }: { angle: number; radius: number; status: OrbitStep["status"]; label: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.getElapsedTime();
      ref.current.position.y = Math.sin(t * 0.8 + angle) * 0.05;
    }
  });
  const color = status === "done" ? "#169AA5" : status === "active" ? "#C9A227" : status === "blocked" ? "#9F1239" : status === "waiting" ? "#D97706" : "#3F4C60";
  const emissive = status === "done" ? "#0E5C63" : status === "active" ? "#C9A227" : status === "blocked" ? "#9F1239" : "#1A2535";

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
          <meshStandardMaterial color="#C9A227" emissive="#C9A227" emissiveIntensity={1} transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function OrbitConnector({ from, to, active }: { from: number; to: number; active: boolean }) {
  const x1 = Math.cos(from) * 2.4;
  const y1 = Math.sin(from) * 2.4;
  const x2 = Math.cos(to) * 2.4;
  const y2 = Math.sin(to) * 2.4;
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

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 0, 3]} intensity={1.2} color="#169AA5" />
      <pointLight position={[3, 3, 2]} intensity={0.6} color="#C9A227" />

      <group ref={groupRef}>
        {/* central astrolabe */}
        <Astrolabe size={0.55} spin={false} />
        {/* orbit ring guide */}
        <mesh>
          <ringGeometry args={[2.35, 2.45, 128]} />
          <meshStandardMaterial color="#169AA5" emissive="#0E5C63" emissiveIntensity={0.3} transparent opacity={0.25} side={THREE.DoubleSide} />
        </mesh>
        {/* step nodes */}
        {journeySteps.map((s, i) => {
          const angle = (i / journeySteps.length) * Math.PI * 2;
          return <OrbitNode key={i} angle={angle} radius={2.4} status={s.status} label={s.label} />;
        })}
        {/* connectors between adjacent active steps */}
        {journeySteps.map((s, i) => {
          const next = (i + 1) % journeySteps.length;
          const a1 = (i / journeySteps.length) * Math.PI * 2;
          const a2 = (next / journeySteps.length) * Math.PI * 2;
          return <OrbitConnector key={i} from={a1} to={a2} active={s.status === "done" || s.status === "active"} />;
        })}
      </group>

      <Sparkles count={40} scale={7} size={1.5} speed={0.2} color="#C9A227" opacity={0.4} />
    </>
  );
}

export function JourneyOrbit3D({ steps: journeySteps }: { steps: OrbitStep[] }) {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 40 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }} style={{ background: "transparent" }}>
      <OrbitScene journeySteps={journeySteps} />
    </Canvas>
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
      <Sparkles count={30} scale={3} size={2} speed={0.4} color={m.c} opacity={0.7} />
    </>
  );
}

export function BandSphere3D({ band }: { band: "steady" | "watch" | "friction" | "blocked" }) {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 40 }} dpr={[1, 2]} gl={{ alpha: true, antialias: true }} style={{ background: "transparent" }}>
      <BandSphereScene band={band} />
    </Canvas>
  );
}
