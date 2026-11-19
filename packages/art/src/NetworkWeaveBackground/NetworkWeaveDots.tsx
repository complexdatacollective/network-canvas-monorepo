'use client';

import { useEffect, useRef } from 'react';

import { usePrefersReducedMotion } from '@codaco/fresco-ui/reducedMotion';

import {
  type NetworkWeaveBounds,
  NETWORK_WEAVE_DOT_WIDTH,
  NETWORK_WEAVE_HEIGHT,
  NETWORK_WEAVE_WIDTH,
} from './networkWeaveScene';

// A dot is a one-unit dash with round caps; the gap brings the next one along.
const DASH = 1;
const GAP = 52;
export const NETWORK_WEAVE_DOT_SPACING = DASH + GAP;

// The dots drift slowly, so they are redrawn only when they have moved far
// enough to see: about this many scene units, and never more often than the
// limit. Redrawing them on every screen refresh costs a repaint each time for
// a movement of a fraction of a pixel.
const UNITS_PER_STEP = 0.6;
const MAX_STEPS_PER_SECOND = 30;
const MIN_STEPS_PER_SECOND = 8;

const dotStepsPerSecond = (unitsPerSecond: number) =>
  Math.min(
    MAX_STEPS_PER_SECOND,
    Math.max(MIN_STEPS_PER_SECOND, Math.ceil(unitsPerSecond / UNITS_PER_STEP)),
  );

type NetworkWeaveDot = {
  d: string;
  color: string | undefined;
  /** How far along its spacing this tributary's dots start, in scene units. */
  phase: number;
};

const percent = (value: number) => `${Number((value * 100).toFixed(3))}%`;

/**
 * The dots that travel along the tributaries towards the convergence. They
 * sit in their own layer, sized to the part of the scene the tributaries
 * cross, so that moving them never repaints the ribbons.
 */
export default function NetworkWeaveDots({
  dots,
  bounds,
  unitsPerSecond,
}: {
  dots: readonly NetworkWeaveDot[];
  bounds: NetworkWeaveBounds;
  unitsPerSecond: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const reduceMotion = usePrefersReducedMotion();

  useEffect(() => {
    const svg = ref.current;
    // `null` is "not known yet": the dots stay where they are until it is.
    if (!svg || reduceMotion !== false) return undefined;

    const step = () => {
      if (document.hidden) return;
      const travelled = (performance.now() / 1000) * unitsPerSecond;
      svg.style.setProperty(
        '--network-weave-dash',
        `${(-(travelled % NETWORK_WEAVE_DOT_SPACING)).toFixed(2)}px`,
      );
    };
    step();
    const interval = window.setInterval(
      step,
      1000 / dotStepsPerSecond(unitsPerSecond),
    );
    return () => {
      window.clearInterval(interval);
      svg.style.removeProperty('--network-weave-dash');
    };
  }, [reduceMotion, unitsPerSecond]);

  return (
    <svg
      ref={ref}
      className="network-weave__dots"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="none"
      focusable="false"
      style={{
        position: 'absolute',
        left: percent(bounds.x / NETWORK_WEAVE_WIDTH),
        top: percent(bounds.y / NETWORK_WEAVE_HEIGHT),
        width: percent(bounds.width / NETWORK_WEAVE_WIDTH),
        height: percent(bounds.height / NETWORK_WEAVE_HEIGHT),
        display: 'block',
        // Its own layer: a step repaints these strokes and nothing else.
        willChange: 'transform',
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {dots.map((dot, index) => (
        <path
          key={`tributary-flow-${index}`}
          className="network-weave__tributary-flow"
          d={dot.d}
          fill="none"
          stroke={dot.color}
          strokeWidth={NETWORK_WEAVE_DOT_WIDTH}
          strokeOpacity="0.64"
          strokeDasharray={`${DASH} ${GAP}`}
          strokeLinecap="round"
          style={{
            strokeDashoffset: `calc(var(--network-weave-dash, 0px) - ${Number(dot.phase.toFixed(2))}px)`,
          }}
        />
      ))}
    </svg>
  );
}
