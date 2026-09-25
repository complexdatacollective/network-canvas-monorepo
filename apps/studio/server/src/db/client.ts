import { PgClient } from '@effect/sql-pg';
import {
  DefaultServices,
  make as makeDrizzle,
} from 'drizzle-orm/effect-postgres';
import { Context, Effect, Layer, Redacted } from 'effect';
import { Reactivity } from 'effect/unstable/reactivity';
import type { SqlError } from 'effect/unstable/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { Environment } from '../env.ts';

// One `DATABASE_URL`, three identities, three service tags (#1927 §9).
//
// `PgClient.layer` occupies the single `PgClient`/`SqlClient` tags, so a
// program that needs two identities — the app role serving requests and the
// maintenance role running the worker — cannot hold both under those tags.
// Each tag below re-tags one client so the identities are separate services.
//
// **One client value per identity per program.** `SqlClient` routes every
// statement by the fiber's `TransactionConnection` service, and that service
// is keyed per `PgClient` instance
// (`effect/unstable/sql/SqlClient.ts` — `TransactionConnection(clientIdCounter++)`).
// A second client built for the same database therefore carries a *different*
// key, so a statement issued through it inside another client's transaction
// silently runs on its own connection — which would defeat the job queue's
// enqueue atomicity without any error. `db/__tests__/tenant.test.ts` pins it.
//
// LIMITATION — fallback A (#1927 §20 Q6). `@effect/sql-pg` 4.0.0-rc.115 has no
// `startupParameters`, so the role cannot be pinned the way a startup
// parameter pins it (a startup parameter survives `RESET ROLE`). Until rc.116
// the role is pinned with `set local role` as the first statement of every
// transaction — see `db/tenant.ts` — which is weaker for a statement run
// outside a transaction. `db/__tests__/raw-sql-policy.test.ts` bounds how many
// of those there can be.

export type DatabaseIdentity = 'app' | 'maintenance' | 'owner';

export type DatabaseConfig = {
  readonly url: string;
  readonly maxConnections?: number | undefined;
  readonly applicationName?: string | undefined;
  /**
   * A schema to resolve unqualified names against, pinned per transaction. The
   * production clients carry none — the server's connections deliberately do
   * not — but the suites provision a scratch schema per file and every Studio
   * table in it is unqualified. This is the `search_path` half of fallback A,
   * which rc.116's `startupParameters` replaces.
   */
  readonly searchPath?: string | undefined;
};

/** The role a given identity runs as; the owner is the connecting login. */
export const roleFor = (identity: DatabaseIdentity): string | null => {
  switch (identity) {
    case 'app':
      return TENANT_ROLES.app;
    case 'maintenance':
      return TENANT_ROLES.maintenance;
    case 'owner':
      return null;
  }
};

/**
 * What every client tag carries. `sql` is the statement client and `db` the
 * drizzle builder over it; both are the *same* connection pool, and drizzle's
 * `transaction` delegates to `sql.withTransaction` (drizzle
 * `effect-postgres/session.js`), which is why a builder transaction and a raw
 * statement inside it share one connection.
 */
export type DatabaseService = {
  readonly identity: DatabaseIdentity;
  readonly sql: PgClient.PgClient;
  readonly db: DrizzleDatabase;
  readonly searchPath: string | null;
};

export type DrizzleDatabase = Effect.Success<ReturnType<typeof makeDrizzle>>;

/** 10 s: an unroutable host otherwise hangs until the OS gives up. */
const CONNECT_TIMEOUT = '10 seconds';

const makeService = (
  identity: DatabaseIdentity,
  config: DatabaseConfig,
  defaultMaxConnections: number,
) =>
  Effect.gen(function* () {
    const sql = yield* PgClient.make({
      url: Redacted.make(config.url),
      maxConnections: config.maxConnections ?? defaultMaxConnections,
      connectTimeout: CONNECT_TIMEOUT,
      applicationName: config.applicationName ?? `studio-${identity}`,
      // No `types` and no name transforms, deliberately: a transform would
      // break the job queue's and better-auth's column names.
    });
    const db = yield* makeDrizzle().pipe(
      Effect.provideService(PgClient.PgClient, sql),
      Effect.provide(DefaultServices),
    );
    return {
      identity,
      sql,
      db,
      searchPath: config.searchPath ?? null,
    } satisfies DatabaseService;
  });

/** The application's client: every transaction runs as the application role. */
export class Database extends Context.Service<Database, DatabaseService>()(
  '@studio/db/Database',
) {
  static readonly layer = (
    config: DatabaseConfig,
  ): Layer.Layer<Database, SqlError.SqlError> =>
    Layer.effect(Database, makeService('app', config, 10)).pipe(
      Layer.provide(Reactivity.layer),
    );

  /** The same client, configured from the process environment. */
  static readonly layerFromEnvironment: Layer.Layer<
    Database,
    SqlError.SqlError,
    Environment
  > = Layer.unwrap(
    Effect.flatMap(Environment, (env) =>
      env.db === undefined
        ? Effect.die(new Error('DATABASE_URL is not set'))
        : Effect.succeed(Database.layer({ url: env.db.url })),
    ),
  );
}

/**
 * The application client a process with **no database** has.
 *
 * Every surface that would reach it has already refused: the auth gate is off
 * without a database, so no procedure that opens a transaction is reachable,
 * and the two public ones that stay reachable — `status` and `setup.complete`
 * — answer from the absent pool before any client is asked for. So this is not
 * a fallback that degrades; it is the shape of a requirement nothing satisfies
 * and nothing asks for, and touching it is a programming error rather than a
 * deployment state.
 *
 * A proxy rather than a layer that fails to build: a process without a
 * database is a supported topology (`programs/serve.ts`'s `withoutDatabase`),
 * and refusing to build the graph would take down the status surface that
 * exists to explain exactly that.
 */
export const DatabaseAbsent: Layer.Layer<Database> = Layer.succeed(Database)(
  new Proxy({} as DatabaseService, {
    get: (_target, property) => {
      throw new Error(
        `this process has no database: nothing may read Database.${String(property)}`,
      );
    },
  }),
);

/** Background work: every transaction runs as the cross-team maintenance role. */
export class MaintenanceDatabase extends Context.Service<
  MaintenanceDatabase,
  DatabaseService
>()('@studio/db/MaintenanceDatabase') {
  static readonly layer = (
    config: DatabaseConfig,
  ): Layer.Layer<MaintenanceDatabase, SqlError.SqlError> =>
    Layer.effect(
      MaintenanceDatabase,
      makeService('maintenance', config, 10),
    ).pipe(Layer.provide(Reactivity.layer));
}

/** The connecting login itself: schema application, reset, and seeding. */
export class OwnerDatabase extends Context.Service<
  OwnerDatabase,
  DatabaseService
>()('@studio/db/OwnerDatabase') {
  static readonly layer = (
    config: DatabaseConfig,
  ): Layer.Layer<OwnerDatabase, SqlError.SqlError> =>
    Layer.effect(OwnerDatabase, makeService('owner', config, 4)).pipe(
      Layer.provide(Reactivity.layer),
    );
}
