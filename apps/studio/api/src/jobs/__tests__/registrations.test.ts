import { assert, describe, it, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Layer } from 'effect';

import { JOB_QUEUES, type JobQueueName } from '@codaco/studio-sync/jobs';

import { ownerRows, testDb } from '../../__tests__/support/database.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { MaintenanceScope } from '../../db/tenant.ts';
import { type DbEnv, Environment, type StudioEnv } from '../../env.ts';
import { collectLogs } from '../../platform/__tests__/support/logs.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import { ObjectStore } from '../../storage/object-store.ts';
import { STUDIO_VERSION } from '../../version.ts';
import {
  layerRecordingHttp,
  layerRecordingMailer,
  RecordedMail,
} from '../handlers/__tests__/support.ts';
import { DeniedAttemptsStore } from '../handlers/denied-attempts/store.ts';
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

const WORKED = [
  'protocol-store-gc',
  'denied-attempts-summary',
  'update-check',
  'sign-in-email',
  'invitation-delivery',
] as const satisfies readonly JobQueueName[];

const UNWORKED = [
  'invitation-delivery-dead-letter',
  'session-completed',
] as const satisfies readonly JobQueueName[];

describe('the queues this deployment declares', () => {
  it('are each either worked or deliberately parked', () => {
    assert.deepStrictEqual(
      [...WORKED, ...UNWORKED].toSorted(),
      JOB_QUEUES.map(({ name }) => name).toSorted(),
      'every declared queue must be worked by JobHandlersLive or listed in UNWORKED as one nothing claims from — a queue in neither list accumulates jobs no replica will ever run',
    );
  });
});

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
    objectStore: undefined,
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
    telemetryHeaders: undefined,
    logLevel: 'Info',
    deploymentMode: 'self-hosted',
    seedAdminPassword: undefined,
  };
}

describe.skipIf(!testDb)('the worker’s handler registrations', () => {
  layer(
    Layer.mergeAll(
      layerRecordingMailer,
      // The running version, so the check records it and finds nothing to send.
      layerRecordingHttp({
        kind: 'json',
        body: {
          version: STUDIO_VERSION,
          date: '2026-10-06T14:30:00Z',
          notes: 'https://releases.networkcanvas.com/studio/notes',
          migration: '0001_initial',
        },
      }),
      DeniedAttemptsStore.layer.pipe(Layer.provide(RateLimitStore.layerAbsent)),
    ).pipe(Layer.provideMerge(layerDeliveryHarness)),
  )('over Studio and the queue', (suite) => {
    const registered = (overrides: {
      readonly mail?: StudioEnv['mail'];
      readonly auth?: StudioEnv['auth'];
    }) =>
      JobHandlersLive.pipe(
        Layer.provide(
          Layer.succeed(Environment, workerEnv(testDb!, overrides)),
        ),
        Layer.provide(Layer.succeed(ObjectStore, ObjectStore.absent)),
        Layer.provideMerge(layerWorker()),
      );

    const configured = { mail: { kind: 'console' } as const };

    const enqueue = Effect.fnUntraced(function* (queue: JobQueueName) {
      const jobs = yield* Jobs;
      return yield* MaintenanceScope.open(
        jobs.enqueue(queue, payloadFor(queue)),
      );
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
              const row = (yield* readJobs(queue)).find(
                (entry) => entry.id === jobId,
              );
              assert.deepStrictEqual(
                {
                  id: row?.id,
                  state: row?.state,
                  attempts: row?.attempts,
                },
                { id: jobId, state: 'created', attempts: 0 },
              );
            }
            yield* enqueue('protocol-store-gc');
            const swept = yield* worker.drainOnce('protocol-store-gc');
            assert.strictEqual(swept._tag, 'settled');

            // The check is not behind the mail gate: with no transport it
            // still runs and still records the release the in-app notice reads.
            yield* enqueue('update-check');
            const checked = yield* worker.drainOnce('update-check');
            assert.strictEqual(checked._tag, 'settled');
            const recorded = yield* ownerRows<{
              latest_version: string | null;
            }>('select latest_version from deployment_state');
            assert.strictEqual(recorded[0]?.latest_version, STUDIO_VERSION);
          }).pipe(
            Effect.provide(registered({ mail: { kind: 'refuse' } }), {
              local: true,
            }),
          );

          const refusals = logs.records.filter(({ message }) =>
            message.includes('No mail transport is configured'),
          );
          assert.strictEqual(refusals.length, 1);
          assert.deepStrictEqual(refusals[0]?.annotations, {
            queues: ['invitation-delivery', 'sign-in-email'],
          });
        }).pipe(Effect.provide(logs.layer));
      },
    );

    suite.effect(
      'upserts the declared schedules and drops one this build no longer declares',
      () =>
        Effect.gen(function* () {
          const { schema } = yield* QueueHarness;
          yield* asOwner(
            Effect.flatMap(
              MaintenanceDatabase,
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
            'update-check',
          ]);
        }),
    );

    suite.effect('refuses to register delivery without a public base URL', () =>
      Effect.gen(function* () {
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
