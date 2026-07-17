import { describe, expect, it } from 'vitest';

import { INHERITANCE_PATTERNS } from '../narrative-pedigree.ts';

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
});
