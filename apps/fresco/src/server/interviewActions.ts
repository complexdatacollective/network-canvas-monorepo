import { createServerFn } from '@tanstack/react-start';

import { prisma } from '~/lib/db';
import { getInterviewIdsMatching } from '~/lib/queries/interviews';
import { type InterviewsSearchParams } from '~/lib/searchParams/interviews';
import type { DeleteInterviews } from '~/schemas/interviews';
import { addEvent } from '~/src/server/activityFeed';
import { authed } from '~/src/server/middleware';

/**
 * The interviews half of `actions/interviews.ts` as server functions.
 *
 * Two things change, and only two:
 *
 * 1. `requireApiAuth()` at the top of every handler becomes one
 *    `.middleware([authed])`, which also types the session into the handler
 *    context.
 * 2. The `safeUpdateTag(...)` calls are gone. Under cache option (i) there is
 *    no server cache to invalidate, so the caller re-runs its loader with
 *    `router.invalidate()` instead — see `StartInterviewActions`.
 *
 * The bodies are otherwise the Next.js versions verbatim, including the
 * `{ error, data }` return shape.
 */

export const deleteInterviews = createServerFn({ method: 'POST' })
  .middleware([authed])
  .validator((data: DeleteInterviews) => data)
  .handler(async ({ data, context }) => {
    const idsToDelete = data.map((p) => p.id);

    try {
      const deletedInterviews = await prisma.interview.deleteMany({
        where: { id: { in: idsToDelete } },
      });

      void addEvent(
        'Interview(s) Deleted',
        `User ${context.session.user.username} deleted ${deletedInterviews.count} interview(s)`,
      );

      return { error: null, count: deletedInterviews.count };
    } catch {
      return { error: 'Failed to delete interviews', count: 0 };
    }
  });

export const commitInterviewExport = createServerFn({ method: 'POST' })
  .middleware([authed])
  .validator((interviewIds: string[]) => interviewIds)
  .handler(async ({ data, context }) => {
    const ids = [...new Set(data)];
    if (ids.length === 0) {
      return { error: null, data: { count: 0 } };
    }

    try {
      const result = await prisma.interview.updateMany({
        where: { id: { in: ids } },
        data: { exportTime: new Date() },
      });
      await addEvent(
        'Data Exported',
        `User ${context.session.user.username} exported data for ${String(result.count)} interview(s)`,
        { interviewCount: result.count },
      );
      return { error: null, data: { count: result.count } };
    } catch {
      return { error: 'Failed to commit export', data: null };
    }
  });

export const resolveInterviewIds = createServerFn({ method: 'POST' })
  .middleware([authed])
  .validator(
    (input: {
      searchParams: InterviewsSearchParams;
      extra?: { onlyUnexported?: boolean; onlyCompleted?: boolean };
    }) => input,
  )
  .handler(async ({ data }) => {
    try {
      const ids = await getInterviewIdsMatching(data.searchParams, data.extra);
      return { error: null, ids };
    } catch {
      return { error: 'Failed to resolve interviews', ids: [] };
    }
  });

export const getInterviewDeletionInfo = createServerFn({ method: 'POST' })
  .middleware([authed])
  .validator((ids: string[]) => ids)
  .handler(async ({ data }) => {
    try {
      const uniqueIds = [...new Set(data)];
      const interviews = await prisma.interview.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true, exportTime: true },
      });
      return { error: null, data: interviews };
    } catch {
      return { error: 'Failed to resolve interviews', data: [] };
    }
  });

export const getIncompleteInterviewUrlData = createServerFn({ method: 'POST' })
  .middleware([authed])
  .validator((protocolId: string) => protocolId)
  .handler(async ({ data }) => {
    try {
      const interviews = await prisma.interview.findMany({
        where: { protocolId: data, finishTime: null },
        select: { id: true, participant: { select: { identifier: true } } },
      });
      return {
        error: null,
        data: interviews.map((interview) => ({
          id: interview.id,
          identifier: interview.participant.identifier,
        })),
      };
    } catch {
      return { error: 'Failed to load incomplete interviews', data: [] };
    }
  });
