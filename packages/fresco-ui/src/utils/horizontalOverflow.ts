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

export function setHorizontalOverflowVariables(
  target: HTMLElement,
  { left, right }: HorizontalOverflow,
) {
  target.style.setProperty('--scroll-area-overflow-x-start', `${left}px`);
  target.style.setProperty('--scroll-area-overflow-x-end', `${right}px`);
}
