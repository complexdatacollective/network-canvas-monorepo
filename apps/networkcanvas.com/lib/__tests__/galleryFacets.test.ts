import { describe, expect, it } from 'vitest';

import {
  applyFacets,
  countFacetValues,
  emptyFacetSelection,
  toggleFacetValue,
} from '~/lib/galleryFacets';
import type { GalleryProtocol } from '~/lib/protocolGallery';

function protocol(
  slug: string,
  fields: string[],
  edgeGeneration: string[],
): GalleryProtocol {
  return { slug, fields, edgeGeneration } as unknown as GalleryProtocol;
}

const protocols = [
  protocol('a', ['Public health', 'Medicine'], ['sociogram']),
  protocol('b', ['Public health'], ['sociogram', 'dyad census']),
  protocol('c', ['Aging', 'Aging'], ['no edges captured']),
];

describe('countFacetValues', () => {
  it('counts each protocol once per value, most common first', () => {
    expect(countFacetValues(protocols, ({ fields }) => fields)).toEqual([
      { value: 'Public health', count: 2 },
      { value: 'Aging', count: 1 },
      { value: 'Medicine', count: 1 },
    ]);
  });
});

describe('applyFacets', () => {
  it('passes everything through when nothing is selected', () => {
    expect(applyFacets(protocols, emptyFacetSelection)).toEqual(protocols);
  });

  it('matches any selected value within a facet', () => {
    expect(
      applyFacets(protocols, {
        fields: ['Medicine', 'Aging'],
        edgeGeneration: [],
      }).map(({ slug }) => slug),
    ).toEqual(['a', 'c']);
  });

  it('requires every facet with a selection to match', () => {
    expect(
      applyFacets(protocols, {
        fields: ['Public health'],
        edgeGeneration: ['dyad census'],
      }).map(({ slug }) => slug),
    ).toEqual(['b']);
  });
});

describe('toggleFacetValue', () => {
  it('adds a missing value and removes a present one', () => {
    expect(toggleFacetValue([], 'x')).toEqual(['x']);
    expect(toggleFacetValue(['x', 'y'], 'x')).toEqual(['y']);
  });
});
