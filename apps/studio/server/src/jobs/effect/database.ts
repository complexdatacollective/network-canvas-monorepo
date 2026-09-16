import { PgClient } from '@effect/sql-pg';
import { Context, Effect, Layer, Redacted } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import type { SqlClient, SqlError } from 'effect/unstable/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

// The `Database` and `Transaction` seam of #1927 §4, reduced to what the job
// spike needs. The names and shapes are the ones stage 3 will own, so the
// queue below slots into that stage rather than inventing a second vocabulary
// for the same two things.
//
// `PgClient.layer` occupies the single `PgClient`/`SqlClient` tags, so a
// program that needs two identities — the app role serving requests and the
// maintenance role running the worker — cannot hold both under those tags.
// `Database` re-tags one client so each identity is a separate service, which
// is what §9's "one client value per identity per program" means.
//
// SPIKE LIMITATION: `@effect/sql-pg` 4.0.0-rc.115 has no `startupParameters`,
// so the role cannot be pinned the way src/db/pool.ts pins it (a startup
// parameter survives RESET ROLE). Until rc.116 the role is pinned with
// `set local role` as the first statement of every transaction, which is
// weaker: a statement run outside a transaction runs as the connecting login.
// Everything the queue does runs inside a transaction, so the gap is real but
// unexercised here.

export type DatabaseIdentity = 'app' | 'maintenance' | 'owner';

export type DatabaseConfig = {
  readonly url: string;
  readonly maxConnections?: number | undefined;
  readonly applicationName?: string | undefined;
};

/** The role a given identity runs as; the owner is the connecting login. */
const roleFor = (identity: DatabaseIdentity): string | null => {
  switch (identity) {
    case 'app':
      return TENANT_ROLES.app;
    case 'maintenance':
      return TENANT_ROLES.maintenance;
    case 'owner':
      return null;
  }
};

export class Database extends Context.Service<
  Database,
  {
    readonly identity: DatabaseIdentity;
    readonly sql: PgClient.PgClient;
  }
>()('@studio/jobs/effect/Database') {
  static readonly layer = (
    identity: DatabaseIdentity,
    config: DatabaseConfig,
  ): Layer.Layer<Database, SqlError.SqlError> =>
    Layer.effect(
      Database,
      Effect.map(
        PgClient.make({
          url: Redacted.make(config.url),
          maxConnections: config.maxConnections ?? 10,
          applicationName: config.applicationName ?? `studio-${identity}`,
        }),
        (sql) => Database.of({ identity, sql }),
      ),
    ).pipe(Layer.provide(Reactivity.layer));
}

/**
 * The open transaction, provided per transaction and never by a layer — which
 * is the whole of the transaction guarantee at the type level: an effect that
 * writes a row and enqueues a job cannot be run outside one, because `Jobs`
 * requires this service and nothing but `withTransaction` provides it.
 *
 * `sql` is the same client value `Database` carries. Routing is by fiber
 * context rather than by value (`SqlClient` reads `TransactionConnection` off
 * the fiber), so carrying it here is a convenience for handlers, not the
 * mechanism.
 */
export class Transaction extends Context.Service<
  Transaction,
  {
    readonly sql: SqlClient.SqlClient;
    readonly teamId: string | null;
  }
>()('@studio/jobs/effect/Transaction') {}

/** `set local role`, the rc.115 stand-in for a `role` startup parameter. */
const pinRole = (
  sql: SqlClient.SqlClient,
  identity: DatabaseIdentity,
): Effect.Effect<void, SqlError.SqlError> => {
  const role = roleFor(identity);
  // A role name is not a bindable parameter; these two come from a constant
  // this module owns, never from a caller.
  return role === null
    ? Effect.void
    : Effect.asVoid(sql.unsafe(`set local role ${role}`));
};

/**
 * One transaction on the identity's client, with `Transaction` provided to the
 * body. Nested calls are savepoints on the same connection (SqlClient.ts
 * `makeWithTransaction`), which is what makes a handler's inner transaction
 * safe to open under an outer one.
 */
export const withTransaction = <A, E, R>(
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SqlError.SqlError,
  Database | Exclude<R, Transaction>
> =>
  Database.use(({ identity, sql }) =>
    sql.withTransaction(
      Effect.provideService(
        Effect.flatMap(pinRole(sql, identity), () => body),
        Transaction,
        Transaction.of({ sql, teamId: null }),
      ),
    ),
  );

/**
 * The tenant form: the same transaction with `app.team_id` stamped for the
 * length of it, which is what every row-level-security policy reads
 * (studio-sync/src/rls.ts). Bound rather than interpolated.
 */
export const withTenantTransaction = <A, E, R>(
  teamId: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | SqlError.SqlError,
  Database | Exclude<R, Transaction>
> =>
  Database.use(({ identity, sql }) =>
    sql.withTransaction(
      Effect.provideService(
        Effect.gen(function* () {
          yield* pinRole(sql, identity);
          yield* sql`select set_config('app.team_id', ${teamId}, true)`;
          return yield* body;
        }),
        Transaction,
        Transaction.of({ sql, teamId }),
      ),
    ),
  );
