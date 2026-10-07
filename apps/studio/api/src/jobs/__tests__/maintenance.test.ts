import { assert, describe, layer } from '@effect/vitest';
import { Deferred, Duration, Effect, Layer, MutableRef, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import type { SchemaState } from '../../db/schema.ts';
import { MaintenanceTriggers } from '../../http/middleware/maintenance.ts';
import { collectLogs } from '../../platform/__tests__/support/logs.ts';
import { MaintenanceState } from '../../platform/maintenance-state.ts';
import { applyMaintenanceWindow } from '../../programs/maintenance.ts';
import { JobMaintenanceGate } from '../maintenance.ts';
import { JobWorker } from '../worker.ts';
import {
  awaitJobState,
  awaitTrue,
  clearQueue,
  enqueueDelivery,
  enqueueSweep,
  layerDeliveryHarness,
  layerJobs,
  layerQueueHarness,
  layerWorker,
  readJobs,
} from './support.ts';

const db = await reachableDb();

const CURRENT: SchemaState = { kind: 'current' };

const STALE: SchemaState = {
  kind: 'stale',
  reason: 'mismatch',
  found: 'a-later-build',
  appliedAt: new Date(0),
};

/**
 * The gate over the API's own closure rule, with every reading but the flag's
 * injected: `lockHeld` and `schema` stand in for `migrationLockHeld` and
 * `SchemaStatus.read`.
 */
const gateOver = (
  probes: {
    readonly maintenance?: MutableRef.MutableRef<boolean>;
    readonly lockHeld?: MutableRef.MutableRef<boolean>;
    readonly schema?: MutableRef.MutableRef<SchemaState>;
  },
  config?: Parameters<typeof JobMaintenanceGate.layer>[0],
) => {
  const { lockHeld, schema } = probes;
  return JobMaintenanceGate.layer(config).pipe(
    Layer.provide(
      MaintenanceTriggers.layerWith({
        lockHeld:
          lockHeld === undefined
            ? Effect.succeed(false)
            : Effect.sync(() => MutableRef.get(lockHeld)),
        schema:
          schema === undefined
            ? Effect.succeed(CURRENT)
            : Effect.sync(() => MutableRef.get(schema)),
      }),
    ),
    Layer.provide(
      probes.maintenance === undefined
        ? MaintenanceState.layerOff
        : MaintenanceState.layerTest(probes.maintenance),
    ),
  );
};

/** The triggers the deployment-state cases want: the flag alone, read live. */
const openTriggers = MaintenanceTriggers.layerWith({
  lockHeld: Effect.succeed(false),
  schema: Effect.succeed(CURRENT),
});

describe.skipIf(!db)('the maintenance gate', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const recording = (calls: boolean[]) =>
      Layer.unwrap(
        Effect.map(JobWorker, (worker) =>
          Layer.succeed(JobWorker)(
            JobWorker.of({
              ...worker,
              setFetching: (fetching) =>
                Effect.flatMap(
                  Effect.sync(() => {
                    calls.push(fetching);
                  }),
                  () => worker.setFetching(fetching),
                ),
            }),
          ),
        ),
      );

    const tick = TestClock.adjust(Duration.seconds(1));

    it.effect('stops claiming for maintenance and resumes after it', () => {
      const logs = collectLogs();
      const maintenance = MutableRef.make(false);
      const calls: boolean[] = [];
      return Effect.gen(function* () {
        yield* Effect.gen(function* () {
          assert.deepStrictEqual(calls, [true]);
          yield* tick;
          assert.deepStrictEqual(calls, [true]);
          assert.deepStrictEqual(logs.messages, []);

          MutableRef.set(maintenance, true);
          yield* tick;
          assert.deepStrictEqual(calls, [true, false]);
          assert.strictEqual(logs.messages.length, 1);
          assert.include(logs.messages[0]!, 'maintenance mode is on');
          assert.include(logs.messages[0]!, 'stopped claiming jobs');

          yield* tick;
          yield* tick;
          assert.deepStrictEqual(calls, [true, false]);
          assert.strictEqual(logs.messages.length, 1);

          MutableRef.set(maintenance, false);
          yield* tick;
          assert.deepStrictEqual(calls, [true, false, true]);
          assert.strictEqual(logs.messages.length, 2);
          assert.include(logs.messages[1]!, 'claiming jobs again');
        }).pipe(
          Effect.provide(gateOver({ maintenance })),
          Effect.provide(recording(calls)),
        );
      }).pipe(Effect.provide(layerWorker()), Effect.provide(logs.layer));
    });

    it.effect(
      'boots paused when the deployment is already in maintenance',
      () => {
        const logs = collectLogs();
        const maintenance = MutableRef.make(true);
        const calls: boolean[] = [];
        return Effect.gen(function* () {
          yield* Effect.gen(function* () {
            yield* tick;
            assert.deepStrictEqual(calls, [false]);
            assert.strictEqual(logs.messages.length, 1);
            assert.include(logs.messages[0]!, 'maintenance mode is on');
          }).pipe(
            Effect.provide(gateOver({ maintenance })),
            Effect.provide(recording(calls)),
          );
        }).pipe(Effect.provide(layerWorker()), Effect.provide(logs.layer));
      },
    );

    it.effect(
      'stops claiming on a schema that is not this build’s and resumes once it is current, with the flag off throughout',
      () => {
        const logs = collectLogs();
        const schema = MutableRef.make<SchemaState>(CURRENT);
        const calls: boolean[] = [];
        return Effect.gen(function* () {
          yield* Effect.gen(function* () {
            assert.deepStrictEqual(calls, [true]);

            MutableRef.set(schema, STALE);
            yield* tick;
            assert.deepStrictEqual(calls, [true, false]);
            assert.strictEqual(logs.messages.length, 1);
            assert.include(logs.messages[0]!, 'not this build');
            assert.include(logs.messages[0]!, 'stopped claiming jobs');

            // Still closed, for a different reason: the log says so once,
            // and fetching is not set again.
            MutableRef.set(schema, { kind: 'absent' });
            yield* tick;
            yield* tick;
            assert.deepStrictEqual(calls, [true, false]);
            assert.strictEqual(logs.messages.length, 2);
            assert.include(logs.messages[1]!, 'no Studio schema');

            MutableRef.set(schema, CURRENT);
            yield* tick;
            assert.deepStrictEqual(calls, [true, false, true]);
            assert.strictEqual(logs.messages.length, 3);
            assert.include(logs.messages[2]!, 'claiming jobs again');
          }).pipe(
            Effect.provide(gateOver({ schema })),
            Effect.provide(recording(calls)),
          );
        }).pipe(Effect.provide(layerWorker()), Effect.provide(logs.layer));
      },
    );

    it.effect(
      'stops claiming while the migration lock is held and resumes once it is released, with the flag off throughout',
      () => {
        const logs = collectLogs();
        const lockHeld = MutableRef.make(false);
        const calls: boolean[] = [];
        return Effect.gen(function* () {
          yield* Effect.gen(function* () {
            assert.deepStrictEqual(calls, [true]);

            MutableRef.set(lockHeld, true);
            yield* tick;
            assert.deepStrictEqual(calls, [true, false]);
            assert.strictEqual(logs.messages.length, 1);
            assert.include(logs.messages[0]!, 'migration is running');
            assert.include(logs.messages[0]!, 'stopped claiming jobs');

            MutableRef.set(lockHeld, false);
            yield* tick;
            assert.deepStrictEqual(calls, [true, false, true]);
            assert.include(logs.messages[1]!, 'claiming jobs again');
          }).pipe(
            Effect.provide(gateOver({ lockHeld })),
            Effect.provide(recording(calls)),
          );
        }).pipe(Effect.provide(layerWorker()), Effect.provide(logs.layer));
      },
    );

    it.effect(
      'leaves a job unclaimed on a running worker through a migration and on the schema it leaves behind',
      () =>
        TestClock.withLive(
          Effect.gen(function* () {
            yield* clearQueue;
            const logs = collectLogs();
            const lockHeld = MutableRef.make(false);
            const schema = MutableRef.make<SchemaState>(CURRENT);
            const calls: boolean[] = [];
            const logged = (text: string) =>
              awaitTrue(
                Effect.sync(() =>
                  logs.messages.some((line) => line.includes(text)),
                ),
                Duration.seconds(5),
              );

            yield* Effect.gen(function* () {
              const worker = yield* JobWorker;
              yield* worker.work('invitation-delivery', () =>
                Effect.succeed('completed' as const),
              );
              yield* Layer.build(
                gateOver(
                  { lockHeld, schema },
                  { pollInterval: Duration.millis(50) },
                ).pipe(Layer.provide(recording(calls))),
              );

              // `migrate` takes the lock against the running worker, and
              // leaves a schema this worker's build did not write.
              MutableRef.set(lockHeld, true);
              assert.isTrue(
                Option.isSome(yield* logged('migration is running')),
                'the gate never paused for the migration',
              );
              yield* enqueueDelivery();
              yield* Effect.sleep(WINDOW);
              const [during] = yield* readJobs('invitation-delivery');
              assert.strictEqual(during?.state, 'created');
              assert.strictEqual(during?.attempts, 0);

              // The gate's next answer, once it sees the lock let go, is the
              // schema the migration left: it never reopens in between.
              MutableRef.set(schema, STALE);
              MutableRef.set(lockHeld, false);
              assert.isTrue(
                Option.isSome(yield* logged('not this build')),
                'the gate never read the schema the migration left',
              );
              yield* Effect.sleep(WINDOW);
              assert.deepStrictEqual(calls, [true, false]);
              assert.isFalse(
                logs.messages.some((line) =>
                  line.includes('claiming jobs again'),
                ),
              );
              const [after] = yield* readJobs('invitation-delivery');
              assert.strictEqual(after?.state, 'created');
              assert.strictEqual(after?.attempts, 0);

              // The control: the same worker claims it once the schema is
              // its own again.
              MutableRef.set(schema, CURRENT);
              const worked = yield* awaitJobState(
                'invitation-delivery',
                'completed',
                Duration.seconds(5),
              );
              assert.isTrue(Option.isSome(worked));
            }).pipe(
              Effect.scoped,
              Effect.provide(
                layerWorker({
                  background: true,
                  listen: false,
                  pollInterval: Duration.millis(50),
                  startPaused: true,
                }),
              ),
              Effect.provide(logs.layer),
            );
          }).pipe(Effect.provide(layerJobs)),
        ),
      30_000,
    );

    it.effect(
      'claims nothing on a worker that boots before the first reading lands',
      () =>
        TestClock.withLive(
          Effect.gen(function* () {
            yield* clearQueue;
            yield* enqueueDelivery();
            const maintenance = MutableRef.make(true);
            const firstRead = yield* Deferred.make<void>();
            const held = Layer.succeed(MaintenanceState)(
              MaintenanceState.of({
                read: Effect.andThen(Deferred.await(firstRead), () =>
                  Effect.sync(() => ({
                    maintenance: MutableRef.get(maintenance),
                    reason: null,
                  })),
                ),
              }),
            );

            yield* Effect.gen(function* () {
              const worker = yield* JobWorker;
              yield* worker.work('invitation-delivery', () =>
                Effect.succeed('completed' as const),
              );
              yield* Effect.forkScoped(
                Layer.build(
                  JobMaintenanceGate.layer({
                    pollInterval: Duration.millis(50),
                  }).pipe(Layer.provide(openTriggers)),
                ).pipe(Effect.provide(held)),
              );
              yield* Effect.sleep(Duration.millis(500));
              const [waiting] = yield* readJobs('invitation-delivery');
              assert.strictEqual(waiting?.state, 'created');
              assert.strictEqual(waiting?.attempts, 0);
              assert.isTrue(yield* worker.ready);

              yield* Deferred.succeed(firstRead, undefined);
              yield* Effect.sleep(Duration.millis(300));
              const [still] = yield* readJobs('invitation-delivery');
              assert.strictEqual(still?.state, 'created');

              MutableRef.set(maintenance, false);
              const worked = yield* awaitJobState(
                'invitation-delivery',
                'completed',
                Duration.seconds(5),
              );
              assert.isTrue(Option.isSome(worked));
            }).pipe(
              Effect.scoped,
              Effect.provide(
                layerWorker({
                  background: true,
                  listen: false,
                  pollInterval: Duration.millis(50),
                  startPaused: true,
                }),
              ),
            );
          }).pipe(Effect.provide(layerJobs)),
        ),
    );
  });
});

/**
 * How long a job enqueued during the window is left unclaimed before the case
 * says nobody claimed it. A negative assertion has no event to await, so a
 * bounded wait is the oracle: twenty of the worker's 50 ms polls and twenty of
 * the gate's, which a worker still fetching would not survive (it claims within
 * one poll).
 */
const WINDOW = Duration.seconds(1);

/**
 * #1901 step 8, end to end in one process: the flag is the `deployment_state`
 * row, written by the `maintenance on|off` program's own effect and read back
 * through the worker's `MaintenanceState.layerMaintenance` (one-second cache),
 * driving a real background worker. Nothing is a control ref.
 */
describe.skipIf(!db)(
  'the maintenance window, over the deployment state',
  () => {
    layer(layerDeliveryHarness, { excludeTestServices: true })(
      'with a running worker',
      (it) => {
        it.effect(
          'finishes the job in flight, holds the one enqueued in the window, and works it once the flag clears, without a restart',
          () => {
            const logs = collectLogs();
            return Effect.gen(function* () {
              yield* clearQueue;
              const started = yield* Deferred.make<void>();
              const release = yield* Deferred.make<void>();

              yield* Effect.gen(function* () {
                const worker = yield* JobWorker;
                yield* worker.work('invitation-delivery', () =>
                  Effect.gen(function* () {
                    yield* Deferred.succeed(started, undefined);
                    yield* Deferred.await(release);
                    return 'completed' as const;
                  }),
                );
                yield* worker.work('denied-attempts-summary', () =>
                  Effect.succeed('completed' as const),
                );
                yield* Layer.build(
                  JobMaintenanceGate.layer({
                    pollInterval: Duration.millis(50),
                  }).pipe(Layer.provide(openTriggers)),
                ).pipe(Effect.provide(MaintenanceState.layerMaintenance));

                // A job in flight when the window opens.
                yield* enqueueDelivery();
                yield* Deferred.await(started).pipe(
                  Effect.timeout(Duration.seconds(5)),
                );

                yield* applyMaintenanceWindow({
                  maintenance: true,
                  reason: 'Upgrading',
                });
                const paused = yield* awaitTrue(
                  Effect.sync(() =>
                    logs.messages.some((line) =>
                      line.includes('stopped claiming jobs'),
                    ),
                  ),
                  Duration.seconds(5),
                );
                assert.isTrue(Option.isSome(paused), 'the gate never paused');

                // A job enqueued during the window is not claimed while it lasts.
                yield* enqueueSweep;
                yield* Effect.sleep(WINDOW);
                const [held] = yield* readJobs('denied-attempts-summary');
                assert.strictEqual(held?.state, 'created');
                assert.strictEqual(held?.attempts, 0);

                // The job in flight finishes inside the window.
                yield* Deferred.succeed(release, undefined);
                const finished = yield* awaitJobState(
                  'invitation-delivery',
                  'completed',
                  Duration.seconds(5),
                );
                assert.isTrue(
                  Option.isSome(finished),
                  'the job in flight did not finish during the window',
                );
                const [stillHeld] = yield* readJobs('denied-attempts-summary');
                assert.strictEqual(stillHeld?.state, 'created');

                // Clearing the flag resumes this same worker.
                yield* applyMaintenanceWindow({ maintenance: false });
                const worked = yield* awaitJobState(
                  'denied-attempts-summary',
                  'completed',
                  Duration.seconds(10),
                );
                assert.isTrue(
                  Option.isSome(worked),
                  'the job enqueued during the window was never worked',
                );
                assert.isTrue(
                  logs.messages.some((line) =>
                    line.includes('claiming jobs again'),
                  ),
                );
              }).pipe(
                Effect.scoped,
                Effect.provide(
                  layerWorker({
                    background: true,
                    listen: false,
                    pollInterval: Duration.millis(50),
                  }),
                ),
              );
            }).pipe(Effect.provide(logs.layer));
          },
          30_000,
        );
      },
    );
  },
);
