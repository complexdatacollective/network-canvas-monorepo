import 'server-only';
import { cacheLife } from 'next/cache';

import type { InterviewsSearchParams } from '~/app/dashboard/_components/InterviewsTable/searchParams';
import { safeCacheTag } from '~/lib/cache';
import {
  getInterviewFilterOptions as getInterviewFilterOptionsUncached,
  getInterviews as getInterviewsUncached,
} from '~/lib/queries/interviews';

/**
 * The `'use cache'` layer over `lib/queries/interviews.ts`. The reads
 * themselves — including all the raw SQL — live there, so they can be shared
 * with a host that has no server cache.
 */

export {
  getInterviewById,
  getInterviewIdsMatching,
  getInterviewsForExport,
  type GetInterviewByIdQuery,
  type GetInterviewsQuery,
  type InterviewFilterOptions,
} from '~/lib/queries/interviews';

export async function getInterviews(searchParams: InterviewsSearchParams) {
  'use cache';
  cacheLife('max');
  safeCacheTag('getInterviews');

  return getInterviewsUncached(searchParams);
}

export type GetInterviewsReturnType = ReturnType<typeof getInterviews>;

export async function getInterviewFilterOptions() {
  'use cache';
  cacheLife('max');
  // Options derive from protocols (names + codebook node/edge types), so they
  // must refresh when protocols change — not when interviews are exported.
  safeCacheTag('getProtocols');

  return getInterviewFilterOptionsUncached();
}
