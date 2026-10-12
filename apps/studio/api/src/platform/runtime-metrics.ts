import { monitorEventLoopDelay } from 'node:perf_hooks';

import { Duration, Effect, Layer, Metric, Schedule } from 'effect';

export const eventLoopDelayP99 = Metric.gauge(
  'studio_runtime_event_loop_delay_p99_ms',
  {
    description:
      '99th percentile event-loop delay over the last sample window, in milliseconds',
  },
);

export const eventLoopDelayMean = Metric.gauge(
  'studio_runtime_event_loop_delay_mean_ms',
  {
    description:
      'mean event-loop delay over the last sample window, in milliseconds',
  },
);

export const memoryRss = Metric.gauge('studio_runtime_memory_rss_bytes', {
  description: 'resident set size of the process, in bytes',
});

export const memoryHeapUsed = Metric.gauge(
  'studio_runtime_memory_heap_used_bytes',
  { description: 'V8 heap in use, in bytes' },
);

export const memoryHeapTotal = Metric.gauge(
  'studio_runtime_memory_heap_total_bytes',
  { description: 'V8 heap allocated, in bytes' },
);

export const memoryExternal = Metric.gauge(
  'studio_runtime_memory_external_bytes',
  {
    description: 'memory held by C++ objects bound to JavaScript, in bytes',
  },
);

export type RuntimeMetricsConfig = {
  readonly sampleInterval?: Duration.Input | undefined;
};

const DEFAULT_SAMPLE_INTERVAL = Duration.seconds(10);

const NANOS_PER_MILLI = 1_000_000;

type EventLoopDelay = ReturnType<typeof monitorEventLoopDelay>;

const sample = (histogram: EventLoopDelay) =>
  Effect.gen(function* () {
    if (histogram.count > 0) {
      const p99 = histogram.percentile(99) / NANOS_PER_MILLI;
      const mean = histogram.mean / NANOS_PER_MILLI;
      histogram.reset();
      yield* Metric.update(eventLoopDelayP99, p99);
      yield* Metric.update(eventLoopDelayMean, mean);
    }
    const memory = process.memoryUsage();
    yield* Metric.update(memoryRss, memory.rss);
    yield* Metric.update(memoryHeapUsed, memory.heapUsed);
    yield* Metric.update(memoryHeapTotal, memory.heapTotal);
    yield* Metric.update(memoryExternal, memory.external);
  });

export const RuntimeMetrics = {
  layer: (config: RuntimeMetricsConfig = {}): Layer.Layer<never> =>
    Layer.effectDiscard(
      Effect.gen(function* () {
        const histogram = yield* Effect.acquireRelease(
          Effect.sync(() => {
            const monitor = monitorEventLoopDelay();
            monitor.enable();
            return monitor;
          }),
          (monitor) => Effect.sync(() => monitor.disable()),
        );
        yield* Effect.forkScoped(
          sample(histogram).pipe(
            Effect.repeat(
              Schedule.spaced(config.sampleInterval ?? DEFAULT_SAMPLE_INTERVAL),
            ),
          ),
        );
      }),
    ),
} as const;

export const RuntimeMetricsLive: Layer.Layer<never> = RuntimeMetrics.layer();
