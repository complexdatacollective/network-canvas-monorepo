import { describe, expect, it } from 'vitest';

import { itemsBetween, layOut } from '../useWindowedRows';

describe('layOut', () => {
  it('stacks the items, a heading shorter than a row, until they are drawn', () => {
    const { offsets, indexOf } = layOut(
      [
        { key: 'group:a', heading: true },
        { key: 'row:a', heading: false },
        { key: 'row:b', heading: false },
      ],
      new Map(),
    );

    expect(Array.from(offsets)).toEqual([0, 40, 136, 232]);
    expect(indexOf.get('row:b')).toBe(2);
  });

  it('uses the height an item was drawn at', () => {
    const { offsets } = layOut(
      [
        { key: 'row:a', heading: false },
        { key: 'row:b', heading: false },
      ],
      new Map([['row:a', 150]]),
    );

    expect(Array.from(offsets)).toEqual([0, 150, 246]);
  });
});

describe('itemsBetween', () => {
  // Five items of 100 each.
  const offsets = Float64Array.from([0, 100, 200, 300, 400, 500]);

  it('names the first item the stretch reaches and the one after the last', () => {
    expect(itemsBetween(offsets, 150, 320)).toEqual([1, 4]);
  });

  it('counts an item that ends where the stretch starts as above it', () => {
    expect(itemsBetween(offsets, 200, 250)).toEqual([2, 3]);
  });

  it('keeps to the items there are', () => {
    expect(itemsBetween(offsets, -300, 9000)).toEqual([0, 5]);
    expect(itemsBetween(offsets, 700, 900)).toEqual([5, 5]);
  });

  it('reaches every item for a stretch with no end', () => {
    expect(
      itemsBetween(offsets, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
    ).toEqual([0, 5]);
  });
});
