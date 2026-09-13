import pg from 'pg';
import { expect, it, vi } from 'vitest';

import { startOutboxWorker } from '../../outbox/worker.ts';
import { startMonitoringRollupWorker } from '../recompute.ts';

vi.mock('../../outbox/worker.ts', () => ({
  startOutboxWorker: vi.fn(() => ({ stop: vi.fn(async () => undefined) })),
}));

it('starts one poll loop for the shared wave and stage recomputation queue', async () => {
  const pool = new pg.Pool();
  const worker = startMonitoringRollupWorker({ pool });
  expect(startOutboxWorker).toHaveBeenCalledTimes(1);
  expect(startOutboxWorker).toHaveBeenCalledWith(
    expect.objectContaining({ queue: 'study_wave_rollups' }),
  );
  const started = vi.mocked(startOutboxWorker).mock.results[0];
  if (!started || started.type !== 'return')
    throw new Error('worker did not start');
  await worker.stop();
  expect(started.value.stop).toHaveBeenCalledOnce();
  await pool.end();
});
