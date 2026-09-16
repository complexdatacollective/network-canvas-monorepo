// The worker process's pg-boss: that it never installs or migrates a schema,
// which role it runs as, that a notify-enabled queue does not wait out a poll,
// and that closing its scope — which is what a container stop does — lets an
// in-flight job finish.
//
// The layers are composed here rather than through `scratch.createJobWorker`,
// because the layer API is what is under test: the harness is one composition
// of it, and a case driven through the harness could not tell a broken layer
// from a harness that worked around it.
import { describe, expect, it } from '@effect/vitest';
import { Context, Effect, Exit, Layer, Logger, Scope } from 'effect';
import { afterAll, beforeAll, vi } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import { settlesWithin } from '../../__tests__/support/timing.ts';
import { DatabasePool } from '../../db/database-pool.ts';
import { type DbEnv, Environment, type StudioEnv } from '../../env.ts';
import { MailFailed, Mailer, type StudioMailer } from '../../mail/mailer.ts';
import { SchemaStatus } from '../../platform/schema-gate.ts';
import type { JobClient } from '../client.ts';
import { jobQueueDefinitions } from '../queues.ts';
import { JobHandlersLive } from '../registrations.ts';
import { JobWorker, jobWorkerConfig } from '../worker.ts';

const db = await reachableDb();

/** Long enough for a graceful stop a scratch worker asks for (2 s). */
const STOP_BUDGET_MS = 10_000;

/**
 * The window a worker built here gives an in-flight handler. Production asks
 * for 25 seconds, which is most of a container's stop window and nearly all of
 * this suite's 30-second hook timeout: a case whose handler is deliberately
 * slow would spend the whole window in teardown and fail the file there rather
 * than at the assertion that went wrong.
 */
const STOP_TIMEOUT_MS = 2000;

/** Enough that pg-boss's own polling floor (500ms) is what a case waits on. */
const INTERVALS = {
  superviseIntervalSeconds: 1,
  maintenanceIntervalSeconds: 1,
  monitorIntervalSeconds: 1,
  queueCacheIntervalSeconds: 1,
  cronMonitorIntervalSeconds: 1,
  cronWorkerIntervalSeconds: 1,
  clockMonitorIntervalSeconds: 1,
};

const silentMailer: StudioMailer = {
  sendMagicLink: () => Promise.resolve(),
  sendTeamInvitation: () => Promise.resolve(),
};

function environment(scratchDb: DbEnv, mailer?: StudioMailer): StudioEnv {
  return {
    port: 3000,
    host: '127.0.0.1',
    workerHealthPort: 3001,
    s3: undefined,
    db: scratchDb,
    auth: {
      secret: 'worker-suite-signing-secret',
      baseUrl: 'http://localhost:3000',
      trustedProxies: undefined,
      socialProviders: {},
    },
    // What `resolve` produces for a worker with and without SMTP_URL set; the
    // registrations read it to decide whether to work the mail queues.
    mail: mailer ? { kind: 'console' } : { kind: 'refuse' },
    secrets: undefined,
    redis: undefined,
    trustedProxies: undefined,
    devDefaults: true,
    telemetry: false,
    telemetryEndpoint: undefined,
    deploymentMode: 'self-hosted',
    seedAdminPassword: undefined,
  };
}

function mailerLayer(mailer: StudioMailer | undefined): Layer.Layer<Mailer> {
  if (!mailer) return Mailer.layerRefuse;
  return Layer.succeed(
    Mailer,
    Mailer.of({
      sendMagicLink: (input) =>
        Effect.tryPromise({
          try: () => mailer.sendMagicLink(input),
          catch: (cause) => new MailFailed({ cause }),
        }),
      sendTeamInvitation: (input) =>
        Effect.tryPromise({
          try: () => mailer.sendTeamInvitation(input),
          catch: (cause) => new MailFailed({ cause }),
        }),
    }),
  );
}

describe.skipIf(!db)('the job worker layers', () => {
  let scratch: ScratchSchema;
  let jobs: JobClient;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    jobs = await scratch.createJobClient();
  });

  afterAll(async () => {
    await scratch.dispose();
  });

  /** Everything a worker process builds, over one scratch schema. */
  const workerLayer = (
    on: ScratchSchema,
    scratchDb: DbEnv,
    options: {
      mailer?: StudioMailer;
      workPollingIntervalSeconds?: number;
      lines?: string[];
    } = {},
  ) =>
    JobHandlersLive({
      workPollingIntervalSeconds: options.workPollingIntervalSeconds,
    }).pipe(
      Layer.provideMerge(
        JobWorker.layerPgBoss({
          schema: on.jobSchema,
          intervals: INTERVALS,
          stopTimeoutMs: STOP_TIMEOUT_MS,
        }),
      ),
      Layer.provide([
        Layer.succeed(Environment, environment(scratchDb, options.mailer)),
        SchemaStatus.layerCurrent,
        Layer.succeed(DatabasePool, {
          identity: 'maintenance' as const,
          pool: on.maintenance,
        }),
        mailerLayer(options.mailer),
        Logger.layer([
          Logger.make(({ message }: Logger.Options<unknown>) => {
            options.lines?.push(
              (Array.isArray(message) ? message : [message])
                .map(String)
                .join(' '),
            );
          }),
        ]),
      ]),
    );

  /**
   * A built worker and the scope holding it. The scope rather than a `stop()`
   * because closing the scope is what a program's shutdown does, and what the
   * graceful window is a property of.
   */
  const build = async (
    layer: Layer.Layer<JobWorker, unknown>,
  ): Promise<{
    worker: JobWorker['Service'];
    close: () => Promise<void>;
  }> => {
    const scope = Effect.runSync(Scope.make());
    try {
      const services = await Effect.runPromise(
        Layer.buildWithScope(layer, scope),
      );
      return {
        worker: Context.get(services, JobWorker),
        close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
      };
    } catch (error) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      throw error;
    }
  };

  const enqueueSignIn = async (): Promise<string> => {
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      const jobId = await jobs.enqueue(client, 'sign-in-email', {
        email: 'researcher@example.org',
        url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
      });
      await client.query('COMMIT');
      return jobId;
    } finally {
      client.release();
    }
  };

  const jobState = async (jobId: string): Promise<string | undefined> => {
    const state = await scratch.pool.query<{ state: string }>(
      `select state from ${scratch.jobSchema}.job_common where id = $1`,
      [jobId],
    );
    return state.rows[0]?.state;
  };

  it('runs maintenance often enough for the shortest retention it declares', () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    // Deleting a completed job happens on pg-boss's maintenance pass and
    // nowhere else, so `deleteAfterSeconds` is only as true as that pass is
    // frequent — and pg-boss's own default is 24 hours, which would leave a
    // completed sign-in job, whose payload is the magic link itself, in the
    // table for most of a day after the link expired.
    //
    // Read from `jobWorkerConfig` with no options, which is what a deployment
    // builds: every worker in this file hands the cadences down for the suite's
    // sake, which is precisely what must not be what makes this true. pg-boss
    // keeps its configuration private, so the constructed object is the oracle.
    const config = jobWorkerConfig(db);

    // Taken from the queues rather than written here, so a queue that later
    // asks for a shorter retention than the worker can enforce fails this
    // rather than quietly keeping its jobs longer than it says.
    // `0` is pg-boss's "keep it forever" (the dead-letter queue asks for it),
    // which no maintenance cadence can be too slow for.
    const retentions = jobQueueDefinitions().flatMap(({ options }) =>
      options.deleteAfterSeconds !== undefined && options.deleteAfterSeconds > 0
        ? [options.deleteAfterSeconds]
        : [],
    );
    const shortest = Math.min(...retentions);
    expect(shortest).toBeGreaterThan(0);
    expect(config.maintenanceIntervalSeconds).toBeLessThanOrEqual(shortest);
  });

  it('lets the suites turn that cadence down', () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    // The knob stays a knob: the workers every case here builds run maintenance
    // every second, so the default above cannot be what any of them wait on.
    expect(
      jobWorkerConfig(db, { intervals: INTERVALS }).maintenanceIntervalSeconds,
    ).toBe(1);
  });

  it.live('starts against a schema apply-schema installed', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const built = yield* Effect.promise(() =>
        build(workerLayer(scratch, db, { mailer: silentMailer })),
      );
      try {
        expect(
          yield* Effect.promise(() => built.worker.boss.isInstalled()),
        ).toBe(true);
      } finally {
        yield* Effect.promise(built.close);
      }
    }),
  );

  it.live('refuses a database whose job schema is not installed', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const bare = yield* Effect.promise(() => createScratchSchema(db));
      try {
        yield* Effect.promise(() => provisionScratchSchema(bare.pool));
        yield* Effect.promise(() =>
          bare.pool.query(`drop schema "${bare.jobSchema}" cascade`),
        );

        // The layer fails to build rather than producing a worker that would
        // then be found not to work.
        const failure = yield* Effect.flip(
          Layer.build(workerLayer(bare, db, { mailer: silentMailer })).pipe(
            Effect.scoped,
          ),
        );
        expect(failure._tag).toBe('QueueUnavailable');
        expect(failure.message).toMatch(/pg-boss is not installed/);

        // The refusal is the point: a worker that installed what it found
        // missing could move a database out from under a web process that was
        // already serving requests against the schema it replaced.
        const rebuilt = yield* Effect.promise(() =>
          bare.pool.query<{ present: boolean }>(
            `select to_regclass('${bare.jobSchema}.version') is not null as present`,
          ),
        );
        expect(rebuilt.rows[0]?.present).toBe(false);
      } finally {
        yield* Effect.promise(bare.dispose);
      }
    }),
  );

  it.live('names the queues it cannot work without a mail transport', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const lines: string[] = [];
      const built = yield* Effect.promise(() =>
        build(workerLayer(scratch, db, { lines })),
      );
      try {
        // Unset SMTP is a supported state, not a refusal: the jobs queue until
        // a worker with mail configured returns (#1895). It only has to be loud.
        expect(lines.join('\n')).toContain(
          'invitation-delivery and sign-in-email',
        );
      } finally {
        yield* Effect.promise(built.close);
      }
    }),
  );

  it.live('says nothing about mail when a transport is configured', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const lines: string[] = [];
      const built = yield* Effect.promise(() =>
        build(workerLayer(scratch, db, { mailer: silentMailer, lines })),
      );
      try {
        expect(lines).toEqual([]);
      } finally {
        yield* Effect.promise(built.close);
      }
    }),
  );

  it.live('lets an in-flight job finish before stopping', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      let entered: number | undefined;
      let left: number | undefined;
      // The slowness goes in the transport rather than in a handler registered
      // beside the worker's own: a second `work()` on the same queue would race
      // the registered one for the job, and half the time the job would be
      // finished by the handler this case is not watching.
      const slowMailer: StudioMailer = {
        ...silentMailer,
        sendMagicLink: async () => {
          entered = Date.now();
          // Long enough that a stop which did not wait would return first, and
          // short enough to stay well inside the suite's timeout.
          await new Promise((resolve) => setTimeout(resolve, 1000));
          left = Date.now();
        },
      };
      const built = yield* Effect.promise(() =>
        build(workerLayer(scratch, db, { mailer: slowMailer })),
      );

      const jobId = yield* Effect.promise(enqueueSignIn);
      yield* Effect.promise(() =>
        vi.waitFor(() => expect(entered).toBeDefined(), {
          timeout: 15_000,
          interval: 25,
        }),
      );

      const stopBegan = Date.now();
      yield* Effect.promise(built.close);
      const stopReturned = Date.now();

      expect(left).toBeDefined();
      // A stop that abandoned the handler would return in milliseconds and
      // pg-boss would have failed the job with "shut down while active".
      expect(stopReturned - stopBegan).toBeGreaterThan(500);
      expect(stopReturned).toBeGreaterThanOrEqual(left!);
      expect(yield* Effect.promise(() => jobState(jobId))).toBe('completed');
    }),
  );

  it.live('stops when pg-boss has already stopped', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const built = yield* Effect.promise(() =>
        build(workerLayer(scratch, db, { mailer: silentMailer })),
      );

      // Something else stopped the instance first: a second SIGTERM, a
      // supervisor, or a case that stopped the boss to make a point. pg-boss
      // returns from `stop()` without emitting `stopped` when it has nothing
      // left to shut down, so a shutdown that waited for the event would never
      // return — and the scope close would hang behind it.
      yield* Effect.promise(() => built.worker.boss.stop({ graceful: false }));

      yield* Effect.promise(() =>
        settlesWithin(built.close(), STOP_BUDGET_MS, 'a repeated stop'),
      );
    }),
  );

  it.live(
    'waits out a hung handler for the scratch window, not the deployed one',
    () =>
      Effect.gen(function* () {
        if (!db) throw new Error('unreachable: probe guaranteed a database');
        let entered = false;
        // The hang lives in the transport, not in a second handler on the
        // queue: the worker's own registration already works every queue, and a
        // handler registered beside it would race it for the job.
        const hungMailer: StudioMailer = {
          ...silentMailer,
          sendMagicLink: () => {
            entered = true;
            // Never settles: the handler a graceful stop has to give up on.
            return new Promise(() => undefined);
          },
        };
        const built = yield* Effect.promise(() =>
          build(workerLayer(scratch, db, { mailer: hungMailer })),
        );

        yield* Effect.promise(enqueueSignIn);
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(entered).toBe(true), {
            timeout: 15_000,
            interval: 25,
          }),
        );

        const began = Date.now();
        yield* Effect.promise(built.close);
        const elapsed = Date.now() - began;

        // It did wait — the graceful window is what lets a real handler
        // finish...
        expect(elapsed).toBeGreaterThan(1000);
        // ...and the suites ask for a short one. Production's 25 seconds here
        // would spend most of a 30-second hook timeout on teardown, so a case
        // that failed with a job in flight would report the timeout instead.
        expect(elapsed).toBeLessThan(10_000);
      }),
    20_000,
  );

  it.live('runs pg-boss as the maintenance role', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      // Read from inside the statements pg-boss runs on its own pool, because
      // that is the session whose role is in question: the handler's own queries
      // go to the maintenance pool, which is pinned elsewhere. A job's fetch and
      // completion are both UPDATEs, so a trigger on the job table sees the role
      // pg-boss connected as.
      yield* Effect.promise(() =>
        scratch.pool.query(`
          create table ${scratch.jobSchema}.role_probe (who text not null);
          grant insert on ${scratch.jobSchema}.role_probe to ${TENANT_ROLES.maintenance};
          create function ${scratch.jobSchema}.record_role() returns trigger
            language plpgsql as $$
            begin
              insert into ${scratch.jobSchema}.role_probe (who) values (current_user);
              return null;
            end $$;
          create trigger record_role after update on ${scratch.jobSchema}.job_common
            for each row execute function ${scratch.jobSchema}.record_role();
        `),
      );

      const built = yield* Effect.promise(() =>
        build(workerLayer(scratch, db, { mailer: silentMailer })),
      );
      try {
        // Worked by the handler the worker registers for itself; any queue's
        // fetch and completion go through pg-boss's own pool, which is the
        // session under test.
        const jobId = yield* Effect.promise(enqueueSignIn);
        yield* Effect.promise(() =>
          vi.waitFor(
            async () => expect(await jobState(jobId)).toBe('completed'),
            {
              timeout: 15_000,
              interval: 100,
            },
          ),
        );

        const roles = yield* Effect.promise(() =>
          scratch.pool.query<{ who: string }>(
            `select distinct who from ${scratch.jobSchema}.role_probe`,
          ),
        );
        // The login the URL carries is the schema's owner — a superuser in
        // development — so an unpinned worker would read as that instead.
        expect(roles.rows).toEqual([{ who: TENANT_ROLES.maintenance }]);
      } finally {
        yield* Effect.promise(built.close);
        yield* Effect.promise(() =>
          scratch.pool.query(
            `drop trigger record_role on ${scratch.jobSchema}.job_common`,
          ),
        );
      }
    }),
  );

  it.live('is woken by a notification rather than its polling interval', () =>
    Effect.gen(function* () {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      let picked: number | undefined;
      // Thirty seconds is longer than this case is allowed to take, so a pickup
      // inside it can only have come from the NOTIFY the insert fires for a
      // notify-enabled queue — which is what a sign-in link, valid for minutes,
      // depends on. The cadence goes on the worker, whose own registration is
      // the only handler on the queue.
      const built = yield* Effect.promise(() =>
        build(
          workerLayer(scratch, db, {
            mailer: {
              ...silentMailer,
              sendMagicLink: () => {
                picked = Date.now();
                return Promise.resolve();
              },
            },
            workPollingIntervalSeconds: 30,
          }),
        ),
      );
      try {
        // Past whatever poll registering a worker performs for itself, so the
        // job below is created with no poll of its own coming.
        yield* Effect.sleep('1 second');

        yield* Effect.promise(enqueueSignIn);
        const queued = Date.now();

        yield* Effect.promise(() =>
          vi.waitFor(() => expect(picked).toBeDefined(), {
            timeout: 10_000,
            interval: 25,
          }),
        );
        expect(picked! - queued).toBeLessThan(2000);
      } finally {
        yield* Effect.promise(built.close);
      }
    }),
  );
});
