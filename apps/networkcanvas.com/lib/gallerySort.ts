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
