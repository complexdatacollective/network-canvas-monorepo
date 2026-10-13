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
 * How much every drawing's lines may do in all (see `RoutingWork`): about
 * thirty milliseconds on a laptop, whatever the size of the family, so a
 * family the interview can hold is laid out well inside a frame budget.
 * The first seating's lines are always routed once in full; any other
 * drawing whose first routing would pass what is left is abandoned, and
 * every search for better courses stops once the work is spent. Most
 * families finish well inside it; a larger one is drawn from the best of
 * what was found.
 */
const LINE_SEARCH_WORK = 300_000;

/**
 * How much the quick search of any one seating may do past its first
 * routing: the quick search only sorts the seatings for the thorough one,
 * so a seating that is hard to draw does not spend what the others need.
 */
const QUICK_SEARCH_WORK = 30_000;

/** The share of the work the quick searches may do in all: the rest is
 * kept for the thorough searches, which decide. */
const QUICK_SHARE = 0.7;

/**
 * The work kept for finding a drawing that breaks no hard constraint, when
 * the best found within `LINE_SEARCH_WORK` breaks one. That budget limits
 * how far the cost of drawings that keep every hard constraint is bettered;
 * it is not what returns a drawing that breaks one. This is bounded all the
 * same: some families have no drawing that keeps every hard constraint, and
 * they too are drawn inside the frame budget (`layoutBudget.test.ts`).
 */
const CONSTRAINT_WORK = 150_000;

type Search = 'quick' | 'thorough';

/**
 * A family laid out. Given `drawingCost` (what a layout's routed lines cost
 * the drawing: see `routePedigree`), the seating is chosen by what it costs
 * once drawn, never by an estimate the router cannot honour (Josh, 12 Oct
 * 2026): of the cheapest seatings the search finds, the one whose drawing
 * costs least, compared after the seating's own hard constraints (lines of
 * descent that would cross, helpers away from the owners), and before its
 * passing, length and recorded order. Every seating is screened with a
 * quick search of its lines (each line offered fewer courses: see
 * `RoutingScene`), and the few screened best are drawn again with a
 * thorough search (`SEATINGS_SEARCHED`), which decides. Without
 * `drawingCost`, the seating the search settles on.
 *
 * Every search here is bounded before it starts, by counted work, never by
 * the clock, so a family is drawn the same way however fast the machine:
 * at most `SEATINGS_DRAWN` seatings, and every line search shares one
 * budget of work (`LINE_SEARCH_WORK`), of which the quick searches take at
 * most a share (`QUICK_SHARE`, and `QUICK_SEARCH_WORK` each).
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
  type Drawn = {
    layout: PedigreeLayout;
    key: number[];
    /** Where the seating stands in the order it was found in: equal keys
     * keep it. */
    rank: number;
  };
  const drawnOf = (
    layout: PedigreeLayout,
    [hard, , passing, length, order]: number[],
    search: Search,
    rank: number,
  ): Drawn => {
    const left = work.limit - work.spent;
    const own: RoutingWork = {
      spent: 0,
      limit: search === 'quick' ? Math.min(QUICK_SEARCH_WORK, left) : left,
      // Every drawing but the first is abandoned if its first routing alone
      // would pass the work left.
      ...(work.spent > 0 ? { abandonPast: left } : {}),
    };
    const lines = drawingCost(layout, search, own);
    work.spent += own.spent;
    return { layout, key: [hard!, lines, passing!, length!, order!], rank };
  };
  // An abandoned drawing (see `RoutingWork`) is left out.
  const keep = (into: Drawn[], entry: Drawn) => {
    if (entry.key[1]! < Number.POSITIVE_INFINITY) into.push(entry);
  };
  // A seating that breaks more of its own hard constraints than the
  // cheapest is never drawn better than it: hard constraints are compared
  // first.
  const fewestBroken = Math.min(...candidates.map(({ cost }) => cost[0]!));
  const drawn: Drawn[] = [];
  for (const [rank, { layout, cost }] of candidates.entries()) {
    if (cost[0]! > fewestBroken) continue;
    if (drawn.length > 0 && work.spent >= QUICK_SHARE * work.limit) break;
    keep(drawn, drawnOf(layout, cost, 'quick', rank));
    // The cheapest seating by the estimate, drawn with every line straight
    // and clear, is not bettered by another.
    const [hard, lines] = drawn[0]!.key;
    if (
      rank === 0 &&
      drawn.length === 1 &&
      hard === 0 &&
      straightAndClear(lines!)
    ) {
      return layout;
    }
  }
  // The seatings drawn best by the quick search, drawn again thoroughly,
  // while there is work left.
  const searchedOf = (quick: Drawn[]) => {
    const ranked = quick.toSorted(compareDrawn).slice(0, SEATINGS_SEARCHED);
    const searched: Drawn[] = [];
    for (const { layout, key, rank } of ranked) {
      if (!workLeft()) break;
      keep(searched, drawnOf(layout, key, 'thorough', rank));
    }
    return searched.length > 0 ? searched : ranked.slice(0, 1);
  };
  const searched = searchedOf(drawn);
  // When the best drawing breaks a hard constraint, the search goes on
  // with work kept for that alone (`CONSTRAINT_WORK`), not with what is
  // left of the budget: the seatings drawn best are drawn again with each
  // row shifted by up to a seat either way, the nearest shifts first, until
  // one draws without breaking any. That drawing is drawn again thoroughly,
  // and kept only if it still breaks none. A drawing that breaks a hard
  // constraint is returned only when no shift within that work draws
  // without one.
  const [best] = searched.toSorted(compareDrawn);
  const [seatsBreak, linesCost] = best!.key;
  if (seatsBreak === 0 && breaksAHardConstraint(linesCost!)) {
    work.limit = work.spent + CONSTRAINT_WORK;
    const shifted: Drawn[] = [];
    let valid: Drawn | undefined;
    let shifts = 0;
    shifting: for (const { layout, key } of searched) {
      for (const by of ROW_SHIFTS) {
        for (let layer = 0; layer < layout.pos.length; layer++) {
          if (!workLeft()) break shifting;
          const moved = shiftRow(layout, layer, by);
          const entry = drawnOf(
            moved,
            key,
            'quick',
            candidates.length + shifts++,
          );
          keep(shifted, entry);
          if (!breaksAHardConstraint(entry.key[1]!)) {
            valid = entry;
            break shifting;
          }
        }
      }
    }
    if (valid) {
      // Drawn again as a layout of its own, so the quick drawing is kept
      // should the thorough one break a hard constraint after all.
      const thorough = workLeft()
        ? drawnOf({ ...valid.layout }, valid.key, 'thorough', valid.rank)
        : undefined;
      searched.push(
        thorough && !breaksAHardConstraint(thorough.key[1]!) ? thorough : valid,
      );
    } else if (shifted.length > 0) {
      searched.push(...searchedOf(shifted));
    }
  }
  return searched.toSorted(compareDrawn)[0]!.layout;
}

/**
 * Seatings in the order they are drawn best: by their cost, compared step
 * by step (see `lessCost`), and, where two cost the same, in the order the
 * search found them. A total order, so the seating chosen does not depend
 * on how a sort meets its candidates.
 */
export function compareDrawn(
  a: { key: readonly number[]; rank: number },
  b: { key: readonly number[]; rank: number },
): number {
  if (lessCost(a.key, b.key)) return -1;
  if (lessCost(b.key, a.key)) return 1;
  return a.rank - b.rank;
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
