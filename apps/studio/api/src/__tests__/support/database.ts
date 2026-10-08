import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Cause,
  Context,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Predicate,
  Result,
  Schema,
} from 'effect';
import type { SqlError, Statement } from 'effect/sql';
import pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { AuditSignal } from '../../audit/signal.ts';
import {
  Database,
  type DatabaseService,
  MaintenanceDatabase,
  OwnerDatabase,
} from '../../db/client.ts';
import { sqlState } from '../../db/errors.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { splitStatements } from '../../db/statements.ts';
import {
  MaintenanceScope,
  TenantScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../../db/tenant.ts';
import { type DbEnv, readEnv } from '../../env.ts';
import { Jobs } from '../../jobs/jobs.ts';
import {
  dropJobSchemaSql,
  jobSchemaGrantsSql,
  jobSchemaSql,
} from '../../jobs/schema.ts';
import { Analytics } from '../../platform/analytics.ts';
import type { StudioServices } from '../../rpc/deps.ts';
import { createSecretsCipher } from '../../secrets/cipher.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { ERASURE_GUC } from '../../study/schema.ts';
import { CI } from './env.ts';
import { reachableDb } from './postgres.ts';
import { scratchSchemaDdl } from './schema-ddl.ts';
import { testDeniedAttempts } from './valkey.ts';

/**
 * Four connections because a case that holds a lock on one and contends for it
 * on another needs two at once, plus room for the drop in the finalizer.
 */
const OWNER_CONNECTIONS = 4;

/**
 * **One** connection for the application client, so "the next transaction on
 * the same pooled connection" is a property of the harness.
 */
const APP_CONNECTIONS = 1;

const MAINTENANCE_CONNECTIONS = 2;

/**
 * Named from the scratch schema so the `studio_test_%` sweep in scripts/apply.ts
 * reclaims it after a crashed run.
 */
const jobSchemaFor = (schema: string): string => `${schema}_ejobs`;

export type TestDatabaseShape = {
  readonly schema: string;
  readonly jobSchema: string;
  readonly app: DatabaseService;
  readonly maintenance: DatabaseService;
  readonly owner: DatabaseService;
  /**
   * `SqlClient` keys its `TransactionConnection` per client instance, so this
   * one cannot see `app`'s open transaction.
   */
  readonly secondApp: DatabaseService;
  readonly onOwner: <A, E, R>(
    body: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqlError.SqlError, R>;
};

export class TestDatabase extends Context.Service<
  TestDatabase,
  TestDatabaseShape
>()('@studio/db/test/TestDatabase') {}

export const testDb: DbEnv | null = await reachableDb();

// `@effect/sql-pg` has no simple-query path (SQLSTATE 42601), and
// dollar-quoted plpgsql bodies would be cut in half by a `;` split.
// Read only on CI: off CI the cache directory survives a schema edit.
let cachedStatements: Promise<readonly string[]> | undefined;

const StatementsCache = Schema.Array(Schema.String);

function statementsCachePath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../node_modules/.cache/studio-api',
    `scratch-schema-${SCHEMA_FINGERPRINT}.statements.json`,
  );
}

async function loadStatements(): Promise<readonly string[]> {
  const path = statementsCachePath();

  if (CI) {
    try {
      const decoded = Schema.decodeUnknownResult(StatementsCache)(
        JSON.parse(await readFile(path, 'utf8')) as unknown,
      );
      if (Result.isSuccess(decoded) && decoded.success.length > 0) {
        return decoded.success;
      }
    } catch {
      // A miss and an unreadable entry are the same thing: render it.
    }
  }

  const statements = splitStatements(await scratchSchemaDdl());

  if (CI) {
    try {
      await mkdir(dirname(path), { recursive: true });
      const pending = `${path}.${process.pid}.pending`;
      await writeFile(pending, JSON.stringify(statements));
      await rename(pending, path);
    } catch {
      // The cache is an optimisation; the statements in hand are verified.
    }
  }

  return statements;
}

function scratchSchemaStatements(): Promise<readonly string[]> {
  // A rejection must not become the memoised answer.
  cachedStatements ??= loadStatements().catch((error: unknown) => {
    cachedStatements = undefined;
    throw error;
  });
  return cachedStatements;
}

const configFor = (
  identity: string,
  db: DbEnv,
  schema: string,
  maxConnections: number,
) => ({
  url: db.url,
  maxConnections,
  applicationName: `studio-test-${identity}`,
  searchPath: schema,
});

const installSchema = Effect.fnUntraced(function* (
  owner: DatabaseService,
  schema: string,
  jobSchema: string,
) {
  const statements = yield* Effect.promise(() => scratchSchemaStatements());
  yield* owner.sql.withTransaction(
    Effect.gen(function* () {
      yield* owner.sql.unsafe(`create schema ${schema}`);
      for (const statement of statements) {
        yield* owner.sql.unsafe(statement);
      }
      yield* owner.sql`insert into "schemaFingerprint" ("fingerprint")
                       values (${SCHEMA_FINGERPRINT})
                       on conflict ("id")
                       do update set "fingerprint" = excluded."fingerprint",
                                     "appliedAt" = CURRENT_TIMESTAMP`;
      for (const statement of [
        ...splitStatements(jobSchemaSql(jobSchema)),
        ...splitStatements(jobSchemaGrantsSql(jobSchema)),
      ]) {
        yield* owner.sql.unsafe(statement);
      }
    }),
  );
});

/**
 * Both schemas are dropped before the pools are: this finalizer is registered
 * after they were built, and finalizers run in reverse.
 */
export const TestDatabaseLive: Layer.Layer<
  Database | MaintenanceDatabase | OwnerDatabase | TestDatabase
> = Layer.effectContext(
  Effect.gen(function* () {
    if (testDb === null) {
      return yield* Effect.die(
        new Error(
          'TestDatabaseLive was built without a reachable database; guard the suite with describe.skipIf(!testDb)',
        ),
      );
    }
    const db = testDb;
    const schema = `studio_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const jobSchema = jobSchemaFor(schema);

    // Built into this layer's own scope rather than provided to an effect,
    // which would close each pool the moment the effect that built it
    // finished.
    const owner = yield* Effect.map(
      Effect.orDie(
        Layer.build(
          OwnerDatabase.layer(
            configFor('owner', db, schema, OWNER_CONNECTIONS),
          ),
        ),
      ),
      (context) => Context.get(context, OwnerDatabase),
    );
    const app = yield* Effect.map(
      Effect.orDie(
        Layer.build(
          Database.layer(configFor('app', db, schema, APP_CONNECTIONS)),
        ),
      ),
      (context) => Context.get(context, Database),
    );
    const secondApp = yield* Effect.map(
      Effect.orDie(
        Layer.build(
          Database.layer(configFor('app-second', db, schema, APP_CONNECTIONS)),
        ),
      ),
      (context) => Context.get(context, Database),
    );
    const maintenance = yield* Effect.map(
      Effect.orDie(
        Layer.build(
          MaintenanceDatabase.layer(
            configFor('maintenance', db, schema, MAINTENANCE_CONNECTIONS),
          ),
        ),
      ),
      (context) => Context.get(context, MaintenanceDatabase),
    );

    yield* Effect.orDie(installSchema(owner, schema, jobSchema));

    yield* Effect.addFinalizer(() =>
      Effect.orDie(
        Effect.gen(function* () {
          yield* owner.sql.unsafe(dropJobSchemaSql(jobSchema));
          yield* owner.sql.unsafe(`drop schema if exists ${schema} cascade`);
        }),
      ),
    );

    const onOwner = <A, E, R>(
      body: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | SqlError.SqlError, R> =>
      owner.sql.withTransaction(body);

    const harness: TestDatabaseShape = {
      schema,
      jobSchema,
      app,
      maintenance,
      owner,
      secondApp,
      onOwner,
    };

    return Context.empty().pipe(
      Context.add(TestDatabase, TestDatabase.of(harness)),
      Context.add(Database, app),
      Context.add(MaintenanceDatabase, maintenance),
      Context.add(OwnerDatabase, owner),
    );
  }),
);

const TestStudioServicesLive: Layer.Layer<
  StudioServices | MaintenanceDatabase | OwnerDatabase | TestDatabase
> = Layer.unwrap(
  Effect.gen(function* () {
    const harness = yield* TestDatabase;
    const keyring = readEnv().secrets;
    return Layer.mergeAll(
      Jobs.layer({ schema: harness.jobSchema }),
      AuditSignal.layer,
      Analytics.layerDisabled,
      testDeniedAttempts,
      keyring === undefined
        ? Layer.succeed(SecretsCipher)(
            new Proxy({} as ReturnType<typeof createSecretsCipher>, {
              get: (_target, property) => {
                throw new Error(
                  `this suite configured no keyring: nothing may read SecretsCipher.${String(property)}`,
                );
              },
            }),
          )
        : Layer.succeed(SecretsCipher)(createSecretsCipher(keyring)),
    );
  }),
).pipe(Layer.provideMerge(TestDatabaseLive));

class TestAppPool extends Context.Service<TestAppPool, pg.Pool>()(
  '@studio/db/test/TestAppPool',
) {}

const TestAppPoolLive: Layer.Layer<TestAppPool, never, TestDatabase> =
  Layer.effect(
    TestAppPool,
    Effect.gen(function* () {
      const harness = yield* TestDatabase;
      if (testDb === null) {
        return yield* Effect.die(new Error('no reachable test database'));
      }
      const url = testDb.url;
      return yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new pg.Pool({
              connectionString: url,
              options: `-c search_path=${harness.schema} -c role=${TENANT_ROLES.app}`,
              max: 20,
              connectionTimeoutMillis: 10_000,
            }),
        ),
        (pool) => Effect.promise(() => pool.end()),
      );
    }),
  );

type TestStudioContext =
  | StudioServices
  | MaintenanceDatabase
  | OwnerDatabase
  | TestDatabase
  | TestAppPool;

export type TestDatabaseRuntime = {
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, TestStudioContext>,
  ) => Promise<A>;
  readonly services: Context.Context<StudioServices>;
  readonly appPool: pg.Pool;
  readonly harness: TestDatabaseShape;
  readonly dispose: () => Promise<void>;
};

export async function openTestDatabase(): Promise<TestDatabaseRuntime> {
  const runtime = ManagedRuntime.make(
    Layer.provideMerge(TestAppPoolLive, TestStudioServicesLive),
  );
  const { services, appPool, harness } = await runtime
    .runPromise(
      Effect.gen(function* () {
        return {
          services: yield* Effect.context<StudioServices>(),
          appPool: yield* TestAppPool,
          harness: yield* TestDatabase,
        };
      }),
    )
    .catch(async (error: unknown) => {
      await runtime.dispose();
      throw error;
    });
  return {
    run: (effect) => runtime.runPromise(effect),
    services,
    appPool,
    harness,
    dispose: () => runtime.dispose(),
  };
}

export const uniqueTeamId = (label: string): string =>
  `${label}-${randomUUID().slice(0, 8)}`;

export const insertTeam = Effect.fnUntraced(function* (teamId: string) {
  const harness = yield* TestDatabase;
  yield* harness.onOwner(
    harness.owner.sql`insert into teams (id, name, slug)
                      values (${teamId}, ${teamId}, ${teamId})
                      on conflict (id) do nothing`,
  );
});

export const dumpSchemaRows = Effect.fnUntraced(function* (
  options: {
    schema?: string;
    omitColumns?: Readonly<Record<string, readonly string[]>>;
  } = {},
) {
  const harness = yield* TestDatabase;
  const { sql } = harness.owner;
  const schema = options.schema ?? harness.schema;
  return yield* harness.onOwner(
    Effect.gen(function* () {
      const tables = yield* sql<{ name: string }>`
        select tablename as name from pg_tables
         where schemaname = ${schema} order by 1`;
      const dump = new Map<string, string[]>();
      for (const { name } of tables) {
        // One comma-joined string rather than an array: the driver cannot
        // type an empty array, and most tables omit nothing.
        const omitted = (options.omitColumns?.[name] ?? []).join(',');
        const rows = yield* sql<{ row: string }>`
          select (to_jsonb(t) - string_to_array(${omitted}, ','))::text as row
            from ${sql(schema)}.${sql(name)} t
           order by 1`;
        dump.set(
          name,
          rows.map((row) => row.row),
        );
      }
      return dump;
    }),
  );
});

function walkCause(error: unknown, visit: (link: object) => void): void {
  let current: unknown = error;
  for (let depth = 0; depth < 32; depth += 1) {
    if (!Predicate.isObject(current)) return;
    if (Cause.isCause(current)) {
      current = Cause.squash(current);
      continue;
    }
    visit(current);
    if (!('cause' in current)) return;
    current = current.cause;
  }
}

function messagesOf(error: unknown): string {
  const parts: string[] = [];
  walkCause(error, (link) => {
    if ('message' in link && Predicate.isString(link.message)) {
      parts.push(link.message);
    }
  });
  return parts.join('\n');
}

function fieldOf(
  error: unknown,
  key: 'constraint' | 'detail',
): string | undefined {
  let found: string | undefined;
  walkCause(error, (link) => {
    if (found !== undefined) return;
    if (key in link) {
      const value: unknown = Reflect.get(link, key);
      if (Predicate.isString(value)) found = value;
    }
  });
  return found;
}

export const NOT_REFUSED = 'no failure';

export type Refusal = {
  readonly state: string;
  readonly constraint: string;
  readonly detail: string;
  readonly message: string;
};

/**
 * Read off the `Exit`'s whole cause: `SqlClient`'s transaction wrapper runs
 * the COMMIT as `Effect.orDie`, so a constraint deferred to commit arrives as
 * a defect.
 */
export const refusalOf = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Refusal, never, R> =>
  Effect.map(Effect.exit(effect), (exit) =>
    Exit.isFailure(exit)
      ? {
          state: sqlState(exit.cause) ?? 'no sqlstate',
          constraint: fieldOf(exit.cause, 'constraint') ?? 'no constraint',
          detail: fieldOf(exit.cause, 'detail') ?? 'no detail',
          message: messagesOf(exit.cause),
        }
      : {
          state: NOT_REFUSED,
          constraint: NOT_REFUSED,
          detail: NOT_REFUSED,
          message: NOT_REFUSED,
        },
  );

/**
 * The development superuser bypasses the row-level security policies but not
 * the triggers.
 */
export const ownerRows = <A extends object = Record<string, unknown>>(
  statement: string,
  params: ReadonlyArray<unknown> = [],
): Effect.Effect<ReadonlyArray<A>, SqlError.SqlError, TestDatabase> =>
  Effect.flatMap(TestDatabase, (harness) =>
    harness.onOwner(harness.owner.sql.unsafe<A>(statement, params)),
  );

const readNow = Schema.decodeUnknownSync(Schema.Struct({ now: Schema.Date }));

/**
 * The database's clock, in epoch milliseconds: the host's `Date.now()` drifts
 * from the database container's.
 */
export const databaseNow: Effect.Effect<
  number,
  SqlError.SqlError,
  TestDatabase
> = Effect.map(ownerRows('select now() as now'), (rows) =>
  readNow(rows[0]).now.getTime(),
);

const readRowCount = Schema.decodeUnknownSync(
  Schema.Struct({ rowCount: Schema.Number }),
);

export const affectedRows = <A extends object>(
  statement: Statement.Statement<A>,
): Effect.Effect<number, SqlError.SqlError> =>
  Effect.map(statement.raw, (result) => readRowCount(result).rowCount);

export const ownerAffected = (
  statement: string,
  params: ReadonlyArray<unknown> = [],
): Effect.Effect<number, SqlError.SqlError, TestDatabase> =>
  Effect.flatMap(TestDatabase, (harness) =>
    harness.onOwner(
      affectedRows(harness.owner.sql.unsafe<object>(statement, params)),
    ),
  );

/**
 * Column names are interpolated, so `row`'s keys must be literals in the suite
 * — never anything derived from data.
 */
export const ownerInsert = (table: string, row: Record<string, unknown>) => {
  const columns = Object.keys(row);
  return ownerAffected(
    `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
    Object.values(row),
  );
};

const ownerAccess = (teamId: string) => unsafeMakeTeamAccess(teamId, 'owner');

const inTenant = <A>(
  teamId: string,
  run: (
    sql: Transaction['Service']['sql'],
  ) => Effect.Effect<A, SqlError.SqlError>,
) =>
  TenantScope.open(
    ownerAccess(teamId),
    Effect.flatMap(Transaction, ({ sql }) => run(sql)),
  );

const inMaintenance = <A>(
  run: (
    sql: Transaction['Service']['sql'],
  ) => Effect.Effect<A, SqlError.SqlError>,
) => MaintenanceScope.open(Effect.flatMap(Transaction, ({ sql }) => run(sql)));

export const tenantRows = <A extends object = Record<string, unknown>>(
  teamId: string,
  statement: string,
  params: ReadonlyArray<unknown> = [],
) => inTenant(teamId, (sql) => sql.unsafe<A>(statement, params));

export const tenantAffected = (
  teamId: string,
  statement: string,
  params: ReadonlyArray<unknown> = [],
) =>
  inTenant(teamId, (sql) =>
    affectedRows(sql.unsafe<object>(statement, params)),
  );

export const maintenanceRows = <A extends object = Record<string, unknown>>(
  statement: string,
  params: ReadonlyArray<unknown> = [],
) => inMaintenance((sql) => sql.unsafe<A>(statement, params));

export const maintenanceAffected = (
  statement: string,
  params: ReadonlyArray<unknown> = [],
) =>
  inMaintenance((sql) => affectedRows(sql.unsafe<object>(statement, params)));

export const erasing = (
  teamId: string,
  participantId: string,
  statement: string,
  params: ReadonlyArray<unknown> = [],
) =>
  inTenant(teamId, (sql) =>
    Effect.andThen(
      sql`select set_config(${ERASURE_GUC}, ${participantId}, true)`,
      affectedRows(sql.unsafe<object>(statement, params)),
    ),
  );
