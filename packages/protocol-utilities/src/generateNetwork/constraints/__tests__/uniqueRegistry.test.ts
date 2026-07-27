import { describe, expect, it } from 'vitest';

import { valueKey } from '../uniqueRegistry';

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
