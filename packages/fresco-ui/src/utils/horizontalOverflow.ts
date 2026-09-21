export type HorizontalOverflow = {
  /** Content hidden past the left edge, in px. */
  left: number;
  /** Content hidden past the right edge, in px. */
  right: number;
  /** Content hidden past the inline-end edge (right in LTR, left in RTL). */
  inlineEnd: number;
};

export function isRightToLeft(element: HTMLElement): boolean {
  return getComputedStyle(element).direction === 'rtl';
}

/**
 * Measures how much of a horizontally scrolling element's content lies past
 * each physical edge. RTL scrolling reports a zero-or-negative `scrollLeft`, so
 * the distance travelled is taken as its magnitude and mapped back to a side.
 *
 * With `excludePadding`, the element's own left/right padding is not counted
 * as hidden content, so a fade appears only once content (not padding) has
 * scrolled past the edge.
 */
export function measureHorizontalOverflow(
  element: HTMLElement,
  { excludePadding = false }: { excludePadding?: boolean } = {},
): HorizontalOverflow {
  const hidden = Math.max(0, element.scrollWidth - element.clientWidth);
  if (hidden === 0) return { left: 0, right: 0, inlineEnd: 0 };

  const styles = getComputedStyle(element);
  const rightToLeft = styles.direction === 'rtl';
  const travelled = Math.min(Math.abs(element.scrollLeft), hidden);
  const left = rightToLeft ? hidden - travelled : travelled;
  const right = hidden - left;
  const padLeft = excludePadding ? Number.parseFloat(styles.paddingLeft) : 0;
  const padRight = excludePadding ? Number.parseFloat(styles.paddingRight) : 0;

  return {
    left: Math.max(0, left - padLeft),
    right: Math.max(0, right - padRight),
    inlineEnd: rightToLeft ? left : right,
  };
}

/** Writes the variables the `scroll-area-viewport-x` fade utility reads. */
export function setHorizontalOverflowVariables(
  target: HTMLElement,
  { left, right }: HorizontalOverflow,
) {
  target.style.setProperty('--scroll-area-overflow-x-start', `${left}px`);
  target.style.setProperty('--scroll-area-overflow-x-end', `${right}px`);
}
