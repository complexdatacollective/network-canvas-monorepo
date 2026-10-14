import type * as PerfHooks from 'node:perf_hooks';

import { assert, describe, it } from '@effect/vitest';
import { Duration, Effect, Exit, Layer, Metric, Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { vi } from 'vitest';

import { quietEpisode } from '../operator-alerts.ts';
import {
  eventLoopDelayMean,
  eventLoopDelayP99,
  memoryExternal,
  memoryHeapTotal,
  memoryHeapUsed,
  memoryRss,
  noteEventLoopDelay,
  RuntimeMetrics,
} from '../runtime-metrics.ts';
import { collectLeveledLogs } from './support/logs.ts';

const monitors = vi.hoisted(
  (): ReturnType<typeof PerfHooks.monitorEventLoopDelay>[] => [],
);

vi.mock('node:perf_hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof PerfHooks>();
  return {
    ...actual,
    monitorEventLoopDelay: (
      ...options: Parameters<typeof actual.monitorEventLoopDelay>
    ) => {
      const monitor = actual.monitorEventLoopDelay(...options);
      monitors.push(monitor);
      return monitor;
    },
  };
});

const INTERVAL = Duration.seconds(10);

const BLOCK_MILLIS = 60;

const gauge = (metric: Metric.Gauge<number>) =>
  Effect.map(Metric.value(metric), (state) => state.value);

const blockEventLoop = Effect.sync(() => {
  const until = performance.now() + BLOCK_MILLIS;
  while (performance.now() < until) {
    continue;
  }
});

const withRegistry = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, Metric.MetricRegistry, new Map());

const started = Effect.gen(function* () {
  monitors.length = 0;
  const scope = yield* Scope.make();
  yield* Layer.buildWithScope(
    RuntimeMetrics.layer({ sampleInterval: INTERVAL }),
    scope,
  );
  assert.lengthOf(monitors, 1);
  return { scope, monitor: monitors[0]! };
});

describe('the runtime metrics', () => {
  it.effect(
    'reports event-loop delay after one tick, then starts a new window',
    () =>
      withRegistry(
        Effect.gen(function* () {
          const { scope, monitor } = yield* started;

          yield* blockEventLoop;
          yield* TestClock.withLive(Effect.sleep(Duration.millis(100)));
          const recorded = monitor.count;
          assert.isAtLeast(recorded, 3);
          yield* TestClock.adjust(INTERVAL);
          assert.isBelow(monitor.count, recorded);

          const p99 = yield* gauge(eventLoopDelayP99);
          const mean = yield* gauge(eventLoopDelayMean);
          assert.isAbove(p99, 0);
          assert.isAbove(mean, 0);
          assert.isAtMost(mean, p99);
          assert.isBelow(p99, 60_000);

          yield* Scope.close(scope, Exit.void);
        }),
      ),
  );

  it.effect('reports the process’s memory', () =>
    withRegistry(
      Effect.gen(function* () {
        const { scope } = yield* started;
        yield* TestClock.adjust(INTERVAL);

        const rss = yield* gauge(memoryRss);
        const heapUsed = yield* gauge(memoryHeapUsed);
        const heapTotal = yield* gauge(memoryHeapTotal);
        const external = yield* gauge(memoryExternal);
        assert.isAbove(rss, 0);
        assert.isAbove(heapUsed, 0);
        assert.isAbove(heapTotal, 0);
        assert.isAbove(external, 0);
        assert.isAtMost(heapUsed, heapTotal);

        yield* Scope.close(scope, Exit.void);
      }),
    ),
  );

  it.effect('stops sampling and the monitor when its scope closes', () =>
    withRegistry(
      Effect.gen(function* () {
        const { scope, monitor } = yield* started;
        yield* TestClock.adjust(INTERVAL);
        assert.isAbove(yield* gauge(memoryRss), 0);

        yield* Scope.close(scope, Exit.void);
        assert.isFalse(monitor.disable());

        yield* Metric.update(memoryRss, -1);
        yield* TestClock.adjust(Duration.times(INTERVAL, 3));
        assert.strictEqual(yield* gauge(memoryRss), -1);
      }),
    ),
  );
});

describe('the event-loop lag alert', () => {
  it.effect(
    'logs once when p99 delay stays above 200 ms for five minutes, and once when it recovers',
    () => {
      const logs = collectLeveledLogs();
      return Effect.gen(function* () {
        const episode = quietEpisode();
        const note = (p99: number) => noteEventLoopDelay(episode, p99);
        const records = () =>
          logs.records.map(({ level, annotations }) => ({
            level,
            alert: annotations.alert,
            p99_ms: annotations.p99_ms,
          }));

        yield* note(250);
        yield* TestClock.adjust(Duration.minutes(3));
        yield* note(150);
        yield* TestClock.adjust(Duration.minutes(3));
        yield* note(250);
        yield* TestClock.adjust(Duration.minutes(4));
        yield* note(250);
        assert.deepStrictEqual(records(), []);

        yield* TestClock.adjust(Duration.minutes(1));
        yield* note(260);
        yield* TestClock.adjust(Duration.minutes(5));
        yield* note(300);
        assert.deepStrictEqual(records(), [
          { level: 'Error', alert: 'event_loop_lag', p99_ms: 260 },
        ]);

        yield* note(120);
        yield* TestClock.adjust(Duration.minutes(1));
        yield* note(110);
        assert.deepStrictEqual(records(), [
          { level: 'Error', alert: 'event_loop_lag', p99_ms: 260 },
          { level: 'Info', alert: undefined, p99_ms: 120 },
        ]);
      }).pipe(Effect.provide(logs.layer));
    },
  );
});
