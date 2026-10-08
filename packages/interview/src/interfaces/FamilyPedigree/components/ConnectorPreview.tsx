'use client';

import type { MotionValue } from 'motion/react';
import { type RefObject, useEffect, useState } from 'react';

import {
  DASHED_PATTERN,
  EDGE_WIDTH,
} from '../pedigree-layout/components/EdgeRenderer';

type Point = { x: number; y: number };

type ConnectorPreviewProps = {
  /** The element the line is drawn in, which does not move with the
   * family. */
  container: RefObject<HTMLElement | null>;
  /** The family's pan and zoom, which move the people under a still mouse. */
  transform: {
    x: MotionValue<number>;
    y: MotionValue<number>;
    scale: MotionValue<number>;
  };
  /** The first person selected. */
  from: HTMLElement;
  /** The person the line ends on — hovered, focused or chosen — or null to
   * follow the mouse. */
  to: HTMLElement | null;
  /** The family's connector colour. */
  color: string;
};

const centreOf = (element: HTMLElement): Point => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/**
 * A line drawn like the family's own connectors, but dashed, from the first person selected for connecting to the mouse,
 * or to the person it is over. It follows the mouse itself, so moving it does
 * not re-render the family.
 */
export default function ConnectorPreview({
  container,
  transform,
  from,
  to,
  color,
}: ConnectorPreviewProps) {
  const [pointer, setPointer] = useState<Point | null>(null);
  // Panning and zooming move the people under a still mouse. The motion
  // values change before the frame that draws them, so the line is redrawn
  // on the frame after.
  const [, setMoved] = useState(0);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      setPointer({ x: event.clientX, y: event.clientY });
    };
    let frame = 0;
    const handleTransform = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setMoved((count) => count + 1));
    };
    const unsubscribe = [transform.x, transform.y, transform.scale].map(
      (value) => value.on('change', handleTransform),
    );
    window.addEventListener('pointermove', handleMove);
    return () => {
      cancelAnimationFrame(frame);
      for (const stop of unsubscribe) stop();
      window.removeEventListener('pointermove', handleMove);
    };
  }, [transform.x, transform.y, transform.scale]);

  const box = container.current?.getBoundingClientRect();
  const end = to ? centreOf(to) : pointer;
  if (!box || !end) return null;
  const start = centreOf(from);

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      <line
        x1={start.x - box.left}
        y1={start.y - box.top}
        x2={end.x - box.left}
        y2={end.y - box.top}
        stroke={color}
        strokeWidth={EDGE_WIDTH}
        strokeDasharray={DASHED_PATTERN}
      />
    </svg>
  );
}
