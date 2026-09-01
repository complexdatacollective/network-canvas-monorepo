import { useParams } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

import { authClient } from '../lib/auth.ts';

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
export function useActiveTeamReconciler(): void {
  // `strict: false` because most app routes have no `teamId` at all, and the
  // absence is the answer for them rather than a type error.
  const { teamId: committedTeamId } = useParams({ strict: false });
  const activeTeam = authClient.useActiveOrganization();
  const activeMember = authClient.useActiveMember();
  const activeTeamId = activeTeam.data?.id;
  const refetchActiveTeam = activeTeam.refetch;
  const refetchActiveMember = activeMember.refetch;
  // One write in flight at a time. The effect's own dependencies do not change
  // while `setActive` is on the wire, but a re-render caused by anything else
  // must not start a second one.
  const writing = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (committedTeamId === undefined) return;
    if (committedTeamId === activeTeamId) return;
    if (writing.current === committedTeamId) return;

    writing.current = committedTeamId;
    void (async () => {
      try {
        await authClient.organization.setActive(
          { organizationId: committedTeamId },
          // Better Auth otherwise schedules a delayed refresh of its own —
          // a 10ms timeout toggling the matched nanostores. The two refetches
          // below replace the two this component reads, so suppressing it
          // keeps exactly one authoritative refresh path.
          { disableSignal: true },
        );
      } catch {
        // A failed write leaves the setting where it was. The screens that
        // depend on it say they are still waiting rather than showing another
        // team's data, and the next navigation to this team tries again.
      } finally {
        await Promise.allSettled([refetchActiveTeam(), refetchActiveMember()]);
        writing.current = undefined;
      }
    })();
  }, [activeTeamId, committedTeamId, refetchActiveMember, refetchActiveTeam]);
}
