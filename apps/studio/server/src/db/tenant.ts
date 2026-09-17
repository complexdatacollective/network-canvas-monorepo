import { Context, Effect, Option } from 'effect';
import type { SqlClient, SqlError } from 'effect/unstable/sql';

import { TEAM_GUC } from '@codaco/studio-sync/rls';

import {
  Database,
  type DatabaseService,
  type DrizzleDatabase,
  MaintenanceDatabase,
  roleFor,
} from './client.ts';

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

/**
 * The open transaction. Provided per transaction and never by a layer, which
 * is the whole of the job queue's transaction guarantee at the type level: an
 * effect that writes a row and enqueues a job cannot run outside a transaction,
 * because `Jobs.enqueue` requires this service and only the scopes below
 * provide it.
 *
 * `sql` and `tx` are the same connection. Routing is by fiber context rather
 * than by value — `SqlClient` reads the fiber's `TransactionConnection`
 * service, and drizzle's `transaction` delegates to `sql.withTransaction`
 * (drizzle `effect-postgres/session.js`) — so carrying them here is a
 * convenience for callers, not the mechanism.
 */
export class Transaction extends Context.Service<
  Transaction,
  {
    readonly tx: DrizzleTransaction;
    readonly sql: SqlClient.SqlClient;
    /** `null` in a maintenance scope, which stamps no team GUC. */
    readonly teamId: string | null;
  }
>()('@studio/db/Transaction') {}

/** The handle drizzle hands a transaction body. */
export type DrizzleTransaction = Parameters<
  Parameters<DrizzleDatabase['transaction']>[0]
>[0];

const TeamAccessBrand: unique symbol = Symbol.for('@studio/db/TeamAccess');

/**
 * Proof that the caller may act within a team, and the only key that opens a
 * tenant transaction. It carries the membership role so a command that needs
 * the tier does not have to ask a second time — but the authoritative check for
 * an administrative action is still the locked re-read inside the command's own
 * transaction, which closes the window between the two.
 */
export type TeamAccess = {
  readonly teamId: string;
  readonly role: string;
  readonly [TeamAccessBrand]: typeof TeamAccessBrand;
};

/**
 * Mints a `TeamAccess`. **Not** a general constructor: `db/__tests__/raw-sql-policy.test.ts`
 * pins its call sites to the five modules named at the top of this file, each
 * of which has just proved a membership. Anywhere else it would be exactly the
 * hole the branded type exists to close.
 *
 * @internal
 */
export const unsafeMakeTeamAccess = (
  teamId: string,
  role: string,
): TeamAccess => ({ teamId, role, [TeamAccessBrand]: TeamAccessBrand });

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
