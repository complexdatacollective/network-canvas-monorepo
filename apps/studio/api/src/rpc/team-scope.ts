import { and, eq } from 'drizzle-orm';
import { Effect, Option } from 'effect';
import type { SqlError } from 'effect/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import {
  Forbidden,
  type RateLimited,
} from '@codaco/studio-contract/schema/errors';

import { AuthService } from '../auth/service.ts';
import { AUTH_TABLES } from '../db/auth-schema.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import {
  type TeamAccess,
  Transaction,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
import { isReachableByCaller } from '../protocol/store.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import type { RateLimiter } from '../rate-limit/limiter.ts';
import { STUDY_ROLE_TABLES } from '../study/roles-schema.ts';
import { STUDY_TABLES } from '../study/schema.ts';
import {
  type ResolvedStudy,
  resolveStudy as resolveStudyTenant,
  seesEveryTeamStudy,
} from '../study/tenancy.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { requireDatabase } from './bridge.ts';
import type { RpcDeps } from './deps.ts';

const { team_members: teamMembers } = AUTH_TABLES;
const { studyRoleGrants } = STUDY_ROLE_TABLES;
const { studies } = STUDY_TABLES;

/**
 * Checked against the payload's explicit teamId, never the session's active
 * team.
 */
export const openTeam = Effect.fnUntraced(function* (
  deps: RpcDeps,
  principal: Principal['Service'],
  teamId: string,
): Effect.fn.Return<
  TeamAccess,
  Forbidden | RateLimited,
  AuthService | RateLimiter
> {
  yield* requireDatabase(deps);
  const auth = yield* AuthService;
  const membership = yield* auth.getMembership(principal.userId, teamId);
  if (Option.isNone(membership)) return yield* new Forbidden({});
  // Charged only once the caller is known to be in the team, so a stranger
  // cannot exhaust its quota.
  yield* enforceRateLimit('rpc_team', teamId);
  return unsafeMakeTeamAccess(teamId, membership.value.role);
});

export const requireTeamAdministration = (
  access: TeamAccess,
): Effect.Effect<void, Forbidden> =>
  roleGrantsTeamAdministration(access.role) ? Effect.void : new Forbidden({});

export const resolveStudy = Effect.fnUntraced(function* (
  principal: Principal['Service'],
  studyId: string,
): Effect.fn.Return<
  ResolvedStudy,
  Forbidden | RateLimited,
  Database | AuthService | RateLimiter
> {
  const auth = yield* AuthService;
  const memberships = yield* auth.listMemberships(principal.userId);
  const resolved = yield* Effect.orDie(
    resolveStudyTenant({
      studyId,
      actorUserId: principal.userId,
      memberships,
    }),
  );
  if (resolved === null) return yield* new Forbidden({});
  yield* enforceRateLimit('rpc_team', resolved.access.teamId);
  return resolved;
});

/** A caller that also locks the membership row `FOR UPDATE` must take that lock first, or concurrent calls deadlock. */
export const requireLockedRole = Effect.fnUntraced(function* (
  access: TeamAccess,
): Effect.fn.Return<
  string,
  Forbidden | SqlError.SqlError,
  Transaction | Principal
> {
  const principal = yield* Principal;
  const { tx } = yield* Transaction;
  const members = yield* sqlErrorsOnly(
    tx
      .select({ role: teamMembers.role })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.team_id, access.teamId),
          eq(teamMembers.user_id, principal.userId),
        ),
      )
      .for('share', { of: teamMembers }),
  );
  const member = members[0];
  if (member === undefined) return yield* new Forbidden({});
  return member.role;
});

export const requireProtocol = Effect.fnUntraced(function* (
  access: TeamAccess,
  protocolId: string,
): Effect.fn.Return<
  void,
  Forbidden | SqlError.SqlError,
  Transaction | Principal
> {
  const principal = yield* Principal;
  const { tx } = yield* Transaction;
  const seesEveryStudy = seesEveryTeamStudy(yield* requireLockedRole(access));
  if (!seesEveryStudy) {
    yield* sqlErrorsOnly(
      tx
        .select({ id: studyRoleGrants.id })
        .from(studyRoleGrants)
        .innerJoin(
          studies,
          and(
            eq(studies.id, studyRoleGrants.studyId),
            eq(studies.teamId, studyRoleGrants.teamId),
          ),
        )
        .where(
          and(
            eq(studyRoleGrants.teamId, access.teamId),
            eq(studyRoleGrants.userId, principal.userId),
            eq(studies.protocolId, protocolId),
          ),
        )
        .for('share', { of: studyRoleGrants }),
    );
  }
  const reachable = yield* isReachableByCaller(access.teamId, protocolId, {
    actorUserId: principal.userId,
    seesEveryStudy,
  });
  if (!reachable) return yield* new Forbidden({});
  return undefined;
});
