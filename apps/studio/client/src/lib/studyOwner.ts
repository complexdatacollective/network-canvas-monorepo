import { useQueries, useQuery } from '@tanstack/react-query';

import { orpc, type rpcClient } from './api.ts';
import { authClient } from './auth.ts';

type Study = Awaited<ReturnType<typeof rpcClient.protocols.list>>[number];

export type StudyOwner =
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'notFound' }
  | { status: 'found'; teamId: string; study: Study };

/**
 * Which team owns `studyId`, resolved from the study id itself rather than
 * from whichever team the researcher was last acting in.
 *
 * **`$studyId` is authoritative** (§2.2, §5.6): a study URL is a canonical
 * link, and it has to open the study whoever follows it and however they got
 * there. Reading the ACTIVE team instead makes that false in two ways, both
 * reachable from an ordinary bookmark. A direct visit to team B's study while
 * the setting still names team A asks A's list, does not find it and reports
 * the study unavailable; and a session that names no team at all — which is
 * every first sign-in, since nothing sets `activeOrganizationId` when a
 * session is created — has nothing to ask, so the screen never resolves at
 * all. §6.6's reconciler cannot help: a study route names no team, so it
 * leaves the setting wherever the last team route left it.
 *
 * **One question, asked of the teams the researcher has.** `study.shell` (§6.3)
 * is the procedure that answers "which team owns this study?" in one request,
 * and it is the one server surface this slice may not add. What the client can
 * do without it is ask each team it belongs to for its own studies, which is a
 * procedure that already exists and is already authorized per team. The cost
 * is kept to the ordinary case's one request: the active team is asked first
 * and alone, because arriving from a team's studies list has already cached
 * exactly that answer, and the rest are asked only when it does not have the
 * study. When `study.shell` lands this whole hook becomes one query, and
 * nothing above it changes.
 *
 * A team list that could not be read, or a studies list that could not be
 * read, is `unavailable` and never `notFound`: "no team of yours has this
 * study" is a claim about the researcher's access, and an outage is no basis
 * for making it.
 *
 * **`undefined` asks nothing.** The header calls this on every app route, most
 * of which name no study, and a lookup that ran anyway would ask the active
 * team for its whole studies list and then fan out across every other team —
 * on `/account`, on the gallery, on the templates — to answer a question
 * nobody asked. The answer for a study that is not there is `pending`, which
 * is what an unasked question resolves to; the caller that passes `undefined`
 * renders no study segment at all, so it never reads it.
 */
export function useStudyOwner(studyId: string | undefined): StudyOwner {
  const asked = studyId !== undefined;
  const teams = authClient.useListOrganizations();
  const activeTeamId = authClient.useActiveOrganization().data?.id;

  const activeList = useQuery({
    ...orpc.protocols.list.queryOptions({
      input: { teamId: activeTeamId ?? '' },
    }),
    enabled: asked && activeTeamId !== undefined,
  });
  const activeStudy = asked
    ? activeList.data?.find((candidate) => candidate.id === studyId)
    : undefined;
  // A disabled query is `pending` for ever, so "has the active team answered?"
  // cannot be read off the status alone — with no active team there was
  // nothing to ask and the answer is immediate.
  const activeAnswered =
    activeTeamId === undefined || activeList.status !== 'pending';

  const otherTeamIds =
    !asked || activeStudy !== undefined || !activeAnswered
      ? []
      : (teams.data ?? [])
          .map((team) => team.id)
          .filter((id) => id !== activeTeamId);
  const otherLists = useQueries({
    queries: otherTeamIds.map((teamId) =>
      orpc.protocols.list.queryOptions({ input: { teamId } }),
    ),
  });

  if (!asked) return { status: 'pending' };
  if (activeStudy !== undefined && activeTeamId !== undefined) {
    return { status: 'found', teamId: activeTeamId, study: activeStudy };
  }
  if (!activeAnswered || teams.isPending) return { status: 'pending' };

  const ownerIndex = otherLists.findIndex((list) =>
    list.data?.some((candidate) => candidate.id === studyId),
  );
  const owner = otherTeamIds[ownerIndex];
  const study = otherLists[ownerIndex]?.data?.find(
    (candidate) => candidate.id === studyId,
  );
  if (owner !== undefined && study !== undefined) {
    return { status: 'found', teamId: owner, study };
  }

  if (otherLists.some((list) => list.isPending)) return { status: 'pending' };
  if (
    activeList.isError ||
    otherLists.some((list) => list.isError) ||
    // Better Auth reports a refused list by storing an error and leaving
    // `data` null, so an unreadable team list is an empty one here — and
    // concluding "not found" from a list of teams nobody could read is the
    // same lie in a different place.
    (teams.error !== null && teams.data === null)
  ) {
    return { status: 'unavailable' };
  }
  return { status: 'notFound' };
}
