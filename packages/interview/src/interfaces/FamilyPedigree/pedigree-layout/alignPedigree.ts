import {
  breaksAHardConstraint,
  type RoutingWork,
  straightAndClear,
} from './auxiliaryRouting';
import { lessCost, sugiyamaLayouts } from './sugiyamaLayout';
import type { Hints, PedigreeInput, PedigreeLayout } from './types';

/** How many of the cheapest seatings the search finds are drawn and
 * weighed by their routed lines, at most. */
const SEATINGS_DRAWN = 10;

/** How many of the seatings drawn best by a quick search of their lines are
 * drawn again with a thorough one, which decides between them. */
const SEATINGS_SEARCHED = 2;

/**
 * How much the search of every drawing's lines may do in all, once the
 * first seating's lines are routed (see `RoutingWork`): a few hundred
 * milliseconds, whatever the size of the family. No family drawn in the
 * tests is drawn differently for it but a stress test of eleven parents;
 * a larger family stops searching here, and is drawn from the best of what
 * was found.
 */
const LINE_SEARCH_WORK = 2_000_000;

type Search = 'quick' | 'thorough';

/**
 * A family laid out. Given `drawingCost` (what a layout's routed lines cost
 * the drawing: see `routePedigree`), the seating is chosen by what it costs
 * once drawn, never by an estimate the router cannot honour (Josh, 12 Oct
 * 2026): of the cheapest seatings the search finds, the one whose drawing
 * costs least, compared after the seating's own hard constraints (lines of
 * descent that would cross, helpers away from the owners), and before its
 * passing, length and recorded order. Every seating is drawn with a quick
 * search of its lines, and the two drawn best again with a thorough one,
 * which decides. Without `drawingCost`, the seating the search settles on.
 *
 * Every search here is bounded before it starts: at most `SEATINGS_DRAWN`
 * seatings, and every line search shares one budget of work
 * (`LINE_SEARCH_WORK`). The first seating is always drawn in full; nothing
 * past it is drawn once the work is spent.
 */
export function alignPedigree(
  ped: PedigreeInput,
  options: {
    packed?: boolean;
    width?: number;
    align?: boolean | number[];
    hints?: Hints;
    drawingCost?: (
      layout: PedigreeLayout,
      search: Search,
      work: RoutingWork,
    ) => number;
  } = {},
): PedigreeLayout {
  const { drawingCost } = options;
  if (!drawingCost) return sugiyamaLayouts(ped, 1)[0]!.layout;
  const candidates = sugiyamaLayouts(ped, SEATINGS_DRAWN);
  const work: RoutingWork = { spent: 0, limit: LINE_SEARCH_WORK };
  const workLeft = () => work.spent < work.limit;
  type Drawn = { layout: PedigreeLayout; key: number[] };
  const keyOf = (
    layout: PedigreeLayout,
    [hard, , passing, length, order]: number[],
    search: Search,
  ) => [hard!, drawingCost(layout, search, work), passing!, length!, order!];
  const cheaper = (a: Drawn, b: Drawn) => (lessCost(a.key, b.key) ? -1 : 1);
  const drawn: Drawn[] = [];
  for (const { layout, cost } of candidates) {
    if (drawn.length > 0 && !workLeft()) break;
    drawn.push({ layout, key: keyOf(layout, cost, 'quick') });
    // The cheapest seating by the estimate, drawn with every line straight
    // and clear, is not bettered by another.
    const [hard, lines] = drawn[0]!.key;
    if (drawn.length === 1 && hard === 0 && straightAndClear(lines!)) {
      return layout;
    }
  }
  // The seatings drawn best by the quick search, drawn again thoroughly,
  // while there is work left.
  const searchedOf = (quick: Drawn[]) => {
    const ranked = quick.toSorted(cheaper).slice(0, SEATINGS_SEARCHED);
    const searched: Drawn[] = [];
    for (const { layout, key } of ranked) {
      if (!workLeft()) break;
      searched.push({ layout, key: keyOf(layout, key, 'thorough') });
    }
    return searched.length > 0 ? searched : ranked.slice(0, 1);
  };
  const searched = searchedOf(drawn);
  // When no seating draws without breaking a hard constraint, how far each
  // row sits across from the others is searched as well: the seating is
  // the same, and each row is shifted by up to a seat either way, for the
  // two seatings drawn best.
  const [best] = searched.toSorted(cheaper);
  const [seatsBreak, linesCost] = best!.key;
  if (seatsBreak === 0 && breaksAHardConstraint(linesCost!)) {
    const shifted: Drawn[] = [];
    shifting: for (const { layout, key } of searched) {
      for (const by of ROW_SHIFTS) {
        for (let layer = 0; layer < layout.pos.length; layer++) {
          if (!workLeft()) break shifting;
          const moved = shiftRow(layout, layer, by);
          shifted.push({ layout: moved, key: keyOf(moved, key, 'quick') });
        }
      }
    }
    if (shifted.length > 0) searched.push(...searchedOf(shifted));
  }
  return searched.toSorted(cheaper)[0]!.layout;
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
