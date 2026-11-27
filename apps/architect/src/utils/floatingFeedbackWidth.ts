/**
 * How wide the floating Feedback button is, as a CSS custom property on the
 * document root. It sits in the bottom corner at the start edge, where the
 * action toolbar's controls would run under it at narrower widths.
 */
export const FLOATING_FEEDBACK_WIDTH_VARIABLE =
  '--architect-floating-feedback-width';

/**
 * The start padding that keeps a centred `max-w-7xl` row clear of the button:
 * its width and a gap, less whatever margin the row already has beside it on
 * a wide screen, and never below zero.
 */
export const FLOATING_FEEDBACK_CLEARANCE = `max(0px, calc(var(${FLOATING_FEEDBACK_WIDTH_VARIABLE}, 0px) + 0.5rem - max(0px, (100% - 80rem) / 2)))`;
