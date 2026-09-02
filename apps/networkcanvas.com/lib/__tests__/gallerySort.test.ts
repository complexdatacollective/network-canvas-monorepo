import { describe, expect, it } from 'vitest';

import { parseSortId, sortIds, sortRules } from '~/lib/gallerySort';

describe('gallerySort', () => {
  it('orders recency by the parsed date, not by dataset position', () => {
    expect(sortRules.newest).toEqual({
      property: 'dateAdded',
      direction: 'desc',
      type: 'string',
    });
    expect(sortRules.oldest.property).toBe('dateAdded');
    expect(sortRules.titleAsc.property).toBe('shortName');
    expect(sortRules.titleDesc.direction).toBe('desc');
  });

  it('exposes a rule for every sort option', () => {
    for (const id of sortIds) {
      expect(sortRules[id]).toBeDefined();
      expect(parseSortId(id)).toBe(id);
    }
    expect(parseSortId('unknown')).toBe('newest');
  });
});
