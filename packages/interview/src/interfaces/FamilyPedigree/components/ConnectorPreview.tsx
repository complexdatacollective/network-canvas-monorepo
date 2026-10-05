'use client';

import { type RefObject, useEffect, useState } from 'react';

type Point = { x: number; y: number };

type ConnectorPreviewProps = {
  /** The element the line is drawn in; it scrolls with the family. */
  container: RefObject<HTMLElement | null>;
  /** The first person selected. */
  from: HTMLElement;
  /** The person the line ends on — hovered, focused or chosen — or null to
   * follow the mouse. */
  to: HTMLElement | null;
};

const centreOf = (element: HTMLElement): Point => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/**
 * A dashed line from the first person selected for connecting to the mouse,
 * or to the person it is over. It follows the mouse itself, so moving it does
 * not re-render the family.
 */
export default function ConnectorPreview({
  container,
  from,
  to,
}: ConnectorPreviewProps) {
  const [pointer, setPointer] = useState<Point | null>(null);
  // Scrolling moves the people under a still mouse.
  const [, setScrolled] = useState(0);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      setPointer({ x: event.clientX, y: event.clientY });
    };
    const handleScroll = () => setScrolled((count) => count + 1);
    window.addEventListener('pointermove', handleMove);
    // Scroll events do not bubble; capture catches the family's scroller.
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

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
        strokeWidth={3}
        strokeDasharray="8 6"
        strokeLinecap="round"
        className="stroke-primary"
      />
    </svg>
  );
}
