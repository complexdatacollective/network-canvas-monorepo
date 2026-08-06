import { useRouter } from '@tanstack/react-router';
import { type ReactNode } from 'react';

import { InterviewActionsProvider } from '~/components/interviews/InterviewActions';
import {
  commitInterviewExport,
  deleteInterviews,
  getIncompleteInterviewUrlData,
  getInterviewDeletionInfo,
  resolveInterviewIds,
} from '~/src/server/interviewActions';

/**
 * Supplies the same client tree with TanStack Start server functions.
 *
 * `refresh` is `router.invalidate()`. This is the whole of
 * read-your-own-writes under cache option (i): there is no server cache to be
 * stale, so re-running the loader is sufficient and always correct. What was
 * bought by `safeUpdateTag` in 57 places is bought here by re-querying.
 */
export function StartInterviewActions({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <InterviewActionsProvider
      actions={{
        deleteInterviews: (data) => deleteInterviews({ data }),
        getInterviewDeletionInfo: (ids) =>
          getInterviewDeletionInfo({ data: ids }),
        resolveInterviewIds: (searchParams, extra) =>
          resolveInterviewIds({ data: { searchParams, extra } }),
        getIncompleteInterviewUrlData: (protocolId) =>
          getIncompleteInterviewUrlData({ data: protocolId }),
        commitInterviewExport: (interviewIds) =>
          commitInterviewExport({ data: interviewIds }),
        refresh: () => router.invalidate(),
      }}
    >
      {children}
    </InterviewActionsProvider>
  );
}
