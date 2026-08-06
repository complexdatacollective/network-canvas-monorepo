import { createServerFn } from '@tanstack/react-start';

import {
  getInterviewFilterOptions,
  getInterviews,
} from '~/lib/queries/interviews';
import { getProtocols } from '~/lib/queries/protocols';
import { type InterviewsSearchParams } from '~/lib/searchParams/interviews';
import { authed } from '~/src/server/middleware';

/**
 * The interviews-table read, as one server function.
 *
 * In `app/dashboard/interviews/page.tsx` this is three async server components
 * starting three promises behind a `<Suspense>`. Router loaders are isomorphic,
 * so Prisma cannot be called from one: the reads move into a server function
 * and the loader calls it.
 *
 * All three reads were `'use cache'` with `cacheLife('max')`. Under cache
 * replacement option (i) they are plain queries — which is also why
 * read-your-own-writes now costs nothing to guarantee: there is no stale entry
 * for a mutation to beat, only `router.invalidate()`.
 */
export const fetchInterviewsPage = createServerFn({ method: 'GET' })
  .middleware([authed])
  .validator((searchParams: InterviewsSearchParams) => searchParams)
  .handler(async ({ data }) => {
    const [interviews, filterOptions, protocols] = await Promise.all([
      getInterviews(data),
      getInterviewFilterOptions(),
      getProtocols(),
    ]);

    return { interviews, filterOptions, protocols };
  });
