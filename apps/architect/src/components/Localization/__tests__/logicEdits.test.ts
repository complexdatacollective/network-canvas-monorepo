import { describe, expect, it } from 'vitest';

import {
  latestOrder,
  type Patch,
  patchAfterWrite,
  readCellLogic,
  withPatch,
  withPatches,
} from '../logicEdits';

const STORED = { a: 'stored a', b: 'stored b' };

describe('the definitions that the table holds', () => {
  it('are the stored ones while no cell has changed any', () => {
    expect(withPatches(STORED, [undefined, {}])).toBe(STORED);
  });

  it('take each change in order, the latest for each id winning', () => {
    const first: Patch = {
      a: { order: 1, value: 'first a' },
      b: { order: 4, value: 'first b' },
    };
    const second: Patch = {
      a: { order: 2, value: 'second a' },
      b: { order: 3, value: 'second b' },
      c: { order: 5, value: 'second c' },
    };

    expect(withPatches(STORED, [first, second])).toEqual({
      a: 'second a',
      b: 'first b',
      c: 'second c',
    });
    // The order of the cells does not matter, only the order of the changes.
    expect(withPatches(STORED, [second, first])).toEqual(
      withPatches(STORED, [first, second]),
    );
  });

  it('leave out what a change removed, and keep what a later change gives back', () => {
    expect(withPatches(STORED, [{ a: { order: 1, removed: true } }])).toEqual({
      b: 'stored b',
    });
    expect(
      withPatches(STORED, [
        { a: { order: 1, removed: true } },
        { a: { order: 2, value: 'back' } },
      ]),
    ).toEqual({ a: 'back', b: 'stored b' });
  });
});

describe("a cell's changes after its editor writes", () => {
  it('record each id that the write changes, at its order', () => {
    expect(
      patchAfterWrite({
        previous: undefined,
        without: STORED,
        shown: STORED,
        next: { a: 'new a', c: 'new c' },
        order: 7,
      }),
    ).toEqual({
      a: { order: 7, value: 'new a' },
      b: { order: 7, removed: true },
      c: { order: 7, value: 'new c' },
    });
  });

  it("keep the cell's earlier change to an id the write leaves as it was shown, with its order", () => {
    const previous: Patch = { a: { order: 2, value: 'earlier a' } };

    expect(
      patchAfterWrite({
        previous,
        without: STORED,
        shown: { ...STORED, a: 'earlier a' },
        next: { a: 'earlier a', b: 'new b' },
        order: 9,
      }),
    ).toEqual({
      a: { order: 2, value: 'earlier a' },
      b: { order: 9, value: 'new b' },
    });
  });

  it('drop the change to an id the write puts back as it is without the cell', () => {
    expect(
      patchAfterWrite({
        previous: { a: { order: 2, value: 'earlier a' } },
        without: STORED,
        shown: { ...STORED, a: 'earlier a' },
        next: STORED,
        order: 9,
      }),
    ).toEqual({});
  });

  it("keep a change of the cell's that a later cell's change hides, while the write leaves the id as shown", () => {
    // The cell changed a, and another cell changed it again since.
    const previous: Patch = { a: { order: 2, value: 'mine' } };
    const without = { ...STORED, a: 'theirs' };

    expect(
      patchAfterWrite({
        previous,
        without,
        shown: without,
        next: { ...without, b: 'new b' },
        order: 9,
      }),
    ).toEqual({
      a: { order: 2, value: 'mine' },
      b: { order: 9, value: 'new b' },
    });
  });

  it('make the write the latest change, so that it is what the table holds', () => {
    // Another cell's change to a is later than this cell's first one.
    const theirs: Patch = { a: { order: 3, value: 'theirs' } };
    const mine = patchAfterWrite({
      previous: { a: { order: 2, value: 'mine' } },
      without: withPatches(STORED, [theirs]),
      shown: withPatches(STORED, [theirs]),
      next: { ...STORED, a: 'mine again' },
      order: latestOrder([theirs]) + 1,
    });

    expect(withPatches(STORED, [theirs, mine])).toEqual({
      ...STORED,
      a: 'mine again',
    });
    // Escape in this cell puts back the other cell's change.
    expect(withPatches(STORED, [theirs])).toEqual({ ...STORED, a: 'theirs' });
  });
});

describe("what a cell's field holds as its logic", () => {
  it('holds no logic once every change is dropped', () => {
    const logic = withPatch(undefined, 'conditions', {
      a: { order: 1, value: 'a' },
    });
    expect(logic).toEqual({ conditions: { a: { order: 1, value: 'a' } } });
    expect(withPatch(logic, 'conditions', {})).toBeUndefined();
    expect(
      withPatch(logic, 'dynamicAttributes', {
        d: { order: 2, removed: true },
      }),
    ).toEqual({
      conditions: { a: { order: 1, value: 'a' } },
      dynamicAttributes: { d: { order: 2, removed: true } },
    });
  });

  it('is read back as it was written, and anything else as none', () => {
    const logic = {
      conditions: { a: { order: 1, value: { rules: [] } } },
      dynamicAttributes: { d: { order: 2, removed: true } },
    };
    expect(readCellLogic(structuredClone(logic))).toEqual(logic);
    expect(readCellLogic({ conditions: { a: { value: 1 } } })).toBeUndefined();
    expect(readCellLogic('logic')).toBeUndefined();
  });

  it('orders a first change after none', () => {
    expect(latestOrder([])).toBe(0);
    expect(latestOrder([undefined, { a: { order: 4, removed: true } }])).toBe(
      4,
    );
  });
});
