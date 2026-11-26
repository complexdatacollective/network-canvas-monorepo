import { describe, expect, it } from 'vitest';

import { unrecordedLinks } from '../pedigreeLinks';

const RELATIONSHIP = 'relationship';
const parentLink = { source: 'mum', target: 'ego' };

describe('unrecordedLinks', () => {
  it('drops a planned link the network records in the same order', () => {
    expect(
      unrecordedLinks(
        [parentLink],
        [{ type: RELATIONSHIP, from: 'mum', to: 'ego' }],
        RELATIONSHIP,
      ),
    ).toEqual([]);
  });

  it('keeps a planned parent link when the network records the reverse edge', () => {
    expect(
      unrecordedLinks(
        [parentLink],
        [{ type: RELATIONSHIP, from: 'ego', to: 'mum' }],
        RELATIONSHIP,
      ),
    ).toEqual([parentLink]);
  });

  it('keeps a planned link recorded only under another edge type', () => {
    expect(
      unrecordedLinks(
        [parentLink],
        [{ type: 'friendship', from: 'mum', to: 'ego' }],
        RELATIONSHIP,
      ),
    ).toEqual([parentLink]);
  });
});
