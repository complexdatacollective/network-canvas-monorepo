import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { type Database } from '../db/client.ts';
import {
  type TeamAccess,
  TenantScope,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { getStudy, type StudyDetailRow } from './store.ts';

/** One team the caller belongs to, as the auth service reports it. */
export type ActorMembership = {
  teamId: string;
  role: string;
};

/** The team a study turned out to be in, as proof plus the row itself. */
export type ResolvedStudy = {
  readonly access: TeamAccess;
  readonly study: StudyDetailRow;
};

/**
 * Whether a team role sees every study its team owns, or only the studies it
 * holds a grant on (#1257's starter matrix). An unparseable role list is not
 * an admin: the safe reading of a value this build does not understand is the
 * narrower one.
 */
export function seesEveryTeamStudy(role: string): boolean {
  return roleGrantsTeamAdministration(role);
}

/**
 * `requireStudy` (app-shell design §6.3): the tenant behind a `/study/$studyId`
 * URL, derived from the caller's own memberships rather than taken from the
 * browser. A cold direct navigation carries no team to send, and the rule
 * `AcceptTeamInvitationInput` records applies — a tenant that cannot be
 * validated against a membership must not be trusted.
 *
 * The search space is exactly the caller's teams, so "no such study" and "a
 * study in a team you are not in" are the same answer here (null), and the
 * caller turns both into `Forbidden`. Nothing about the study is read outside a
 * tenant scope: each probe opens one on a `TeamAccess` minted from a membership
 * the auth service just reported, so it runs under the row-level security
 * policy and under #1257's visibility rule, and a study a Member holds no grant
 * on is invisible to this resolver too.
 *
 * The probes run in the order the memberships arrive. §6.3 orders the session's
 * active team first so the common case is one probe; that needs the active team
 * on the principal, which this does not add — and the cost without it is one
 * primary-key lookup per team the researcher belongs to.
 */
export const resolveStudy: (input: {
  readonly studyId: string;
  readonly actorUserId: string;
  readonly memberships: readonly ActorMembership[];
}) => Effect.Effect<ResolvedStudy | null, SqlError.SqlError, Database> =
  Effect.fn('study.tenancy.resolveStudy')(function* (input: {
    readonly studyId: string;
    readonly actorUserId: string;
    readonly memberships: readonly ActorMembership[];
  }) {
    for (const membership of input.memberships) {
      const access = unsafeMakeTeamAccess(membership.teamId, membership.role);
      const study = yield* TenantScope.open(
        access,
        getStudy(input.studyId, {
          actorUserId: input.actorUserId,
          seesEveryStudy: seesEveryTeamStudy(membership.role),
        }),
      );
      if (study !== null) return { access, study };
    }
    return null;
  });
