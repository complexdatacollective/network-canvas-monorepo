import type { MotionProps, Variant, Variants } from 'motion/react';

import {
  segmentLayoutSpring,
  segmentPresenceVariants,
} from '@codaco/fresco-ui/SegmentedToolbar';

/**
 * How long the bar takes to slide in, in seconds. The controls on it when it
 * first appears start growing in once it has.
 */
export const BAR_ENTRANCE = 0.6;

// The delay between one control's entrance and the next.
const STAGGER = 0.04;

const target = (variant: Variant | undefined) =>
  typeof variant === 'object' ? variant : {};

const grown = target(segmentPresenceVariants.animate);

/**
 * The segmented toolbar's grow-in and shrink-away. A control's `custom` is the
 * delay before it grows in, in seconds.
 *
 * Once grown in, a control is left with no `filter`: a filter keeps it in a
 * layer of its own, which makes its hover feedback lag behind the pointer.
 */
const barVariants: Variants = {
  initial: target(segmentPresenceVariants.initial),
  animate: (delay: number) => ({
    ...grown,
    transition: { ...grown.transition, delay },
    transitionEnd: { filter: 'none' },
  }),
  exit: target(segmentPresenceVariants.exit),
};

/** With reduced motion a control only fades. */
const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: (delay: number) => ({
    opacity: 1,
    transition: { delay },
  }),
  exit: { opacity: 0 },
};

/**
 * How every control on the navigation bar moves, the way the segmented
 * toolbar moves its segments: a control grows out of a blur when it appears
 * and shrinks back into one when it goes, and the controls that stay glide
 * to their new places.
 *
 * Each control animates by itself. A control that is on the bar when the bar
 * first appears (`entering`) waits until the bar has slid in, then grows in
 * after the control before it (`index`, its place on the bar). A control
 * added later grows in at once. When animations are turned off, the delays
 * are skipped with them, so the controls are simply there.
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
  entering,
  index,
  layoutDependency,
}: {
  reduceMotion: boolean;
  entering: boolean;
  index: number;
  layoutDependency: string;
}): MotionProps => ({
  variants: reduceMotion ? fadeVariants : barVariants,
  custom: entering ? BAR_ENTRANCE + index * STAGGER : 0,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  layout: 'position',
  layoutDependency,
  transition: {
    layout: reduceMotion ? { duration: 0 } : segmentLayoutSpring,
  },
});
