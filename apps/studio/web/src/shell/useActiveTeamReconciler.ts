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
  // Whether either of the two queries is holding a failure, which is the only
  // place a refresh outcome is recorded.
  //
  // **A refetch never rejects, and settling says nothing.** Better Auth's
  // `useAuthQuery` wraps each request in a promise it resolves from `finally`
  // whatever happens, and reports a failure by storing `error` on the atom —
  // keeping the previous `data` unless the status was 401. So there is nothing
  // for `Promise.allSettled` below to suppress, and equally nothing it can
  // tell us: a write that landed followed by two refreshes that did not leaves
  // the hooks naming the team the researcher has just left, with no error
  // anywhere and, if the reconciliation were marked settled there, no way back
  // but a reload.
  //
  // Read at RENDER time because that is the only place it is current. The
  // atoms are set before the refetch promise resolves, but the value this
  // component holds is the one its last render read, so an async continuation
  // that consulted it would read the state from BEFORE the refresh.
  const refreshFailed =
    Boolean(activeTeam.error) || Boolean(activeMember.error);
  // The team a write is on the wire for, and while one is there no second write
  // starts — not even for a different team.
  //
  // Two overlapping `setActive` calls are resolved by the server in whatever
  // order it answers them, and the LAST one to land is the one that sticks. A
  // researcher who commits a second team URL while the first write is still
  // out can therefore be left with the team they have just left as their active
  // one, and nothing corrects it once they move somewhere that names no team:
  // a study route, `/account`, the gallery. The next landing resolution then
  // sends them back to the earlier team. Waiting and re-reading the committed
  // team on the next pass writes the newest team LAST, which is the only order
  // that agrees with the URL.
  //
  // State rather than a ref, because the effect has to run again the moment
  // this clears: it is what defers the second write, so nothing else about the
  // effect's dependencies is guaranteed to change when the first one finishes.
  const [writingTeamId, setWritingTeamId] = useState<string | undefined>(
    undefined,
  );
  // The team the last COMPLETE reconciliation was made for — a write that
  // landed AND a refresh that reached the two queries above — and what keys
  // §6.6's idempotency.
  //
  // Not the comparison above it: `disableSignal` suppresses `$sessionSignal`
  // and nothing replaces it, so the active team this reads can still name the
  // old team after a write that worked (§6.6 says so in as many words, and
  // that the comparison is an optimisation rather than the correctness
  // argument). Deferring the second write is what makes that matter — the
  // effect now runs again the moment a write finishes, and without this it
  // would meet a stale comparison and write the same team for ever.
  const settledTeamId = useRef<string | undefined>(undefined);
  // The team a write failed for, so a failure is retried on request rather
  // than on the next render: nothing about the effect's dependencies changes
  // when a write fails, so an unrecorded failure would be re-attempted by
  // whatever re-renders the shell next, silently and for ever.
  const [failedTeamId, setFailedTeamId] = useState<string | undefined>(
    undefined,
  );
  // The team whose write has landed and whose refresh has not been read yet.
  //
  // This is what splits the reconciliation in two. The closure below cannot
  // read `refreshFailed` — it closes over the render that started the write —
  // so it hands the team back here instead, and the pass this state change
  // causes is where the reconciliation is finally marked settled or failed.
  // That pass reads the hooks fresh, because a render is what re-reads them.
  const [refreshedTeamId, setRefreshedTeamId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    // The second half of a reconciliation, before anything else: the write
    // landed and the two refreshes have now been given their chance.
    //
    // Ahead of the `committedTeamId` guard so it always completes. A
    // researcher who navigates to a study or `/account` while the refreshes
    // are out names no team on arrival, and leaving this half undone would
    // strand the idempotency key on a write that did happen.
    if (refreshedTeamId !== undefined) {
      if (refreshFailed) {
        setFailedTeamId(refreshedTeamId);
      } else {
        settledTeamId.current = refreshedTeamId;
        setFailedTeamId(undefined);
      }
      setRefreshedTeamId(undefined);
      return;
    }

    if (committedTeamId === undefined) return;
    if (committedTeamId === settledTeamId.current) return;
    if (writingTeamId !== undefined) return;
    if (failedTeamId === committedTeamId) return;
    // §6.6's optimisation, and the one condition under which it is safe to
    // take: that the queries it compares are current. A refresh that failed
    // for the MEMBER alone leaves the team query already naming the committed
    // team, and short-circuiting on that would refuse the very retry the
    // researcher has just asked for — the comparison deciding correctness,
    // which §6.6 says it must never do.
    if (committedTeamId === activeTeamId && !refreshFailed) return;

    setWritingTeamId(committedTeamId);
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
        // `allSettled` for form only — neither of these can reject. What they
        // did is on the hooks, and only the next render can read it.
        await Promise.allSettled([refetchActiveTeam(), refetchActiveMember()]);
        setWritingTeamId(undefined);
        if (failed) {
          setFailedTeamId(committedTeamId);
        } else {
          // NOT settled here, whatever the write says. The screens this exists
          // for read the queries above, not the server, so a write nothing
          // told them about has not reconciled anything.
          setRefreshedTeamId(committedTeamId);
          // The landing resolution caches which team was active for 30 seconds
          // (§6.4). This write is what makes that answer stale, so `/` cannot
          // send the researcher back to the team they just left — and that is
          // true of the write alone, whether or not the refreshes landed.
          await invalidateMemberships(queryClient);
        }
      }
    })();
  }, [
    activeTeamId,
    committedTeamId,
    failedTeamId,
    queryClient,
    refetchActiveMember,
    refetchActiveTeam,
    refreshedTeamId,
    refreshFailed,
    writingTeamId,
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
