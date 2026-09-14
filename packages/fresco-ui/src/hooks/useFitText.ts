'use client';

import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

/**
 * `scrollHeight` and `clientHeight` are each one rounding of a fractional
 * height, so a line that fits exactly can still measure a pixel or two "over".
 * Anything beyond that is real, up to the leading under the last line — which is
 * why the slack is a fraction of the line box and not a fixed number of pixels:
 * a budget large enough for a 42px line hides a third of a 16px one.
 *
 * Width has no such slack — a single hidden pixel is the upright stroke of a
 * final letter ("Mohammad" clipped to "Mohammac").
 */
const ROUNDING_SLACK = 2;
const LEADING_FRACTION = 0.15;
const NO_LINE_HEIGHT_SLACK = 6;

const overflowsHeight = (element: HTMLElement) => {
  const excess = element.scrollHeight - element.clientHeight;
  if (excess <= 0) return false;
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  // `normal`, or no layout at all, leaves nothing to measure the leading with.
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return excess > NO_LINE_HEIGHT_SLACK;
  }
  return excess > Math.max(ROUNDING_SLACK, lineHeight * LEADING_FRACTION);
};

const overflows = (element: HTMLElement) =>
  overflowsHeight(element) || element.scrollWidth > element.clientWidth;

type Fitter = {
  element: HTMLElement;
  steps: readonly string[];
  commit: (stepIndex: number, isTruncated: boolean) => void;
};

const pending = new Set<Fitter>();
let flushScheduled = false;

/**
 * Fits every queued element together, one rung at a time.
 *
 * Fitting an element alone means writing a class name and then reading a
 * measurement from it, which forces the browser to lay the page out again —
 * once per rung, per element. A canvas full of nodes turns that into hundreds
 * of layout flushes. Batching writes all of one rung before reading any of it,
 * so the whole queue costs one flush per rung however many elements are in it.
 */
function flush() {
  flushScheduled = false;
  if (pending.size === 0) return;

  const fitters = [...pending];
  pending.clear();

  const states = fitters.map((fitter) => ({
    fitter,
    stepIndex: 0,
    fits: false,
  }));
  const deepestLadder = Math.max(...fitters.map(({ steps }) => steps.length));

  for (let rung = 0; rung < deepestLadder; rung += 1) {
    const searching = states.filter(
      (state) => !state.fits && rung < state.fitter.steps.length,
    );
    if (searching.length === 0) break;

    // Write phase — no measurements taken, so layout is invalidated once.
    for (const state of searching) {
      state.fitter.element.className = state.fitter.steps[rung]!;
      state.stepIndex = rung;
    }

    // Read phase — the first read pays for the layout, the rest are free.
    for (const state of searching) {
      state.fits = !overflows(state.fitter.element);
    }
  }

  for (const state of states) {
    state.fitter.commit(state.stepIndex, !state.fits);
  }
}

function enqueue(fitter: Fitter) {
  pending.add(fitter);
  if (flushScheduled) return;
  flushScheduled = true;
  // A microtask still runs before the browser paints, so the fitted size is
  // never visible as a change.
  queueMicrotask(flush);
}

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
 * real layout after render rather than inferring from character count.
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

    const fitter: Fitter = {
      element,
      steps,
      commit: (stepIndex, isTruncated) => {
        if (cancelled) return;
        setState((previous) =>
          previous.stepIndex === stepIndex &&
          previous.isTruncated === isTruncated
            ? previous
            : { stepIndex, isTruncated },
        );
      },
    };

    const fit = () => {
      if (!cancelled) enqueue(fitter);
    };

    fit();

    // Web fonts change glyph metrics after first paint, so a label measured
    // against the fallback font can fit — or stop fitting — once they load.
    void document.fonts?.ready.then(fit);

    // ResizeObserver only notices the fixed box. Fluid type tokens can change
    // with the viewport while that box stays the same size, so the text still
    // needs measuring on a viewport resize.
    window.addEventListener('resize', fit);

    const cleanup = () => {
      cancelled = true;
      pending.delete(fitter);
      window.removeEventListener('resize', fit);
    };

    if (typeof ResizeObserver === 'undefined' || !container) {
      return cleanup;
    }

    const observer = new ResizeObserver(fit);
    observer.observe(container);

    return () => {
      cleanup();
      observer.disconnect();
    };
  }, [steps, containerRef, watch, enabled]);

  return { ref, stepIndex: state.stepIndex, isTruncated: state.isTruncated };
}
