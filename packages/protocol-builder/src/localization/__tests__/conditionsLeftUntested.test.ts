import { describe, expect, it } from 'vitest';

import {
  conditionsLeftUntested,
  newConditionId,
  retireConditionId,
} from '../conditionText.ts';

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

describe('newConditionId', () => {
  it('takes the first id nothing holds', () => {
    expect(newConditionId((id) => id === 'if1')).toBe('if2');
  });

  // Every field of a stage shares its ids. An "If" removed from one field
  // can come back by undo under the id it had, so no other field may be
  // given that id in the meantime.
  it('does not give out an id whose "If" was removed and may be undone', () => {
    retireConditionId('if3');
    expect(newConditionId((id) => id === 'if1' || id === 'if2')).toBe('if4');
  });
});
