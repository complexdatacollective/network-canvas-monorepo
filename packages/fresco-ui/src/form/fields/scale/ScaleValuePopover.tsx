'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { surfaceVariants } from '../../../layout/Surface';
import { usePortalContainer } from '../../../PortalContainer';
import { cx } from '../../../utils/cva';

// A transient value bubble that rides the slider thumb while the control is
// being adjusted. It reuses the shared popover surface variant so it matches
// Tooltip/Popover, and portals into the shared PortalContainer to escape the
// (overflow-clipped) field container. Unlike base-ui's Popover it tracks the
// thumb's live position every frame — base-ui doesn't reposition to a moving
// anchor once open.
export default function ScaleValuePopover({
  visible,
  anchor,
  children,
}: {
  visible: boolean;
  /** The thumb element the bubble is anchored to. */
  anchor: Element | null;
  children: ReactNode;
}) {
  const container = usePortalContainer();
  const reduceMotion = useReducedMotion();
  const positionerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!visible || !anchor) return undefined;
    let frame = 0;
    const track = () => {
      const positioner = positionerRef.current;
      if (positioner) {
        const rect = anchor.getBoundingClientRect();
        positioner.style.left = `${rect.left + rect.width / 2}px`;
        positioner.style.top = `${rect.top}px`;
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [visible, anchor]);

  const target =
    container ?? (typeof document === 'undefined' ? null : document.body);
  if (!target) return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <div
          ref={positionerRef}
          className="pointer-events-none! fixed top-0 left-0 z-60"
        >
          {/* Centred on the thumb, floated above it; the outer wrapper owns the
              positioning transform so motion is free to animate the bubble. */}
          <div className="absolute bottom-2 left-0 -translate-x-1/2">
            <motion.div
              data-testid="scale-value-popover"
              className="relative"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 4, scale: 0.92 }
              }
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
              }
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 4, scale: 0.92 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', duration: 0.25, bounce: 0.3 }
              }
            >
              <div
                className={cx(
                  surfaceVariants({
                    level: 'popover',
                    shadow: 'sm',
                    spacing: 'none',
                  }),
                  'px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                )}
              >
                {children}
              </div>
              {/* Caret: a rotated square painted over the bubble's bottom border,
                  so the outline flows into the point. Rendered after the bubble
                  so it sits in front. */}
              <span
                aria-hidden="true"
                className="border-outline bg-surface-popover absolute top-full left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r-2 border-b-2"
              />
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    target,
  );
}
