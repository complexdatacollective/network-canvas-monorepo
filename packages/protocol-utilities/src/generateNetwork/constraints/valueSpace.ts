import type { VariableEntry } from '../../types';
import { type DateResolution, openDateFloor, stepsBetween } from './dateWindow';
import type { ConstrainedVariable, VariableConstraints } from './types';
import { valueKey } from './uniqueRegistry';

/**
 * Symbols the unique-text generator draws from. Kept in sync with
 * ValueGenerator's distinct-text encoding: both are base 36.
 */
export const TEXT_ALPHABET_SIZE = 36;

/**
 * Decimal places every scalar draw is rounded to, and the step every part of
 * this analysis reasons in — the draw, comparator propagation, the value-space
 * count, and the solver's domain enumeration all read it, so they cannot
 * disagree about what a scalar can hold.
 *
 * Deliberately coarser than the control: fresco-ui's `VisualAnalogScale` steps
 * by 0.001. Nothing invalid comes of that, since every value on this grid is
 * one the control can produce. What it costs is refusing a chain the
 * participant could satisfy — 102 scalars linked by `greaterThanVariable` fit
 * inside `[0, 1]` at the control's step but not at this one.
 *
 * Kept at 2 knowingly. Matching the control would move every generated scalar
 * value, and with it every story fixture, visual baseline and snapshot holding
 * one, to buy a case that needs on the order of a hundred scalars in a single
 * strict chain. Revisit if that trade ever changes — the only correct
 * alternative is to move all four readers together.
 */
export const SCALAR_DECIMAL_PLACES = 2;

/**
 * The normalised scale a scalar response is recorded on, written as the bounds
 * a scalar is drawn between. The type declares none of its own — the schema
 * accepts no `minValue`/`maxValue` on it — but it is bounded all the same, and
 * every consumer that reasons about a scalar's range reads it from here.
 */
export const SCALAR_DOMAIN = { minValue: 0, maxValue: 1 };

/** Length a text draw falls back to when the rules impose no maximum. */
const DEFAULT_TEXT_LENGTH = 12;

/**
 * The longest text value generation will materialise, and the ceiling every
 * text draw is taken at.
 *
 * The schema bounds neither length rule — `minLength` and `maxLength` are each
 * a plain `z.number().int()` — so an imported protocol can declare a length no
 * run can produce. `minLength: 1_000_000_000` reaches `padEnd` and throws
 * `RangeError: Invalid string length`, and lengths well short of that allocate
 * hundreds of megabytes into the tab running the preview.
 *
 * Where the ceiling comes from is not the field, which imposes none: `Text` and
 * `TextArea` render a plain input and textarea, and fresco-ui's `maxLength`
 * validator only enforces what the protocol itself declares. It is the export
 * the data has to survive. A spreadsheet cell holds 32,767 characters, so a
 * longer value cannot round-trip through the CSV a researcher opens — it is a
 * length the pipeline could not deliver even if it were drawn. That is also
 * orders of magnitude past anything a participant types into a single answer,
 * and past the {@link DEFAULT_TEXT_LENGTH} a draw falls back to, so no protocol
 * describing collectable data is affected by it.
 *
 * A `maxLength` above this is honoured by drawing shorter, which still
 * satisfies it. A `minLength` above it is satisfied by no value this generator
 * will build, so `analyseFeasibility` refuses the protocol rather than emitting
 * a value shorter than its own rule.
 */
export const MAX_TEXT_DRAW_LENGTH = 32_767;

/**
 * The range a number draw falls back to when the rules leave it open, as a
 * realistic span of ages.
 */
const NUMBER_DEFAULT_RANGE = { floor: 18, span: 62 };

/**
 * How far past its floor an unbounded `unique` number may range. Set well above
 * the largest entity count generation can reach, so the space the feasibility
 * pass calls "unbounded" really is.
 */
const UNIQUE_NUMBER_HEADROOM = 100_000;

/** How many options a categorical draw picks when nothing declares a ceiling. */
const DEFAULT_MAX_SELECTED = 2;

/**
 * How far back a draw reaches from its ceiling when the protocol declares no
 * floor, in steps at each resolution. Mirrored from `ValueGenerator`'s own date
 * fallbacks the way `generateEntityAttributes` mirrors the number range: what
 * the draw walks is what the count has to describe, and the pair are held
 * together by the conformance tests that draw a date variable's whole space.
 * Where that reach lands is decided once, by `openDateFloor`, which both read.
 */
const DATE_DEFAULT_REACH: Record<DateResolution, number> = {
  year: 40,
  month: 480,
  full: 3650,
};
const UNIQUE_DATE_REACH: Record<DateResolution, number> = {
  year: 1000,
  month: 12_000,
  full: 365_250,
};

/**
 * Scaling a decimal bound lands a hair beside the integer it should be
 * (`0.1 * 100` is `10.000000000000002`), which would push a bound to the wrong
 * side of the rounding grid and so drop or invent a value. Far below one grid
 * step, so a bound genuinely off the grid still rounds outward.
 */
const GRID_TOLERANCE = 1e-6;

/**
 * The one length a text value is drawn at. The generator picks a single length
 * rather than spreading draws across `[minLength, maxLength]`, so counting the
 * whole range would let a `unique` variable pass feasibility and then collide;
 * both the generator and the count read this instead.
 *
 * Held at {@link MAX_TEXT_DRAW_LENGTH}. A ceiling above the cap is met by
 * drawing shorter, a shorter value satisfying `maxLength` perfectly well, and
 * the count reads the clamped length through this same function — so the space
 * it describes stays the space the draw walks, which is the whole reason both
 * read one function. A floor above the cap is the case no shorter value
 * satisfies: `analyseFeasibility` refuses it before a seed is consulted, and
 * `generateConstrained` throws rather than allocating if one reaches it anyway.
 */
export function textDrawLength(constraints: VariableConstraints): number {
  return Math.min(
    MAX_TEXT_DRAW_LENGTH,
    Math.max(
      constraints.maxLength ?? DEFAULT_TEXT_LENGTH,
      constraints.minLength ?? 0,
    ),
  );
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/**
 * The values a rounded-and-clamped draw can reach between `min` and `max`.
 *
 * Every such draw is `clamp(round(somewhere in [min, max]), min, max)`, so what
 * comes out is a grid point at {@link SCALAR_DECIMAL_PLACES} inside the range —
 * or, where rounding left the range and the clamp brought it back, exactly the
 * bound it was clamped to. Both of those bounds are values a participant's own
 * form accepts, `minValue` and `maxValue` comparing inclusively, so they are
 * genuinely drawable and genuinely valid. Leaving them out of the count is what
 * refused a two-entity stage on `[0.001, 0.009]`, whose draw reaches both ends.
 *
 * Held as a descriptor rather than a list: `size` is what the count spends and
 * {@link decimalGridValueAt} is what the draw walks, so neither can believe in
 * values the other cannot reach. Values are unranked
 * arithmetically, so nothing is allocated per draw and no cap is needed — the
 * set is small in any case, since this describes a `number` only where its
 * range holds no integer (and so spans less than one unit) and a `scalar` only
 * inside the normalised scale, leaving at most
 * `10 ** SCALAR_DECIMAL_PLACES + 1` grid points either way.
 */
export type DecimalGrid = {
  min: number;
  max: number;
  /** The lowest grid multiple inside the range, in scaled units. */
  first: number;
  /** How many grid multiples lie inside the range; zero where none does. */
  points: number;
  /** Whether each bound is a value of its own, rather than a grid point. */
  clampedMin: boolean;
  clampedMax: boolean;
  /** How many distinct values {@link decimalGridValueAt} walks. */
  size: number;
};

const GRID_SCALE = 10 ** SCALAR_DECIMAL_PLACES;

export function decimalGrid(min: number, max: number): DecimalGrid {
  const first = Math.ceil(min * GRID_SCALE - GRID_TOLERANCE);
  const last = Math.floor(max * GRID_SCALE + GRID_TOLERANCE);
  const points = Math.max(0, last - first + 1);

  // A range holding nothing, or holding one value, is the one value the draw is
  // pinned to; taking a bound as a value of its own there would promise a
  // second the draw cannot produce.
  if (max <= min) {
    return {
      min,
      max,
      first,
      points: 0,
      clampedMin: true,
      clampedMax: false,
      size: 1,
    };
  }

  // Read against the same tolerance the grid itself is read against, so a bound
  // this analysis has already treated as sitting on the grid is not then
  // counted a second time as a value beside it.
  const onGrid = (bound: number, at: number): boolean =>
    points > 0 && Math.abs(bound * GRID_SCALE - at) <= GRID_TOLERANCE;

  const clampedMin = !onGrid(min, first);
  const clampedMax = !onGrid(max, first + points - 1);

  return {
    min,
    max,
    first,
    points,
    clampedMin,
    clampedMax,
    size: points + (clampedMin ? 1 : 0) + (clampedMax ? 1 : 0),
  };
}

/**
 * The smallest difference between two values {@link decimalGridValueAt} walks,
 * which is the largest step a strict comparison across this grid is guaranteed
 * to leave.
 *
 * Usually one grid place, since the values are consecutive multiples of it. A
 * bound the grid does not itself hold is the exception: it sits closer to its
 * neighbouring multiple than one place, and a range holding no multiple at all
 * — `[0.001, 0.009]` — is drawn as its two ends alone and so separates them by
 * whatever the protocol declared. A grid with one value has no separation of
 * its own to state, and gives the grid place back: the pair's other end is what
 * decides how far a comparison against a pinned value has to reach.
 */
export function decimalGridStep(grid: DecimalGrid): number {
  const { min, max, first, points, clampedMin, clampedMax, size } = grid;
  const place = 1 / GRID_SCALE;
  if (size < 2) return place;

  if (points === 0) return max - min;

  let step = points > 1 ? place : Number.POSITIVE_INFINITY;
  if (clampedMin) step = Math.min(step, first / GRID_SCALE - min);
  if (clampedMax) {
    step = Math.min(step, max - (first + points - 1) / GRID_SCALE);
  }

  return Number.isFinite(step) ? step : place;
}

/**
 * The grid a scalar is drawn on: the normalised scale, narrowed by whatever a
 * group or a comparison left it. Read wherever a scalar's reachable values are
 * counted, stepped or compared, so those readings cannot disagree.
 */
export function scalarDrawGrid(constraints: VariableConstraints): DecimalGrid {
  return decimalGrid(
    Math.max(
      constraints.minValue ?? SCALAR_DOMAIN.minValue,
      SCALAR_DOMAIN.minValue,
    ),
    Math.min(
      constraints.maxValue ?? SCALAR_DOMAIN.maxValue,
      SCALAR_DOMAIN.maxValue,
    ),
  );
}

/**
 * The `index`-th value of the grid, ascending, wrapping past the end. A bound
 * the grid does not already hold takes the position outside it, so values come
 * out in the order they sit in on the number line — which is what lets a
 * `unique` slot consume them bottom-up.
 */
export function decimalGridValueAt(grid: DecimalGrid, index: number): number {
  let at = ((index % grid.size) + grid.size) % grid.size;

  if (grid.clampedMin) {
    if (at === 0) return grid.min;
    at -= 1;
  }
  if (at >= grid.points) return grid.max;

  // Clamped the way the draw clamps. A bound within {@link GRID_TOLERANCE} of
  // the grid is read as sitting on it, and the grid point standing in for it
  // can then land a hair outside the bound a participant's form enforces.
  const value = Number(
    ((grid.first + at) / GRID_SCALE).toFixed(SCALAR_DECIMAL_PLACES),
  );
  if (value < grid.min) return grid.min;
  if (value > grid.max) return grid.max;
  return value;
}

/**
 * The range a number is drawn between, with the generator's own fallbacks
 * standing in for whichever side the rules leave open.
 *
 * Read by the draw and by the count, so neither can believe in values the other
 * cannot reach. The floor is a realism default, not a rule: a ceiling declared
 * below it slides the whole range down rather than inverting it, because a
 * value above a declared maximum is one the participant's form rejects. A
 * `unique` variable left without a ceiling widens far past any entity count,
 * since a realistic range holds nowhere near one value per entity.
 */
export function numberDrawBounds(constraints: VariableConstraints): {
  min: number;
  max: number;
} {
  const { minValue, maxValue, unique } = constraints;
  const { floor, span } = NUMBER_DEFAULT_RANGE;

  const min =
    minValue ??
    (maxValue !== undefined && maxValue < floor ? maxValue - span : floor);
  const max =
    maxValue ??
    Math.max(min, unique ? min + UNIQUE_NUMBER_HEADROOM : floor + span);

  return { min, max };
}

/**
 * How many values a categorical draw selects, as an inclusive size range.
 *
 * Read by the draw and by the count for the same reason as
 * {@link numberDrawBounds}. A selection is never wider than the values the
 * option list offers — sized by {@link distinctOptionValues} rather than by
 * entries, because a selection is a set and two entries carrying one value
 * contribute one member to it. Without a declared ceiling a draw keeps its
 * selections small, which is realistic but nowhere near one value per entity; a
 * `unique` variable reaches every size instead.
 *
 * A selection is never empty either, with one exception. `minSelected: 0` does
 * not lower the floor — the interview's `minSelected` validator ignores an
 * empty array anyway, `required` owns emptiness, and a draw that answered
 * nothing would be a poorer sample — which is why `valueSpaceSize` leaves the
 * empty set out of that variable's count. `maxSelected: 0` is the other way
 * round: the interview's validator accepts the empty array and rejects every
 * non-empty one, so nothing else is drawable and the space is exactly the one
 * value. The floor gives way to that ceiling rather than inverting against it,
 * as a draw clamped back up to one option would fail the form it was generated
 * for. `minSelected` above it is a contradiction feasibility already refuses.
 */
export function selectionSizeRange(variable: ConstrainedVariable): {
  min: number;
  max: number;
} {
  const optionCount = distinctOptionValues(variable.entry).length;
  const { minSelected, maxSelected, unique } = variable.constraints;

  const max = Math.min(
    maxSelected ?? (unique ? optionCount : DEFAULT_MAX_SELECTED),
    optionCount,
  );

  return {
    min: max === 0 ? 0 : Math.min(Math.max(1, minSelected ?? 1), optionCount),
    max,
  };
}

/** The `rank`-th `k`-subset of `{0, …, n - 1}`, in lexicographic order. */
function unrankCombination(n: number, k: number, rank: number): number[] {
  const chosen: number[] = [];
  let remaining = rank;
  let candidate = 0;

  for (let left = k; left > 0; left--) {
    // Subsets are grouped by their lowest member: skip whole groups until the
    // rank falls inside one, and that group's member is the next choice.
    for (; candidate <= n - left; candidate++) {
      const group = binomial(n - candidate - 1, left - 1);
      if (remaining < group) break;
      remaining -= group;
    }
    chosen.push(candidate);
    candidate += 1;
  }

  return chosen;
}

/**
 * The `rank`-th selection a categorical draw can make, as option values.
 *
 * Ranks walk the whole combination space: sizes in order, and each size's
 * subsets in lexicographic order. Choosing a contiguous run of values instead
 * would reach only as many selections as there are starting points, and a
 * `unique` variable would exhaust its values long before the count said so.
 * Past the end of the space the sequence wraps.
 *
 * Combined over {@link distinctOptionValues} rather than over option
 * positions. Two entries carrying one value are one member of a selection, so a
 * position-based subset of size two could collapse to a single-value answer no
 * `minSelected: 2` accepts — while {@link valueSpaceSize} counted the pair it
 * never drew.
 */
export function categoricalSelectionAt(
  variable: ConstrainedVariable,
  rank: number,
): (string | number | boolean)[] {
  const values = distinctOptionValues(variable.entry);
  if (values.length === 0) return [];
  const { min, max } = selectionSizeRange(variable);

  const sizes: { size: number; count: number }[] = [];
  let total = 0;
  // An inverted pair is a contradiction feasibility reports; here it draws the
  // smallest selection its rules describe rather than nothing at all.
  for (let size = min; size <= Math.max(min, max); size++) {
    const count = binomial(values.length, size);
    sizes.push({ size, count });
    total += count;
  }

  let remaining = rank % total;
  for (const { size, count } of sizes) {
    if (remaining < count) {
      const selected: (string | number | boolean)[] = [];
      for (const at of unrankCombination(values.length, size, remaining)) {
        const value = values[at];
        if (value !== undefined) selected.push(value);
      }
      return selected;
    }
    remaining -= count;
  }

  return [];
}

/**
 * The values an option list offers, first occurrence kept, deduplicated the way
 * the unique registry deduplicates: by {@link valueKey}, so the count, the
 * selection range and the draws they are spent on judge sameness identically.
 *
 * Entries, not values, are what the schema requires two of — an imported
 * protocol may list one value under two labels. Everything downstream of an
 * option list works in values: a draw reaches such a value once however many
 * entries carry it, and a selection holding it twice is the same selection. So
 * this is what a categorical selection is sized by, drawn from and counted
 * over; sizing any of them by entries lets the three disagree.
 */
export function distinctOptionValues(
  entry: VariableEntry,
): (string | number | boolean)[] {
  const seen = new Set<string>();
  const values: (string | number | boolean)[] = [];

  for (const option of entry.options ?? []) {
    const key = valueKey(option.value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(option.value);
  }

  return values;
}

/**
 * The values the rendered Boolean control offers. Toggle ignores codebook
 * options, while the choice control uses them and defaults only when absent.
 */
export function booleanDomainValues(entry: VariableEntry): boolean[] {
  if (entry.component !== 'Boolean' || entry.options === undefined) {
    return [false, true];
  }

  if (entry.options.length === 0) return [];

  const values = distinctOptionValues(entry).filter(
    (value): value is boolean => typeof value === 'boolean',
  );
  return values.length > 0 ? values : [false, true];
}

/**
 * How many distinct values the generator can produce for this variable, or
 * `'unbounded'` once the count reaches `ceiling`.
 *
 * Counted over what the generator can actually reach rather than what the
 * rules permit: a feasibility pass that assumed a wider space than the
 * generator draws from would pass protocols the generator then exhausts.
 */
export function valueSpaceSize(
  variable: ConstrainedVariable,
  ceiling: number,
): number | 'unbounded' {
  const { entry, constraints } = variable;
  const cap = (value: number): number | 'unbounded' =>
    value >= ceiling ? 'unbounded' : value;

  switch (entry.type) {
    case 'boolean':
      return cap(booleanDomainValues(entry).length);

    case 'ordinal':
      return cap(distinctOptionValues(entry).length);

    case 'categorical': {
      const optionCount = distinctOptionValues(entry).length;
      // Sizes come from `selectionSizeRange`, which is already held to the
      // values the option list offers and is the same range the draw walks.
      // Clamping again here would be a second opinion on how wide a selection
      // can be, and the two could then disagree.
      const { min, max } = selectionSizeRange(variable);
      let total = 0;
      for (let size = min; size <= max; size++) {
        total += binomial(optionCount, size);
        if (total >= ceiling) return 'unbounded';
      }
      return total;
    }

    case 'number': {
      const { min, max } = numberDrawBounds(constraints);
      if (max < min) return 0;

      // The draw walks whole values wherever the range holds one and falls back
      // to the rounding grid only where it holds none, so what it reaches is
      // one or the other and never both: counting the grid over an ordinary
      // range would let a `unique` age in [18, 80] claim 6201 values for the 63
      // it can draw, while counting integers over [0.1, 0.9] would call a range
      // the draw fills perfectly well empty.
      const integers = Math.floor(max) - Math.ceil(min) + 1;
      if (integers > 0) return cap(integers);

      // Schema-valid number bounds are integers; hand-built codebooks can still reach this grid.
      // A range holding no integer spans less than one unit, and the draw falls
      // back to the rounding grid inside it — plus whichever bound rounding
      // steps outside and the clamp brings back, which is a value the draw
      // reaches and the form accepts. Counting only the grid points refused a
      // two-entity stage on `[0.001, 0.009]`, whose two ends are all it has.
      return cap(decimalGrid(min, max).size);
    }

    case 'datetime': {
      const window = constraints.dateWindow;
      // `buildVariableConstraints` closes every window it builds — at the last
      // date the field offers, or at the floor where a full-date floor sits
      // later than that — so only a descriptor assembled elsewhere can arrive
      // without a ceiling. Reading today's date to supply one here would move
      // the count with the wall clock, which a seeded run has to survive.
      if (!window?.max) return 'unbounded';

      const min =
        window.min ??
        openDateFloor(
          window.max,
          (constraints.unique ? UNIQUE_DATE_REACH : DATE_DEFAULT_REACH)[
            window.resolution
          ],
          window.resolution,
        );

      return cap(
        Math.max(0, stepsBetween(min, window.max, window.resolution) + 1),
      );
    }

    case 'scalar': {
      // Draws are rounded to a fixed number of decimal places and clamped into
      // the range, so what the generator can reach is that grid rather than the
      // whole interval. The range is the normalised scale unless a group holds
      // this scalar equal to something narrower, and never wider than it. The
      // schema does not permit `unique` on scalar, but in-progress protocol
      // state can still declare it.
      //
      // Read through the same descriptor a number's fractional range is:
      // `resolveValueBounds` gives every scalar the scale itself, and both ends
      // of it sit on the grid, so this is the plain grid count for any scalar
      // whose bounds the protocol did not narrow. A scalar held equal to a
      // number can inherit that number's off-grid bounds, and it is drawn with
      // the same clamp as the number is — so it reaches the same two ends, and
      // is counted the same way rather than one value short of them.
      const grid = scalarDrawGrid(constraints);
      return grid.size < 2 ? 1 : cap(grid.size);
    }

    case 'text':
      return cap(TEXT_ALPHABET_SIZE ** textDrawLength(constraints));

    default:
      return 'unbounded';
  }
}
