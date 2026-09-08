import type pg from 'pg';

import { authorizeBearerToken } from '@codaco/studio-sync/operational-http';

import type { AssetStore } from '../assets.ts';
import { createOperationalMetrics } from './metrics.ts';
import { createReadiness } from './readiness.ts';

export function createObservability(options: {
  pool?: pg.Pool;
  maintenancePool?: pg.Pool;
  assetStore?: AssetStore;
  monitorProcess?: boolean;
  timeoutMs?: number;
  cacheMs?: number;
  allowUnversionedSchema?: boolean;
  allowedLogins?: readonly string[];
  administrativeLogins?: readonly string[];
}) {
  const readiness = createReadiness(options);
  const metrics = createOperationalMetrics({ ...options, readiness });
  return {
    readiness,
    metrics,
    stop() {
      readiness.stop();
      metrics.stop();
    },
  };
}

export function authorizeMetrics(
  header: string | undefined,
  token: string,
): boolean {
  return authorizeBearerToken(header, token);
}
