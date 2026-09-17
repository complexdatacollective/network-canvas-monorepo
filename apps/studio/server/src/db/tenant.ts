import { Effect, Option } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { TEAM_GUC } from '@codaco/studio-sync/rls';
import {
  type DrizzleTransaction,
  type TeamAccess,
  Transaction,
  unsafeMakeTeamAccess,
} from '@codaco/studio-sync/tenant';

import {
  Database,
  type DatabaseService,
  MaintenanceDatabase,
  OwnerDatabase,
  roleFor,
} from './client.ts';

// `Transaction`, `TeamAccess` and its constructor are **defined in
// `@codaco/studio-sync/tenant`** and re-exported here, not declared here.
// `SyncServer` writes inside a caller's transaction and so must require the
// service, and that package cannot import from the app that depends on it. A
// service tag's identity is its class, so two declarations sharing a string
// key would still be two different services: there is one definition, and this
// module is where the server reads it from.
export {
  type DrizzleTransaction,
  type TeamAccess,
  Transaction,
  unsafeMakeTeamAccess,
};

// Tenancy, and the two scopes that are the only way Studio opens a transaction
// (#1927 §9, §10).
//
// The rule this module exists to enforce is that **tenancy implies
// authorization**. `TenantScope.open` takes a `TeamAccess`, never a bare team
// id, and a `TeamAccess` can only be built by one of the named constructors in
// `team/access.ts`, `study/access.ts`, `protocol-builder/tenancy.ts`,
// `team/commands.ts` (an invitation the actor is not yet a member of) and
// `jobs/team-access.ts` (worker-only). So a tenant transaction cannot be
// opened without a membership check having happened, and the compiler says so
// — which is a stronger guarantee than the coverage test the first draft of
// the design proposed, because a coverage test cannot see a wrong id or a
// check made too late (#1927 §21 F7).

export type IsolationLevel = 'repeatable read' | 'serializable';

export type ScopeOptions = {
  /**
   * Legal **only at the root of a transaction**. `set transaction isolation
   * level` is refused by Postgres once a statement has run
   * (SQLSTATE 25001), and a nested `open` is a savepoint on a transaction that
   * has already begun — so asking for one there is a programming error, not a
   * condition a caller can recover from, and it dies (#1927 §21 F6).
   */
  readonly isolation?: IsolationLevel | undefined;
};

/**
 * `set local role` and `set local search_path`: the rc.115 stand-ins for the
 * two startup parameters rc.116 adds (fallback A, #1927 §20 Q6). Neither is a
 * bindable parameter — the role comes from a constant this codebase owns, and
 * the search path is checked against the same identifier rule the DDL is.
 */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

const pinSession = (
  service: DatabaseService,
): Effect.Effect<void, SqlError.SqlError> =>
  Effect.gen(function* () {
    const role = roleFor(service.identity);
    if (role !== null) yield* service.sql.unsafe(`set local role ${role}`);
    if (service.searchPath !== null) {
      if (!IDENTIFIER.test(service.searchPath)) {
        return yield* Effect.die(
          new Error(
            `invalid search path: ${JSON.stringify(service.searchPath)}`,
          ),
        );
      }
      yield* service.sql.unsafe(
        `set local search_path to ${service.searchPath}`,
      );
    }
  });

/**
 * Dies when an isolation level is asked for inside an existing transaction.
 * Read off the fiber rather than tracked by hand: `SqlClient` keys
 * `TransactionConnection` per client, and its presence *is* "this fiber is
 * already in a transaction on this client".
 */
const refuseNestedIsolation = (
  service: DatabaseService,
  options: ScopeOptions | undefined,
): Effect.Effect<void> =>
  options?.isolation === undefined
    ? Effect.void
    : Effect.flatMap(
        Effect.serviceOption(service.sql.transactionService),
        (open) =>
          Option.isSome(open)
            ? Effect.die(
                new Error(
                  'an isolation level may only be set at the root of a transaction; ' +
                    'this scope is nested, and Postgres refuses `set transaction` ' +
                    'once the transaction has begun',
                ),
              )
            : Effect.void,
      );

const openOn = <A, E, R>(
  service: DatabaseService,
  teamId: string | null,
  body: Effect.Effect<A, E, R>,
  options?: ScopeOptions,
): Effect.Effect<A, E | SqlError.SqlError, Exclude<R, Transaction>> =>
  Effect.flatMap(refuseNestedIsolation(service, options), () =>
    service.db.transaction(
      (tx) =>
        Effect.provideService(
          Effect.gen(function* () {
            // Before anything reads: the role first, then the team, so no
            // statement in the body can run unpinned or unstamped.
            yield* pinSession(service);
            if (teamId !== null) {
              yield* service.sql`select set_config(${TEAM_GUC}, ${teamId}, true)`;
            }
            return yield* body;
          }),
          Transaction,
          Transaction.of({ tx, sql: service.sql, teamId }),
        ),
      options?.isolation === undefined
        ? undefined
        : { isolationLevel: options.isolation },
    ),
  );

/**
 * One transaction on the **application** client, stamped with the team the
 * caller has proved access to. Every row-level-security policy reads that GUC
 * (`studio-sync/src/rls.ts`), so a statement that forgets its team predicate
 * sees nothing rather than another team's rows. The explicit predicates stay:
 * they lead the team-first indexes and hold where RLS is bypassed.
 */
export const TenantScope = {
  open: <A, E, R>(
    access: TeamAccess,
    body: Effect.Effect<A, E, R>,
    options?: ScopeOptions,
  ): Effect.Effect<
    A,
    E | SqlError.SqlError,
    Database | Exclude<R, Transaction>
  > => Database.use((service) => openOn(service, access.teamId, body, options)),
} as const;

/**
 * A transaction on the **application** client with no team stamped.
 *
 * It exists for one read, and the comment is the reason it is named rather
 * than folded into `TenantScope.open`: `team.acceptInvitation` has to resolve
 * which team an invitation belongs to before anybody has proved they may act
 * in that team, because the browser sends the opaque invitation id and nothing
 * else (`team/store.ts` — `findInvitationTeam`).
 *
 * It is strictly weaker than a tenant scope rather than a way around one. The
 * team GUC is unset, and every tenant policy reads it through
 * `NULLIF(current_setting(…, true), '')`, so a statement here matches no team's
 * rows at all — the tables it can reach are better-auth's, which carry no
 * policy. What it still does is pin the role and the search path, which a bare
 * statement outside a transaction does not (fallback A, #1927 §20 Q6).
 */
export const UntenantedScope = {
  open: <A, E, R>(
    body: Effect.Effect<A, E, R>,
    options?: ScopeOptions,
  ): Effect.Effect<
    A,
    E | SqlError.SqlError,
    Database | Exclude<R, Transaction>
  > => Database.use((service) => openOn(service, null, body, options)),
} as const;

/**
 * The connecting login's scope. No team is stamped, because the owner is not a
 * tenant identity — it is the role that applies the schema and seeds it, and
 * every tenant policy is written to except the application roles rather than
 * this one.
 *
 * It exists because two callers need a transaction as the owner and neither is
 * a tenant: `db/migrate.ts`, which applies the schema and installs the queue's,
 * and the suites, whose fixtures and oracles have to see across teams to be
 * oracles at all.
 */
export const OwnerScope = {
  open: <A, E, R>(
    body: Effect.Effect<A, E, R>,
    options?: ScopeOptions,
  ): Effect.Effect<
    A,
    E | SqlError.SqlError,
    OwnerDatabase | Exclude<R, Transaction>
  > => OwnerDatabase.use((service) => openOn(service, null, body, options)),
} as const;

/**
 * A nested transaction on the transaction already open: a savepoint on the
 * same connection, taken through the handle the outer scope provided rather
 * than through a client tag, so it cannot accidentally open a second one.
 *
 * `audited` is the reason this exists. It needs the body's writes to be
 * undoable without losing the locks the outer transaction holds, and a
 * savepoint is exactly that — a subtransaction's rollback releases only the
 * locks taken inside it. Re-entering `TenantScope.open` would do the same
 * thing but would re-send `set local role` and the team GUC on every audited
 * command, two round trips that change nothing.
 *
 * `SqlClient` names these `effect_sql_<depth>` and emits no `RELEASE` on
 * success, so a bulk loop must not open one per row.
 */
export const savepoint = <A, E, R>(
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | SqlError.SqlError, Transaction | R> =>
  Effect.flatMap(Transaction, (open) => open.tx.transaction(() => body));

/**
 * The worker's scopes, on the **maintenance** client.
 *
 * `open` stamps no team: the maintenance role is excepted from the tenant
 * policies, which is what lets a sweep cross teams. `openTenant` does stamp
 * one, because `audit_events` has no maintenance escape — an event the worker
 * appends is still that team's event and is written under its policy.
 */
export const MaintenanceScope = {
  open: <A, E, R>(
    body: Effect.Effect<A, E, R>,
    options?: ScopeOptions,
  ): Effect.Effect<
    A,
    E | SqlError.SqlError,
    MaintenanceDatabase | Exclude<R, Transaction>
  > =>
    MaintenanceDatabase.use((service) => openOn(service, null, body, options)),

  openTenant: <A, E, R>(
    access: TeamAccess,
    body: Effect.Effect<A, E, R>,
    options?: ScopeOptions,
  ): Effect.Effect<
    A,
    E | SqlError.SqlError,
    MaintenanceDatabase | Exclude<R, Transaction>
  > =>
    MaintenanceDatabase.use((service) =>
      openOn(service, access.teamId, body, options),
    ),
} as const;
