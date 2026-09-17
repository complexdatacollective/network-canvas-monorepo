import { useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Publishes one element's own height on the document root, under `variable`,
 * for parts of the page laid out around it that are not inside it.
 *
 * Measured rather than declared, for blocks whose height is not a number a
 * stylesheet could carry: what they hold changes from screen to screen, their
 * text wraps, and the type scale is responsive. A `ResizeObserver` rather than
 * a mount-time reading alone, because every one of those changes the height
 * without remounting anything. Each variable's own module says what its block
 * is and who reads it.
 *
 * A measurement of zero is never published. An element that has not been laid
 * out yet — hidden, or measured in an environment that lays nothing out —
 * would otherwise collapse the space every reader of the variable is keeping
 * clear, which is the fault this exists to fix; the stylesheet's starting
 * value stands until a real one arrives.
 */
export function usePublishedBlockHeight<T extends HTMLElement = HTMLElement>(
  variable: string,
): RefObject<T | null> {
  const element = useRef<T>(null);

  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;

    const root = document.documentElement;
    const publish = (height: number) => {
      if (height <= 0) return;
      root.style.setProperty(variable, `${height}px`);
    };

    publish(target.getBoundingClientRect().height);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // The border box, not `contentRect`: an element's own padding is part
        // of the room it takes, and the content box leaves it out.
        publish(
          entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height ?? 0,
        );
      }
    });
    observer.observe(target);

    return () => {
      observer.disconnect();
      root.style.removeProperty(variable);
    };
  }, [variable]);

  return element;
}
