import { describe, expect, it } from 'vitest';

import {
  parseSortId,
  sortGalleryProtocols,
  sortIds,
  sortRules,
} from '~/lib/gallerySort';
import type { GalleryProtocol } from '~/lib/protocolGallery';

function protocol(
  shortName: string,
  dateAdded: string,
  featured = false,
): GalleryProtocol {
  return { shortName, dateAdded, featured } as unknown as GalleryProtocol;
}

const protocols = [
  protocol('Beta', '2025-10-22'),
  protocol('Alpha', '2026-06-12'),
  protocol('Gamma', '2025-01-01', true),
];

describe('gallerySort', () => {
  it('keeps the featured protocol first, then applies the active rule', () => {
    expect(
      sortGalleryProtocols(protocols, 'newest').map((p) => p.shortName),
    ).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(
      sortGalleryProtocols(protocols, 'oldest').map((p) => p.shortName),
    ).toEqual(['Gamma', 'Beta', 'Alpha']);
    expect(
      sortGalleryProtocols(protocols, 'titleAsc').map((p) => p.shortName),
    ).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(
      sortGalleryProtocols(protocols, 'titleDesc').map((p) => p.shortName),
    ).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

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
