import { createHash, timingSafeEqual } from 'node:crypto';

import type pg from 'pg';

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

const digest = (value: string) => createHash('sha256').update(value).digest();

export function authorizeMetrics(
  header: string | undefined,
  token: string,
): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(header.slice(7)), digest(token));
}
