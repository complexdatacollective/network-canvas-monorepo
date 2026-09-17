import { Effect } from 'effect';

import type { Principal } from '@codaco/studio-contract/middleware/authenticated';
import {
  Forbidden,
  type RateLimited,
} from '@codaco/studio-contract/schema/errors';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import { ProtocolStore } from '../protocol/store.ts';
import type { StudyDetailRow } from '../study/store.ts';
import { resolveStudy, seesEveryTeamStudy } from '../study/tenancy.ts';
import { roleGrantsTeamAdministration } from '../team/roles.ts';
import {
  chargeLimit,
  requestIdOrMint,
  requireCipher,
  requirePool,
} from './bridge.ts';
import type { RpcDeps } from './deps.ts';

// The three scopes today's `requireTeam`, `requireStudy` and `requireProtocol`
// middlewares resolved (`src/rpc.ts`), as helpers a handler calls.
//
// They are not rpc middlewares. `RpcMiddleware`'s options expose the payload as
// `unknown`, so a middleware would have to re-decode an untyped payload to find
// the team it is being asked about — which is why the design puts this
// authorization at the command level instead (#1930 §20, risk 1). What the move
// must preserve is the ORDER: the caller's own budget before any query, the
// team's only once membership is confirmed. A spent window leaves as the
// contract's `RateLimited`, which every procedure that opens a scope declares.

/** A caller, resolved inside one team, with that team's database pinned. */
export type TeamScope = {
  readonly principal: Principal['Service'];
  readonly requestId: string;
  readonly team: { readonly id: string; readonly role: string };
  readonly tenantDb: TenantDb;
};

/** A team scope that a study was resolved through, carrying the study row. */
export type StudyScope = TeamScope & { readonly study: StudyDetailRow };

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
): Effect.fn.Return<TeamScope, Forbidden | RateLimited> {
  // The caller's own budget first, before the database is touched at all: that
  // is the one a runaway client spends, and refusing after a membership lookup
  // would have spent the work the limit exists to stop.
  yield* chargeLimit(deps.limiter, 'rpc_user', principal.userId);
  const pool = yield* requirePool(deps);
  const membership = yield* Effect.promise(() =>
    deps.auth.getMembership(principal.userId, teamId),
  );
  if (!membership) return yield* new Forbidden({});
  // The team's ceiling is charged only once this caller is known to be in the
  // team. Charging it first would let any signed-in stranger who can guess a
  // team id exhaust that team's quota with calls that are all refused — a
  // denial of service built entirely out of forbidden requests.
  yield* chargeLimit(deps.limiter, 'rpc_team', teamId);
  return {
    principal,
    requestId: yield* requestIdOrMint,
    team: { id: teamId, role: membership.role },
    tenantDb: createTenantDb(pool, teamId),
  };
});

/**
 * Membership plus the team Admin tier: the rule #1257 gives study creation,
 * applied to creating a protocol line no study owns. The command re-reads it
 * from the locked membership row, because this answer is already stale by the
 * time the transaction opens.
 */
export const openTeamForAdministration = Effect.fnUntraced(function* (
  deps: RpcDeps,
  principal: Principal['Service'],
  teamId: string,
): Effect.fn.Return<TeamScope, Forbidden | RateLimited> {
  const scope = yield* openTeam(deps, principal, teamId);
  if (!roleGrantsTeamAdministration(scope.team.role)) {
    return yield* new Forbidden({});
  }
  return scope;
});

/**
 * Membership plus #1257's visibility rule, carried from the study tier to every
 * procedure addressed by a protocol line (`protocol/store.ts`). A Member
 * reaches a line only through a study they hold a grant on, so what
 * `studies.list` omits and `studies.get` refuses cannot be read — or edited —
 * through the protocol behind it.
 *
 * The refusal is `studies.get`'s: unreachable for any reason — absent, another
 * team's, or one this caller's role does not show them — is the same
 * `Forbidden`, so this is not an existence oracle either. Which draft belongs
 * to which line stays each procedure's own check; this one is about the line.
 */
export const openProtocol = Effect.fnUntraced(function* (
  deps: RpcDeps,
  principal: Principal['Service'],
  input: { readonly teamId: string; readonly protocolId: string },
): Effect.fn.Return<TeamScope, Forbidden | RateLimited> {
  const scope = yield* openTeam(deps, principal, input.teamId);
  const cipher = yield* requireCipher(deps);
  const reachable = yield* Effect.promise(() =>
    new ProtocolStore(scope.tenantDb, cipher).isReachableByCaller(
      input.protocolId,
      {
        actorUserId: scope.principal.userId,
        seesEveryStudy: seesEveryTeamStudy(scope.team.role),
      },
    ),
  );
  if (!reachable) return yield* new Forbidden({});
  return scope;
});

/**
 * `requireStudy` (app-shell design §6.3). A study URL names no team, so the
 * tenant is derived from the caller's own memberships and the pinned TenantDb
 * comes back with the study the probe found — nothing about the study is read
 * outside it. Unreachable for any reason — absent, another team's, or one this
 * caller's team role does not show them — is the same `Forbidden`, so this is
 * not an existence oracle.
 */
export const openStudy = Effect.fnUntraced(function* (
  deps: RpcDeps,
  principal: Principal['Service'],
  studyId: string,
): Effect.fn.Return<StudyScope, Forbidden | RateLimited> {
  // A study URL names no team, so the team limit cannot be taken before the
  // tenant is resolved; the caller's own is taken before any query.
  yield* chargeLimit(deps.limiter, 'rpc_user', principal.userId);
  const pool = yield* requirePool(deps);
  const resolved = yield* Effect.promise(async () =>
    resolveStudy(pool, {
      studyId,
      actorUserId: principal.userId,
      memberships: await deps.auth.listMemberships(principal.userId),
    }),
  );
  if (!resolved) return yield* new Forbidden({});
  yield* chargeLimit(deps.limiter, 'rpc_team', resolved.teamId);
  return {
    principal,
    requestId: yield* requestIdOrMint,
    team: { id: resolved.teamId, role: resolved.role },
    tenantDb: resolved.tenantDb,
    study: resolved.study,
  };
});
