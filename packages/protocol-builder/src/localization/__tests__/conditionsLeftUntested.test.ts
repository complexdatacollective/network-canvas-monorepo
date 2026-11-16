import { describe, expect, it } from 'vitest';

import { conditionsLeftUntested } from '../conditionText.ts';

const yesNo = { yes: 'true', no: 'false' };

describe('conditionsLeftUntested', () => {
  it('drops a condition once the last binding that tested it is gone', () => {
    expect(
      conditionsLeftUntested(['big'], {
        name: { path: 'ego.name' },
        other: { path: '$condition.other', cases: yesNo },
      }),
    ).toEqual(['big']);
  });

  // Two bindings can test one condition. Removing the text of one of them
  // must leave the condition for the other, which would otherwise point at
  // nothing.
  it('keeps a condition another surviving binding still tests', () => {
    expect(
      conditionsLeftUntested(['big', 'tall'], {
        small: { path: '$condition.big', cases: yesNo },
      }),
    ).toEqual(['tall']);
  });
});
