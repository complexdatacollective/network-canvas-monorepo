import { describe, expect, it } from 'vitest';

import {
  missingDecisionKey,
  missingGroupKey,
} from '../materialise/materialiseSession';
import { missingGroupKey as plannedGroupKey } from '../plan/networkPlan';

/**
 * Unplanned missingness is decided once per (entity, equality group) and
 * remembered under a composite key. Both halves are built from arbitrary
 * strings — a variable id is whatever the codebook calls it, and a roster row
 * keeps whatever `_uid` the caller's external data carried — so a key joined
 * on a separator can be reached by two different inputs, and the second then
 * inherits the first's decision: one entity's unanswered question answered for
 * another's.
 */
describe('the keys an unplanned missingness decision is remembered under', () => {
  const NUL = '\u0000';

  it('tells apart groups a NUL join could not', () => {
    expect(missingGroupKey(['a', `b${NUL}c`])).not.toBe(
      missingGroupKey([`a${NUL}b`, 'c']),
    );
  });

  it('is stable however the members are ordered', () => {
    expect(missingGroupKey(['b', 'a'])).toBe(missingGroupKey(['a', 'b']));
  });

  it('tells apart entity and group combinations a NUL join could not', () => {
    const left = missingDecisionKey('a', missingGroupKey([`b${NUL}c`]));
    const right = missingDecisionKey(`a${NUL}b`, missingGroupKey(['c']));
    expect(left).not.toBe(right);
  });

  it('is the same key the plan decides its own missingness under', () => {
    // The plan settles missingness for the values it draws and the walk for
    // the ones it does not; keying one group two ways would let the two make
    // different decisions about it under one seed.
    expect(plannedGroupKey(['a', `b${NUL}c`])).toBe(
      missingGroupKey(['a', `b${NUL}c`]),
    );
    expect(plannedGroupKey(['a', `b${NUL}c`])).not.toBe(
      plannedGroupKey([`a${NUL}b`, 'c']),
    );
  });

  it('still separates two ordinary entities', () => {
    const group = missingGroupKey(['age']);
    expect(missingDecisionKey('node-1', group)).not.toBe(
      missingDecisionKey('node-2', group),
    );
  });
});
