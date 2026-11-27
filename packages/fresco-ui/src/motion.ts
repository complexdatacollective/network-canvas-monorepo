import type { Transition, Variants } from 'motion/react';

/**
 * The shared motion presets for Network Canvas interfaces.
 *
 * Each spring is defined by a pair of values: `visualDuration`, the time in
 * seconds that the spring takes to reach its target visually, and `bounce`,
 * how far it overshoots that target (0 means that it does not overshoot).
 * These are the values that Motion's `spring(visualDuration, bounce)` accepts.
 *
 * Use one of these presets for ordinary movement. Values that follow a drag
 * or a scroll position, and sequences that are tuned by hand, keep their own
 * settings.
 */
export const springs = {
  /** Feedback for a press or a selection, and for indicators that fill in. */
  press: { type: 'spring', visualDuration: 0.15, bounce: 0.25 },
  /** Layout changes, shared highlights, steps that slide, and exits. */
  snap: { type: 'spring', visualDuration: 0.2, bounce: 0 },
  /** Small items that appear: toggles, menus, popovers, dialogs and floating bars. */
  pop: { type: 'spring', visualDuration: 0.25, bounce: 0.3 },
  /** Content of medium size: cards, tables, panels and drawers. */
  settle: { type: 'spring', visualDuration: 0.35, bounce: 0.15 },
  /** Large, heavy surfaces that bounce slightly when they arrive. */
  heavy: { type: 'spring', visualDuration: 0.5, bounce: 0.3 },
  /** Movement that draws attention or celebrates a result. */
  bouncy: { type: 'spring', visualDuration: 0.3, bounce: 0.5 },
  /** Surfaces attached to an edge of the screen, which must not overshoot. */
  glide: { type: 'spring', visualDuration: 0.5, bounce: 0 },
} as const satisfies Record<string, Transition>;

/** A short tween for elements that leave the screen. */
export const exitTween = {
  duration: 0.2,
  ease: 'easeIn',
} as const satisfies Transition;

/** The delay, in seconds, between items that animate one after another. */
export const stagger = { tight: 0.05, loose: 0.1 } as const;

/**
 * Returns a transition with no duration when the user prefers reduced motion,
 * and the given transition otherwise.
 */
export function reduced(
  transition: Transition,
  reduceMotion: boolean | null,
): Transition {
  return reduceMotion ? { duration: 0 } : transition;
}

/**
 * A bar that floats over the bottom of the screen slides up from below and
 * fades in when it appears, and slides back down when it leaves.
 */
export const floatingBarPresence: Variants = {
  initial: { y: 100, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: springs.pop },
  exit: { y: 100, opacity: 0, transition: exitTween },
};

/**
 * An item grows out of a blur when it appears, and shrinks back into a blur
 * when it leaves.
 */
export const growPresence: Variants = {
  initial: {
    scale: 0.72,
    filter: 'blur(3px) opacity(0%)',
  },
  animate: {
    scale: 1,
    filter: 'blur(0px) opacity(100%)',
    transition: springs.pop,
  },
  exit: {
    scale: 0.72,
    filter: 'blur(3px) opacity(0%)',
    transition: springs.snap,
  },
};
