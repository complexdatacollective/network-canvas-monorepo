import { DATE_PICKER_DEFAULT_MIN } from '@codaco/shared-consts';

import type { VariableEntry } from '../../types';
import {
  addSteps,
  type DateResolution,
  stepsBetween,
  truncateToResolution,
} from './dateWindow';
import type { ConstrainedVariable, VariableConstraints } from './types';
import { valueKey } from './uniqueRegistry';

/**
 * Symbols the unique-text generator draws from. Kept in sync with
 * ValueGenerator's distinct-text encoding: both are base 36.
 */
export const TEXT_ALPHABET_SIZE = 36;

/** Decimal places every scalar draw is rounded to. */
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
 * The floor both stop at is the date picker's own, read from
 * `DATE_PICKER_DEFAULT_MIN`.
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
 */
export function textDrawLength(constraints: VariableConstraints): number {
  return Math.max(
    constraints.maxLength ?? DEFAULT_TEXT_LENGTH,
    constraints.minLength ?? 0,
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

/** Grid points at {@link SCALAR_DECIMAL_PLACES} inside `[min, max]`. */
function gridPointsBetween(min: number, max: number): number {
  const scale = 10 ** SCALAR_DECIMAL_PLACES;
  return (
    Math.floor(max * scale + GRID_TOLERANCE) -
    Math.ceil(min * scale - GRID_TOLERANCE) +
    1
  );
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
 * How many options a categorical draw selects, as an inclusive size range.
 *
 * Read by the draw and by the count for the same reason as
 * {@link numberDrawBounds}. A selection is never wider than the option list,
 * whatever the rules say. Without a declared ceiling a draw keeps its
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
  const optionCount = variable.entry.options?.length ?? 0;
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

/**
 * The floor a date is drawn from when the protocol declares none: as far back
 * as the draw's own span reaches, held at the earliest date the picker offers.
 * A ceiling already before that date is one the protocol declared, and reaching
 * behind it is then the only way to have a range at all.
 */
function openDateFloor(
  max: string,
  resolution: DateResolution,
  unique: boolean,
): string {
  const reach = addSteps(
    max,
    -(unique ? UNIQUE_DATE_REACH : DATE_DEFAULT_REACH)[resolution],
    resolution,
  );
  const floor = truncateToResolution(DATE_PICKER_DEFAULT_MIN, resolution);
  return reach < floor && floor <= max ? floor : reach;
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
 * The `rank`-th selection a categorical draw can make, as option indices.
 *
 * Ranks walk the whole combination space: sizes in order, and each size's
 * subsets in lexicographic order. Choosing a contiguous run of options instead
 * would reach only as many selections as there are starting points, and a
 * `unique` variable would exhaust its values long before the count said so.
 * Past the end of the space the sequence wraps.
 *
 * Selections are positions in the option list, so two entries carrying one
 * value give two ranks that draw the same value. {@link valueSpaceSize} counts
 * the values rather than the ranks for that reason, leaving a rank per value
 * and never the other way round.
 */
export function categoricalSelectionAt(
  variable: ConstrainedVariable,
  rank: number,
): number[] {
  const optionCount = variable.entry.options?.length ?? 0;
  if (optionCount === 0) return [];
  const { min, max } = selectionSizeRange(variable);

  const sizes: { size: number; count: number }[] = [];
  let total = 0;
  // An inverted pair is a contradiction feasibility reports; here it draws the
  // smallest selection its rules describe rather than nothing at all.
  for (let size = min; size <= Math.max(min, max); size++) {
    const count = binomial(optionCount, size);
    sizes.push({ size, count });
    total += count;
  }

  let remaining = rank % total;
  for (const { size, count } of sizes) {
    if (remaining < count) {
      return unrankCombination(optionCount, size, remaining);
    }
    remaining -= count;
  }

  return [];
}

/**
 * How many values an option list offers, counted the way the unique registry
 * counts them: by {@link valueKey}, so the count and the draws it is spent on
 * judge sameness identically.
 *
 * Entries, not values, are what the schema requires two of — an imported
 * protocol may list one value under two labels. The draw reaches such a value
 * once however many entries carry it, so counting entries would let a `unique`
 * variable pass feasibility and then exhaust generation partway through the
 * network.
 *
 * Deliberately not what {@link selectionSizeRange} measures: that is how many
 * options a draw picks, which is a position in the raw list.
 */
function distinctOptionCount(entry: VariableEntry): number {
  return new Set((entry.options ?? []).map((option) => valueKey(option.value)))
    .size;
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
      return 2;

    case 'ordinal':
      return cap(distinctOptionCount(entry));

    case 'categorical': {
      const optionCount = distinctOptionCount(entry);
      const { min, max } = selectionSizeRange(variable);
      let total = 0;
      // Selection sizes are counted in options picked, which duplicate entries
      // make more numerous than the values they carry, so the range is held to
      // the list the values themselves make: a size no set of distinct values
      // can fill counts nothing, and a floor above them is met by the values
      // the entries at that size collapse to. Held rather than left to
      // `binomial`'s zero so the floor moves too — a duplicate-free list is
      // already inside its own option count and is counted exactly as before.
      for (
        let size = Math.min(min, optionCount);
        size <= Math.min(max, optionCount);
        size++
      ) {
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

      // Narrower than a single grid step, where the draw is clamped back to a
      // bound. Counted as the one value that guarantees.
      return cap(Math.max(1, gridPointsBetween(min, max)));
    }

    case 'datetime': {
      const window = constraints.dateWindow;
      // `buildVariableConstraints` closes every window it builds at the last
      // date the field offers, so only a descriptor assembled elsewhere can
      // arrive without a ceiling. Reading today's date to supply one here would
      // move the count with the wall clock, which a seeded run has to survive.
      if (!window?.max) return 'unbounded';

      const min =
        window.min ??
        openDateFloor(window.max, window.resolution, constraints.unique);

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
      const min = Math.max(
        constraints.minValue ?? SCALAR_DOMAIN.minValue,
        SCALAR_DOMAIN.minValue,
      );
      const max = Math.min(
        constraints.maxValue ?? SCALAR_DOMAIN.maxValue,
        SCALAR_DOMAIN.maxValue,
      );
      if (max <= min) return 1;
      return cap(Math.round((max - min) * 10 ** SCALAR_DECIMAL_PLACES) + 1);
    }

    case 'text':
      return cap(TEXT_ALPHABET_SIZE ** textDrawLength(constraints));

    default:
      return 'unbounded';
  }
}
