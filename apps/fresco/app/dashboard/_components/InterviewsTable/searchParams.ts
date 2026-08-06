import { createSearchParamsCache } from 'nuqs/server';

import {
  searchParamsParsers,
  searchParamsUrlKeys,
} from '~/lib/searchParams/interviews';

/**
 * The RSC-bound half of the interviews-table URL contract. The parsers, URL
 * keys and types live in `lib/searchParams/interviews.ts` so a non-RSC host can
 * read the same params with `createLoader`.
 */

export {
  INTERVIEWS_PREFIX,
  searchParamsUrlKeys,
  sortableFields,
  sortOrder,
  type InterviewsSearchParams,
  type NetworkCondition,
} from '~/lib/searchParams/interviews';

export const searchParamsCache = createSearchParamsCache(searchParamsParsers, {
  urlKeys: searchParamsUrlKeys,
});
