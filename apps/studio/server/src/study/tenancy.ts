import type pg from 'pg';

import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { type StudyDetailRow, StudyStore } from './store.ts';

/** One team the caller belongs to, as the auth service reports it. */
export type ActorMembership = {
  teamId: string;
  role: string;
};

export type ResolvedStudy = {
  teamId: string;
  role: string;
  tenantDb: TenantDb;
  study: StudyDetailRow;
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
 * `AcceptTeamInvitationInputSchema` records applies — a tenant that cannot be
 * validated against a membership must not be trusted.
 *
 * The search space is exactly the caller's teams, so "no such study" and "a
 * study in a team you are not in" are the same answer here (null), and the
 * caller turns both into FORBIDDEN. Nothing about the study is read before a
 * `TenantDb` is pinned: each probe runs inside its team's own transaction,
 * under the row-level security policy and under #1257's visibility rule, so a
 * study a Member holds no grant on is invisible to this resolver too.
 *
 * The probes run in the order the memberships arrive. §6.3 orders the
 * session's active team first so the common case is one probe; that needs the
 * active team on the principal, which this change does not add — and the cost
 * without it is one primary-key lookup per team the researcher belongs to.
 */
export async function resolveStudy(
  pool: pg.Pool,
  input: {
    studyId: string;
    actorUserId: string;
    memberships: readonly ActorMembership[];
  },
): Promise<ResolvedStudy | null> {
  for (const membership of input.memberships) {
    const tenantDb = createTenantDb(pool, membership.teamId);
    const study = await new StudyStore(tenantDb).getStudy(input.studyId, {
      actorUserId: input.actorUserId,
      seesEveryStudy: seesEveryTeamStudy(membership.role),
    });
    if (study) {
      return {
        teamId: membership.teamId,
        role: membership.role,
        tenantDb,
        study,
      };
    }
  }
  return null;
}
