"use client";

/* ============================================================
   ASTROLABE — Micro-interactions
   Small reusable interaction primitives. Tree-shakeable via named
   exports. TypeScript strict, no `any`. Every component respects
   prefers-reduced-motion (transform-based effects degrade to
   opacity-only or static).
   ============================================================ */

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

/* A polymorphic host component type that accepts standard HTML attributes
   plus a ref. Used internally for rendering; the public `as` prop accepts
   the wider `ElementType` (so callers can pass either an intrinsic tag name
   like "li" or a component). */
type HostTag = ComponentType<HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }>;

/* ---------- shared hook: prefers-reduced-motion ---------- */

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

/* ---------- shared hook: coarse pointer (touch) ---------- */

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}

/* ============================================================
   <PressScale> — active:scale-[0.98] press feedback (120ms)
   ============================================================ */

interface PressScaleProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** Disable the press feedback (e.g. while loading). */
  disabled?: boolean;
}

export function PressScale({
  children,
  as,
  className = "",
  style,
  disabled = false,
}: PressScaleProps) {
  const reduce = usePrefersReducedMotion();
  const Tag = (as ?? "span") as unknown as HostTag;
  const transition = reduce ? "none" : "transform 120ms var(--ease-standard)";
  const enabled = !reduce && !disabled;
  return (
    <Tag
      className={`${className} ${enabled ? "active:scale-[0.98]" : ""}`.trim()}
      style={{
        display: "inline-flex",
        transition,
        willChange: enabled ? "transform" : undefined,
      }}
    >
      {children}
    </Tag>
  );
}

/* ============================================================
   <HoverLift> — hover:-translate-y-0.5 lift (180ms)
   ============================================================ */

interface HoverLiftProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

export function HoverLift({ children, as, className = "", style }: HoverLiftProps) {
  const reduce = usePrefersReducedMotion();
  const coarse = useCoarsePointer();
  const Tag = (as ?? "span") as unknown as HostTag;
  // Skip hover effects when reduced motion OR coarse pointer (touch).
  const enabled = !reduce && !coarse;
  return (
    <Tag
      className={`${className} ${enabled ? "hover:-translate-y-0.5" : ""}`.trim()}
      style={{
        display: "inline-flex",
        transition: enabled ? "transform 180ms var(--ease-standard)" : "none",
        willChange: enabled ? "transform" : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/* ============================================================
   <NumberTicker> — animated count with tabular numerals
   Eases from the previous value to the new value over 480ms.
   ============================================================ */

interface NumberTickerProps {
  value: number;
  /** Decimal places to render. Default 0. */
  decimals?: number;
  /** Optional prefix (e.g. "0."). */
  prefix?: string;
  /** Optional suffix (e.g. "%", "h"). */
  suffix?: string;
  className?: string;
  style?: CSSProperties;
}

export function NumberTicker({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className = "",
  style,
}: NumberTickerProps) {
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const currentRef = useRef(value); // latest animated value, for restart-on-change
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) return; // reduced-motion: render `value` directly (see `shown` below)
    const from = currentRef.current;
    const to = value;
    if (from === to) return;

    const duration = 480;
    const startTs = performance.now();
    // ease-out cubic
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTs) / duration);
      const eased = ease(t);
      const next = from + (to - from) * eased;
      currentRef.current = next;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        currentRef.current = to;
        setDisplay(to);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, reduce]);

  // When reduced-motion is on, skip the animation and render the target value.
  const shown = reduce ? value : display;
  const text = shown.toFixed(decimals);

  return (
    <span
      className={`tabular ${className}`.trim()}
      style={{
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: '"tnum"',
        ...style,
      }}
    >
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/* ============================================================
   <CitationHover> — wraps a citation chip; lifts 2px on hover
   and adds a teal underline glow
   ============================================================ */

interface CitationHoverProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function CitationHover({ children, className = "", style }: CitationHoverProps) {
  const reduce = usePrefersReducedMotion();
  const coarse = useCoarsePointer();
  const enabled = !reduce && !coarse;
  const [hover, setHover] = useState(false);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        position: "relative",
        transition: enabled ? "transform 180ms var(--ease-standard)" : "none",
        transform: hover && enabled ? "translateY(-2px)" : "translateY(0)",
        ...style,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      {/* teal underline glow */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 4,
          right: 4,
          bottom: -2,
          height: 2,
          borderRadius: 2,
          background: "rgba(22, 154, 165, 0.85)",
          opacity: hover && enabled ? 1 : 0,
          transition: enabled ? "opacity 180ms var(--ease-standard)" : "none",
          boxShadow:
            hover && enabled ? "0 0 8px rgba(22, 154, 165, 0.55)" : "0 0 0 rgba(22, 154, 165, 0)",
          pointerEvents: "none",
        }}
      />
    </span>
  );
}

/* ============================================================
   <RevealOnScroll> — IntersectionObserver fade+rise 8px, one-shot
   Set `--i` via the `stagger` prop to apply a 40ms-per-unit delay.
   ============================================================ */

interface RevealOnScrollProps {
  children: ReactNode;
  /** Position in the stagger sequence (0-based). Adds 40ms × i delay. */
  index?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** IntersectionObserver root margin (default triggers ~80px before in-view). */
  rootMargin?: string;
}

export function RevealOnScroll({
  children,
  index = 0,
  as,
  className = "",
  style,
  rootMargin = "0px 0px -80px 0px",
}: RevealOnScrollProps) {
  const reduce = usePrefersReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const Tag = (as ?? "div") as unknown as HostTag;

  useEffect(() => {
    if (reduce) return; // reduced-motion: treated as visible (see `shown` below)
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin, threshold: 0.04 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, rootMargin]);

  const shown = reduce || visible;
  const staggerMs = reduce ? 0 : Math.min(index, 8) * 40;

  const revealStyle: CSSProperties = reduce
    ? { opacity: 1 }
    : {
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 320ms var(--ease-standard), transform 320ms var(--ease-standard)",
        transitionDelay: `${staggerMs}ms`,
        willChange: "opacity, transform",
      };

  return (
    <Tag ref={ref as never} className={className} style={{ ...revealStyle, ...style }}>
      {children}
    </Tag>
  );
}

/* ============================================================
   <Tilt3D> — subtle 3D tilt on mouse move (max `maxDeg` degrees)
   perspective 800px. Disabled on touch / reduced-motion.
   ============================================================ */

interface Tilt3DProps {
  children: ReactNode;
  /** Maximum tilt in degrees (default 4). */
  maxDeg?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

export function Tilt3D({ children, maxDeg = 4, as, className = "", style }: Tilt3DProps) {
  const reduce = usePrefersReducedMotion();
  const coarse = useCoarsePointer();
  const enabled = !reduce && !coarse;
  const ref = useRef<HTMLElement | null>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const Tag = (as ?? "div") as unknown as HostTag;

  const handleMove = (e: React.MouseEvent<HTMLElement>) => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height; // 0..1
    // Center on 0.5, then scale to [-1, 1]
    const cx = px - 0.5;
    const cy = py - 0.5;
    // rotateX = tilt around X axis (top/bottom). Positive when cursor below center.
    // rotateY = tilt around Y axis (left/right). Positive when cursor right of center.
    const rx = -cy * 2 * maxDeg;
    const ry = cx * 2 * maxDeg;
    setTilt({ rx, ry });
  };

  const handleLeave = () => setTilt({ rx: 0, ry: 0 });

  const transform = enabled
    ? `perspective(800px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`
    : undefined;

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{
        transform,
        transition: enabled ? "transform 240ms var(--ease-standard)" : "none",
        transformStyle: "preserve-3d",
        willChange: enabled ? "transform" : undefined,
        ...style,
      }}
      onMouseMove={enabled ? handleMove : undefined}
      onMouseLeave={enabled ? handleLeave : undefined}
    >
      {children}
    </Tag>
  );
}

/* ---------- exports summary (tree-shakeable) ----------
   PressScale, HoverLift, NumberTicker, CitationHover,
   RevealOnScroll, Tilt3D
   ------------------------------------------------------ */
