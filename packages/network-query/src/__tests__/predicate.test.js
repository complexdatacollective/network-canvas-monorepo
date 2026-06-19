import { describe, expect, it } from 'vitest';

import predicate, { countOperators, operators } from '../predicate';

describe('predicate', () => {
  it('default', () => {
    expect(predicate(null)({ value: null, other: null })).toBe(false);
  });

  describe('operators', () => {
    it('GREATER_THAN', () => {
      expect(predicate(operators.GREATER_THAN)({ value: 1.5, other: 1 })).toBe(
        true,
      );
      expect(predicate(operators.GREATER_THAN)({ value: 2, other: 2 })).toBe(
        false,
      );
    });

    it('LESS_THAN', () => {
      expect(predicate(operators.LESS_THAN)({ value: 1, other: 1.5 })).toBe(
        true,
      );
      expect(predicate(operators.LESS_THAN)({ value: 2, other: 2 })).toBe(
        false,
      );
    });

    describe('numeric operators with non-numeric values', () => {
      // A null / absent number must not be coerced to 0. Otherwise an
      // unanswered node (value null) would wrongly satisfy LESS_THAN and be
      // included in a filter.
      it('null / undefined value is never matched (not coerced to 0)', () => {
        expect(predicate(operators.LESS_THAN)({ value: null, other: 5 })).toBe(
          false,
        );
        expect(
          predicate(operators.LESS_THAN)({ value: undefined, other: 5 }),
        ).toBe(false);
        expect(
          predicate(operators.GREATER_THAN)({ value: null, other: -5 }),
        ).toBe(false);
        expect(
          predicate(operators.GREATER_THAN_OR_EQUAL)({ value: null, other: 0 }),
        ).toBe(false);
        expect(
          predicate(operators.LESS_THAN_OR_EQUAL)({ value: null, other: 0 }),
        ).toBe(false);
      });

      // Datetime values are stored as ISO strings. Number('2020-...') is NaN,
      // so a naive numeric comparison silently fails. Compare them as dates.
      it('datetime ISO strings compare chronologically, not as NaN', () => {
        expect(
          predicate(operators.GREATER_THAN)({
            value: '2020-06-01',
            other: '2020-01-01',
          }),
        ).toBe(true);
        expect(
          predicate(operators.LESS_THAN)({
            value: '2020-01-01',
            other: '2020-06-01',
          }),
        ).toBe(true);
        expect(
          predicate(operators.GREATER_THAN_OR_EQUAL)({
            value: '2020-01-01T00:00:00.000Z',
            other: '2020-01-01T00:00:00.000Z',
          }),
        ).toBe(true);
      });

      // A value that is neither a number nor a parseable date never matches a
      // numeric operator (rather than producing a NaN comparison that happens
      // to be false, or coercing to a misleading number).
      it('unparseable value never matches', () => {
        expect(
          predicate(operators.GREATER_THAN)({ value: 'not a date', other: 5 }),
        ).toBe(false);
        expect(
          predicate(operators.LESS_THAN)({ value: 'not a date', other: 5 }),
        ).toBe(false);
      });
    });

    it('GREATER_THAN_OR_EQUAL', () => {
      expect(
        predicate(operators.GREATER_THAN_OR_EQUAL)({ value: 1.5, other: 1 }),
      ).toBe(true);
      expect(
        predicate(operators.GREATER_THAN_OR_EQUAL)({ value: 2, other: 2 }),
      ).toBe(true);
      expect(
        predicate(operators.GREATER_THAN_OR_EQUAL)({ value: 2, other: 3 }),
      ).toBe(false);
    });

    it('LESS_THAN_OR_EQUAL', () => {
      expect(
        predicate(operators.LESS_THAN_OR_EQUAL)({ value: 1, other: 1.5 }),
      ).toBe(true);
      expect(
        predicate(operators.LESS_THAN_OR_EQUAL)({ value: 2, other: 2 }),
      ).toBe(true);
      expect(
        predicate(operators.LESS_THAN_OR_EQUAL)({ value: 3, other: 2 }),
      ).toBe(false);
    });

    it('EXACTLY', () => {
      expect(predicate(operators.EXACTLY)({ value: 1, other: 1 })).toBe(true);
      expect(predicate(operators.EXACTLY)({ value: 2, other: 1 })).toBe(false);
      expect(predicate(operators.EXACTLY)({ value: null, other: 0 })).toBe(
        false,
      );
      expect(
        predicate(operators.EXACTLY)({ value: 'word', other: 'word' }),
      ).toBe(true);
      expect(
        predicate(operators.EXACTLY)({ value: 'not word', other: 'word' }),
      ).toBe(false);
      expect(predicate(operators.EXACTLY)({ value: null, other: 'word' })).toBe(
        false,
      );
      expect(predicate(operators.EXACTLY)({ value: true, other: true })).toBe(
        true,
      );
      expect(predicate(operators.EXACTLY)({ value: false, other: true })).toBe(
        false,
      );
      expect(predicate(operators.EXACTLY)({ value: null, other: true })).toBe(
        false,
      );
      expect(predicate(operators.EXACTLY)({ value: true, other: false })).toBe(
        false,
      );
      expect(predicate(operators.EXACTLY)({ value: false, other: false })).toBe(
        true,
      );
      expect(predicate(operators.EXACTLY)({ value: null, other: false })).toBe(
        false,
      );
      expect(predicate(operators.EXACTLY)({ value: false, other: null })).toBe(
        false,
      );

      // Categorical attributes are stored as arrays of selected option values,
      // and Architect emits array operands for categorical rules, so EXACTLY is
      // a deep array equality.
      expect(
        predicate(operators.EXACTLY)({ value: ['family'], other: ['family'] }),
      ).toBe(true);
      expect(
        predicate(operators.EXACTLY)({
          value: ['family', 'work'],
          other: ['family', 'work'],
        }),
      ).toBe(true);
      // Different selection sets are not exactly equal.
      expect(
        predicate(operators.EXACTLY)({
          value: ['family', 'work'],
          other: ['family'],
        }),
      ).toBe(false);
      // An unanswered categorical (null) is never exactly a selection.
      expect(
        predicate(operators.EXACTLY)({ value: null, other: ['family'] }),
      ).toBe(false);
    });

    it('NOT', () => {
      expect(predicate(operators.NOT)({ value: 1, other: 1 })).toBe(false);
      expect(predicate(operators.NOT)({ value: 2, other: 1 })).toBe(true);
      expect(predicate(operators.NOT)({ value: null, other: false })).toBe(
        true,
      );
      expect(predicate(operators.NOT)({ value: null, other: true })).toBe(true);
      expect(predicate(operators.NOT)({ value: false, other: null })).toBe(
        true,
      );
      expect(predicate(operators.NOT)({ value: false, other: true })).toBe(
        true,
      );
      expect(predicate(operators.NOT)({ value: true, other: false })).toBe(
        true,
      );

      // Mirrors EXACTLY — categorical is deep array equality.
      expect(
        predicate(operators.NOT)({ value: ['family'], other: ['family'] }),
      ).toBe(false);
      expect(
        predicate(operators.NOT)({
          value: ['family', 'work'],
          other: ['family'],
        }),
      ).toBe(true);
    });

    // CONTAINS is literal substring matching, NOT regex. A leading '^' is a
    // literal caret, not an anchor, so '^w' does not match 'word'.
    it('CONTAINS', () => {
      expect(
        predicate(operators.CONTAINS)({ value: 'word', other: 'wo' }),
      ).toBe(true);
      expect(
        predicate(operators.CONTAINS)({ value: 'word', other: '^w' }),
      ).toBe(false);
      expect(
        predicate(operators.CONTAINS)({ value: 'word', other: '^g' }),
      ).toBe(false);
    });

    it('DOES_NOT_CONTAIN', () => {
      expect(
        predicate(operators.DOES_NOT_CONTAIN)({ value: 'word', other: 'go' }),
      ).toBe(true);
      // '^g' is a literal substring not present in 'word'.
      expect(
        predicate(operators.DOES_NOT_CONTAIN)({ value: 'word', other: '^g' }),
      ).toBe(true);
      // 'wo' is present, so DOES_NOT_CONTAIN is false (boolean inverse of
      // CONTAINS for present values).
      expect(
        predicate(operators.DOES_NOT_CONTAIN)({ value: 'word', other: 'wo' }),
      ).toBe(false);
    });

    // Regex metacharacters in the filter value are matched literally and must
    // never be compiled as a pattern (which would throw on '(' or match the
    // wrong strings for '.'). getSkipMap evaluates every stage's skip-logic on
    // every network change, so a thrown SyntaxError would break navigation
    // interview-wide.
    it('treats regex metacharacters as literal substrings without throwing', () => {
      // '(' is a literal substring: matches 'a(b', not 'ab', and never throws.
      expect(() =>
        predicate(operators.CONTAINS)({ value: 'a(b', other: '(' }),
      ).not.toThrow();
      expect(predicate(operators.CONTAINS)({ value: 'a(b', other: '(' })).toBe(
        true,
      );
      expect(predicate(operators.CONTAINS)({ value: 'ab', other: '(' })).toBe(
        false,
      );

      // '.' is a literal dot, not a wildcard: 'a.b' does not match 'axb' but
      // does match the literal 'a.b'.
      expect(
        predicate(operators.CONTAINS)({ value: 'axb', other: 'a.b' }),
      ).toBe(false);
      expect(
        predicate(operators.CONTAINS)({ value: 'a.b', other: 'a.b' }),
      ).toBe(true);

      // DOES_NOT_CONTAIN is the boolean inverse and equally crash-safe.
      expect(() =>
        predicate(operators.DOES_NOT_CONTAIN)({ value: 'a(b', other: '(' }),
      ).not.toThrow();
      expect(
        predicate(operators.DOES_NOT_CONTAIN)({ value: 'a(b', other: '(' }),
      ).toBe(false);
      expect(
        predicate(operators.DOES_NOT_CONTAIN)({ value: 'axb', other: 'a.b' }),
      ).toBe(true);
    });

    // An absent (nil) attribute never "contains" anything; mirrors the
    // EXISTS/INCLUDES nil contract.
    it('CONTAINS/DOES_NOT_CONTAIN honour the nil-value contract', () => {
      expect(predicate(operators.CONTAINS)({ value: null, other: 'wo' })).toBe(
        false,
      );
      expect(
        predicate(operators.CONTAINS)({ value: undefined, other: 'wo' }),
      ).toBe(false);
      expect(
        predicate(operators.DOES_NOT_CONTAIN)({ value: null, other: 'wo' }),
      ).toBe(true);
      expect(
        predicate(operators.DOES_NOT_CONTAIN)({
          value: undefined,
          other: 'wo',
        }),
      ).toBe(true);
    });

    it('EXISTS', () => {
      expect(predicate(operators.EXISTS)({ value: null })).toBe(false);
      expect(predicate(operators.EXISTS)({ value: 1 })).toBe(true);

      // Empty array and empty string both count as "exists" — only absence
      // (null / undefined) is treated as missing. Skip-logic stage navigation
      // depends on this.
      expect(predicate(operators.EXISTS)({ value: [] })).toBe(true);
      expect(predicate(operators.EXISTS)({ value: '' })).toBe(true);

      // An absent attribute (undefined — never seeded, e.g. ego variables and
      // blank external-data cells) must be treated the same as null.
      expect(predicate(operators.EXISTS)({ value: undefined })).toBe(false);
      expect(predicate(operators.EXISTS)({})).toBe(false);
    });

    it('NOT_EXISTS', () => {
      expect(predicate(operators.NOT_EXISTS)({ value: 1 })).toBe(false);
      expect(predicate(operators.NOT_EXISTS)({ value: null })).toBe(true);
      expect(predicate(operators.NOT_EXISTS)({ value: [] })).toBe(false);

      // Absent (undefined) is treated the same as null.
      expect(predicate(operators.NOT_EXISTS)({ value: undefined })).toBe(true);
      expect(predicate(operators.NOT_EXISTS)({})).toBe(true);
    });

    describe('INCLUDES', () => {
      it('Other = string', () => {
        expect(
          predicate(operators.INCLUDES)({ value: ['a'], other: 'a' }),
        ).toBe(true);
        expect(
          predicate(operators.INCLUDES)({ value: ['a', 'b'], other: 'a' }),
        ).toBe(true);
        expect(
          predicate(operators.INCLUDES)({ value: ['c', 'd'], other: 'a' }),
        ).toBe(false);
        expect(
          predicate(operators.INCLUDES)({ value: ['d'], other: 'a' }),
        ).toBe(false);
        expect(predicate(operators.INCLUDES)({ value: 'a', other: 'a' })).toBe(
          true,
        );
        expect(predicate(operators.INCLUDES)({ value: 'a', other: 'aa' })).toBe(
          false,
        );
        expect(predicate(operators.INCLUDES)({ value: 6, other: 'a' })).toBe(
          false,
        );
      });

      it('Other = array', () => {
        expect(
          predicate(operators.INCLUDES)({ value: ['a'], other: ['a', 'b'] }),
        ).toBe(false);
        expect(
          predicate(operators.INCLUDES)({
            value: ['a', 'b'],
            other: ['a', 'b'],
          }),
        ).toBe(true);
        expect(
          predicate(operators.INCLUDES)({
            value: ['c', 'd'],
            other: ['a', 'b'],
          }),
        ).toBe(false);
        expect(
          predicate(operators.INCLUDES)({ value: ['d'], other: ['a', 'b'] }),
        ).toBe(false);
        expect(
          predicate(operators.INCLUDES)({ value: 'a', other: ['a', 'b'] }),
        ).toBe(true);
        expect(
          predicate(operators.INCLUDES)({ value: 6, other: ['a', 'b'] }),
        ).toBe(false);
      });

      it('Other = integer', () => {
        expect(predicate(operators.INCLUDES)({ value: ['a'], other: 6 })).toBe(
          false,
        );
        expect(
          predicate(operators.INCLUDES)({ value: ['a', 'b'], other: 6 }),
        ).toBe(false);
        expect(
          predicate(operators.INCLUDES)({ value: ['c', 'd'], other: 6 }),
        ).toBe(false);
        expect(predicate(operators.INCLUDES)({ value: ['d'], other: 6 })).toBe(
          false,
        );
        expect(predicate(operators.INCLUDES)({ value: 'a', other: 6 })).toBe(
          false,
        );
        expect(predicate(operators.INCLUDES)({ value: 6, other: 6 })).toBe(
          true,
        );
      });

      it('Empty array edges', () => {
        // Empty `other` array is vacuously included — every element of [] is
        // in any value. Authors filtering for "any of these" with no options
        // selected get unconditional true.
        expect(predicate(operators.INCLUDES)({ value: ['a'], other: [] })).toBe(
          true,
        );
        // Empty `value` array contains nothing.
        expect(predicate(operators.INCLUDES)({ value: [], other: 'a' })).toBe(
          false,
        );
      });

      it('Falsy scalar value', () => {
        // OrdinalBin writes scalar option values, so a stored `0` must still
        // reach the equality check.
        expect(predicate(operators.INCLUDES)({ value: 0, other: 0 })).toBe(
          true,
        );
        expect(predicate(operators.INCLUDES)({ value: 0, other: 1 })).toBe(
          false,
        );

        // null / undefined remain "unset" — not included.
        expect(predicate(operators.INCLUDES)({ value: null, other: 0 })).toBe(
          false,
        );
        expect(
          predicate(operators.INCLUDES)({ value: undefined, other: 0 }),
        ).toBe(false);
      });
    });

    // True if other is not included in value
    describe('EXCLUDES', () => {
      it('Other = string', () => {
        expect(
          predicate(operators.EXCLUDES)({ value: ['a'], other: 'a' }),
        ).toBe(false);
        expect(
          predicate(operators.EXCLUDES)({ value: ['a', 'b'], other: 'a' }),
        ).toBe(false);
        expect(
          predicate(operators.EXCLUDES)({ value: ['a', 'c', 'd'], other: 'a' }),
        ).toBe(false);
        expect(
          predicate(operators.EXCLUDES)({ value: ['d'], other: 'a' }),
        ).toBe(true);
        expect(predicate(operators.EXCLUDES)({ value: 'a', other: 'a' })).toBe(
          false,
        );
        expect(predicate(operators.EXCLUDES)({ value: 'a', other: 'aa' })).toBe(
          true,
        );
        expect(predicate(operators.EXCLUDES)({ value: 6, other: 'a' })).toBe(
          true,
        );
      });

      it('Other = array', () => {
        expect(
          predicate(operators.EXCLUDES)({ value: ['a'], other: ['a', 'b'] }),
        ).toBe(false);
        expect(
          predicate(operators.EXCLUDES)({
            value: ['a', 'b'],
            other: ['a', 'b'],
          }),
        ).toBe(false);
        expect(
          predicate(operators.EXCLUDES)({
            value: ['a', 'c', 'd'],
            other: ['a', 'b'],
          }),
        ).toBe(false);
        expect(
          predicate(operators.EXCLUDES)({ value: ['d'], other: ['a', 'b'] }),
        ).toBe(true);
        expect(
          predicate(operators.EXCLUDES)({ value: 'a', other: ['a', 'b'] }),
        ).toBe(false);
        expect(
          predicate(operators.EXCLUDES)({ value: 6, other: ['a', 'b'] }),
        ).toBe(true);
      });

      it('Other = integer', () => {
        expect(predicate(operators.EXCLUDES)({ value: ['a'], other: 6 })).toBe(
          true,
        );
        expect(
          predicate(operators.EXCLUDES)({ value: ['a', 'b'], other: 6 }),
        ).toBe(true);
        expect(
          predicate(operators.EXCLUDES)({ value: ['a', 'c', 'd'], other: 6 }),
        ).toBe(true);
        expect(predicate(operators.EXCLUDES)({ value: ['d'], other: 6 })).toBe(
          true,
        );
        expect(predicate(operators.EXCLUDES)({ value: 'a', other: 6 })).toBe(
          true,
        );
        expect(predicate(operators.EXCLUDES)({ value: 6, other: 6 })).toBe(
          false,
        );
      });

      it('Falsy scalar value', () => {
        // Mirror of INCLUDES: stored `0` must reach the equality check
        // rather than falling into the nil short-circuit.
        expect(predicate(operators.EXCLUDES)({ value: 0, other: 0 })).toBe(
          false,
        );
        expect(predicate(operators.EXCLUDES)({ value: 0, other: 1 })).toBe(
          true,
        );

        // null / undefined remain "unset" — vacuously excluded.
        expect(predicate(operators.EXCLUDES)({ value: null, other: 0 })).toBe(
          true,
        );
        expect(
          predicate(operators.EXCLUDES)({ value: undefined, other: 0 }),
        ).toBe(true);
      });

      it('Empty array edges', () => {
        // Empty `other` array vacuously excludes — no element is in `value`.
        expect(predicate(operators.EXCLUDES)({ value: ['a'], other: [] })).toBe(
          true,
        );
        expect(predicate(operators.EXCLUDES)({ value: [], other: 'a' })).toBe(
          true,
        );
      });
    });

    it('OPTIONS_GREATER_THAN', () => {
      const other = 2;
      const value1 = ['a', 'b'];
      const value2 = ['a', 'c', 'd'];

      expect(
        predicate(operators.OPTIONS_GREATER_THAN)({ value: value1, other }),
      ).toBe(false);
      expect(
        predicate(operators.OPTIONS_GREATER_THAN)({ value: value2, other }),
      ).toBe(true);
    });

    it('OPTIONS_GREATER_THAN (unanswered)', () => {
      // A categorical with no selection (null) counts as zero options.
      expect(
        predicate(operators.OPTIONS_GREATER_THAN)({ value: null, other: 0 }),
      ).toBe(false);
    });

    it('OPTIONS_LESS_THAN', () => {
      const other = 2;
      const value1 = ['a'];
      const value2 = ['a', 'c', 'd'];

      expect(
        predicate(operators.OPTIONS_LESS_THAN)({ value: value1, other }),
      ).toBe(true);
      expect(
        predicate(operators.OPTIONS_LESS_THAN)({ value: value2, other }),
      ).toBe(false);
    });

    it('OPTIONS_LESS_THAN (unanswered)', () => {
      // No selection (null) counts as zero options.
      expect(
        predicate(operators.OPTIONS_LESS_THAN)({ value: null, other: 2 }),
      ).toBe(true);
      expect(
        predicate(operators.OPTIONS_LESS_THAN)({ value: null, other: 0 }),
      ).toBe(false);
    });

    it('OPTIONS_EQUALS', () => {
      const other = 2;
      const value1 = ['a', 'b'];
      const value2 = ['a', 'c', 'd'];

      expect(
        predicate(operators.OPTIONS_EQUALS)({ value: value1, other }),
      ).toBe(true);
      expect(
        predicate(operators.OPTIONS_EQUALS)({ value: value2, other }),
      ).toBe(false);
    });

    it('OPTIONS_EQUALS (unanswered)', () => {
      // No selection (null) counts as zero options.
      expect(
        predicate(operators.OPTIONS_EQUALS)({ value: null, other: 0 }),
      ).toBe(true);
      expect(
        predicate(operators.OPTIONS_EQUALS)({ value: null, other: 1 }),
      ).toBe(false);
    });

    it('OPTIONS_NOT_EQUALS', () => {
      const other = 2;
      const value1 = ['a', 'b'];
      const value2 = ['a', 'c', 'd'];

      expect(
        predicate(operators.OPTIONS_NOT_EQUALS)({ value: value1, other }),
      ).toBe(false);
      expect(
        predicate(operators.OPTIONS_NOT_EQUALS)({ value: value2, other }),
      ).toBe(true);
    });

    it('OPTIONS_NOT_EQUALS (unanswered)', () => {
      // No selection (null) counts as zero options.
      expect(
        predicate(operators.OPTIONS_NOT_EQUALS)({ value: null, other: 1 }),
      ).toBe(true);
      expect(
        predicate(operators.OPTIONS_NOT_EQUALS)({ value: null, other: 0 }),
      ).toBe(false);
    });
  });

  describe('Count operators', () => {
    it('COUNT_GREATER_THAN', () => {
      expect(
        predicate(countOperators.COUNT_GREATER_THAN)({ value: 1.5, other: 1 }),
      ).toBe(true);
      expect(
        predicate(countOperators.COUNT_GREATER_THAN)({ value: 2, other: 2 }),
      ).toBe(false);
    });

    it('COUNT_LESS_THAN', () => {
      expect(
        predicate(countOperators.COUNT_LESS_THAN)({ value: 1, other: 1.5 }),
      ).toBe(true);
      expect(
        predicate(countOperators.COUNT_LESS_THAN)({ value: 2, other: 2 }),
      ).toBe(false);
    });

    it('COUNT_GREATER_THAN_OR_EQUAL', () => {
      expect(
        predicate(countOperators.COUNT_GREATER_THAN_OR_EQUAL)({
          value: 1.5,
          other: 1,
        }),
      ).toBe(true);
      expect(
        predicate(countOperators.COUNT_GREATER_THAN_OR_EQUAL)({
          value: 2,
          other: 2,
        }),
      ).toBe(true);
      expect(
        predicate(countOperators.COUNT_GREATER_THAN_OR_EQUAL)({
          value: 2,
          other: 3,
        }),
      ).toBe(false);
    });

    it('COUNT_LESS_THAN_OR_EQUAL', () => {
      expect(
        predicate(countOperators.COUNT_LESS_THAN_OR_EQUAL)({
          value: 1,
          other: 1.5,
        }),
      ).toBe(true);
      expect(
        predicate(countOperators.COUNT_LESS_THAN_OR_EQUAL)({
          value: 2,
          other: 2,
        }),
      ).toBe(true);
      expect(
        predicate(countOperators.COUNT_LESS_THAN_OR_EQUAL)({
          value: 3,
          other: 2,
        }),
      ).toBe(false);
    });

    // COUNT_* numeric operators share compareNumeric with their non-count
    // counterparts, so they inherit the same guards: a nil count never matches
    // (not coerced to 0), datetime ISO strings compare chronologically, and
    // unparseable values never match.
    describe('COUNT_* numeric operators with non-numeric values', () => {
      it('null / undefined value is never matched', () => {
        expect(
          predicate(countOperators.COUNT_LESS_THAN)({ value: null, other: 5 }),
        ).toBe(false);
        expect(
          predicate(countOperators.COUNT_GREATER_THAN)({
            value: undefined,
            other: 5,
          }),
        ).toBe(false);
        expect(
          predicate(countOperators.COUNT_GREATER_THAN_OR_EQUAL)({
            value: null,
            other: 0,
          }),
        ).toBe(false);
        expect(
          predicate(countOperators.COUNT_LESS_THAN_OR_EQUAL)({
            value: null,
            other: 0,
          }),
        ).toBe(false);
      });

      it('datetime ISO strings compare chronologically', () => {
        expect(
          predicate(countOperators.COUNT_GREATER_THAN)({
            value: '2020-06-01',
            other: '2020-01-01',
          }),
        ).toBe(true);
        expect(
          predicate(countOperators.COUNT_LESS_THAN)({
            value: '2020-01-01',
            other: '2020-06-01',
          }),
        ).toBe(true);
      });

      it('unparseable value never matches', () => {
        expect(
          predicate(countOperators.COUNT_LESS_THAN)({
            value: 'not a date',
            other: 5,
          }),
        ).toBe(false);
        expect(
          predicate(countOperators.COUNT_GREATER_THAN)({
            value: 'not a date',
            other: 5,
          }),
        ).toBe(false);
      });
    });

    it('COUNT', () => {
      expect(predicate(countOperators.COUNT)({ value: 1, other: 1 })).toBe(
        true,
      );
      expect(predicate(countOperators.COUNT)({ value: 2, other: 1 })).toBe(
        false,
      );
    });

    it('COUNT_NOT', () => {
      expect(predicate(countOperators.COUNT_NOT)({ value: 1, other: 1 })).toBe(
        false,
      );
      expect(predicate(countOperators.COUNT_NOT)({ value: 2, other: 1 })).toBe(
        true,
      );
    });

    it('COUNT_ANY', () => {
      expect(predicate(countOperators.COUNT_ANY)({ value: 0 })).toBe(false);
      expect(predicate(countOperators.COUNT_ANY)({ value: 100 })).toBe(true);
    });

    it('COUNT_NONE', () => {
      expect(predicate(countOperators.COUNT_NONE)({ value: 100 })).toBe(false);
      expect(predicate(countOperators.COUNT_NONE)({ value: 0 })).toBe(true);
    });
  });
});
