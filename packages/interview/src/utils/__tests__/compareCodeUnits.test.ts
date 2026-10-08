import { expect, it } from 'vitest';

import { compareAsText, compareCodeUnits } from '../compareCodeUnits';

it('orders by code unit, the same in every language', () => {
  // A Swedish collator would put ö after z; the code-unit order does not
  // depend on any locale.
  expect(['z', 'ö', 'a'].toSorted(compareCodeUnits)).toEqual(['a', 'z', 'ö']);
  expect(['b', 'a', 'b'].toSorted(compareCodeUnits)).toEqual(['a', 'b', 'b']);
});

it('orders values by their text', () => {
  expect([10, 9, 'a'].toSorted(compareAsText)).toEqual([10, 9, 'a']);
});
