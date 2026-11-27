import type { MotionProps, Variant, Variants } from 'motion/react';

import {
  segmentLayoutSpring,
  segmentPresenceVariants,
} from '@codaco/fresco-ui/SegmentedToolbar';

// The delay between one control's entrance and the next.
const STAGGER = 0.04;

const target = (variant: Variant | undefined) =>
  typeof variant === 'object' ? variant : {};

const grown = target(segmentPresenceVariants.animate);

/**
 * The segmented toolbar's grow-in and shrink-away. A control's `custom` is its
 * place on the bar, which delays its entrance after the control before it.
 *
 * Once grown in, a control is left with no `filter`: a filter keeps it in a
 * layer of its own, which makes its hover feedback lag behind the pointer.
 */
const barVariants: Variants = {
  initial: target(segmentPresenceVariants.initial),
  animate: (index: number) => ({
    ...grown,
    transition: { ...grown.transition, delay: index * STAGGER },
    transitionEnd: { filter: 'none' },
  }),
  exit: target(segmentPresenceVariants.exit),
};

/** With reduced motion a control only fades. */
const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: (index: number) => ({
    opacity: 1,
    transition: { delay: index * STAGGER },
  }),
  exit: { opacity: 0 },
};

/**
 * How every control on the navigation bar moves, the way the segmented
 * toolbar moves its segments: a control grows out of a blur when it appears
 * and shrinks back into one when it goes, and the controls that stay glide
 * to their new places.
 *
 * Each control animates by itself. It waits, hidden, until the bar has
 * finished arriving (`arrived`), and then grows in after the control before
 * it (`index`, its place on the bar).
 *
 * A control glides only if it renders again when another comes or goes, so
 * that Motion can measure where it was. The React Compiler skips a control
 * whose props did not change, so every control takes `layoutDependency`: a
 * key naming the optional controls the bar shows. When the key changes,
 * every control renders and is measured again.
 *
 * With reduced motion a control only fades, and nothing glides.
 */
export const barItemMotion = ({
  reduceMotion,
  arrived,
  index,
  layoutDependency,
}: {
  reduceMotion: boolean;
  arrived: boolean;
  index: number;
  layoutDependency: string;
}): MotionProps => ({
  variants: reduceMotion ? fadeVariants : barVariants,
  custom: index,
  initial: 'initial',
  animate: arrived ? 'animate' : 'initial',
  exit: 'exit',
  layout: 'position',
  layoutDependency,
  transition: {
    layout: reduceMotion ? { duration: 0 } : segmentLayoutSpring,
  },
});
