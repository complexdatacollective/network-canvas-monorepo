import { PgClient } from '@effect/sql-pg';
import {
  DefaultServices,
  make as makeDrizzle,
} from 'drizzle-orm/effect-postgres';
import { Context, Effect, Layer, Redacted } from 'effect';
import { Reactivity } from 'effect/reactivity';
import type { SqlError } from 'effect/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { Environment } from '../env.ts';
import { readPasswordFile } from '../env/resolve.ts';

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
// (`effect/sql/SqlClient.ts` — `TransactionConnection(clientIdCounter++)`).
// A second client built for the same database therefore carries a *different*
// key, so a statement issued through it inside another client's transaction
// silently runs on its own connection — which would defeat the job queue's
// enqueue atomicity without any error. `db/__tests__/tenant.test.ts` pins it.
//
// **The role is a startup parameter** (#1927 §20 Q6). Every physical
// connection a client opens, pooled replacements included, sends its
// identity's role in the startup packet, so every statement on it runs as that
// role, inside a transaction or not, and `RESET ROLE` returns to it rather than
// to the login. A login that may not assume the role is refused at connect.

export type DatabaseIdentity = 'app' | 'maintenance' | 'owner';

export type DatabaseConfig = {
  readonly url: string;
  readonly maxConnections?: number | undefined;
  readonly applicationName?: string | undefined;
  /**
   * A schema to resolve unqualified names against, sent as the `search_path`
   * startup parameter. The production clients carry none — the server's
   * connections deliberately do not — but the suites provision a scratch
   * schema per file and every Studio table in it is unqualified.
   */
  readonly searchPath?: string | undefined;
  /** Sent as the `statement_timeout` startup parameter, e.g. `'5s'`. */
  readonly statementTimeout?: string | undefined;
  /** Reread for every new connection, so a rotated password needs no restart. */
  readonly passwordFile?: string | undefined;
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
};

export type DrizzleDatabase = Effect.Success<ReturnType<typeof makeDrizzle>>;

const passwordFrom = (passwordFile: string) =>
  Effect.sync(() => Redacted.make(readPasswordFile(passwordFile)));

/** 10 s: an unroutable host otherwise hangs until the OS gives up. */
const CONNECT_TIMEOUT = '10 seconds';

const makeService = (
  identity: DatabaseIdentity,
  config: DatabaseConfig,
  defaultMaxConnections: number,
) =>
  Effect.gen(function* () {
    const role = roleFor(identity);
    const sql = yield* PgClient.make({
      url: Redacted.make(config.url),
      ...(config.passwordFile === undefined
        ? {}
        : { password: passwordFrom(config.passwordFile) }),
      maxConnections: config.maxConnections ?? defaultMaxConnections,
      connectTimeout: CONNECT_TIMEOUT,
      applicationName: config.applicationName ?? `studio-${identity}`,
      startupParameters: {
        ...(role === null ? {} : { role }),
        ...(config.searchPath === undefined
          ? {}
          : { search_path: config.searchPath }),
        ...(config.statementTimeout === undefined
          ? {}
          : { statement_timeout: config.statementTimeout }),
      },
      // No `types` and no name transforms, deliberately: a transform would
      // break the job queue's and better-auth's column names.
    });
    const db = yield* makeDrizzle().pipe(
      Effect.provideService(PgClient.PgClient, sql),
      Effect.provide(DefaultServices),
    );
    return { identity, sql, db } satisfies DatabaseService;
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
        : Effect.succeed(Database.layer(env.db)),
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

/**
 * The readiness probes' own connection, as the process's identity. A probe
 * that times out behind a migration's lock keeps its statement running on the
 * server; on a client of its own it cannot take a connection a request needs.
 */
export class ReadinessDatabase extends Context.Service<
  ReadinessDatabase,
  DatabaseService
>()('@studio/db/ReadinessDatabase') {
  static readonly layer = (
    identity: 'app' | 'maintenance',
    config: DatabaseConfig,
  ): Layer.Layer<ReadinessDatabase, SqlError.SqlError> =>
    Layer.effect(
      ReadinessDatabase,
      makeService(
        identity,
        {
          statementTimeout: '5s',
          applicationName: `studio-${identity}-readiness`,
          ...config,
          maxConnections: 1,
        },
        1,
      ),
    ).pipe(Layer.provide(Reactivity.layer));
}
