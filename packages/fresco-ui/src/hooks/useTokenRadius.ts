'use client';

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * The radius an element's own `rounded-*` class gives it, in pixels, for a
 * Motion component's `style.borderRadius`.
 *
 * A layout animation draws the element at its new size and scales it back to
 * the old one with a transform, so Motion has to counter-scale the corners or
 * they stretch with the box. It can only do that for a radius it holds as a
 * motion value in pixels or percent: a radius that comes from a class, or a
 * `var(--radius-*)` string in `style`, is left alone and distorts for the
 * length of the animation. Theme radius tokens are `calc()`s of `rem`, so the
 * pixel value is only known once the browser has resolved them for this
 * element, its theme and the current root font size.
 *
 * Keep the token class on the element (it is what renders before this has
 * measured, and on the server) and pass the result to `style`:
 *
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const borderRadius = useTokenRadius(ref);
 * <motion.div ref={ref} layout className="rounded-full" style={{ borderRadius }} />
 * ```
 *
 * `rounded-full` (9999px) is safe to pass: Motion turns pixels into a
 * percentage of the animated box on each axis, and the browser clamps radii
 * that overlap by the same factor on every corner, so each frame the corners
 * come out at exactly half the visual height of a horizontal pill.
 *
 * The radius is read from the top-left corner, so it suits a class that rounds
 * every corner alike. It is re-read when the element resizes, which is also
 * how a change in the root font size reaches it, and when the ref moves to
 * another element.
 */
export default function useTokenRadius(
  ref: RefObject<HTMLElement | null>,
): number | undefined {
  const [radius, setRadius] = useState<number>();
  const observed = useRef<{
    element: HTMLElement;
    observer: ResizeObserver | null;
  } | null>(null);

  // No dependency list: a component can hand the same ref to a different
  // element (an expanded and a collapsed form of one control), so each commit
  // checks which element is current and re-reads only when that has changed.
  useLayoutEffect(() => {
    const element = ref.current;
    if (observed.current?.element === element) return;
    observed.current?.observer?.disconnect();
    observed.current = null;
    if (!element) return;

    const measure = () => {
      // The inline radius is the one this hook (or Motion, mid-animation)
      // wrote, so set it aside to read what the class resolves to. Both writes
      // happen before the browser can paint.
      const inline = element.style.getPropertyValue('border-radius');
      element.style.removeProperty('border-radius');
      const resolved = getComputedStyle(element).borderTopLeftRadius;
      if (inline) element.style.setProperty('border-radius', inline);
      // A percentage, an elliptical corner or no stylesheet at all (jsdom)
      // leaves nothing to convert; the class keeps rendering it.
      setRadius(
        /^[\d.]+px$/.test(resolved) ? Number.parseFloat(resolved) : undefined,
      );
    };

    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    observed.current = { element, observer };
  });

  useLayoutEffect(
    () => () => {
      observed.current?.observer?.disconnect();
      observed.current = null;
    },
    [],
  );

  return radius;
}
