import { describe, expect, it } from 'vitest';

import { commandForListChange } from '../listCommands.ts';

const a = { id: 'a' };
const b = { id: 'b' };
const c = { id: 'c' };

/**
 * What a list's change is SAID to be, which is the whole of what a
 * collaborator's client and a rebase have to work with. A row operation can be
 * replayed onto a list that has since changed; a whole-list `set` cannot, so it
 * is the answer only when nothing else is true.
 */
describe('the command a list change is said as', () => {
  it('says an added row as the insert that added it, wherever it went', () => {
    expect(commandForListChange('prompts', [a, b], [a, b, c])).toEqual({
      op: 'insertItem',
      key: 'prompts',
      index: 2,
      item: c,
    });
    expect(commandForListChange('prompts', [a, b], [c, a, b])).toEqual({
      op: 'insertItem',
      key: 'prompts',
      index: 0,
      item: c,
    });
  });

  it('says a dropped row as the removal that dropped it', () => {
    expect(
      commandForListChange(['nodeConfig', 'form'], [a, b, c], [a, c]),
    ).toEqual({ op: 'removeItem', key: ['nodeConfig', 'form'], index: 1 });
  });

  it('says a reordered row as the move that reordered it', () => {
    expect(commandForListChange('prompts', [a, b, c], [c, a, b])).toEqual({
      op: 'moveItem',
      key: 'prompts',
      from: 2,
      to: 0,
    });
    expect(commandForListChange('prompts', [a, b, c], [b, c, a])).toEqual({
      op: 'moveItem',
      key: 'prompts',
      from: 0,
      to: 2,
    });
  });

  /**
   * The command vocabulary addresses a place in the document and cannot reach
   * inside a row, and nothing may claim structurally what it cannot perform: a
   * proposal is verified by carrying it out before it is emitted.
   */
  it('falls back to the whole list when no one row operation explains it', () => {
    // A row rewritten in place: the same length, and no move reproduces it.
    expect(
      commandForListChange('prompts', [a, b], [a, { id: 'b', text: 'new' }]),
    ).toEqual({
      op: 'set',
      key: 'prompts',
      value: [a, { id: 'b', text: 'new' }],
    });
    // Two rows added at once.
    expect(commandForListChange('prompts', [a], [a, b, c])).toEqual({
      op: 'set',
      key: 'prompts',
      value: [a, b, c],
    });
    // A row added and another dropped.
    expect(commandForListChange('prompts', [a, b], [a, c])).toEqual({
      op: 'set',
      key: 'prompts',
      value: [a, c],
    });
  });

  it('holds none of the caller’s own objects', () => {
    const rows = [a, b];
    const added = { id: 'c' };
    const insert = commandForListChange('prompts', rows, [...rows, added]);
    expect(insert).toMatchObject({ op: 'insertItem' });
    if (insert.op !== 'insertItem') throw new Error('not an insert');
    expect(insert.item).not.toBe(added);
    expect(insert.item).toEqual(added);
  });
});
