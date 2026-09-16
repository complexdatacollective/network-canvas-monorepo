import { assert, describe, layer } from '@effect/vitest';
import { Duration, Effect, Layer, MutableRef } from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { collectLogs } from '../../platform/__tests__/support/logs.ts';
import { JobMaintenanceGate, MaintenanceState } from '../maintenance.ts';
import { JobWorker } from '../worker.ts';
import { layerQueueHarness, layerWorker } from './support.ts';

// The gate between a deployment's maintenance window and the worker's
// fetching flag. Every case runs against the real `JobWorker` — the service
// the gate calls is the one the worker builds, wrapped only to record what it
// was told — so a change to `setFetching`'s shape reaches these cases.
//
// What claiming does with the flag is the worker's own suite's subject: these
// workers are built with `background: false`, where nothing polls, so what is
// asserted here is the gate's half of the contract — the right value, at the
// right tick, once per transition.

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
          // The first tick applies the state the process booted into.
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
  });
});
