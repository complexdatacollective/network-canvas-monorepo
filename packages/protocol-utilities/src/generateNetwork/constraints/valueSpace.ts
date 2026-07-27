import { stepsBetween } from './dateWindow';
import type { ConstrainedVariable, VariableConstraints } from './types';

/**
 * Symbols the unique-text generator draws from. Kept in sync with
 * ValueGenerator's distinct-text encoding: both are base 36.
 */
export const TEXT_ALPHABET_SIZE = 36;

/** Decimal places every scalar draw is rounded to. */
export const SCALAR_DECIMAL_PLACES = 2;

/** Length a text draw falls back to when the rules impose no maximum. */
const DEFAULT_TEXT_LENGTH = 12;

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
      return cap(entry.options?.length ?? 0);

    case 'categorical': {
      const optionCount = entry.options?.length ?? 0;
      const min = constraints.minSelected ?? 1;
      const max = Math.min(constraints.maxSelected ?? optionCount, optionCount);
      let total = 0;
      for (let size = min; size <= max; size++) {
        total += binomial(optionCount, size);
        if (total >= ceiling) return 'unbounded';
      }
      return total;
    }

    case 'number': {
      const { minValue, maxValue } = constraints;
      if (minValue === undefined || maxValue === undefined) return 'unbounded';
      return cap(Math.max(0, Math.floor(maxValue) - Math.ceil(minValue) + 1));
    }

    case 'datetime': {
      const window = constraints.dateWindow;
      if (!window?.min || !window.max) return 'unbounded';
      return cap(
        Math.max(
          0,
          stepsBetween(window.min, window.max, window.resolution) + 1,
        ),
      );
    }

    case 'scalar': {
      const min = constraints.minValue ?? 0;
      const max = constraints.maxValue ?? 1;
      // Draws are rounded to a fixed number of decimal places and clamped into
      // the range, so what the generator can reach is that grid rather than the
      // whole interval. The schema does not permit `unique` on scalar, but
      // in-progress protocol state can still declare it.
      if (max <= min) return 1;
      return cap(Math.round((max - min) * 10 ** SCALAR_DECIMAL_PLACES) + 1);
    }

    case 'text':
      return cap(TEXT_ALPHABET_SIZE ** textDrawLength(constraints));

    default:
      return 'unbounded';
  }
}
