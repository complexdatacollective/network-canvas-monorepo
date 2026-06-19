import { isEqual, isNil } from 'es-toolkit';

export const operators = {
  EXACTLY: 'EXACTLY',
  INCLUDES: 'INCLUDES',
  EXCLUDES: 'EXCLUDES',
  EXISTS: 'EXISTS',
  NOT_EXISTS: 'NOT_EXISTS',
  NOT: 'NOT',
  CONTAINS: 'CONTAINS',
  DOES_NOT_CONTAIN: 'DOES_NOT_CONTAIN',
  GREATER_THAN: 'GREATER_THAN',
  GREATER_THAN_OR_EQUAL: 'GREATER_THAN_OR_EQUAL',
  LESS_THAN: 'LESS_THAN',
  LESS_THAN_OR_EQUAL: 'LESS_THAN_OR_EQUAL',
  OPTIONS_GREATER_THAN: 'OPTIONS_GREATER_THAN',
  OPTIONS_LESS_THAN: 'OPTIONS_LESS_THAN',
  OPTIONS_EQUALS: 'OPTIONS_EQUALS',
  OPTIONS_NOT_EQUALS: 'OPTIONS_NOT_EQUALS',
} as const;

export const countOperators = {
  COUNT: 'COUNT',
  COUNT_NOT: 'COUNT_NOT',
  COUNT_ANY: 'COUNT_ANY',
  COUNT_NONE: 'COUNT_NONE',
  COUNT_GREATER_THAN: 'COUNT_GREATER_THAN',
  COUNT_GREATER_THAN_OR_EQUAL: 'COUNT_GREATER_THAN_OR_EQUAL',
  COUNT_LESS_THAN: 'COUNT_LESS_THAN',
  COUNT_LESS_THAN_OR_EQUAL: 'COUNT_LESS_THAN_OR_EQUAL',
} as const;

// Predicate values are intentionally broad: attribute values can be any
// VariableValue (string, number, boolean, arrays, records, null) and filter
// rule comparison values overlap but aren't identical. Using unknown here
// means each switch branch handles its own runtime narrowing, which matches
// the existing JS behavior.
type PredicateInput = {
  value: unknown;
  other: unknown;
};

// Resolves a value to a comparable number for the numeric operators. Plain
// numbers and numeric strings are used as-is; datetime attribute values (ISO
// strings) are compared chronologically via their timestamp. Returns NaN for
// anything that is neither, so the caller can reject the comparison rather than
// silently coercing (e.g. a datetime string to NaN, which always compares
// false). Nil is handled by the caller before this is reached.
const toComparableNumber = (input: unknown): number => {
  if (typeof input === 'number') return input;
  if (typeof input === 'string' && input.trim() !== '') {
    const asNumber = Number(input);
    if (!Number.isNaN(asNumber)) return asNumber;
    return Date.parse(input);
  }
  return NaN;
};

// Numeric/datetime comparison guarded against bad input. A nil value (an
// unanswered / absent attribute) never matches — it must NOT be coerced to 0,
// or LESS_THAN would wrongly include unanswered nodes. If either operand cannot
// be resolved to a number or date, the comparison is rejected (false).
const compareNumeric = (
  value: unknown,
  other: unknown,
  comparator: (a: number, b: number) => boolean,
): boolean => {
  if (isNil(value)) return false;
  const a = toComparableNumber(value);
  const b = toComparableNumber(other);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return comparator(a, b);
};

// Builds a RegExp from a (possibly author-supplied) pattern, returning null
// when the pattern is invalid rather than throwing. getSkipMap evaluates every
// stage's skip-logic on every network change, so one bad pattern must not break
// navigation interview-wide.
const safeRegExp = (pattern: unknown): RegExp | null => {
  try {
    return new RegExp(String(pattern));
  } catch {
    return null;
  }
};

// Number of selected options for a categorical attribute. Categorical values
// are stored as arrays of selected option values; an unanswered attribute
// (null / undefined / non-array) counts as zero.
const optionsLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

/**
 * returns functions that can be used to compare `value` with `other`
 *
 * @param operator One of the operators from the operators list.
 *
 * Usage:
 *
 * ```
 * predicate('GREATER_THAN')({ value: 2, other: 1 }); // returns true
 * ```
 */
const predicate =
  (operator: string) =>
  ({ value, other: variableValue }: PredicateInput): boolean => {
    switch (operator) {
      case operators.GREATER_THAN:
      case countOperators.COUNT_GREATER_THAN:
        return compareNumeric(value, variableValue, (a, b) => a > b);
      case operators.LESS_THAN:
      case countOperators.COUNT_LESS_THAN:
        return compareNumeric(value, variableValue, (a, b) => a < b);
      case operators.GREATER_THAN_OR_EQUAL:
      case countOperators.COUNT_GREATER_THAN_OR_EQUAL:
        return compareNumeric(value, variableValue, (a, b) => a >= b);
      case operators.LESS_THAN_OR_EQUAL:
      case countOperators.COUNT_LESS_THAN_OR_EQUAL:
        return compareNumeric(value, variableValue, (a, b) => a <= b);
      case operators.EXACTLY:
        return isEqual(value, variableValue);
      case countOperators.COUNT:
        return isEqual(value, variableValue);
      case operators.NOT:
        return !isEqual(value, variableValue);
      case countOperators.COUNT_NOT:
        return !isEqual(value, variableValue);
      case operators.CONTAINS: {
        const regexp = safeRegExp(variableValue);
        return regexp ? regexp.test(String(value)) : false;
      }
      case operators.DOES_NOT_CONTAIN: {
        const regexp = safeRegExp(variableValue);
        return regexp ? !regexp.test(String(value)) : true;
      }
      /**
       * WARNING: INCLUDES/EXCLUDES are complicated!
       *
       * value can be a string, an integer, or an array
       * variableValue can be a string, an integer, or an array
       *
       * If you change these, make sure you test all the cases!
       */
      case operators.INCLUDES: {
        // isNil, not `!value`: stored `0` / `false` are valid option values
        // and must reach the equality checks below.
        if (isNil(value)) {
          return false;
        }

        if (Array.isArray(variableValue)) {
          if (Array.isArray(value)) {
            return variableValue.every((v: unknown) => value.includes(v));
          }

          return variableValue.includes(value);
        }

        if (Array.isArray(value)) {
          return value.includes(variableValue);
        }

        // both are strings or integers
        return value === variableValue;
      }
      case operators.EXCLUDES: {
        // See INCLUDES for why this is isNil, not `!value`.
        if (isNil(value)) {
          return true;
        }

        if (Array.isArray(variableValue)) {
          if (Array.isArray(value)) {
            return variableValue.every((v: unknown) => !value.includes(v));
          }

          return !variableValue.includes(value);
        }

        if (Array.isArray(value)) {
          return !value.includes(variableValue);
        }

        // both are strings or integers
        return value !== variableValue;
      }
      case operators.EXISTS:
        // isNil, not isNull: an absent attribute (undefined — ego variables
        // and blank external-data cells are never seeded) must be treated the
        // same as a seeded null so absence is consistent across entities.
        return !isNil(value);
      case operators.NOT_EXISTS:
        return isNil(value);
      case countOperators.COUNT_ANY:
        return (value as number) > 0;
      case countOperators.COUNT_NONE:
        return value === 0;
      case operators.OPTIONS_GREATER_THAN: {
        return optionsLength(value) > (variableValue as number);
      }
      case operators.OPTIONS_LESS_THAN: {
        return optionsLength(value) < (variableValue as number);
      }
      case operators.OPTIONS_EQUALS: {
        return optionsLength(value) === variableValue;
      }
      case operators.OPTIONS_NOT_EQUALS: {
        return optionsLength(value) !== variableValue;
      }
      default:
        return false;
    }
  };

export default predicate;
