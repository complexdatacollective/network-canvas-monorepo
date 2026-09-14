import { NAV_HEIGHT_VARIABLE } from './navHeight';

/**
 * How far below the top of the scroller a target is asked to land: clear of
 * Architect's sticky navigation bar, plus a line of breathing room so the
 * thing being scrolled to does not sit flush against it.
 *
 * The bar's own measured height rather than a number, which is what this used
 * to be: a hard-coded 200px was a guess at a bar that has no fixed height, and
 * it left the target either behind the bar or halfway down the screen
 * depending on how the bar had wrapped.
 */
const SCROLL_MARGIN_TOP = `calc(var(${NAV_HEIGHT_VARIABLE}) + 1rem)`;

const scrollTo = (target: HTMLElement) => {
  if (!target) {
    return;
  }

  // `scroll-margin-top` applies the offset to the native `scrollIntoView` —
  // alignment only, no layout impact. The destination is computed
  // synchronously here, so restore the caller's prior inline value on the next
  // frame rather than leaving a stray offset on their element.
  const previousScrollMarginTop = target.style.scrollMarginTop;
  target.style.scrollMarginTop = SCROLL_MARGIN_TOP;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  requestAnimationFrame(() => {
    target.style.scrollMarginTop = previousScrollMarginTop;
  });
};

export default scrollTo;
