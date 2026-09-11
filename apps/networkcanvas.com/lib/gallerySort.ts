import type { GalleryProtocol } from '~/lib/protocolGallery';

export type SortId = 'newest' | 'oldest' | 'titleAsc' | 'titleDesc';

export type SortRule = {
  property: 'dateAdded' | 'shortName';
  direction: 'asc' | 'desc';
  type: 'string';
};

export const sortIds: SortId[] = ['newest', 'oldest', 'titleAsc', 'titleDesc'];

export const sortRules: Record<SortId, SortRule> = {
  newest: { property: 'dateAdded', direction: 'desc', type: 'string' },
  oldest: { property: 'dateAdded', direction: 'asc', type: 'string' },
  titleAsc: { property: 'shortName', direction: 'asc', type: 'string' },
  titleDesc: { property: 'shortName', direction: 'desc', type: 'string' },
};

export function parseSortId(value: unknown): SortId {
  switch (value) {
    case 'newest':
    case 'oldest':
    case 'titleAsc':
    case 'titleDesc':
      return value;
    default:
      return 'newest';
  }
}

/**
 * The same order `Collection` produces from `sortRules` — featured first,
 * then the active rule — so the server-rendered grid already matches what
 * the collection settles on after hydration.
 */
export function sortGalleryProtocols(
  protocols: GalleryProtocol[],
  sort: SortId,
): GalleryProtocol[] {
  const { property, direction } = sortRules[sort];
  const sign = direction === 'asc' ? 1 : -1;

  return protocols.toSorted(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      sign * a[property].localeCompare(b[property], 'en'),
  );
}
