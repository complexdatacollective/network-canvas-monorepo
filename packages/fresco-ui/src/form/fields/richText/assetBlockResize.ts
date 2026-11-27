import { ASSET_BLOCK_SIZES, type AssetBlockSize } from '@codaco/shared-consts';

/**
 * The arithmetic of resizing a picture by its handle (see the asset block's
 * node view): which size a width is nearest to, and how a drag changes the
 * width. Kept apart from the view so that it can be tested without a layout.
 */

/**
 * A size a picture can be given by its handle: one of the bands that its
 * height is held to, or none (`null`), which leaves it as wide as the page.
 */
export type ResizeStep = AssetBlockSize | null;

/** Every size a picture can be given, narrowest first. */
export const RESIZE_STEPS: readonly ResizeStep[] = [...ASSET_BLOCK_SIZES, null];

/** How wide a picture is drawn at one size. */
export type StepWidth = Readonly<{ size: ResizeStep; width: number }>;

/**
 * How wide a picture of `ratio` (its width over its height) is drawn at each
 * size, in a page `full` pixels wide: each band holds its height to
 * `heights[band]`, and it is never wider than the page.
 */
export const widthsOfSteps = ({
  full,
  ratio,
  heights,
}: Readonly<{
  full: number;
  ratio: number;
  heights: Readonly<Record<AssetBlockSize, number>>;
}>): readonly StepWidth[] =>
  RESIZE_STEPS.map((size) => ({
    size,
    width: size === null ? full : Math.min(full, heights[size] * ratio),
  }));

/**
 * The size that draws a picture nearest to `width`. Where several draw it
 * equally near, the picture keeps the size it has (`current`) if that is one
 * of them, and otherwise takes the largest: a wide picture that every band
 * draws at the page's width is drawn the same at each, and the largest is the
 * one that goes on fitting if the picture is replaced with a taller one.
 */
export const nearestStep = (
  width: number,
  steps: readonly StepWidth[],
  current: ResizeStep,
): ResizeStep => {
  let nearest: ResizeStep = current;
  let distance = Number.POSITIVE_INFINITY;
  for (const step of steps) {
    const away = Math.abs(step.width - width);
    if (away <= distance) {
      nearest = step.size;
      distance = away;
    }
  }
  const kept = steps.find((step) => step.size === current);
  return kept !== undefined && Math.abs(kept.width - width) === distance
    ? current
    : nearest;
};

/**
 * How wide a picture is wanted once its handle has been dragged `across`
 * (towards the end of the line) and `down` from where it was `start`, kept
 * between `min` and `max`.
 *
 * The picture is centred on its line, so its end edge moves half as far as
 * it grows: a move across grows it by twice the move, which keeps the handle
 * under the pointer. It keeps its shape, so a move either way says the same
 * thing, and the one that says the most is taken: the handle can be pulled
 * along either edge of the picture as well as from corner to corner.
 */
export const widthDraggedTo = (
  start: Readonly<{ width: number; height: number }>,
  moved: Readonly<{ across: number; down: number }>,
  limits: Readonly<{ min: number; max: number }>,
): number => {
  const ratio = start.width / start.height;
  const fromAcross = 2 * moved.across;
  const fromDown = moved.down * ratio;
  const grown =
    Math.abs(fromAcross) > Math.abs(fromDown) ? fromAcross : fromDown;
  return Math.min(limits.max, Math.max(limits.min, start.width + grown));
};

/**
 * The size beside `current`: the next larger (`1`) or the next smaller
 * (`-1`), or `current` itself at either end of the list.
 */
export const stepBeside = (current: ResizeStep, by: 1 | -1): ResizeStep => {
  const at = RESIZE_STEPS.indexOf(current) + by;
  if (at < 0 || at >= RESIZE_STEPS.length) return current;
  const next = RESIZE_STEPS[at];
  // A size the list holds, which may be `null`.
  return next === undefined ? current : next;
};

/**
 * The name of each size, as a screen reader says it while the handle has
 * focus. Screen-reader text is English in every app.
 */
const RESIZE_STEP_NAMES = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  full: 'Full size',
} as const satisfies Record<AssetBlockSize | 'full', string>;

export const nameOfStep = (step: ResizeStep): string =>
  RESIZE_STEP_NAMES[step ?? 'full'];
