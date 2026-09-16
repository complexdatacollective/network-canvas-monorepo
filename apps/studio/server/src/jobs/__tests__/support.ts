import { randomUUID } from 'node:crypto';

import { Context, Effect, Layer } from 'effect';

import {
  createScratchSchema,
  provisionScratchSchema,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import { splitStatements } from '../../db/statements.ts';
import type { DbEnv } from '../../env.ts';
import { JobClock } from '../clock.ts';
import { Database, withTransaction } from '../database.ts';
import { Jobs } from '../jobs.ts';
import {
  dropJobSchemaSql,
  jobSchemaGrantsSql,
  jobSchemaSql,
} from '../schema.ts';
import { JobWorker, type JobWorkerConfig } from '../worker.ts';

// One scratch job schema per suite, with a client per identity. The three
// identities are three `Database` *values* rather than three tags — the spike
// keeps one `Database` tag and one `identity` field, and a program picks which
// one it runs as by providing the service. Stage 3 splits them into
// `Database` / `MaintenanceDatabase` / `OwnerDatabase` for the same reason
// `PgClient.layer` cannot serve two: a tag holds one value.

export type QueueHarnessShape = {
  readonly schema: string;
  readonly app: Database['Service'];
  readonly maintenance: Database['Service'];
  readonly owner: Database['Service'];
};

export class QueueHarness extends Context.Service<
  QueueHarness,
  QueueHarnessShape
>()('@studio/jobs/test/QueueHarness') {}

/**
 * `@effect/sql-pg` refuses every multi-command string with `42601`, so the
 * sidecar is split before it is sent — with stage 2a's dollar-quote-aware
 * splitter, which the `notify_job` trigger's plpgsql body now requires:
 * splitting on `;` would cut it in half.
 */
const installSchema = Effect.fnUntraced(function* (schema: string) {
  const { sql } = yield* Database;
  for (const statement of [
    ...splitStatements(jobSchemaSql(schema)),
    ...splitStatements(jobSchemaGrantsSql(schema)),
  ]) {
    yield* sql.unsafe(statement);
  }
});

const client = (identity: 'app' | 'maintenance' | 'owner', db: DbEnv) =>
  Database.layer(identity, {
    url: db.url,
    maxConnections: 4,
    applicationName: `studio-jobs-spike-${identity}`,
  });

/**
 * A scratch schema with the queue installed, its grants applied, and a client
 * per identity. Dropped when the suite's layer scope closes.
 */
export const layerQueueHarness = (db: DbEnv): Layer.Layer<QueueHarness> =>
  Layer.effect(
    QueueHarness,
    Effect.gen(function* () {
      const schema = `studio_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      // Built into this layer's own scope rather than `Effect.provide`d, which
      // would close each pool the moment the effect that built it finished.
      const build = (identity: 'app' | 'maintenance' | 'owner') =>
        Effect.map(Effect.orDie(Layer.build(client(identity, db))), (context) =>
          Context.get(context, Database),
        );
      const owner = yield* build('owner');
      const app = yield* build('app');
      const maintenance = yield* build('maintenance');

      const asOwner = <A, E>(effect: Effect.Effect<A, E, Database>) =>
        Effect.provideService(effect, Database, owner);

      yield* Effect.orDie(asOwner(withTransaction(installSchema(schema))));

      yield* Effect.addFinalizer(() =>
        Effect.orDie(
          asOwner(
            Effect.flatMap(Database, ({ sql }) =>
              sql.unsafe(dropJobSchemaSql(schema)),
            ),
          ),
        ),
      );

      return QueueHarness.of({ schema, app, maintenance, owner });
    }),
  );

/** Runs an effect as the role that serves requests. */
export const asApp = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, Database> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, Database, harness.app),
  );

/** Runs an effect as the role the worker runs as. */
export const asMaintenance = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, Database> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, Database, harness.maintenance),
  );

/** Runs an effect as the connecting login; the suites' oracle connection. */
export const asOwner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, Database> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, Database, harness.owner),
  );

/** The maintenance client under the `Database` tag, for a worker layer. */
const layerMaintenanceDatabase: Layer.Layer<Database, never, QueueHarness> =
  Layer.effect(
    Database,
    Effect.map(QueueHarness, (harness) => harness.maintenance),
  );

/**
 * The worker as the suites build it: on the maintenance client, with every
 * background fiber unforked unless a case asks for them, so a case drives
 * `drainOnce` and the maintenance passes itself.
 */
export const layerWorker = (
  config: Omit<JobWorkerConfig, 'schema'> = {},
  /**
   * The clock the worker and its enqueues share. Defaults to the uncorrected
   * one `TestClock` drives; a case that wants to *be* a skewed replica passes
   * `JobClock.layerOffset(…)`.
   */
  clock: Layer.Layer<never> = JobClock.layerTest,
): Layer.Layer<JobWorker | Jobs | Database, never, QueueHarness> =>
  Layer.unwrap(
    Effect.map(QueueHarness, (harness) =>
      JobWorker.layer({
        schema: harness.schema,
        background: false,
        ...config,
      }).pipe(
        Layer.provideMerge(Jobs.layer({ schema: harness.schema })),
        Layer.provideMerge(layerMaintenanceDatabase),
        Layer.provide(clock),
      ),
    ),
  );

/** Every row of the queue, read as the owner — neither role may. */
export type JobRow = {
  readonly id: string;
  readonly queue: string;
  readonly state: string;
  readonly policy: string;
  readonly attempts: number;
  readonly payload: unknown;
  readonly singleton_key: string | null;
  /** The retry policy as it was frozen onto the row at enqueue. */
  readonly retry_limit: number;
  readonly retry_delay: number;
  readonly retry_backoff: boolean;
  readonly retry_delay_max: number | null;
  readonly expire_in_seconds: number;
  readonly last_error: string | null;
  readonly outcome: string | null;
  readonly dead_letter_of: string | null;
  /** rc.115 decodes `timestamptz` as epoch milliseconds. */
  readonly run_at: number;
  readonly keep_until: number;
  readonly locked_until: number | null;
  readonly completed_at: number | null;
};

export const readJobs = Effect.fnUntraced(function* (queue?: string) {
  const { schema } = yield* QueueHarness;
  return yield* asOwner(
    Effect.flatMap(
      Database,
      ({ sql }) =>
        sql<JobRow>`
          SELECT id, queue, state, policy, attempts, payload, singleton_key,
                 retry_limit, retry_delay, retry_backoff, retry_delay_max,
                 expire_in_seconds, last_error,
                 outcome, dead_letter_of, run_at, keep_until, locked_until,
                 completed_at
            FROM ${sql(schema)}.jobs
           WHERE ${queue === undefined ? sql.literal('true') : sql`queue = ${queue}`}
           ORDER BY created_at, queue`,
    ),
  );
});

// The delivery suite needs Studio's own schema as well as the queue's, so it
// reuses the pg-based scratch-schema helpers every other Studio suite uses and
// installs the queue into a sibling schema. The pg pools stay available for
// fixtures and oracles; the queue and the handler run on the Effect clients,
// which carry `search_path` so the unqualified Studio tables resolve.

export type DeliveryHarnessShape = QueueHarnessShape & {
  /** The Studio schema these clients resolve unqualified names against. */
  readonly studioSchema: string;
  readonly scratch: ScratchSchema;
};

export class DeliveryHarness extends Context.Service<
  DeliveryHarness,
  DeliveryHarnessShape
>()('@studio/jobs/test/DeliveryHarness') {}

export const layerDeliveryHarness = (
  db: DbEnv,
): Layer.Layer<DeliveryHarness | QueueHarness> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const scratch = yield* Effect.promise(async () => {
        const created = await createScratchSchema(db);
        await provisionScratchSchema(created.pool);
        return created;
      });
      const studioSchema = yield* Effect.promise(async () => {
        const { rows } = await scratch.pool.query<{ schema: string }>(
          'select current_schema() as schema',
        );
        return rows[0]!.schema;
      });
      // A sibling of the Studio schema, named so the `studio_test_%` sweep in
      // scripts/apply.ts reclaims it after a crashed run — the same rule
      // pg-boss's scratch schema follows.
      const schema = `${studioSchema}_ejobs`;

      const build = (identity: 'app' | 'maintenance' | 'owner') =>
        Effect.map(
          Effect.orDie(
            Layer.build(
              Database.layer(identity, {
                url: db.url,
                maxConnections: 6,
                applicationName: `studio-jobs-spike-${identity}`,
                searchPath: studioSchema,
              }),
            ),
          ),
          (context) => Context.get(context, Database),
        );
      const owner = yield* build('owner');
      const app = yield* build('app');
      const maintenance = yield* build('maintenance');

      yield* Effect.orDie(
        Effect.provideService(
          withTransaction(installSchema(schema)),
          Database,
          owner,
        ),
      );

      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          await scratch.dispose();
        }),
      );

      const shape: DeliveryHarnessShape = {
        schema,
        studioSchema,
        app,
        maintenance,
        owner,
        scratch,
      };
      return Context.make(DeliveryHarness, DeliveryHarness.of(shape)).pipe(
        Context.add(QueueHarness, QueueHarness.of(shape)),
      );
    }),
  );
