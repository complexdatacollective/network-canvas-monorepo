'use client';

import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/**
 * `scrollHeight` and `clientHeight` are each one rounding of a fractional
 * height, so a line that fits exactly can still measure a pixel or two "over".
 * Beyond that, the only height a clipped line can lose without losing a glyph
 * is the half-leading under it — which is a property of the gap between the
 * font size and the line box, not a fraction of either. A budget taken from the
 * line box alone is far too generous on tight leading: at `line-height: 1.15`
 * the half-leading is about 6.5% of the line box, so 15% of it would accept
 * more than twice the space that is actually empty.
 *
 * Width has no such slack — a single hidden pixel is the upright stroke of a
 * final letter ("Mohammad" clipped to "Mohammac").
 */
const ROUNDING_SLACK = 2;
const NO_LINE_HEIGHT_SLACK = 6;

const overflowsHeight = (element: HTMLElement) => {
  const excess = element.scrollHeight - element.clientHeight;
  if (excess <= 0) return false;
  const { lineHeight, fontSize } = getComputedStyle(element);
  const lineBox = Number.parseFloat(lineHeight);
  const glyphs = Number.parseFloat(fontSize);
  // `normal`, or no layout at all, leaves nothing to measure the leading with.
  if (!Number.isFinite(lineBox) || !Number.isFinite(glyphs) || lineBox <= 0) {
    return excess > NO_LINE_HEIGHT_SLACK;
  }
  const halfLeading = Math.max(0, (lineBox - glyphs) / 2);
  return excess > Math.max(ROUNDING_SLACK, halfLeading);
};

const overflows = (element: HTMLElement) =>
  overflowsHeight(element) || element.scrollWidth > element.clientWidth;

type Fitter = {
  element: HTMLElement;
  steps: readonly string[];
  container: HTMLElement | null;
  commit: (measurement: FitMeasurement) => void;
};

type FitMeasurement = {
  stepIndex: number;
  isTruncated: boolean;
  wholeLines: number | undefined;
  overflow: number;
};

/**
 * How many whole lines of the element's type its container can show. A
 * line clamp set for more lines than that leaves a sliver of the next line
 * showing and puts the ellipsis out of sight.
 */
const wholeLinesIn = (container: HTMLElement | null, element: HTMLElement) => {
  if (!container) return undefined;
  const lineBox = Number.parseFloat(getComputedStyle(element).lineHeight);
  if (!Number.isFinite(lineBox) || lineBox <= 0) return undefined;
  return Math.max(
    1,
    Math.floor((container.clientHeight + ROUNDING_SLACK) / lineBox),
  );
};

/**
 * How far the element's box reaches below its container's, as a fraction of
 * the container's height. A rung without a height limit lets text grow past
 * its container rather than overflow itself, and this is how far.
 */
const overflowOf = (container: HTMLElement | null, element: HTMLElement) => {
  if (!container) return 0;
  const excess = element.offsetHeight - container.clientHeight;
  if (excess <= 0) return 0;
  // `clientHeight` is rounded; a caller scaling the fraction back up by the
  // container's true size would otherwise be off by the rounding.
  const height = Number.parseFloat(getComputedStyle(container).height);
  return height > 0 ? excess / height : 0;
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

  // Read first, then commit: a commit may write to the page.
  const measured = states.map(({ fitter, fits, stepIndex }) => ({
    fitter,
    measurement: {
      stepIndex,
      isTruncated: !fits,
      wholeLines: fits
        ? undefined
        : wholeLinesIn(fitter.container, fitter.element),
      overflow: overflowOf(fitter.container, fitter.element),
    },
  }));
  for (const { fitter, measurement } of measured) fitter.commit(measurement);
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
   * It may be rendered by a parent component. This must not be the text
   * element itself: fitting changes that element's own size, which would
   * retrigger the observer indefinitely.
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
  /**
   * For truncated text, the number of whole lines of the fitted type the
   * container can show.
   */
  wholeLines: number | undefined;
  /**
   * How far the text reaches below its container, as a fraction of the
   * container's height; 0 when it stays inside. Only a rung that lifts the
   * text's height limit lets it reach past.
   */
  overflow: number;
  /**
   * The `watch` value the reported rung was measured for. `stepIndex` is kept
   * until the next measurement lands, so right after `watch` changes it still
   * describes the previous text; a caller that acts on the rung compares this
   * with the `watch` it passed.
   */
  fittedWatch: UseFitTextOptions['watch'];
};

const UNFITTED = {
  stepIndex: 0,
  isTruncated: false,
  wholeLines: undefined,
  overflow: 0,
  fittedWatch: undefined,
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
  const [state, setState] = useState<
    FitMeasurement & { fittedWatch: UseFitTextOptions['watch'] }
  >(UNFITTED);

  // Fits the current text, for whatever later finds the room has changed. A
  // fit left behind by an earlier text has been cancelled, so it does nothing.
  const refitRef = useRef<(() => void) | null>(null);
  const containerElementRef = useRef<HTMLElement | null>(null);

  // Measured before paint, so the first frame already shows the fitted size.
  useLayoutEffect(() => {
    const element = ref.current;

    if (!enabled || !element || steps.length === 0) {
      setState((previous) =>
        previous.stepIndex === 0 &&
        !previous.isTruncated &&
        previous.overflow === 0 &&
        previous.fittedWatch === undefined
          ? previous
          : UNFITTED,
      );
      return undefined;
    }

    let cancelled = false;

    const fitter: Fitter = {
      element,
      steps,
      // Set by the passive effect below, which refits once it has.
      get container() {
        return containerElementRef.current;
      },
      commit: (measurement) => {
        if (cancelled) return;
        setState((previous) =>
          previous.stepIndex === measurement.stepIndex &&
          previous.isTruncated === measurement.isTruncated &&
          previous.wholeLines === measurement.wholeLines &&
          previous.overflow === measurement.overflow &&
          previous.fittedWatch === watch
            ? previous
            : { ...measurement, fittedWatch: watch },
        );
      },
    };

    const fit = () => {
      if (!cancelled) enqueue(fitter);
    };

    fit();
    refitRef.current = fit;

    // Web fonts change glyph metrics after first paint, so a label measured
    // against the fallback font can fit — or stop fitting — once they load.
    void document.fonts?.ready.then(fit);

    // The container's ResizeObserver only notices the fixed box. Fluid type
    // tokens can change with the viewport while that box stays the same size,
    // so the text still needs measuring on a viewport resize.
    window.addEventListener('resize', fit);

    return () => {
      cancelled = true;
      pending.delete(fitter);
      window.removeEventListener('resize', fit);
    };
  }, [steps, watch, enabled]);

  // The container is watched from a passive effect, not from the layout effect
  // above: React attaches a ref only after every layout effect beneath it has
  // run, so a container a parent renders — a bin around its label — is still
  // null there on mount. Text that never hears its box shrink keeps a size it
  // no longer fits. By the time passive effects run, every ref is attached, and
  // the observer's first report measures the box as it is then.
  useEffect(() => {
    const container = containerRef.current;
    containerElementRef.current = container;
    if (!enabled || !container || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => refitRef.current?.());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, enabled]);

  return {
    ref,
    stepIndex: state.stepIndex,
    isTruncated: state.isTruncated,
    wholeLines: state.wholeLines,
    overflow: state.overflow,
    fittedWatch: state.fittedWatch,
  };
}
