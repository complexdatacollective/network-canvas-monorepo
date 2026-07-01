'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import { surfaceVariants } from '../../../layout/Surface';
import { ArrowSvg } from '../../../Popover';
import { sliderValuePopoverStyles } from '../../../styles/controlVariants';
import { cx } from '../../../utils/cva';

// A transient value bubble that rides the slider thumb while the control is
// being adjusted. Styled with the shared popover surface variant (and the shared
// arrow) so it matches Tooltip/Popover. Positioned via a computed percentage
// (base-ui's `--slider-thumb-position` is inline on the thumb, unreadable by
// siblings). Decorative for assistive tech — the value is announced via the
// field's aria-live region / native slider input.
export default function ScaleValuePopover({
  visible,
  position,
  children,
}: {
  visible: boolean;
  /** Horizontal position of the thumb as a 0–100 percentage of the track. */
  position: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          aria-hidden="true"
          data-testid="scale-value-popover"
          className={sliderValuePopoverStyles}
          style={{ left: `${position}%` }}
          initial={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.92 }
          }
          animate={
            reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
          }
          exit={
            reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.92 }
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
              'px-2 py-0.5 text-sm font-medium whitespace-nowrap',
            )}
          >
            {children}
          </div>
          <ArrowSvg className="absolute top-full left-1/2 -translate-x-1/2 translate-y-[-9px] rotate-180" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
