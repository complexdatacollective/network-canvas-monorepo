import type {
  MotionProps,
  TargetAndTransition,
  Variant,
  Variants,
} from 'motion/react';

import {
  segmentLayoutSpring,
  segmentPresenceVariants,
} from '@codaco/fresco-ui/SegmentedToolbar';

/**
 * How long the bar takes to slide in, in seconds. The controls on it when it
 * first appears fade in once it has.
 */
export const BAR_ENTRANCE = 0.6;

// How long the controls take to fade in with the bar, in seconds.
const ENTRANCE_FADE = 0.3;

const target = (variant: Variant | undefined): TargetAndTransition =>
  typeof variant === 'object' ? variant : {};

const grown = target(segmentPresenceVariants.animate);

// The controls on the bar when it first appears fade in together once it has
// slid in.
const entranceFade = {
  opacity: { delay: BAR_ENTRANCE, duration: ENTRANCE_FADE },
};

/**
 * `opacity` is kept for that fade and `filter` for a control's own coming and
 * going, so the target a control animates to is the same whichever way it
 * arrived. A control's `custom` (whether it arrived with the bar) changes one
 * frame after the bar appears, and a target that read it would change then
 * too, stopping the fade.
 *
 * A control that arrives with the bar starts fully grown and transparent; one
 * added later starts opaque and shrunk into a blur.
 *
 * Once grown in, a control is left with no `filter`: a filter keeps it in a
 * layer of its own, which makes its hover feedback lag behind the pointer.
 */
const barVariants: Variants = {
  initial: (entering: boolean) =>
    entering
      ? { opacity: 0, scale: 1, filter: 'blur(0px) opacity(100%)' }
      : { ...target(segmentPresenceVariants.initial), opacity: 1 },
  animate: {
    scale: grown.scale,
    filter: grown.filter,
    opacity: 1,
    transition: { ...grown.transition, ...entranceFade },
    transitionEnd: { filter: 'none' },
  },
  exit: target(segmentPresenceVariants.exit),
};

/** With reduced motion a control only fades, by the same split. */
const fadeVariants: Variants = {
  initial: (entering: boolean) =>
    entering
      ? { opacity: 0, filter: 'opacity(100%)' }
      : { opacity: 1, filter: 'opacity(0%)' },
  animate: {
    opacity: 1,
    filter: 'opacity(100%)',
    transition: entranceFade,
    transitionEnd: { filter: 'none' },
  },
  exit: { opacity: 0 },
};

/**
 * How every control on the navigation bar moves, the way the segmented
 * toolbar moves its segments: a control grows out of a blur when it appears
 * and shrinks back into one when it goes, and the controls that stay glide
 * to their new places.
 *
 * Each control animates by itself. The controls on the bar when the bar first
 * appears (`entering`) fade in together once the bar has slid in. When
 * animations are turned off, the delay is skipped with them, so the controls
 * are simply there.
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
  layoutDependency,
}: {
  reduceMotion: boolean;
  entering: boolean;
  layoutDependency: string;
}): MotionProps => ({
  variants: reduceMotion ? fadeVariants : barVariants,
  custom: entering,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  layout: 'position',
  layoutDependency,
  transition: {
    layout: reduceMotion ? { duration: 0 } : segmentLayoutSpring,
  },
});
