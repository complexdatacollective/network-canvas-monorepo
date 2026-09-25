import { assert, describe, layer } from '@effect/vitest';
import { Deferred, Duration, Effect, Layer, MutableRef, Option } from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { collectLogs } from '../../platform/__tests__/support/logs.ts';
import { MaintenanceState } from '../../platform/maintenance-state.ts';
import { JobMaintenanceGate } from '../maintenance.ts';
import { JobWorker } from '../worker.ts';
import {
  awaitJobState,
  clearQueue,
  enqueueDelivery,
  layerJobs,
  layerQueueHarness,
  layerWorker,
  readJobs,
} from './support.ts';

// The gate between a deployment's maintenance window and the worker's
// fetching flag. Every case runs against the real `JobWorker` — the service
// the gate calls is the one the worker builds, wrapped only to record what it
// was told — so a change to `setFetching`'s shape reaches these cases.
//
// What claiming does with the flag is the worker's own suite's subject: the
// first cases' workers are built with `background: false`, where nothing
// polls, so what they assert is the gate's half of the contract — the right
// value, at the right tick, once per transition. The last case is the one
// place the two halves meet, because the window it guards is between them: a
// worker whose poll fibers run before the gate's first reading lands.

const db = await reachableDb();

describe.skipIf(!db)('the maintenance gate', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    /**
     * The worker the gate is given: the real one, recording each
     * `setFetching` and passing it on. Spread rather than rebuilt, so a field
     * added to `JobWorker` needs no change here.
     */
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

    /** One poll interval of the gate. */
    const tick = TestClock.adjust(Duration.seconds(1));

    it.effect('stops claiming for maintenance and resumes after it', () => {
      const logs = collectLogs();
      const maintenance = MutableRef.make(false);
      const calls: boolean[] = [];
      return Effect.gen(function* () {
        yield* Effect.gen(function* () {
          // The first reading is applied while the gate's layer builds —
          // before the clock has moved at all — so a worker built paused is
          // open by the time the process reports itself started.
          assert.deepStrictEqual(calls, [true]);
          yield* tick;
          assert.deepStrictEqual(calls, [true]);
          assert.deepStrictEqual(logs.messages, []);

          // Maintenance begins: within one tick the worker is told to stop.
          MutableRef.set(maintenance, true);
          yield* tick;
          assert.deepStrictEqual(calls, [true, false]);
          assert.strictEqual(logs.messages.length, 1);
          assert.include(logs.messages[0]!, 'in maintenance');
          assert.include(logs.messages[0]!, 'stopped claiming jobs');

          // Still in maintenance: the gate says nothing and calls nothing.
          yield* tick;
          yield* tick;
          assert.deepStrictEqual(calls, [true, false]);
          assert.strictEqual(logs.messages.length, 1);

          // And out again.
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
            // `false` first, not `true` then `false`: a process that boots into
            // a maintenance window must never claim in between.
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
            // Ready before anything is built, so the pollers' first pass has
            // a job to claim — the order a worker restarted into a backlog
            // sees.
            yield* enqueueDelivery();
            const maintenance = MutableRef.make(true);
            const firstRead = yield* Deferred.make<void>();
            // Not `layerTest` or `layerFrom`: the live reading gives up after
            // half a second and answers "not in maintenance", which would open
            // the worker on its own. Held here until the case says so, so the
            // window this case is about stays open as long as it likes.
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
              // The gate awaits its first reading while its layer builds, so
              // it is built on a fiber of its own: this case holds that
              // reading and watches the worker meanwhile.
              yield* Effect.forkScoped(
                Layer.build(
                  JobMaintenanceGate.layer({
                    pollInterval: Duration.millis(50),
                  }),
                ).pipe(Effect.provide(held)),
              );
              // Ten poll intervals with the reading still out: long enough
              // for a fetching worker to claim several times over.
              yield* Effect.sleep(Duration.millis(500));
              const [waiting] = yield* readJobs('invitation-delivery');
              assert.strictEqual(waiting?.state, 'created');
              assert.strictEqual(waiting?.attempts, 0);
              // Paused and still ready: it read its tables without claiming.
              assert.isTrue(yield* worker.ready);

              // The reading lands and says "maintenance": still nothing.
              yield* Deferred.succeed(firstRead, undefined);
              yield* Effect.sleep(Duration.millis(300));
              const [still] = yield* readJobs('invitation-delivery');
              assert.strictEqual(still?.state, 'created');

              // Maintenance ends, and the job is worked.
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
