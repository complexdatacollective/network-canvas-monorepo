'use client';

/**
 * FamilyPedigreePlaceholder
 *
 * Decorative, infinitely-looping pedigree illustration for the Family
 * Pedigree intro screen. It symbolically previews the build process and
 * repeats forever in four calm beats:
 *
 *   1. SKETCH    — the family-tree skeleton draws itself in (platinum
 *                  strokes: parents → sibling rail → children), mirroring
 *                  "we sketch out your immediate family for you".
 *   2. FILL      — each node fills with colour in turn (top-down, then
 *                  left-to-right), as if details are being entered for one
 *                  relative after another.
 *   3. ADD       — a tap pulse lands on the ego node and a brand-new
 *                  relative branch draws out beneath it and fills in,
 *                  conveying "click any person to add more relatives".
 *   4. RESET     — the finished tree holds for about a second, then the
 *                  colour drains and every stroke un-draws back to an empty
 *                  canvas. The loop's end state IS its start state, so it
 *                  repeats seamlessly with no jarring snap.
 *
 * Each element animates its own pathLength / fillOpacity / scale on a
 * shared LOOP-length timeline (keyframes + per-property `times`), so the
 * whole composition stays phase-locked and loops as one. Honors
 * prefers-reduced-motion by rendering the finished, fully-detailed tree
 * statically with no motion. Decorative only: aria-hidden, no text labels.
 *
 * Geometry keeps the existing 10× coordinate scale (radius 170,
 * viewBox 0 0 2800 1600) to avoid sub-pixel rounding.
 */

import { motion, useReducedMotion } from 'motion/react';
import type { Easing, Transition } from 'motion/react';

// ---- Loop timing (seconds) ------------------------------------------------
const BASE = 8.6; // length of the base timeline (seconds)
const SPEED = 1.1; // play 10% slower than the base timeline
const LOOP = BASE * SPEED; // actual wall-clock loop length (~9.46s)
const RD = 0.5; // calm empty pause between cycles
const TAP = 4.3; // tap pulse lands on the ego node
// The finished tree holds from ~6.0s until DRAIN_A — a ~1s beat before the reverse.
const DRAIN_A = 7.0; // colour starts draining
const DRAIN_B = 7.6;
const ERASE_A = 7.4; // strokes start un-drawing
const ERASE_B = 8.3;

// Event times below are authored on the BASE timeline; the loop runs `duration: LOOP`
// (10% longer) while keeping the same fractions, so the whole thing simply plays slower.
const f = (t: number) => t / BASE; // seconds → fraction of the loop

// Eased segments: hold → ramp-in → hold → ramp-out
const DRAW_EASE: Easing[] = ['linear', 'easeOut', 'linear', 'easeInOut'];
const FILL_EASE: Easing[] = ['linear', 'easeOut', 'linear', 'easeInOut'];
const POP_EASE: Easing[] = ['linear', 'easeOut', 'easeInOut'];

const loop = (times: number[], ease: Easing[] | Easing): Transition => ({
  duration: LOOP,
  repeat: Infinity,
  repeatDelay: RD,
  times,
  ease,
});

const STROKE_KEYS = [0, 0, 1, 1, 0]; // empty → drawn (a→b) → un-drawn at reset
const FILL_KEYS = [0, 0, 1, 1, 0]; // empty → filled (a→b) → drained at reset
const POP_KEYS = [1, 1, 1.08, 1]; // a gentle pop as a node fills

// A connecting line: draws on (a→b), un-draws during the reset.
const strokeAnim = (a: number, b: number) => ({
  animate: { pathLength: STROKE_KEYS },
  transition: {
    pathLength: loop([0, f(a), f(b), f(ERASE_A), f(ERASE_B)], DRAW_EASE),
  },
});

// A node: outline draws on (da→db), then fills + pops (fa→fb), then resets.
const nodeAnim = (da: number, db: number, fa: number, fb: number) => ({
  animate: { pathLength: STROKE_KEYS, fillOpacity: FILL_KEYS, scale: POP_KEYS },
  transition: {
    pathLength: loop([0, f(da), f(db), f(ERASE_A), f(ERASE_B)], DRAW_EASE),
    fillOpacity: loop([0, f(fa), f(fb), f(DRAIN_A), f(DRAIN_B)], FILL_EASE),
    scale: loop([0, f(fa), f(fa + 0.18), f(fa + 0.55)], POP_EASE),
  },
});

export default function FamilyPedigreePlaceholder({
  className,
}: {
  className?: string;
}) {
  const reduce = useReducedMotion();

  // ---- Geometry (viewBox 0 0 2800 1600) ----
  const r = 170; // circle radius & half-side length for squares
  const rNew = 130; // radius of the grown-in "new relative" node
  const rx = 100; // square corner radius
  const sw = 25; // stroke width

  const father = { x: 1000, y: 260 }; // square
  const mother = { x: 1800, y: 260 }; // circle
  const midX = (father.x + mother.x) / 2; // 1400
  const railY = 720;
  const kidsY = 980;
  const child1 = { x: 600, y: kidsY }; // circle
  const ego = { x: midX, y: kidsY }; // square (the participant)
  const child3 = { x: 2200, y: kidsY }; // circle
  const newKid = { x: midX, y: 1460 }; // circle, grown out in beat 3

  // Pivot SVG scale transforms on each element's own centre.
  const pivot = {
    transformBox: 'fill-box',
    transformOrigin: 'center',
  } as const;

  // Initial state: empty when animated, fully-detailed when reduced-motion.
  const nodeInit = {
    pathLength: reduce ? 1 : 0,
    fillOpacity: reduce ? 1 : 0,
    scale: 1,
  };
  const lineInit = { pathLength: reduce ? 1 : 0 };

  return (
    <svg
      className={className}
      viewBox="0 0 2800 1600"
      fill="none"
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {/* ============================ connecting lines (platinum) ============================ */}
      <motion.line
        className="stroke-platinum"
        x1={father.x + r}
        y1={father.y}
        x2={mother.x - r}
        y2={mother.y}
        strokeWidth={sw}
        strokeLinecap="butt"
        initial={lineInit}
        {...(reduce ? {} : strokeAnim(0.0, 0.55))}
      />
      <motion.line
        className="stroke-platinum"
        x1={midX}
        y1={father.y}
        x2={midX}
        y2={railY}
        strokeWidth={sw}
        strokeLinecap="butt"
        initial={lineInit}
        {...(reduce ? {} : strokeAnim(0.5, 0.95))}
      />
      <motion.line
        className="stroke-platinum"
        x1={child1.x - sw / 2}
        y1={railY}
        x2={child3.x + sw / 2}
        y2={railY}
        strokeWidth={sw}
        strokeLinecap="butt"
        initial={lineInit}
        {...(reduce ? {} : strokeAnim(0.75, 1.4))}
      />
      <motion.line
        className="stroke-platinum"
        x1={child1.x}
        y1={railY}
        x2={child1.x}
        y2={kidsY - r}
        strokeWidth={sw}
        strokeLinecap="butt"
        initial={lineInit}
        {...(reduce ? {} : strokeAnim(1.05, 1.4))}
      />
      <motion.line
        className="stroke-platinum"
        x1={ego.x}
        y1={railY}
        x2={ego.x}
        y2={kidsY - r}
        strokeWidth={sw}
        strokeLinecap="butt"
        initial={lineInit}
        {...(reduce ? {} : strokeAnim(1.15, 1.5))}
      />
      <motion.line
        className="stroke-platinum"
        x1={child3.x}
        y1={railY}
        x2={child3.x}
        y2={kidsY - r}
        strokeWidth={sw}
        strokeLinecap="butt"
        initial={lineInit}
        {...(reduce ? {} : strokeAnim(1.25, 1.6))}
      />

      {/* new relative branch — draws out beneath the ego node in beat 3 */}
      <motion.line
        className="stroke-platinum"
        x1={ego.x}
        y1={ego.y + r}
        x2={newKid.x}
        y2={newKid.y - rNew}
        strokeWidth={sw}
        strokeLinecap="butt"
        initial={lineInit}
        {...(reduce ? {} : strokeAnim(4.7, 5.2))}
      />

      {/* ============================ nodes ============================ */}
      {/* squares = one sex, circles = the other — both shapes always present. */}
      {/* They sketch as platinum outlines, then each fills primary in turn.  */}
      <motion.rect
        className="stroke-platinum fill-primary"
        x={father.x - r}
        y={father.y - r}
        width={r * 2}
        height={r * 2}
        rx={rx}
        strokeWidth={sw}
        style={pivot}
        initial={nodeInit}
        {...(reduce ? {} : nodeAnim(0.15, 0.7, 2.4, 2.85))}
      />
      <motion.circle
        className="stroke-platinum fill-primary"
        cx={mother.x}
        cy={mother.y}
        r={r}
        strokeWidth={sw}
        style={pivot}
        initial={nodeInit}
        {...(reduce ? {} : nodeAnim(0.28, 0.85, 2.7, 3.15))}
      />
      <motion.circle
        className="stroke-platinum fill-primary"
        cx={child1.x}
        cy={child1.y}
        r={r}
        strokeWidth={sw}
        style={pivot}
        initial={nodeInit}
        {...(reduce ? {} : nodeAnim(1.3, 1.85, 3.0, 3.45))}
      />
      <motion.rect
        className="stroke-platinum fill-primary"
        x={ego.x - r}
        y={ego.y - r}
        width={r * 2}
        height={r * 2}
        rx={rx}
        strokeWidth={sw}
        style={pivot}
        initial={nodeInit}
        {...(reduce ? {} : nodeAnim(1.45, 1.95, 3.3, 3.75))}
      />
      <motion.circle
        className="stroke-platinum fill-primary"
        cx={child3.x}
        cy={child3.y}
        r={r}
        strokeWidth={sw}
        style={pivot}
        initial={nodeInit}
        {...(reduce ? {} : nodeAnim(1.6, 2.15, 3.6, 4.05))}
      />

      {/* new relative node — draws on and fills after the tap pulse */}
      <motion.circle
        className="stroke-platinum fill-primary"
        cx={newKid.x}
        cy={newKid.y}
        r={rNew}
        strokeWidth={sw}
        style={pivot}
        initial={nodeInit}
        {...(reduce ? {} : nodeAnim(5.1, 5.6, 5.5, 6.0))}
      />

      {/* ============================ tap pulse on the ego node (accent) ============================ */}
      {!reduce && (
        <>
          <motion.circle
            className="text-accent"
            cx={ego.x}
            cy={ego.y}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={sw}
            style={pivot}
            initial={{ scale: 0.55, opacity: 0 }}
            animate={{ scale: [0.55, 0.55, 1.85], opacity: [0, 0, 0.55, 0] }}
            transition={{
              scale: loop([0, f(TAP), f(TAP + 1.15)], ['linear', 'easeOut']),
              opacity: loop(
                [0, f(TAP), f(TAP + 0.55), f(TAP + 1.15)],
                ['linear', 'easeOut', 'easeIn'],
              ),
            }}
          />
          <motion.circle
            className="fill-accent"
            cx={ego.x}
            cy={ego.y}
            r={46}
            style={pivot}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 0, 1, 0.8], opacity: [0, 0, 1, 0] }}
            transition={{
              scale: loop(
                [0, f(TAP), f(TAP + 0.4), f(TAP + 0.7)],
                ['linear', 'easeOut', 'easeIn'],
              ),
              opacity: loop(
                [0, f(TAP), f(TAP + 0.4), f(TAP + 0.7)],
                ['linear', 'easeOut', 'easeIn'],
              ),
            }}
          />
        </>
      )}
    </svg>
  );
}
