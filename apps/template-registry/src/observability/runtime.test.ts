import pg from 'pg';
import { expect, it } from 'vitest';

import { createRegistryObservability } from './runtime.ts';

const observation = {
  requestId: 'CB6DC2C0-DF78-4FD2-9131-7FF2909C88E5',
  route: '/healthz',
  method: 'GET',
  status: 200,
  durationMs: 1.23456,
};

it('writes only the bounded request schema and isolates sink failures', async () => {
  const pool = new pg.Pool({ max: 3 });
  const operatorPool = new pg.Pool({ max: 2 });
  const lines: string[] = [];
  const observability = createRegistryObservability({
    pool,
    operatorPool,
    monitorProcess: false,
    write: (line) => lines.push(line),
  });
  try {
    observability.request(observation);
    expect(JSON.parse(lines[0]!)).toEqual({
      timestamp: expect.any(String),
      event: 'http_request',
      request_id: observation.requestId.toLowerCase(),
      route: '/healthz',
      method: 'GET',
      status: 200,
      duration_ms: 1.235,
    });
    expect((await observability.scrape()).body).toContain(
      'registry_database_pool_capacity{pool="application"} 3',
    );
    const broken = createRegistryObservability({
      pool,
      operatorPool,
      monitorProcess: false,
      write: () => {
        throw new Error('synthetic private sink contents');
      },
    });
    expect(() => broken.request(observation)).not.toThrow();
    broken.stop();
  } finally {
    observability.stop();
    await Promise.all([pool.end(), operatorPool.end()]);
  }
});
