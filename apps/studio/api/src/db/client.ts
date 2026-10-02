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

// One client value per identity per program: `SqlClient` keys
// `TransactionConnection` per client, so a statement through a second client
// inside another's transaction silently runs on its own connection.

export type DatabaseIdentity = 'app' | 'maintenance' | 'owner';

export type DatabaseConfig = {
  readonly url: string;
  readonly maxConnections?: number | undefined;
  readonly applicationName?: string | undefined;
  readonly searchPath?: string | undefined;
  readonly statementTimeout?: string | undefined;
  readonly passwordFile?: string | undefined;
};

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

export type DatabaseService = {
  readonly identity: DatabaseIdentity;
  readonly sql: PgClient.PgClient;
  readonly db: DrizzleDatabase;
};

export type DrizzleDatabase = Effect.Success<ReturnType<typeof makeDrizzle>>;

const passwordFrom = (passwordFile: string) =>
  Effect.sync(() => Redacted.make(readPasswordFile(passwordFile)));

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

export class Database extends Context.Service<Database, DatabaseService>()(
  '@studio/db/Database',
) {
  static readonly layer = (
    config: DatabaseConfig,
  ): Layer.Layer<Database, SqlError.SqlError> =>
    Layer.effect(Database, makeService('app', config, 10)).pipe(
      Layer.provide(Reactivity.layer),
    );

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
 * A proxy rather than a layer that fails to build: a process without a
 * database is a supported topology, and refusing to build would take down its
 * status surface.
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
