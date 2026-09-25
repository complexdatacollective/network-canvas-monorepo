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
import type { SqlError, Statement } from 'effect/unstable/sql';
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
import type { StudioServices } from '../../rpc/deps.ts';
import { createSecretsCipher } from '../../secrets/cipher.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { ERASURE_GUC } from '../../study/schema.ts';
import { CI } from './env.ts';
import { reachableDb } from './postgres.ts';
import { scratchSchemaDdl } from './schema-ddl.ts';
import { testDeniedAttempts } from './valkey.ts';

// The scratch-schema harness: one schema per suite, with the three stage-3
// clients over it (#1927 section 9). It replaced a node-postgres harness whose
// pools carried `options=-c search_path=...` on the connection string — a
// startup parameter `@effect/sql-pg` 4.0.0-rc.115 cannot set at all, and one
// `env/resolve.ts` refuses in `DATABASE_URL` because it would also unpin the
// role.
//
// The stand-in is fallback A's `search_path` half: each client is configured
// with `DatabaseConfig.searchPath`, and `db/tenant.ts`'s `pinSession` emits
// `set local search_path to <schema>` as the second statement of every
// transaction it opens. Everything this file runs outside those scopes — the
// schema apply, the fixtures, the oracle reads — pins the same search path
// itself, through `onOwner`.
//
// `support/postgres.ts` keeps what is not a scratch schema: the reachability
// probe, and the scratch *databases* the process suites point child processes
// at by URL.

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
      // The stamp `applySchema` writes, so a suite that reads the schema state
      // sees a current database rather than an unstamped one.
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

/**
 * What `createStudio` takes, over this suite's scratch schema: the job queue on
 * its job sibling, the operator signal, the process cipher and the audit
 * denial window over the process's store, beside the clients
 * `TestDatabaseLive` already provides. The production wiring with only the two
 * schema names changed.
 *
 * With no keyring configured the cipher is a proxy that throws on first use,
 * so a suite that never seals anything needs none, and one that does fails
 * with a sentence rather than a missing service.
 */
const TestStudioServicesLive: Layer.Layer<
  StudioServices | MaintenanceDatabase | OwnerDatabase | TestDatabase
> = Layer.unwrap(
  Effect.gen(function* () {
    const harness = yield* TestDatabase;
    const keyring = readEnv().secrets;
    return Layer.mergeAll(
      Jobs.layer({ schema: harness.jobSchema }),
      AuditSignal.layer,
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

/**
 * A node-postgres pool over the scratch schema, as the application role.
 *
 * Only for what still runs on node-postgres: the surfaces `createApp` hands a
 * pool to — the readiness probe, and the `requirePool` assertion on the rpc
 * plane. better-auth is not one of them since stage 4: it runs on
 * `auth/adapter.ts` over the Effect client. Everything else in a suite goes
 * through the Effect clients. The search path rides the
 * connection options, as `support/postgres.ts`'s pools did, because this pool
 * opens no scope to pin it in.
 */
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
  /** Runs one effect against this suite's scratch schema and its services. */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, TestStudioContext>,
  ) => Promise<A>;
  /** What `createStudio`/`createApp` take as `services`. */
  readonly services: Context.Context<StudioServices>;
  /** See `TestAppPool`. */
  readonly appPool: pg.Pool;
  readonly harness: TestDatabaseShape;
  readonly dispose: () => Promise<void>;
};

/**
 * `TestStudioServicesLive` for a suite driven from promises — one that builds a
 * `Studio` and talks to it through `createRpcClient` or `app.request`, where
 * wrapping every call in `Effect.promise` would say nothing a `beforeAll`
 * does not. The same scratch schema and the same clients as `layer(…)` gives
 * a suite whose cases are Effects; `dispose` drops both schemas.
 */
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
      // A schema that failed to provision still holds pools; close them.
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

/** A team id no other case in the run will pick. */
export const uniqueTeamId = (label: string): string =>
  `${label}-${randomUUID().slice(0, 8)}`;

/** A bare team row, as the connecting login; a second call is a no-op. */
export const insertTeam = Effect.fnUntraced(function* (teamId: string) {
  const harness = yield* TestDatabase;
  yield* harness.onOwner(
    harness.owner.sql`insert into teams (id, name, slug)
                      values (${teamId}, ${teamId}, ${teamId})
                      on conflict (id) do nothing`,
  );
});

/**
 * Every row of every table in the scratch schema, rendered as text and sorted
 * within each table — so two dumps of the same data compare equal whatever
 * order Postgres hands rows back in, and a search over one covers everything
 * stored.
 *
 * Driven off `pg_tables` rather than a list, for the reason the seed's own
 * wipe is: a table added later is in the dump without anyone remembering to
 * add it. Rows go through `to_jsonb` so a column can be left out
 * (`omitColumns`), which `t::text` cannot express.
 */
export const dumpSchemaRows = Effect.fnUntraced(function* (
  options: {
    /** Defaults to the scratch schema; the job sibling is `harness.jobSchema`. */
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

/** Visits each link down a failure's cause chain, through `Cause` wrappers. */
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

/** Every message down the chain, joined: a trigger's own words are at the end. */
function messagesOf(error: unknown): string {
  const parts: string[] = [];
  walkCause(error, (link) => {
    if ('message' in link && Predicate.isString(link.message)) {
      parts.push(link.message);
    }
  });
  return parts.join('\n');
}

/** The first `string` value of `key` anywhere down the chain. */
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

/** Every field of a `Refusal` when the statement was not refused at all. */
export const NOT_REFUSED = 'no failure';

export type Refusal = {
  /** The SQLSTATE, read through the chain by `db/errors.ts`. */
  readonly state: string;
  /** The constraint the backend named, for a CHECK, unique or foreign key. */
  readonly constraint: string;
  /** The backend's DETAIL line, which names the row a foreign key could not find. */
  readonly detail: string;
  /** Every message down the chain, which is where a trigger's words arrive. */
  readonly message: string;
};

/**
 * What Postgres said when it refused a statement, captured in one run so a case
 * that reads two of these fields does not issue the statement twice — and
 * `NOT_REFUSED` in every field when it was admitted, so a case that stops
 * refusing fails on the value rather than passing vacuously.
 *
 * Read off the `Exit`'s whole cause rather than through `Effect.result`:
 * `SqlClient`'s transaction wrapper runs the COMMIT as `Effect.orDie`, so a
 * constraint deferred to commit arrives as a defect, which `Effect.result`
 * leaves untouched.
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
 * One raw statement as the connecting login, in a transaction of its own — the
 * way each `pool.query` was. The development superuser bypasses the row-level
 * security policies but not the triggers: the fixture tool and the cross-team
 * oracle. Role-sensitive probes open a `TenantScope` or a `MaintenanceScope`.
 *
 * Rows come back as `@effect/sql-pg` rc.115 decodes them, not as node-postgres
 * did: a raw `timestamptz` is epoch milliseconds, `int8` and an uncast
 * `count(*)` are `bigint`, and a `date` is a string (#1927 §20 Q6).
 */
export const ownerRows = <A extends object = Record<string, unknown>>(
  statement: string,
  params: ReadonlyArray<unknown> = [],
): Effect.Effect<ReadonlyArray<A>, SqlError.SqlError, TestDatabase> =>
  Effect.flatMap(TestDatabase, (harness) =>
    harness.onOwner(harness.owner.sql.unsafe<A>(statement, params)),
  );

const readNow = Schema.decodeUnknownSync(Schema.Struct({ now: Schema.Number }));

/**
 * The database's clock, in epoch milliseconds (rc.115 decodes a raw
 * `timestamptz` as a number), read in a transaction of its own.
 *
 * What a case asserting "stamped no earlier than now" compares against. The
 * host's `Date.now()` is the wrong clock for that: the database runs in a
 * container whose clock drifts from the host's by milliseconds, so a default
 * stamped a moment later can still read as earlier than the host's reading. A
 * later transaction's `now()` is never earlier than this one's.
 */
export const databaseNow: Effect.Effect<
  number,
  SqlError.SqlError,
  TestDatabase
> = Effect.map(
  ownerRows('select now() as now'),
  (rows) => readNow(rows[0]).now,
);

const readRowCount = Schema.decodeUnknownSync(
  Schema.Struct({ rowCount: Schema.Number }),
);

/**
 * How many rows a statement affected. An INSERT, UPDATE or DELETE with no
 * RETURNING hands back no rows, so the count node-postgres reported on
 * `pg.Result` is read off the driver's own result instead, decoded rather than
 * trusted.
 */
export const affectedRows = <A extends object>(
  statement: Statement.Statement<A>,
): Effect.Effect<number, SqlError.SqlError> =>
  Effect.map(statement.raw, (result) => readRowCount(result).rowCount);

/** `ownerRows`, counting the rows affected rather than returning them. */
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
 * One raw INSERT of `row` into `table` as the connecting login, returning how
 * many rows it wrote. Column names are interpolated, so `row`'s keys must be
 * literals in the suite — never anything derived from data.
 */
export const ownerInsert = (table: string, row: Record<string, unknown>) => {
  const columns = Object.keys(row);
  return ownerAffected(
    `INSERT INTO ${table} (${columns.map((name) => `"${name}"`).join(', ')})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
    Object.values(row),
  );
};

/**
 * The membership a tenant scope stands for. A schema suite has no command to
 * prove one, so it mints the access a command would have checked.
 */
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

/** One raw statement on the application client, in `teamId`'s own tenant transaction. */
export const tenantRows = <A extends object = Record<string, unknown>>(
  teamId: string,
  statement: string,
  params: ReadonlyArray<unknown> = [],
) => inTenant(teamId, (sql) => sql.unsafe<A>(statement, params));

/** `tenantRows`, counting the rows affected. */
export const tenantAffected = (
  teamId: string,
  statement: string,
  params: ReadonlyArray<unknown> = [],
) =>
  inTenant(teamId, (sql) =>
    affectedRows(sql.unsafe<object>(statement, params)),
  );

/** One raw statement on the maintenance client, in a transaction of its own. */
export const maintenanceRows = <A extends object = Record<string, unknown>>(
  statement: string,
  params: ReadonlyArray<unknown> = [],
) => inMaintenance((sql) => sql.unsafe<A>(statement, params));

/** `maintenanceRows`, counting the rows affected. */
export const maintenanceAffected = (
  statement: string,
  params: ReadonlyArray<unknown> = [],
) =>
  inMaintenance((sql) => affectedRows(sql.unsafe<object>(statement, params)));

/**
 * One raw statement in `teamId`'s tenant transaction under the erasure marker
 * for `participantId`: the transaction-local GUC (`ERASURE_GUC`) the
 * participant-delete guards in `study/schema.ts` and its dependants read. No
 * command sets it yet; the suites stand in for the one that will. Counts the
 * rows affected.
 */
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
