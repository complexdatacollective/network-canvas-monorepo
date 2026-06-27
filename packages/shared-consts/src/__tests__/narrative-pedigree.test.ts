import { describe, expect, it } from 'vitest';

import { INHERITANCE_PATTERNS, FOCAL_POSITIONS } from '../narrative-pedigree';

describe('narrative-pedigree', () => {
  it('has the canonical inheritance patterns', () => {
    expect(INHERITANCE_PATTERNS).toEqual([
      'autosomalDominant',
      'autosomalRecessive',
      'xLinkedDominant',
      'xLinkedRecessive',
      'yLinked',
      'mitochondrial',
      'multifactorial',
      'unknown',
    ]);
  });

  it('has the canonical focal positions', () => {
    expect(FOCAL_POSITIONS).toEqual([
      'ego',
      'egoChildren',
      'egoParents',
      'egoSiblings',
      'everyone',
    ]);
  });
});
