import type { ReactNode } from 'react';

import { cx } from './utils/cva';

const VIEW_BOX = 40;
const STROKE_WIDTH = 3.5;
// The stroke's outer edge meets the edge of the view box.
const RADIUS = VIEW_BOX / 2 - STROKE_WIDTH / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type ProgressRingProps = {
  /** How much of the ring is filled, from 0 to 1. */
  value: number;
  /** Draws the filled arc in the success colour, for something finished. */
  complete?: boolean;
  /** Centred over the ring: a count, a percentage, an icon. */
  children?: ReactNode;
  /** Sizes the ring; it fills its box to the edge. */
  className?: string;
};

/**
 * A ring that fills clockwise from the top, with whatever it measures in its
 * middle.
 *
 * Presentational: the ring is drawn hidden from assistive technology, and
 * says nothing on its own. It is usually the face of a control that names the
 * progress itself (a toolbar button reading "Family tree 92% complete"), so
 * the caller names it there, or adds visually hidden text among `children`.
 */
export default function ProgressRing({
  value,
  complete = false,
  children,
  className,
}: ProgressRingProps) {
  const fraction = Math.min(1, Math.max(0, value));
  return (
    <span
      className={cx(
        'relative inline-flex size-full items-center justify-center',
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
        className="size-full -rotate-90"
        aria-hidden
      >
        <circle
          cx={VIEW_BOX / 2}
          cy={VIEW_BOX / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          className="stroke-current opacity-20"
        />
        <circle
          cx={VIEW_BOX / 2}
          cy={VIEW_BOX / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          className={cx(
            'transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none',
            complete ? 'stroke-success' : 'stroke-primary',
          )}
        />
      </svg>
      {children === undefined ? null : (
        <span className="absolute inset-0 flex items-center justify-center">
          {children}
        </span>
      )}
    </span>
  );
}
