export type HorizontalOverflow = {
  left: number;
  right: number;
  inlineEnd: number;
};

export function isRightToLeft(element: HTMLElement): boolean {
  return getComputedStyle(element).direction === 'rtl';
}

export function measureHorizontalOverflow(
  element: HTMLElement,
  {
    excludePadding = false,
    scrollWidth = element.scrollWidth,
  }: { excludePadding?: boolean; scrollWidth?: number } = {},
): HorizontalOverflow {
  const hidden = Math.max(0, scrollWidth - element.clientWidth);
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

/**
 * The width a scroll container's content spans in layout: from the start of
 * its first in-flow child to the end of its last, plus its inline padding.
 *
 * `scrollWidth` also counts transformed and out-of-flow descendants, so it
 * runs past this while children animate, and Chrome does not always shrink it
 * back once they settle. Offset geometry ignores transforms, and children
 * taken out of flow (such as Motion's `popLayout` exits) are skipped. Taking
 * the span rather than the last child's end holds in either direction, since
 * a right-to-left row overflows to negative offsets.
 */
export function measureRestingScrollWidth(element: HTMLElement): number {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;

  for (const child of element.children) {
    if (!(child instanceof HTMLElement)) continue;
    const { display, position } = getComputedStyle(child);
    if (display === 'none' || position === 'absolute' || position === 'fixed') {
      continue;
    }
    start = Math.min(start, child.offsetLeft);
    end = Math.max(end, child.offsetLeft + child.offsetWidth);
  }

  const styles = getComputedStyle(element);
  const padding =
    (Number.parseFloat(styles.paddingLeft) || 0) +
    (Number.parseFloat(styles.paddingRight) || 0);

  return Math.max(0, end - start) + padding;
}

export function setHorizontalOverflowVariables(
  target: HTMLElement,
  { left, right }: HorizontalOverflow,
) {
  target.style.setProperty('--scroll-area-overflow-x-start', `${left}px`);
  target.style.setProperty('--scroll-area-overflow-x-end', `${right}px`);
}
