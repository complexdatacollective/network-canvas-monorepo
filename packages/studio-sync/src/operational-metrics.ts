import { monitorEventLoopDelay } from 'node:perf_hooks';

import { Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';
import type pg from 'pg';

import type { RequestObservation } from './operational-http.ts';

const METRIC_PREFIX = /^[a-z][a-z0-9_]{0,63}$/;
const POOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;

export function createHttpRuntimeMetrics(options: {
  prefix: string;
  pools?: ReadonlyArray<readonly [name: string, pool: pg.Pool | undefined]>;
  monitorProcess?: boolean;
}) {
  if (!METRIC_PREFIX.test(options.prefix))
    throw new Error('OPERATIONAL_METRIC_PREFIX_INVALID');
  const pools = (options.pools ?? []).map(([name, pool]) => {
    if (!POOL_NAME.test(name)) throw new Error('OPERATIONAL_POOL_NAME_INVALID');
    return [name, pool] as const;
  });
  const registry = new Registry();
  const registers = [registry];
  const requests = new Counter({
    name: `${options.prefix}_http_requests_total`,
    help: 'Completed HTTP requests through actual transport completion.',
    labelNames: ['method', 'route', 'status'] as const,
    registers,
  });
  const latency = new Histogram({
    name: `${options.prefix}_http_request_duration_seconds`,
    help: 'HTTP request duration through actual transport completion.',
    labelNames: ['method', 'route'] as const,
    buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers,
  });
  const poolConnections = new Gauge({
    name: `${options.prefix}_database_pool_connections`,
    help: 'Pool connections and waiting checkouts.',
    labelNames: ['pool', 'state'] as const,
    registers,
  });
  const poolCapacity = new Gauge({
    name: `${options.prefix}_database_pool_capacity`,
    help: 'Configured maximum pool connections.',
    labelNames: ['pool'] as const,
    registers,
  });
  const lag = new Gauge({
    name: `${options.prefix}_event_loop_lag_seconds`,
    help: 'Event loop delay since the preceding scrape.',
    labelNames: ['statistic'] as const,
    registers,
  });
  const eventLoop = options.monitorProcess
    ? monitorEventLoopDelay({ resolution: 20 })
    : undefined;
  eventLoop?.enable();

  const collectRuntime = () => {
    poolConnections.reset();
    poolCapacity.reset();
    for (const [name, pool] of pools) {
      if (!pool) continue;
      poolCapacity.set({ pool: name }, pool.options.max ?? 10);
      for (const [state, count] of [
        ['active', pool.totalCount - pool.idleCount],
        ['idle', pool.idleCount],
        ['waiting', pool.waitingCount],
      ] as const)
        poolConnections.set({ pool: name, state }, count);
    }
    if (eventLoop) {
      for (const [statistic, value] of [
        ['mean', eventLoop.mean],
        ['max', eventLoop.max],
        ['p99', eventLoop.percentile(99)],
      ] as const)
        lag.set({ statistic }, Number.isFinite(value) ? value / 1e9 : 0);
      eventLoop.reset();
    }
  };

  return {
    registry,
    request(observation: RequestObservation) {
      requests.inc({
        method: observation.method,
        route: observation.route,
        status: String(observation.status),
      });
      latency.observe(
        { method: observation.method, route: observation.route },
        observation.durationMs / 1_000,
      );
    },
    collectRuntime,
    async scrape() {
      collectRuntime();
      return {
        body: await registry.metrics(),
        contentType: registry.contentType,
      };
    },
    stop() {
      eventLoop?.disable();
    },
  };
}
