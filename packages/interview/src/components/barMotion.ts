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
const STAGGER = 0.05;

// How far a control travels as it comes in with the bar, from the start of
// the line (the left, or the right in a right-to-left interview).
const ENTRANCE_TRAVEL = 24;

// The spring a control comes in on with the bar: heavier and slower to
// settle than the toolbar's, so the bar's controls land with some weight.
const ENTRANCE_SPRING = {
  type: 'spring',
  stiffness: 260,
  damping: 26,
  mass: 1.4,
} as const;

/**
 * What a control needs to know to come in: whether it comes in with the bar,
 * when, and from how far.
 */
type BarItemCustom = Readonly<{
  entering: boolean;
  delay: number;
  travel: number;
}>;

const target = (variant: Variant | undefined) =>
  typeof variant === 'object' ? variant : {};

const grown = target(segmentPresenceVariants.animate);

/**
 * The segmented toolbar's grow-in and shrink-away. A control's `custom` says
 * how long it waits before growing in, in seconds, and how far it travels as
 * it does (0 for a control added after the bar has appeared).
 *
 * Once grown in, a control is left with no `filter`: a filter keeps it in a
 * layer of its own, which makes its hover feedback lag behind the pointer.
 */
const barVariants: Variants = {
  initial: ({ travel }: BarItemCustom) => ({
    ...target(segmentPresenceVariants.initial),
    x: travel,
  }),
  animate: ({ entering, delay }: BarItemCustom) => ({
    ...grown,
    x: 0,
    transition: { ...(entering ? ENTRANCE_SPRING : grown.transition), delay },
    transitionEnd: { filter: 'none' },
  }),
  exit: target(segmentPresenceVariants.exit),
};

/** With reduced motion a control only fades. */
const fadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: ({ delay }: BarItemCustom) => ({
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
 * after the control before it (`index`, its place on the bar), coming in from
 * the start of the line on a heavier spring. A control added later grows in
 * at once, in place, on the toolbar's spring. When animations are turned off,
 * the delays are skipped with them, so the controls are simply there.
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
  isRtl,
  entering,
  index,
  layoutDependency,
}: {
  reduceMotion: boolean;
  isRtl: boolean;
  entering: boolean;
  index: number;
  layoutDependency: string;
}): MotionProps => ({
  variants: reduceMotion ? fadeVariants : barVariants,
  custom: {
    entering,
    delay: entering ? BAR_ENTRANCE + index * STAGGER : 0,
    travel: entering ? (isRtl ? ENTRANCE_TRAVEL : -ENTRANCE_TRAVEL) : 0,
  } satisfies BarItemCustom,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  layout: 'position',
  layoutDependency,
  transition: {
    layout: reduceMotion ? { duration: 0 } : segmentLayoutSpring,
  },
});
