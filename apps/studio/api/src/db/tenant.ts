import { Effect, Option } from 'effect';
import type { SqlError } from 'effect/sql';

import { TEAM_GUC } from '@codaco/studio-sync/rls';
import {
  type TeamAccess,
  Transaction,
  unsafeMakeTeamAccess,
} from '@codaco/studio-sync/tenant';

import {
  Database,
  type DatabaseService,
  MaintenanceDatabase,
  OwnerDatabase,
} from './client.ts';

// Defined in `@codaco/studio-sync/tenant` and re-exported: a service tag's
// identity is its class, so a second declaration would be a different service.
export { type TeamAccess, Transaction, unsafeMakeTeamAccess };

export type IsolationLevel = 'repeatable read' | 'serializable';

export type ScopeOptions = {
  /**
   * Legal only at the root of a transaction: Postgres refuses `set transaction
   * isolation level` once a statement has run (SQLSTATE 25001).
   */
  readonly isolation?: IsolationLevel | undefined;
};

/**
 * A savepoint shares the outer transaction's session state: a team GUC set in
 * one that is not rolled back outlives it.
 */
const refuseUnsafeNesting = (
  service: DatabaseService,
  teamId: string | null,
  options: ScopeOptions | undefined,
): Effect.Effect<void> =>
  Effect.flatMap(
    Effect.serviceOption(service.sql.transactionService),
    (open) => {
      if (Option.isNone(open)) return Effect.void;
      if (options?.isolation !== undefined) {
        return Effect.die(
          new Error(
            'an isolation level may only be set at the root of a transaction; ' +
              'this scope is nested, and Postgres refuses `set transaction` ' +
              'once the transaction has begun',
          ),
        );
      }
      return Effect.flatMap(Effect.serviceOption(Transaction), (outer) => {
        if (Option.isNone(outer) || outer.value.sql !== service.sql) {
          return Effect.die(
            new Error(
              'a scope nested in a transaction on the same client must be ' +
                'nested in the scope that opened it',
            ),
          );
        }
        if (outer.value.teamId !== teamId) {
          return Effect.die(
            new Error(
              `a scope for team ${JSON.stringify(teamId)} cannot be nested in ` +
                `one for team ${JSON.stringify(outer.value.teamId)}: the savepoint ` +
                'shares the outer transaction’s team setting',
            ),
          );
        }
        return Effect.void;
      });
    },
  );

const openOn = <A, E, R>(
  service: DatabaseService,
  teamId: string | null,
  body: Effect.Effect<A, E, R>,
  options?: ScopeOptions,
): Effect.Effect<A, E | SqlError.SqlError, Exclude<R, Transaction>> =>
  Effect.flatMap(refuseUnsafeNesting(service, teamId, options), () =>
    service.db.transaction(
      (tx) =>
        Effect.provideService(
          Effect.gen(function* () {
            // Before anything reads, so no statement in the body can run
            // unstamped. The role is the connection's own (`client.ts`).
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

export const savepoint = <A, E, R>(
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | SqlError.SqlError, Transaction | R> =>
  Effect.flatMap(Transaction, (open) => open.tx.transaction(() => body));

/** `openTenant` stamps a team because `audit_events` has no maintenance escape. */
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
