'use client';

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * Sub-pixel differences between an element's scroll and client boxes are
 * rounding noise from fractional layout, not real overflow.
 */
const OVERFLOW_TOLERANCE = 1;

const overflows = (element: HTMLElement) =>
  element.scrollHeight - element.clientHeight > OVERFLOW_TOLERANCE ||
  element.scrollWidth - element.clientWidth > OVERFLOW_TOLERANCE;

type UseFitTextOptions = {
  /**
   * Complete class names for each rung of the ladder, largest first. The first
   * rung whose text fits is used; if none fit, the smallest is kept and the
   * text is reported as truncated.
   */
  steps: readonly string[];
  /**
   * The fixed-size element the text has to fit inside, observed for resizes.
   * This must not be the text element itself: fitting changes that element's
   * own size, which would retrigger the observer indefinitely.
   */
  containerRef: RefObject<HTMLElement | null>;
  /** Primitive whose change forces a re-fit (e.g. the rendered text). */
  watch?: string | number | boolean | null;
  /** Skip fitting entirely (e.g. while the text isn't rendered). */
  enabled?: boolean;
};

type UseFitTextResult<T> = {
  ref: RefObject<T | null>;
  /** Index into `steps` of the rung the text was fitted to. */
  stepIndex: number;
  /** Whether the text still overflows at the smallest rung. */
  isTruncated: boolean;
};

/**
 * Fits text to its container by stepping down a ladder of type sizes, measuring
 * real layout at each rung rather than inferring from character count.
 *
 * Reports whether the text is still clipped at the smallest rung, so callers can
 * offer a way to read the rest.
 */
export function useFitText<T extends HTMLElement = HTMLElement>({
  steps,
  containerRef,
  watch,
  enabled = true,
}: UseFitTextOptions): UseFitTextResult<T> {
  const ref = useRef<T>(null);
  const [state, setState] = useState({ stepIndex: 0, isTruncated: false });

  useLayoutEffect(() => {
    const element = ref.current;
    const container = containerRef.current;

    if (!enabled || !element || steps.length === 0) {
      setState((previous) =>
        previous.stepIndex === 0 && !previous.isTruncated
          ? previous
          : { stepIndex: 0, isTruncated: false },
      );
      return undefined;
    }

    let cancelled = false;

    const fit = () => {
      if (cancelled || !ref.current) return;
      const text = ref.current;

      // Each rung is applied to the DOM directly rather than through state:
      // measuring a rung requires it to be laid out, and a render per rung
      // would make a three-rung ladder cost three commits per node.
      let stepIndex = steps.length - 1;
      let stillOverflows = true;

      for (let index = 0; index < steps.length; index += 1) {
        text.className = steps[index]!;
        stillOverflows = overflows(text);
        if (!stillOverflows) {
          stepIndex = index;
          break;
        }
      }

      text.className = steps[stepIndex]!;

      setState((previous) =>
        previous.stepIndex === stepIndex &&
        previous.isTruncated === stillOverflows
          ? previous
          : { stepIndex, isTruncated: stillOverflows },
      );
    };

    fit();

    // Web fonts change glyph metrics after first paint, so a label measured
    // against the fallback font can fit — or stop fitting — once they load.
    void document.fonts?.ready.then(fit);

    if (typeof ResizeObserver === 'undefined' || !container) {
      return () => {
        cancelled = true;
      };
    }

    const observer = new ResizeObserver(fit);
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [steps, containerRef, watch, enabled]);

  return { ref, stepIndex: state.stepIndex, isTruncated: state.isTruncated };
}
