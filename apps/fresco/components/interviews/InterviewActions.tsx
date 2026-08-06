'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { InterviewsSearchParams } from '~/lib/searchParams/interviews';
import type { DeleteInterviews } from '~/schemas/interviews';

/**
 * The interviews client tree's server calls, supplied by whichever host is
 * rendering it.
 *
 * Under Next.js a `'use server'` import from a client component is a reference
 * to an RPC endpoint, and the module's body never enters the client bundle.
 * Under Vite it is an ordinary import, so a client component that imports
 * `~/actions/interviews` drags Prisma, PostHog and the whole server tree into
 * the browser build — TanStack Start's Import Protection stops the build when
 * this happens, which is how it was found.
 *
 * One context, provided once per host, therefore replaces what would otherwise
 * be a rewrite of every client component that calls an action.
 */
export type InterviewActions = {
  deleteInterviews: (
    data: DeleteInterviews,
  ) => Promise<{ error: string | null }>;
  getInterviewDeletionInfo: (ids: string[]) => Promise<{
    error: string | null;
    data: { id: string; exportTime: Date | null }[];
  }>;
  resolveInterviewIds: (
    searchParams: InterviewsSearchParams,
    extra?: { onlyUnexported?: boolean; onlyCompleted?: boolean },
  ) => Promise<{ error: string | null; ids: string[] }>;
  getIncompleteInterviewUrlData: (protocolId: string) => Promise<{
    error: string | null;
    data: { id: string; identifier: string }[];
  }>;
  commitInterviewExport: (interviewIds: string[]) => Promise<{
    error: string | null;
    data: { count: number } | null;
  }>;
  /**
   * Refresh the data the current route rendered from.
   *
   * Next.js gets this for free: `safeUpdateTag` inside the action invalidates
   * the cache tag and the router refreshes, which is what "read-your-own-writes"
   * means there. With no server cache there is no tag to update, so the host
   * re-runs its own loaders instead.
   */
  refresh: () => void | Promise<void>;
};

const InterviewActionsContext = createContext<InterviewActions | null>(null);

export function useInterviewActions(): InterviewActions {
  const ctx = useContext(InterviewActionsContext);
  if (!ctx) {
    throw new Error(
      'useInterviewActions must be used within an <InterviewActionsProvider>',
    );
  }
  return ctx;
}

export function InterviewActionsProvider({
  actions,
  children,
}: {
  actions: InterviewActions;
  children: ReactNode;
}) {
  return (
    <InterviewActionsContext value={actions}>
      {children}
    </InterviewActionsContext>
  );
}
