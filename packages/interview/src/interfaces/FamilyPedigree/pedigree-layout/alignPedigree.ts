import { breaksAHardConstraint, straightAndClear } from './auxiliaryRouting';
import { lessCost, sugiyamaLayouts } from './sugiyamaLayout';
import type { Hints, PedigreeInput, PedigreeLayout } from './types';

/** How many of the cheapest seatings the search finds are drawn and
 * weighed by their routed lines, at most. */
const SEATINGS_DRAWN = 10;

/**
 * A family laid out. Given `drawingCost` (what a layout's routed lines cost
 * the drawing: see `routePedigree`), the seating is chosen by what it costs
 * once drawn, never by an estimate the router cannot honour (Josh, 12 Oct
 * 2026): of the cheapest seatings the search finds, the one whose drawing
 * costs least, compared after the seating's own hard constraints (lines of
 * descent that would cross, helpers away from the owners), and before its
 * passing, length and recorded order. Without it, the seating the search
 * settles on.
 */
export function alignPedigree(
  ped: PedigreeInput,
  options: {
    packed?: boolean;
    width?: number;
    align?: boolean | number[];
    hints?: Hints;
    drawingCost?: (layout: PedigreeLayout) => number;
  } = {},
): PedigreeLayout {
  const { drawingCost } = options;
  if (!drawingCost) return sugiyamaLayouts(ped, 1)[0]!.layout;
  const candidates = sugiyamaLayouts(ped, SEATINGS_DRAWN);
  let best: { layout: PedigreeLayout; key: number[] } | undefined;
  const drawnKeys: { layout: PedigreeLayout; key: number[] }[] = [];
  for (const { layout, cost } of candidates) {
    const [hard, , passing, length, order] = cost;
    const drawn = drawingCost(layout);
    const key = [hard, drawn, passing, length, order];
    drawnKeys.push({ layout, key });
    if (!best || lessCost(key, best.key)) best = { layout, key };
    // The cheapest seating by the estimate, drawn with every line straight
    // and clear, is not bettered by another.
    if (
      best.layout === candidates[0]!.layout &&
      hard === 0 &&
      straightAndClear(drawn)
    ) {
      break;
    }
  }
  // When no seating draws without breaking a hard constraint, how far each
  // row sits across from the others is searched as well: the seating is
  // the same, and each row is shifted by up to a seat either way, for the
  // two seatings drawn best.
  const unbroken = () =>
    best !== undefined &&
    (best.key[0]! > 0 || !breaksAHardConstraint(best.key[1]!));
  const nearest = drawnKeys
    .filter(({ key }) => key[0] === 0)
    .toSorted((a, b) => (lessCost(a.key, b.key) ? -1 : 1))
    .slice(0, 2);
  for (const {
    layout,
    key: [hard, , passing, length, order],
  } of nearest) {
    for (const by of ROW_SHIFTS) {
      for (let layer = 0; layer < layout.pos.length && !unbroken(); layer++) {
        const shifted = shiftRow(layout, layer, by);
        const key = [hard!, drawingCost(shifted), passing!, length!, order!];
        if (lessCost(key, best!.key)) best = { layout: shifted, key };
      }
    }
  }
  return best!.layout;
}

/** How far a row may be shifted across from the others, in seats, the
 * nearest first. */
const ROW_SHIFTS = [-0.5, 0.5, -1, 1];

/** A layout with one row shifted across by `by` seats. */
function shiftRow(
  layout: PedigreeLayout,
  layer: number,
  by: number,
): PedigreeLayout {
  return {
    ...layout,
    pos: layout.pos.map((row, k) =>
      k === layer ? row.map((x) => x + by) : row,
    ),
  };
}
