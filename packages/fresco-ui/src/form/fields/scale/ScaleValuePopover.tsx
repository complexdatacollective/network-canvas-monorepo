'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import {
  sliderValuePopoverCaretStyles,
  sliderValuePopoverStyles,
} from '../../../styles/controlVariants';

// A transient value bubble that rides the slider thumb while the control is
// being adjusted. Positioned via base-ui's `--slider-thumb-position`, so it must
// be rendered inside the Slider.Track. Decorative for assistive tech (the value
// is announced via the field's aria-live region / native slider input).
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
          {children}
          <span className={sliderValuePopoverCaretStyles} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
