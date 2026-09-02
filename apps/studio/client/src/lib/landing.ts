import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

import { authClient } from './auth.ts';

/**
 * §6.4's landing destination: where a signed-in researcher belongs when they
 * have not asked for anywhere in particular.
 *
 * Four callers share it, and they must not answer differently: `/`, which is
 * a redirect-only route on a self-hosted instance (§10.4); the sign-in page's
 * already-signed-in guard, which is also where both sign-in callbacks come
 * back to; `/no-team`, which is the screen for the one answer below that
 * means "stay"; and the app shell's own guard, which asks the one question
 * below that needs no session read.
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

async function fetchTeams(): Promise<Memberships['teams']> {
  const teams = await authClient.organization.list().catch(() => {
    throw new MembershipsUnavailableError();
  });
  if (teams.error || !teams.data) throw new MembershipsUnavailableError();
  return teams.data.map((team) => ({ id: team.id, name: team.name }));
}

/**
 * `null`, not `undefined`, for "the session names no team".
 *
 * That is an ANSWER, and this one has to survive being cached: TanStack Query
 * treats a `queryFn` resolving `undefined` as a failed query and throws
 * `<queryHash> data is undefined` in its place (`query-core`'s `Query.fetch`).
 * Spelt that way the answer never reaches `landingDestination` at all — every
 * caller of the resolution below gets the error screen instead, and the
 * sign-in bounce, which swallows a failed resolution by design, leaves the
 * researcher on the page they have just signed in from.
 */
async function fetchActiveTeamId(): Promise<string | null> {
  // Which team the researcher was last acting in is a session field
  // (`activeOrganizationId`, stored as `activeTeamId`). The session query
  // (§6.2) deliberately does not carry it — it answers signedIn/signedOut and
  // nothing that could go stale behind it — so this asks for itself rather
  // than widening that answer.
  const session = await authClient.getSession().catch(() => {
    throw new MembershipsUnavailableError();
  });
  // better-fetch resolves a refused read with an `error` field instead of
  // rejecting, exactly as `fetchTeams` above has to allow for. Left to the
  // nullish coalescing below, a read that failed would be indistinguishable
  // from a session naming no team, and the two mean opposite things here: one
  // is answered by falling back to the first team, and the other is the
  // membership-unavailable error this module promises.
  if (session.error) throw new MembershipsUnavailableError();
  // And that answer is the ordinary state of a session that has never switched
  // teams: nothing sets `activeOrganizationId` when a session is created —
  // not Better Auth's organization plugin, and no database hook of ours — so it
  // is what every first sign-in reads.
  return session.data?.session.activeOrganizationId ?? null;
}

/**
 * Two queries, because the two facts live in different places and not every
 * caller needs both. §6.4's case 4 — "no team at all" — is answered by the
 * list alone, and the app shell's guard asks only that on every cold entry to
 * the authenticated tree; making it read the session too would put a second
 * `/api/auth/get-session` request behind every one the session query already
 * makes, which is the duplication §6.2 removed from the shell in the first
 * place.
 *
 * Both are resolved once per landing rather than held live: they are read by
 * guards, and a short staleness window keeps a sign-in that lands, bounces off
 * `/sign-in` and lands again from asking twice. Invalidation is what makes an
 * accepted invitation visible, not the timer.
 */
const teamsQueryOptions = queryOptions({
  queryKey: ['memberships', 'teams'],
  queryFn: fetchTeams,
  staleTime: 30_000,
  retry: false,
});

const activeTeamQueryOptions = queryOptions({
  queryKey: ['memberships', 'activeTeam'],
  queryFn: fetchActiveTeamId,
  staleTime: 30_000,
  retry: false,
});

/** The prefix both of the above share, so one call invalidates the pair. */
const MEMBERSHIPS_QUERY_PREFIX = ['memberships'];

/**
 * The active team has moved, so the cached answers above are wrong in the one
 * field the resolution below reads them for.
 *
 * The freshness window is there to stop a sign-in that lands, bounces off
 * `/sign-in` and lands again from asking three times; it is not a claim that
 * memberships cannot change inside it. Switching teams changes them, and
 * without this the researcher who switches from A to B and then goes to `/`
 * is redirected back to A for the rest of the window — the timer overriding
 * the choice they just made.
 *
 * Invalidation rather than a `setQueryData` patch: the same write can coincide
 * with an accepted invitation or a team they have just left, and the next
 * resolution should ask rather than assume it knows what else changed. Neither
 * query has observers — both are only ever read by `fetchQuery` — so this
 * marks them stale and issues no request of its own.
 */
export async function invalidateMemberships(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: MEMBERSHIPS_QUERY_PREFIX,
  });
}

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
  const [teams, activeTeamId] = await Promise.all([
    queryClient.fetchQuery(teamsQueryOptions),
    queryClient.fetchQuery(activeTeamQueryOptions),
  ]);
  // The query's `null` and this vocabulary's `undefined` are the same answer;
  // only the cache needs the distinction.
  return landingDestination({ teams, activeTeamId: activeTeamId ?? undefined });
}

/**
 * Whether this session belongs to no team at all — §6.4's case 4, and the only
 * question the app shell's guard has to answer.
 *
 * Resolved through `landingDestination` rather than by comparing a length, so
 * the guard and the landing cannot come to disagree about what "no team"
 * means. The active team is deliberately not read: case 4 is the one answer
 * that cannot depend on it, and asking would cost the authenticated tree a
 * second session request on every cold entry.
 */
export async function resolveTeamlessSession(
  queryClient: QueryClient,
): Promise<boolean> {
  const teams = await queryClient.fetchQuery(teamsQueryOptions);
  return (
    landingDestination({ teams, activeTeamId: undefined }).to === '/no-team'
  );
}
