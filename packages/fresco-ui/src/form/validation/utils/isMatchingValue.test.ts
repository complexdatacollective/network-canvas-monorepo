import { describe, expect, it } from 'vitest';

import isMatchingValue from './isMatchingValue';

describe('isMatchingValue', () => {
  describe('primitive arrays (categorical/ordinal selections)', () => {
    it('treats reordered selections as matching (order-insensitive)', () => {
      expect(isMatchingValue(['x', 'y'], ['y', 'x'])).toBe(true);
    });

    it('treats reordered three-element selections as matching', () => {
      expect(isMatchingValue(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
    });

    it('treats identical selections as matching', () => {
      expect(isMatchingValue(['x', 'y'], ['x', 'y'])).toBe(true);
    });

    it('treats differing multisets as not matching', () => {
      expect(isMatchingValue(['x', 'x'], ['x', 'y'])).toBe(false);
    });

    it('is count-sensitive for duplicate elements', () => {
      expect(isMatchingValue(['x', 'x', 'y'], ['x', 'y', 'y'])).toBe(false);
    });

    it('treats reordered duplicate selections as matching', () => {
      expect(isMatchingValue(['x', 'x', 'y'], ['y', 'x', 'x'])).toBe(true);
    });

    it('treats arrays of different length as not matching', () => {
      expect(isMatchingValue(['x', 'y'], ['x'])).toBe(false);
    });

    it('distinguishes values of different primitive types', () => {
      expect(isMatchingValue([1, 2], ['1', '2'])).toBe(false);
    });

    it('matches reordered numeric selections', () => {
      expect(isMatchingValue([1, 2, 3], [3, 2, 1])).toBe(true);
    });

    it('matches reordered boolean selections (count-sensitive)', () => {
      expect(isMatchingValue([true, false], [false, true])).toBe(true);
      expect(isMatchingValue([true, true], [true, false])).toBe(false);
    });
  });

  describe('object arrays (coordinates / records)', () => {
    it('matches arrays of coordinate objects in the same order', () => {
      expect(
        isMatchingValue(
          [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
          [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        ),
      ).toBe(true);
    });

    it('does not match coordinate-object arrays with differing values', () => {
      expect(isMatchingValue([{ x: 1, y: 2 }], [{ x: 9, y: 9 }])).toBe(false);
    });
  });

  describe('scalar values', () => {
    it('matches equal scalars', () => {
      expect(isMatchingValue('hello', 'hello')).toBe(true);
      expect(isMatchingValue(5, 5)).toBe(true);
    });

    it('does not match differing scalars', () => {
      expect(isMatchingValue('hello', 'world')).toBe(false);
      expect(isMatchingValue(5, 6)).toBe(false);
    });

    it('handles null / undefined', () => {
      expect(isMatchingValue(null, null)).toBe(true);
      expect(isMatchingValue(undefined, undefined)).toBe(true);
      expect(isMatchingValue(null, undefined)).toBe(false);
      expect(isMatchingValue('x', null)).toBe(false);
    });
  });
});
