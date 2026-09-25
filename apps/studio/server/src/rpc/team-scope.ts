import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import {
  Forbidden,
  type RateLimited,
} from '@codaco/studio-contract/schema/errors';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import type { Database } from '../db/client.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import {
  type TeamAccess,
  Transaction,
  unsafeMakeTeamAccess,
} from '../db/tenant.ts';
import { isReachableByCaller } from '../protocol/store.ts';
import { STUDY_ROLE_TABLES } from '../study/roles-schema.ts';
import { STUDY_TABLES } from '../study/schema.ts';
import {
  type ResolvedStudy,
  resolveStudy as resolveStudyTenant,
  seesEveryTeamStudy,
} from '../study/tenancy.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import { chargeLimit, requirePool } from './bridge.ts';
import type { RpcDeps } from './deps.ts';

const { team_members: teamMembers } = AUTH_TABLES;
const { studyRoleGrants } = STUDY_ROLE_TABLES;
const { studies } = STUDY_TABLES;

// Where a `TeamAccess` comes from on the rpc plane (#1927 §10).
//
// `TeamAccess` is the branded token `@codaco/studio-sync/tenant` declares, and
// `TenantScope.open` takes one instead of a bare team id — so a tenant
// transaction cannot be opened without a membership check having happened and
// the compiler says so. That only holds while the token's constructors are few
// and each one has just proved something, which is what this module is: the
// rpc plane's two, `openTeam` and `resolveStudy`. The others are
// `team/commands.ts` (an invitation whose actor is not yet a member),
// `protocol-builder/tenancy.ts` (the editor host's own gate) and
// `jobs/team-access.ts` (the maintenance token, which `process-separation`
// keeps out of the web process). `db/__tests__/team-access-policy.test.ts` pins
// the whole set.
//
// The Promise-era `tenantDbFor` is gone with the last store that spoke
// node-postgres: every team-scoped write now opens its own `TenantScope`, so
// there is no second way a team's rows are reached.
//
// What the move from the old `TeamScope` record must preserve is the ORDER:
// the caller's own budget before any query, the team's only once membership is
// confirmed. A spent window leaves as the contract's `RateLimited`, which every
// procedure that opens a scope declares.

/**
 * Tenancy is checked per request against an explicit teamId in the procedure
 * payload — never the session's active team. A non-member and a nonexistent
 * team both read `Forbidden`, so the check is not an existence oracle; a plane
 * wired without a database is a deployment bug, not an authorization refusal.
 *
 * Shared by every team-scoped procedure rather than repeated in each, so what
 * "this caller, in this team" means is settled once.
 */
export const openTeam = Effect.fnUntraced(function* (
  deps: RpcDeps,
  principal: Principal['Service'],
  teamId: string,
): Effect.fn.Return<TeamAccess, Forbidden | RateLimited> {
  // The caller's own budget first, before the database is touched at all: that
  // is the one a runaway client spends, and refusing after a membership lookup
  // would have spent the work the limit exists to stop.
  yield* chargeLimit(deps.limiter, 'rpc_user', principal.userId);
  // Asserted here rather than where the handle is built, so a plane wired
  // without a database refuses in the same place it always did — before any
  // membership is looked up.
  yield* requirePool(deps);
  const membership = yield* Effect.promise(() =>
    deps.auth.getMembership(principal.userId, teamId),
  );
  // One refusal, built the same way for both misses: `Forbidden` carries no
  // reason beyond `detail`, and neither branch sets one, so a non-member and an
  // unknown team are byte-identical answers rather than an existence oracle.
  if (!membership) return yield* new Forbidden({});
  // The team's ceiling is charged only once this caller is known to be in the
  // team. Charging it first would let any signed-in stranger who can guess a
  // team id exhaust that team's quota with calls that are all refused — a
  // denial of service built entirely out of forbidden requests.
  yield* chargeLimit(deps.limiter, 'rpc_team', teamId);
  return unsafeMakeTeamAccess(teamId, membership.role);
});

/**
 * The team Admin tier on top of membership: the rule #1257 gives study
 * creation, applied to creating a protocol line no study owns.
 *
 * This is the pre-transaction refusal that keeps a non-admin from taking the
 * team audit lock at all. It is not the authoritative check — the command
 * re-reads the tier from the locked membership row, because this answer is
 * already stale by the time the transaction opens.
 */
export const requireTeamAdministration = (
  access: TeamAccess,
): Effect.Effect<void, Forbidden> =>
  roleGrantsTeamAdministration(access.role) ? Effect.void : new Forbidden({});

/**
 * `requireStudy` (app-shell design §6.3). A study URL names no team, so the
 * tenant is derived from the caller's own memberships and the access comes back
 * with the study the probe found — nothing about the study is read outside its
 * team's own transaction. Unreachable for any reason — absent, another team's,
 * or one this caller's team role does not show them — is the same `Forbidden`,
 * so this is not an existence oracle.
 *
 * The study row travels *beside* the access rather than fused into it: the
 * brand means "this caller may act in this team" and nothing else, and widening
 * it per call site would make every consumer of a `TeamAccess` carry a payload
 * it has no use for.
 */
export const resolveStudy = Effect.fnUntraced(function* (
  deps: RpcDeps,
  principal: Principal['Service'],
  studyId: string,
): Effect.fn.Return<ResolvedStudy, Forbidden | RateLimited, Database> {
  // A study URL names no team, so the team limit cannot be taken before the
  // tenant is resolved; the caller's own is taken before any query.
  yield* chargeLimit(deps.limiter, 'rpc_user', principal.userId);
  const resolved = yield* Effect.orDie(
    Effect.flatMap(
      Effect.promise(() => deps.auth.listMemberships(principal.userId)),
      (memberships) =>
        resolveStudyTenant({
          studyId,
          actorUserId: principal.userId,
          memberships,
        }),
    ),
  );
  if (resolved === null) return yield* new Forbidden({});
  yield* chargeLimit(deps.limiter, 'rpc_team', resolved.access.teamId);
  return resolved;
});

/**
 * #1257's visibility rule for one protocol line, **inside the caller's own
 * transaction**.
 *
 * Requiring `Transaction` is the whole point. A check that opens a transaction
 * of its own answers about a state the write then re-reads, and between the two
 * the grant it relied on can be revoked; taken here it is one transaction per
 * call, the check and the write see the same snapshot and hold the same locks,
 * and no caller can arrange otherwise because the type refuses the call
 * anywhere else. `rpc/__tests__/protocol-check-placement.test.ts` backs it at
 * the source level: every call sits in a scope whose body does more than
 * check.
 *
 * Being inside the transaction is not enough on its own: the role `openTeam`
 * put in `access` was read before it opened. So the rule is decided on the
 * caller's membership row and grant rows as locked here, `FOR SHARE` — a
 * demotion or a revocation in flight is waited out and then seen, and one
 * that starts later waits for this transaction instead. A caller that also
 * locks the membership row `FOR UPDATE` must take that lock first; asking for
 * it after this share lock would be an upgrade two concurrent calls can
 * deadlock on.
 *
 * The predicate is the store's own, so what `studies.list` omits and
 * `studies.get` refuses cannot be read — or edited — through the protocol
 * behind it. The refusal is `studies.get`'s too: unreachable for any reason —
 * absent, another team's, or one this caller's role does not show them — is the
 * same `Forbidden`, so this is not an existence oracle either. Which draft
 * belongs to which line stays each procedure's own check; this one is about the
 * line.
 */
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
  const seesEveryStudy = seesEveryTeamStudy(member.role);
  if (!seesEveryStudy) {
    // The grants that could make this line reachable, locked so none of them
    // is revoked under the answer. A revocation already in flight is waited
    // out here, and the predicate below — a later statement — no longer sees it.
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
