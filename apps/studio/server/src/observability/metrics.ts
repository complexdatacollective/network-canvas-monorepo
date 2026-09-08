import { Counter, Gauge, Histogram } from '@prometheus-io/client';
import type pg from 'pg';

import { createHttpRuntimeMetrics } from '@codaco/studio-sync/operational-metrics';

import type { OutboxObserver } from '../outbox/instrumentation.ts';
import type { RequestObservation } from './logger.ts';
import { createQueueProbe } from './queues.ts';
import type { createReadiness } from './readiness.ts';

type Readiness = ReturnType<typeof createReadiness>;

export function createOperationalMetrics(options: {
  pool?: pg.Pool;
  maintenancePool?: pg.Pool;
  readiness: Readiness;
  monitorProcess?: boolean;
  timeoutMs?: number;
  cacheMs?: number;
}) {
  const runtime = createHttpRuntimeMetrics({
    prefix: 'studio',
    pools: [
      ['application', options.pool],
      ['maintenance', options.maintenancePool],
    ],
    monitorProcess: options.monitorProcess,
  });
  const registry = runtime.registry;
  const registers = [registry];
  const sockets = new Gauge({
    name: 'studio_websocket_connections',
    help: 'Open application WebSocket connections.',
    registers,
  });
  const ready = new Gauge({
    name: 'studio_dependency_ready',
    help: 'One when the latest bounded dependency probe is ready.',
    labelNames: ['dependency'] as const,
    registers,
  });
  const queueAvailable = new Gauge({
    name: 'studio_outbox_collection_success',
    help: 'One when all queue snapshots were collected with the maintenance role.',
    registers,
  });
  const queueCounts = new Gauge({
    name: 'studio_outbox_jobs',
    help: 'Current outbox jobs by queue and state. Ready and lease states are subsets of pending.',
    labelNames: ['queue', 'state'] as const,
    registers,
  });
  const oldest = new Gauge({
    name: 'studio_outbox_oldest_ready_seconds',
    help: 'Age since the oldest currently claimable job became available; zero for an empty ready queue.',
    labelNames: ['queue'] as const,
    registers,
  });
  const lastFailure = new Gauge({
    name: 'studio_outbox_last_failure_timestamp_seconds',
    help: 'Unix time of the most recent retained terminal failure; zero when no failed rows exist.',
    labelNames: ['queue'] as const,
    registers,
  });
  const lastWorkerError = new Gauge({
    name: 'studio_outbox_last_worker_error_timestamp_seconds',
    help: 'Unix time of the most recent worker polling error in this process.',
    labelNames: ['queue'] as const,
    registers,
  });
  const attempts = new Counter({
    name: 'studio_outbox_dispatch_results_total',
    help: 'Shared dispatcher results; retryable failure and uncertain acceptance are distinct.',
    labelNames: ['queue', 'result'] as const,
    registers,
  });
  const dispatchLatency = new Histogram({
    name: 'studio_outbox_dispatch_duration_seconds',
    help: 'Shared dispatcher run duration.',
    labelNames: ['queue'] as const,
    buckets: [0.01, 0.1, 1, 5, 30, 60, 300],
    registers,
  });
  const dispatchErrors = new Counter({
    name: 'studio_outbox_errors_total',
    help: 'Dispatcher and worker lifecycle errors; one failure may cross both boundaries.',
    labelNames: ['queue', 'kind'] as const,
    registers,
  });
  const heartbeats = new Counter({
    name: 'studio_outbox_lease_renewals_total',
    help: 'Shared dispatcher lease renewal outcomes.',
    labelNames: ['queue', 'outcome'] as const,
    registers,
  });
  const queueProbe = createQueueProbe(
    options.maintenancePool,
    options.timeoutMs,
    options.cacheMs,
  );
  const observer: OutboxObserver = (event) => {
    if (event.kind === 'dispatch') {
      dispatchLatency.observe({ queue: event.queue }, event.durationMs / 1000);
      for (const result of [
        'claimed',
        'completed',
        'retried',
        'failed',
        'suppressed',
        'uncertain',
        'leaseLost',
      ] as const) {
        attempts.inc({ queue: event.queue, result }, event[result]);
      }
    } else if (event.kind === 'heartbeat') {
      heartbeats.inc({ queue: event.queue, outcome: event.outcome });
    } else {
      dispatchErrors.inc({ queue: event.queue, kind: event.kind });
      if (event.kind === 'worker_error')
        lastWorkerError.set({ queue: event.queue }, Date.now() / 1000);
    }
  };

  return {
    observer,
    request(this: void, observation: RequestObservation) {
      runtime.request(observation);
    },
    socketOpened() {
      sockets.inc();
    },
    socketClosed() {
      sockets.dec();
    },
    async scrape() {
      const [readiness, queues] = await Promise.all([
        options.readiness.check(),
        queueProbe.check(),
      ]);
      for (const [dependency, state] of Object.entries(readiness.checks))
        ready.set(
          { dependency },
          state === 'ok' || state === 'current' ? 1 : 0,
        );
      queueAvailable.set(queues.status === 'ok' ? 1 : 0);
      // Never retain stale healthy queue data after a collection failure.
      queueCounts.reset();
      oldest.reset();
      lastFailure.reset();
      if (queues.status === 'ok') {
        for (const row of queues.value) {
          oldest.set({ queue: row.queue }, row.oldest_ready_seconds);
          lastFailure.set(
            { queue: row.queue },
            row.last_failure_timestamp_seconds,
          );
          for (const state of [
            'pending',
            'ready',
            'leased',
            'expired_leases',
            'failed',
            'uncertain',
            'suppressed',
          ] as const)
            queueCounts.set({ queue: row.queue, state }, row[state]);
        }
      }
      runtime.collectRuntime();
      return {
        body: await registry.metrics(),
        contentType: registry.contentType,
      };
    },
    stop() {
      queueProbe.stop();
      runtime.stop();
    },
  };
}
