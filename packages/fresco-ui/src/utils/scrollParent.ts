export function scrollParent(
  node: HTMLElement | SVGElement | null,
): HTMLElement | SVGElement | null {
  if (!(node instanceof HTMLElement || node instanceof SVGElement)) {
    return null;
  }

  let current: Node | null = node.parentNode;
  const regex = /(auto|scroll)/;

  while (current && current instanceof Element && current.parentNode) {
    const style = getComputedStyle(current);
    const overflow = style.overflow + style.overflowY + style.overflowX;

    if (
      regex.test(overflow) &&
      (current instanceof HTMLElement || current instanceof SVGElement)
    ) {
      return current;
    }

    current = current.parentNode;
  }

  if (typeof document !== 'undefined') {
    const scrollingElement = document.scrollingElement;
    return scrollingElement instanceof HTMLElement
      ? scrollingElement
      : document.documentElement;
  }

  return null;
}
