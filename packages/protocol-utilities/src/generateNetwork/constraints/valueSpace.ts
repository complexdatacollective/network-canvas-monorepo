import { stepsBetween } from './dateWindow';
import type { ConstrainedVariable } from './types';

/**
 * Symbols the unique-text generator draws from. Kept in sync with
 * ValueGenerator's distinct-text encoding: both are base 36.
 */
export const TEXT_ALPHABET_SIZE = 36;

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

    case 'text': {
      const { maxLength } = constraints;
      if (maxLength === undefined) return 'unbounded';
      const minLength = constraints.minLength ?? 1;
      let total = 0;
      for (let length = minLength; length <= maxLength; length++) {
        total += TEXT_ALPHABET_SIZE ** length;
        if (total >= ceiling) return 'unbounded';
      }
      return total;
    }

    default:
      return 'unbounded';
  }
}
