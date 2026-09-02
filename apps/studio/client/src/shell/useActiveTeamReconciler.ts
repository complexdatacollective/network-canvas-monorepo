import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { authClient } from '../lib/auth.ts';
import { invalidateMemberships } from '../lib/landing.ts';

/**
 * The one place in Studio that writes Better Auth's active organization
 * (§6.6).
 *
 * The URL is authoritative and the active-team setting follows it (§2.2): a
 * team-scoped route names its team, and this makes the setting agree, so the
 * screens that can only read the ACTIVE team — membership, invitations, the
 * researcher's role — describe the team whose URL is on screen rather than
 * whichever one was last chosen.
 *
 * **Keyed on the COMMITTED team id.** `useParams` reads the router's matches,
 * which are the committed ones — never the pending location, which a blocker
 * may still cancel. That is what makes this idempotent and unreachable from a
 * route that never mounted: a blocked or superseded navigation has no
 * committed match, so it writes nothing.
 *
 * **Not a loader and not a `beforeLoad`.** Preload runs both on hover and on
 * keyboard focus after 50ms, and `defaultPreloadStaleTime: 0` re-runs it per
 * hover, so a loader-based `setActive` would fire for every team link a
 * researcher arrow-keys past. Guarding on the `preload` flag is not a fix:
 * loaders also run for navigations a sibling redirect then cancels.
 *
 * A study route names no team — a study's team is derivable only from the
 * study itself (§6.3), which needs `study.shell` — so inside a study this
 * leaves the setting as the last team route left it. That is why the editor
 * reaches its team through the same setting rather than through the URL.
 */

/**
 * A write the reconciler could not make, and the researcher's way out of it.
 * The shell renders this; nothing else can, because a failed write is a fact
 * about the whole app rather than about the screen that happens to be open.
 */
export type ActiveTeamFailure = {
  /** Try the same write again. */
  retry: () => void;
};

export function useActiveTeamReconciler(): ActiveTeamFailure | undefined {
  // `strict: false` because most app routes have no `teamId` at all, and the
  // absence is the answer for them rather than a type error.
  const { teamId: committedTeamId } = useParams({ strict: false });
  const queryClient = useQueryClient();
  const activeTeam = authClient.useActiveOrganization();
  const activeMember = authClient.useActiveMember();
  const activeTeamId = activeTeam.data?.id;
  const refetchActiveTeam = activeTeam.refetch;
  const refetchActiveMember = activeMember.refetch;
  // One write in flight at a time. The effect's own dependencies do not change
  // while `setActive` is on the wire, but a re-render caused by anything else
  // must not start a second one.
  const writing = useRef<string | undefined>(undefined);
  // The team a write failed for, so a failure is retried on request rather
  // than on the next render: nothing about the effect's dependencies changes
  // when a write fails, so an unrecorded failure would be re-attempted by
  // whatever re-renders the shell next, silently and for ever.
  const [failedTeamId, setFailedTeamId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (committedTeamId === undefined) return;
    if (committedTeamId === activeTeamId) return;
    if (writing.current === committedTeamId) return;
    if (failedTeamId === committedTeamId) return;

    writing.current = committedTeamId;
    void (async () => {
      let failed = true;
      try {
        const result = await authClient.organization.setActive(
          { organizationId: committedTeamId },
          // Better Auth otherwise schedules a delayed refresh of its own —
          // a 10ms timeout toggling the matched nanostores. The two refetches
          // below replace the two this component reads, so suppressing it
          // keeps exactly one authoritative refresh path.
          { disableSignal: true },
        );
        // better-fetch resolves a refused write with an `error` field instead
        // of rejecting — the same reading the sign-out sequence makes of its
        // own result. A URL naming a team the researcher has since left comes
        // back this way, and an unchecked result would report a switch that
        // never happened: the refetches below then succeed for the OLD team,
        // leaving the team screens with neither a matching membership nor an
        // error to show, waiting on a write that is never coming.
        failed = Boolean(result.error);
      } catch {
        // A failed write leaves the setting where it was. The screens that
        // depend on it show another team's data over this team's URL only if
        // this pretends it succeeded, so it does not.
      } finally {
        await Promise.allSettled([refetchActiveTeam(), refetchActiveMember()]);
        writing.current = undefined;
        setFailedTeamId(failed ? committedTeamId : undefined);
        // The landing resolution caches which team was active for 30 seconds
        // (§6.4). This write is what makes that answer stale, so `/` cannot
        // send the researcher back to the team they just left.
        if (!failed) await invalidateMemberships(queryClient);
      }
    })();
  }, [
    activeTeamId,
    committedTeamId,
    failedTeamId,
    queryClient,
    refetchActiveMember,
    refetchActiveTeam,
  ]);

  const retry = useCallback(() => {
    setFailedTeamId(undefined);
  }, []);

  // Scoped to the team on screen: navigating somewhere else is not a retry,
  // but it does mean the failure the researcher is looking at is no longer
  // about where they are.
  return failedTeamId !== undefined && failedTeamId === committedTeamId
    ? { retry }
    : undefined;
}
