import type { Transition } from 'motion/react';

import type { Visual } from '../types';

// Settles without overshoot, for things the reader is about to read.
export const SETTLE: Transition = {
  type: 'spring',
  visualDuration: 0.4,
  bounce: 0.15,
};
// A small overshoot, for things arriving or being confirmed.
export const POP: Transition = {
  type: 'spring',
  visualDuration: 0.35,
  bounce: 0.35,
};

export const isAnimated = (visual: Visual): boolean =>
  visual.kind !== 'still' ||
  Boolean(visual.highlights?.length) ||
  Boolean(visual.zoom);
