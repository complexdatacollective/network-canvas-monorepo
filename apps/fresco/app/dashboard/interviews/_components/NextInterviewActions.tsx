'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode } from 'react';

import {
  commitInterviewExport,
  deleteInterviews,
  getIncompleteInterviewUrlData,
  getInterviewDeletionInfo,
  resolveInterviewIds,
} from '~/actions/interviews';
import { InterviewActionsProvider } from '~/components/interviews/InterviewActions';

/**
 * Supplies the interviews client tree with the Next.js Server Actions.
 *
 * `refresh` is a no-op beyond `router.refresh()`: each action already calls
 * `safeUpdateTag`, which gives read-your-own-writes on the server cache.
 */
export function NextInterviewActions({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <InterviewActionsProvider
      actions={{
        deleteInterviews,
        getInterviewDeletionInfo,
        resolveInterviewIds,
        getIncompleteInterviewUrlData,
        commitInterviewExport,
        refresh: () => router.refresh(),
      }}
    >
      {children}
    </InterviewActionsProvider>
  );
}
