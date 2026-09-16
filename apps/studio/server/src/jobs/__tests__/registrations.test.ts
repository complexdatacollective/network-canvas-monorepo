import { assert, describe, it, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Layer } from 'effect';

import { JOB_QUEUES, type JobQueueName } from '@codaco/studio-sync/jobs';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { type DbEnv, Environment, type StudioEnv } from '../../env.ts';
import { collectLogs } from '../../platform/__tests__/support/logs.ts';
import { Database, withTransaction } from '../database.ts';
import {
  layerRecordingMailer,
  RecordedMail,
} from '../handlers/__tests__/support.ts';
import { DeniedAttemptsStore } from '../handlers/denied-attempts/store.ts';
import { layerRecordingWriter } from '../handlers/denied-attempts/testing.ts';
import { Jobs } from '../jobs.ts';
import { JobHandlersLive, QueueUnavailable } from '../registrations.ts';
import { JobWorker } from '../worker.ts';
import {
  asOwner,
  layerDeliveryHarness,
  layerWorker,
  payloadFor,
  QueueHarness,
  readJobs,
  readSchedules,
} from './support.ts';

// What a deployment's worker actually works, which is the whole of what
// `JobHandlersLive` decides. The suite drives one real job per queue rather
// than reading the registry, because "registered" is only interesting if the
// job settles: a queue nothing registered is claimed and put straight back
// (`drainOnce`'s no-handler branch), which looks identical to an idle queue
// from anywhere but the row.
//
// `layerDeliveryHarness` is the general "Studio's schema and the queue's, side
// by side" harness: the sweep needs Studio's tables and every job needs the
// queue's.

const db = await reachableDb();

/** The four queues a worker with a transport claims from. */
const WORKED = [
  'protocol-store-gc',
  'denied-attempts-summary',
  'sign-in-email',
  'invitation-delivery',
] as const satisfies readonly JobQueueName[];

/**
 * The one queue `JobHandlersLive` deliberately registers no handler for. It is
 * #1307's parking queue: an invitation whose delivery exhausted its ladder is
 * copied here so a researcher can re-send it by hand, and a worker that
 * claimed from it would retry the send the dead letter exists to stop
 * retrying.
 */
const UNWORKED = [
  'invitation-delivery-dead-letter',
] as const satisfies readonly JobQueueName[];

describe('the queues this deployment declares', () => {
  it('are each either worked or deliberately parked', () => {
    // Registration is a hand-written list, so the failure mode it has is
    // omission: a sixth queue added to `JOB_QUEUES` with no handler passes
    // every case below — each of them names the queues it drives — while its
    // jobs sit `created` forever (`pollQueue` never claims from a queue with
    // no handler). This is the only assertion that reads the declarations
    // rather than a list written beside them.
    assert.deepStrictEqual(
      [...WORKED, ...UNWORKED].toSorted(),
      JOB_QUEUES.map(({ name }) => name).toSorted(),
      'every declared queue must be worked by JobHandlersLive or listed in UNWORKED as one nothing claims from — a queue in neither list accumulates jobs no replica will ever run',
    );
  });
});

/**
 * The worker's environment, fixed apart from the two things registration
 * reads: whether a transport is configured, and whether there is a public base
 * URL to mint an invitation link against.
 */
function workerEnv(
  dbEnv: DbEnv,
  overrides: {
    readonly mail?: StudioEnv['mail'];
    readonly auth?: StudioEnv['auth'];
  },
): StudioEnv {
  return {
    port: 3000,
    host: '127.0.0.1',
    workerHealthPort: 3001,
    s3: undefined,
    db: dbEnv,
    auth:
      'auth' in overrides
        ? overrides.auth
        : {
            secret: 'scratch-worker-signing-secret',
            baseUrl: 'http://localhost:3000',
            trustedProxies: undefined,
            socialProviders: {},
          },
    mail: overrides.mail,
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

describe.skipIf(!db)('the worker’s handler registrations', () => {
  layer(
    Layer.mergeAll(
      layerRecordingMailer,
      DeniedAttemptsStore.layerAbsent,
      layerRecordingWriter,
    ).pipe(Layer.provideMerge(layerDeliveryHarness(db!))),
  )('over Studio and the queue', (suite) => {
    /**
     * One worker of its own per case, because registration mutates the
     * worker's registry: a shared worker would carry the previous case's mail
     * handlers into the case that is about their absence.
     */
    const registered = (overrides: {
      readonly mail?: StudioEnv['mail'];
      readonly auth?: StudioEnv['auth'];
    }) =>
      JobHandlersLive.pipe(
        Layer.provide(Layer.succeed(Environment, workerEnv(db!, overrides))),
        Layer.provideMerge(layerWorker()),
      );

    const configured = { mail: { kind: 'console' } as const };

    const enqueue = Effect.fnUntraced(function* (queue: JobQueueName) {
      const jobs = yield* Jobs;
      return yield* withTransaction(jobs.enqueue(queue, payloadFor(queue)));
    });

    const scheduleNames = Effect.map(readSchedules(), (rows) =>
      rows.map((row) => row.name),
    );

    suite.effect(
      'settles a job on every queue a transport is configured for',
      () =>
        Effect.gen(function* () {
          const worker = yield* JobWorker;
          for (const queue of WORKED) {
            yield* enqueue(queue);
            const step = yield* worker.drainOnce(queue);
            assert.deepStrictEqual(
              { queue, tag: step._tag },
              { queue, tag: 'settled' },
            );
          }
          // The magic link reached the transport rather than the handler merely
          // being present: the sign-in queue's whole job is that send.
          const mail = yield* RecordedMail;
          assert.strictEqual(mail.magicLinks.length, 1);
        }).pipe(Effect.provide(registered(configured), { local: true })),
    );

    suite.effect(
      'leaves the two mail queues unworked without a transport, and says so once',
      () => {
        const logs = collectLogs();
        return Effect.gen(function* () {
          yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            for (const queue of [
              'sign-in-email',
              'invitation-delivery',
            ] as const) {
              const jobId = yield* enqueue(queue);
              const step = yield* worker.drainOnce(queue);
              assert.strictEqual(step._tag, 'idle');
              // By id: earlier cases left their own settled rows on this
              // queue, and the oldest row is not this case's.
              const row = (yield* readJobs(queue)).find(
                (entry) => entry.id === jobId,
              );
              // Claimed and put straight back, attempt and all: the jobs wait
              // for a replica that has a transport rather than burning their
              // ladder here (#1895).
              assert.deepStrictEqual(
                {
                  id: row?.id,
                  state: row?.state,
                  attempts: row?.attempts,
                },
                { id: jobId, state: 'created', attempts: 0 },
              );
            }
            // And the queues that need no transport are still worked.
            yield* enqueue('protocol-store-gc');
            const swept = yield* worker.drainOnce('protocol-store-gc');
            assert.strictEqual(swept._tag, 'settled');
          }).pipe(
            Effect.provide(registered({ mail: { kind: 'refuse' } }), {
              local: true,
            }),
          );

          const refusals = logs.messages.filter((message) =>
            message.includes('No mail transport is configured'),
          );
          assert.strictEqual(refusals.length, 1);
          assert.match(refusals[0]!, /invitation-delivery and sign-in-email/);
        }).pipe(Effect.provide(logs.layer));
      },
    );

    suite.effect(
      'upserts the declared schedules and drops one this build no longer declares',
      () =>
        Effect.gen(function* () {
          const { schema } = yield* QueueHarness;
          // A row a previous release left behind. It keeps coming due on a
          // queue nothing works unless boot removes it.
          yield* asOwner(
            Effect.flatMap(
              Database,
              ({ sql }) => sql`
                INSERT INTO ${sql(schema)}.job_schedules
                  (name, cron, queue, payload, next_run_at)
                VALUES ('legacy-sweep', '0 * * * *', 'protocol-store-gc',
                        '{}'::jsonb, now())
                ON CONFLICT (name) DO NOTHING`,
            ),
          );

          yield* Effect.provide(Effect.void, registered(configured), {
            local: true,
          });

          assert.deepStrictEqual(yield* scheduleNames, [
            'denied-attempts-summary',
            'protocol-store-gc',
          ]);
        }),
    );

    suite.effect('refuses to register delivery without a public base URL', () =>
      Effect.gen(function* () {
        // The worker program refuses a database without one before it ever
        // gets here; this is the second refusal, at the one registration that
        // cannot be made without it.
        const built = yield* Effect.exit(
          Effect.provide(
            Effect.void,
            registered({ mail: { kind: 'console' }, auth: undefined }),
            { local: true },
          ),
        );
        assert.isTrue(Exit.isFailure(built));
        const refusal = Exit.isFailure(built)
          ? Cause.squash(built.cause)
          : undefined;
        assert.instanceOf(refusal, QueueUnavailable);
        assert.match(String(refusal), /set PUBLIC_URL on the worker/);
      }),
    );
  });
});
