import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

import { authClient } from './auth.ts';

/**
 * §6.4's landing destination: where a signed-in researcher belongs when they
 * have not asked for anywhere in particular.
 *
 * Two callers share it, and they must not answer differently: `/`, which is a
 * redirect-only route on a self-hosted instance (§10.4), and the sign-in
 * page's already-signed-in guard. A third joins them when `/no-team` gains its
 * own guard.
 */

/** The teams the researcher belongs to, and the one they were last acting in. */
export type Memberships = {
  teams: readonly { id: string; name: string }[];
  activeTeamId: string | undefined;
};

/**
 * The session could not be read, or the team list could not be fetched. It
 * reaches the router's `defaultErrorComponent` rather than being turned into
 * "you have no teams", which would be a lie told at the one moment a
 * researcher is most likely to believe it.
 */
class MembershipsUnavailableError extends Error {
  constructor() {
    super('Your teams could not be loaded.');
    this.name = 'MembershipsUnavailableError';
  }
}

async function fetchMemberships(): Promise<Memberships> {
  // Two reads, because the two facts live in different places: the team list
  // is its own endpoint, and which team the researcher was last acting in is
  // a session field (`activeOrganizationId`, stored as `activeTeamId`). The
  // session query (§6.2) deliberately carries neither — it answers
  // signedIn/signedOut and nothing that could go stale behind it — so this
  // asks for itself rather than widening that answer.
  const [teams, session] = await Promise.all([
    authClient.organization.list().catch(() => {
      throw new MembershipsUnavailableError();
    }),
    authClient.getSession().catch(() => {
      throw new MembershipsUnavailableError();
    }),
  ]);

  if (teams.error || !teams.data) throw new MembershipsUnavailableError();

  return {
    teams: teams.data.map((team) => ({ id: team.id, name: team.name })),
    activeTeamId: session.data?.session.activeOrganizationId ?? undefined,
  };
}

/**
 * Resolved once per landing rather than held live: it is read by guards, and a
 * short staleness window keeps a sign-in that lands, bounces off `/sign-in`
 * and lands again from asking twice. Invalidation is what makes an accepted
 * invitation visible, not the timer.
 */
const membershipsQueryOptions = queryOptions({
  queryKey: ['memberships'],
  queryFn: fetchMemberships,
  staleTime: 30_000,
  retry: false,
});

export type LandingDestination =
  | { to: '/no-team' }
  | { to: '/team/$teamId'; params: { teamId: string } };

/**
 * §6.4, with the one degradation this slice cannot avoid.
 *
 * The design resolves a researcher with one team and one study to
 * `/study/$studyId`. There is no studies table — `$studyId` addresses a
 * protocol until #1262 lands the model — so "how many studies does this team
 * have?" is a question nothing can answer yet, and both of the design's
 * one-team cases resolve to `/team/$teamId`, which is the team's studies list
 * and reaches the single study in one click. When the model exists this
 * function gains the study case; nothing else has to move, because every
 * caller already goes through it.
 */
export function landingDestination({
  teams,
  activeTeamId,
}: Memberships): LandingDestination {
  if (teams.length === 0) return { to: '/no-team' };

  // Several teams → the most recently active one (§6.4 case 3), and the first
  // of the list only when the session names no team or names one the
  // researcher has since left.
  const team =
    teams.find((candidate) => candidate.id === activeTeamId) ?? teams[0];
  return team === undefined
    ? { to: '/no-team' }
    : { to: '/team/$teamId', params: { teamId: team.id } };
}

/**
 * The redirect a guard throws. Built here rather than by each caller so the
 * literal route paths stay together with the resolution that chose them.
 */
export function landingRedirect(destination: LandingDestination) {
  return destination.to === '/no-team'
    ? redirect({ to: '/no-team' })
    : redirect({ to: '/team/$teamId', params: destination.params });
}

/** `fetchQuery`, never `ensureQueryData`, for the reason §6.2 records. */
export async function resolveLandingDestination(
  queryClient: QueryClient,
): Promise<LandingDestination> {
  return landingDestination(
    await queryClient.fetchQuery(membershipsQueryOptions),
  );
}
