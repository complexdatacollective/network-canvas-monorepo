import type { MotionProps, Variant, Variants } from 'motion/react';

import {
  segmentLayoutSpring,
  segmentPresenceVariants,
} from '@codaco/fresco-ui/SegmentedToolbar';

// The toolbar's grow-in leaves `filter: blur(0px) opacity(100%)` on a
// segment once it has arrived. A filter keeps the element in a layer of its
// own, which makes a navigation bar button's hover feedback lag behind the
// pointer, so the bar removes the filter once a button has grown in.
const segmentAnimate = segmentPresenceVariants.animate;

const settled = (variant: Variant | undefined): Variant =>
  typeof variant === 'object'
    ? { ...variant, transitionEnd: { filter: 'none' } }
    : (variant ?? {});

/**
 * How a navigation bar button that comes and goes appears and disappears:
 * the segmented toolbar's grow-in and shrink-away, with no filter left on the
 * button once it is in place.
 */
const barPresenceVariants: Variants = {
  ...segmentPresenceVariants,
  animate: settled(segmentAnimate),
};

/** How a navigation bar control fades, with reduced motion. */
export const fadeVariants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
  exit: {
    opacity: 0,
  },
};

/**
 * The bar moves its controls the way the segmented toolbar moves its
 * segments. A control grows out of a blur when it appears and shrinks back
 * into one when it goes, while the controls that stay glide to their new
 * places.
 *
 * When the bar first appears, every control takes its animation from the
 * bar, which brings them in one after another once it has finished arriving
 * (`arrived` is false). After that, a control that can come and go
 * (`presence`) names its own variants: a control that is removed does not
 * take `exit` from the bar, and one that is added must animate by itself.
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
  presence,
  arrived,
  layoutDependency,
}: {
  reduceMotion: boolean;
  presence: boolean;
  arrived: boolean;
  layoutDependency: string;
}): MotionProps => ({
  variants: reduceMotion ? fadeVariants : barPresenceVariants,
  ...(presence &&
    arrived && { initial: 'initial', animate: 'animate', exit: 'exit' }),
  layout: 'position',
  layoutDependency,
  transition: {
    layout: reduceMotion ? { duration: 0 } : segmentLayoutSpring,
  },
});
