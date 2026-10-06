import { assert, describe, layer } from '@effect/vitest';
import { Deferred, Duration, Effect, Layer, MutableRef, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../__tests__/support/postgres.ts';
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
          assert.include(logs.messages[0]!, 'in maintenance');
          assert.include(logs.messages[0]!, 'stopped claiming jobs');

          yield* tick;
          yield* tick;
          assert.deepStrictEqual(calls, [true, false]);
          assert.strictEqual(logs.messages.length, 1);

          MutableRef.set(maintenance, false);
          yield* tick;
          assert.deepStrictEqual(calls, [true, false, true]);
          assert.strictEqual(logs.messages.length, 2);
          assert.include(logs.messages[1]!, 'maintenance is over');
        }).pipe(
          Effect.provide(JobMaintenanceGate.layer()),
          Effect.provide(MaintenanceState.layerTest(maintenance)),
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
            assert.include(logs.messages[0]!, 'in maintenance');
          }).pipe(
            Effect.provide(JobMaintenanceGate.layer()),
            Effect.provide(MaintenanceState.layerTest(maintenance)),
            Effect.provide(recording(calls)),
          );
        }).pipe(Effect.provide(layerWorker()), Effect.provide(logs.layer));
      },
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
                  }),
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
                  }),
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
                    line.includes('maintenance is over'),
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
