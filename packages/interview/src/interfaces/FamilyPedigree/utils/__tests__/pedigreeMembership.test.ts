import { describe, expect, it } from 'vitest';

import { pedigreeMemberIds } from '../pedigreeMembership';

describe('pedigreeMemberIds', () => {
  it('returns null when metadata is undefined', () => {
    expect(pedigreeMemberIds(undefined)).toBeNull();
  });

  it('returns null for census (array) metadata', () => {
    expect(pedigreeMemberIds([[0, 'a', 'b', true]])).toBeNull();
  });

  it('returns null when the pedigree has no committed node list', () => {
    expect(pedigreeMemberIds({ isNetworkCommitted: true })).toBeNull();
  });

  it('returns the set of committed node ids', () => {
    const members = pedigreeMemberIds({
      isNetworkCommitted: true,
      nodes: [
        { id: 'ego', label: 'You', isEgo: true },
        { id: 'mother', label: 'Rose', isEgo: false },
      ],
    });
    expect(members).not.toBeNull();
    expect(members?.has('ego')).toBe(true);
    expect(members?.has('mother')).toBe(true);
    expect(members?.has('non-kin')).toBe(false);
    expect(members?.size).toBe(2);
  });
});
