import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context, Effect, Layer, Result, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import {
  Database,
  type DatabaseService,
  MaintenanceDatabase,
  OwnerDatabase,
} from '../../db/client.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { splitStatements } from '../../db/statements.ts';
import type { DbEnv } from '../../env.ts';
import {
  dropJobSchemaSql,
  jobSchemaGrantsSql,
  jobSchemaSql,
} from '../../jobs/schema.ts';
import { CI } from './env.ts';
import { reachableDb } from './postgres.ts';
import { scratchSchemaDdl } from './schema-ddl.ts';

// The Effect-shaped scratch-schema harness: one schema per suite, with the
// three stage-3 clients over it (#1927 section 9). It is the successor to
// `support/postgres.ts`, whose pools carry `options=-c search_path=...` on the
// connection string — a startup parameter `@effect/sql-pg` 4.0.0-rc.115 cannot
// set at all, and one `env/resolve.ts` refuses in `DATABASE_URL` because it
// would also unpin the role.
//
// The stand-in is fallback A's `search_path` half: each client is configured
// with `DatabaseConfig.searchPath`, and `db/tenant.ts`'s `pinSession` emits
// `set local search_path to <schema>` as the second statement of every
// transaction it opens. Everything this file runs outside those scopes — the
// schema apply, the fixtures, the oracle reads — pins the same search path
// itself, through `onOwner`.
//
// The node-postgres harness stays: about forty suites still build their pools
// from it, and they move file by file.

/**
 * The connecting login's pool, which provisions, seeds and reads oracles.
 * Four connections because a case that holds a lock on one and contends for it
 * on another needs two at once, plus room for the drop in the finalizer.
 */
const OWNER_CONNECTIONS = 4;

/**
 * **One** connection for the application client, so "the next transaction on
 * the same pooled connection" is a property of the harness rather than of
 * whichever connection the pool happened to hand back — `tenant.test.ts` reads
 * the transaction-local team GUC across two transactions and proves it is the
 * same backend. A case that needs a second application connection builds one:
 * `secondApp` is exactly that, and it is a separate client for the separate
 * reason `client.ts` documents.
 */
const APP_CONNECTIONS = 1;

const MAINTENANCE_CONNECTIONS = 2;

/**
 * The job queue installs into a schema of its own, so every scratch schema
 * gets a sibling — the same shape a deployed database has. Named from the
 * scratch schema so the `studio_test_%` sweep in scripts/apply.ts reclaims it
 * after a crashed run.
 */
const jobSchemaFor = (schema: string): string => `${schema}_ejobs`;

export type TestDatabaseShape = {
  /** The scratch schema every unqualified name in the suite resolves to. */
  readonly schema: string;
  /** Its job sibling, installed exactly as `jobs/__tests__/support.ts` does. */
  readonly jobSchema: string;
  /** The application client: `Database`, and what `TenantScope` opens on. */
  readonly app: DatabaseService;
  /** The worker's client: `MaintenanceDatabase`. */
  readonly maintenance: DatabaseService;
  /** The connecting login: `OwnerDatabase`, and the suites' oracle. */
  readonly owner: DatabaseService;
  /**
   * A second application client over the same database, built independently of
   * `app`. `SqlClient` keys its `TransactionConnection` per client instance,
   * so this one cannot see `app`'s open transaction — which is the invariant
   * `db/__tests__/tenant.test.ts` pins.
   */
  readonly secondApp: DatabaseService;
  /**
   * One transaction as the connecting login, with the scratch schema pinned.
   * There is no `OwnerScope` — the owner is not a tenant identity and stamps
   * no team — so fixtures and oracles go through this.
   */
  readonly onOwner: <A, E, R>(
    body: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | SqlError.SqlError, R>;
};

export class TestDatabase extends Context.Service<
  TestDatabase,
  TestDatabaseShape
>()('@studio/db/test/TestDatabase') {}

/**
 * The development database, probed once per worker. `null` means no local
 * Postgres, which off CI is a suite to skip and on CI is a thrown failure —
 * `reachableDb` decides which. Suites guard with `describe.skipIf(!testDb)`.
 */
export const testDb: DbEnv | null = await reachableDb();

// The scratch schema's DDL, already cut into single commands.
//
// `@effect/sql-pg` has no simple-query path, so nothing multi-command can
// reach the driver (SQLSTATE 42601) — and several statements carry
// dollar-quoted plpgsql bodies that splitting on `;` would cut in half, which
// is why it goes through `splitStatements` rather than a `;` split.
//
// Cached as a JSON array addressed by `SCHEMA_FINGERPRINT`, for the reason
// `support/schema-ddl.ts` caches the unsplit bytes: a hit keeps drizzle-kit's
// module graph out of the worker entirely, so CI's cost stays flat as files
// are added. Read only on CI, where the cache directory is empty when a run
// starts and every entry is therefore written by a process in that same run —
// which is what makes the entry trustworthy, since a miss renders from live
// source through `scratchSchemaDdl()` and that is where the fingerprint is
// verified. Off CI the directory survives a schema edit, so nothing is read.
let cachedStatements: Promise<readonly string[]> | undefined;

const StatementsCache = Schema.Array(Schema.String);

function statementsCachePath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../node_modules/.cache/studio-server',
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
  // A rejection must not become the memoised answer: every later caller in
  // this worker would replay the one failure instead of retrying.
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

/**
 * The whole apply, in one transaction: a failure leaves no half-built schema
 * behind, which is what `scripts/apply.ts` gets for free from a multi-command
 * simple query and this path has to ask for.
 */
const installSchema = Effect.fnUntraced(function* (
  owner: DatabaseService,
  schema: string,
  jobSchema: string,
) {
  const statements = yield* Effect.promise(() => scratchSchemaStatements());
  yield* owner.sql.withTransaction(
    Effect.gen(function* () {
      yield* owner.sql.unsafe(`create schema ${schema}`);
      yield* owner.sql.unsafe(`set local search_path to ${schema}`);
      for (const statement of statements) {
        yield* owner.sql.unsafe(statement);
      }
      // The same stamp `provisionScratchSchema` writes, so a suite that reads
      // the schema state sees a current database rather than an unstamped one.
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
 * A scratch schema, its job sibling, and the four clients over them. Both
 * schemas are dropped when the suite's layer scope closes — before the pools
 * are, because this finalizer is registered after they were built and
 * finalizers run in reverse.
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
      owner.sql.withTransaction(
        Effect.flatMap(
          owner.sql.unsafe(`set local search_path to ${schema}`),
          () => body,
        ),
      );

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
