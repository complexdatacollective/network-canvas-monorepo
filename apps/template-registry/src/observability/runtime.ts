import type pg from 'pg';

import { requestLogFields } from '@codaco/studio-sync/operational-http';
import { createHttpRuntimeMetrics } from '@codaco/studio-sync/operational-metrics';

export function createRegistryObservability(options: {
  pool: pg.Pool;
  operatorPool: pg.Pool;
  monitorProcess?: boolean;
  write?: (line: string) => void;
}) {
  const metrics = createHttpRuntimeMetrics({
    prefix: 'registry',
    pools: [
      ['application', options.pool],
      ['operator', options.operatorPool],
    ],
    monitorProcess: options.monitorProcess,
  });
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  return {
    request(observation: Parameters<typeof metrics.request>[0]) {
      try {
        metrics.request(observation);
        write(
          `${JSON.stringify({
            timestamp: new Date().toISOString(),
            event: 'http_request',
            ...requestLogFields(observation),
          })}\n`,
        );
      } catch {
        /* The bounded operational sink cannot alter a request. */
      }
    },
    scrape: () => metrics.scrape(),
    stop: () => metrics.stop(),
  };
}

export type RegistryObservability = ReturnType<
  typeof createRegistryObservability
>;
