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
