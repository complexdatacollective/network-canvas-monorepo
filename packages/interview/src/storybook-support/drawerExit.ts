/**
 * How far a drawer's panel is moved across the screen while it leaves, in
 * pixels: negative for the left, positive for the right.
 *
 * Base UI marks a leaving panel with `data-ending-style` for the length of
 * its transition, and a test run skips that transition, so the panel is never
 * seen on its way out. The mark is set here for long enough to read the
 * style it selects.
 */
export function exitOffsetOf(panel: HTMLElement): number {
  const { transition } = panel.style;
  panel.style.transition = 'none';
  panel.setAttribute('data-ending-style', '');
  try {
    return new DOMMatrixReadOnly(getComputedStyle(panel).transform).m41;
  } finally {
    panel.removeAttribute('data-ending-style');
    panel.style.transition = transition;
  }
}
