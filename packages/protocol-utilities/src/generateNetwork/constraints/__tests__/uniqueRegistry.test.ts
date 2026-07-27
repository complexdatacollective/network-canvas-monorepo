import { describe, expect, it } from 'vitest';

import { UniqueRegistry, valueKey } from '../uniqueRegistry';

describe('valueKey', () => {
  it('keys two orderings of one categorical selection the same', () => {
    expect(valueKey(['b', 'a'])).toBe(valueKey(['a', 'b']));
  });

  it('keys two orderings the same even when a collation ignores the difference', () => {
    // A soft hyphen is ignorable under `localeCompare`, which reports 0 for
    // these two strings; a stable sort then leaves each array in the order it
    // arrived in, and the multiset comparison the runtime makes is lost.
    const selection = ['a', 'a' + String.fromCodePoint(0xad)];

    expect(valueKey(selection.toReversed())).toBe(valueKey(selection));
  });

  it('keys different selections differently', () => {
    expect(valueKey(['a', 'b'])).not.toBe(valueKey(['a', 'c']));
  });
});

describe('UniqueRegistry', () => {
  it('gives a released value back to its slot', () => {
    const registry = new UniqueRegistry();
    registry.claim('node:person', 'band', 2);
    expect(registry.isTaken('node:person', 'band', 2)).toBe(true);

    registry.release('node:person', 'band', 2);

    expect(registry.isTaken('node:person', 'band', 2)).toBe(false);
  });

  it('releases by the same key it claimed, whatever the ordering', () => {
    const registry = new UniqueRegistry();
    registry.claim('node:person', 'tags', ['a', 'b']);

    registry.release('node:person', 'tags', ['b', 'a']);

    expect(registry.isTaken('node:person', 'tags', ['a', 'b'])).toBe(false);
  });

  it('leaves an equal value held in another slot alone', () => {
    const registry = new UniqueRegistry();
    registry.claim('node:person', 'band', 2);
    registry.claim('node:place', 'band', 2);
    registry.claim('node:person', 'rank', 2);

    registry.release('node:person', 'band', 2);

    expect(registry.isTaken('node:place', 'band', 2)).toBe(true);
    expect(registry.isTaken('node:person', 'rank', 2)).toBe(true);
  });

  it('ignores a release of a value the slot never issued', () => {
    const registry = new UniqueRegistry();
    registry.claim('node:person', 'band', 2);

    registry.release('node:person', 'band', 3);
    registry.release('node:person', 'unclaimed', 2);

    expect(registry.isTaken('node:person', 'band', 2)).toBe(true);
  });
});
