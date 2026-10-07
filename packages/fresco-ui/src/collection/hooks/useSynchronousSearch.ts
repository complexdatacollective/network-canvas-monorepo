'use client';

import Fuse from 'fuse.js';
import { useCallback, useMemo } from 'react';

import type { FilterProperty, FuseOptions } from '../filtering/types';
import type { Key, KeyExtractor } from '../types';

type UseSynchronousSearchOptions<T> = {
  items: T[];
  keyExtractor: KeyExtractor<T>;
  filterKeys: FilterProperty[];
  fuseOptions?: FuseOptions;
};

export function useSynchronousSearch<T extends Record<string, unknown>>({
  items,
  keyExtractor,
  filterKeys,
  fuseOptions,
}: UseSynchronousSearchOptions<T>) {
  const searchableItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        _key: keyExtractor(item),
      })),
    [items, keyExtractor],
  );
  const fuse = useMemo(
    () =>
      new Fuse(searchableItems, {
        // Path arrays stay arrays: joining them with '.' would split a segment
        // that itself contains a dot (a variable named `a.b`) into two.
        keys: filterKeys,
        includeScore: true,
        threshold: 0.35,
        distance: 100,
        ignoreLocation: true,
        minMatchCharLength: 2,
        findAllMatches: true,
        ...fuseOptions,
      }),
    [filterKeys, fuseOptions, searchableItems],
  );

  const search = useCallback(
    async (query: string, minQueryLength = 1) => {
      if (query.length < minQueryLength) {
        return {
          matchingKeys: new Set<Key>(searchableItems.map((item) => item._key)),
          matchCount: searchableItems.length,
          scores: new Map<Key, number>(),
        };
      }

      const results = fuse.search(query);
      return {
        matchingKeys: new Set<Key>(results.map((result) => result.item._key)),
        matchCount: results.length,
        scores: new Map<Key, number>(
          results.flatMap((result) =>
            result.score === undefined
              ? []
              : [[result.item._key, result.score] as const],
          ),
        ),
      };
    },
    [fuse, searchableItems],
  );

  return { search, isReady: true, isIndexing: false };
}
