import type pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoundedProbe, withProbeClient } from '../bounded-probe.ts';

afterEach(() => vi.useRealTimers());

describe('bounded operational probes', () => {
  it('retains one unfinished operation after its deadline, then recovers', async () => {
    vi.useFakeTimers();
    const pending = Promise.withResolvers<string>();
    const run = vi.fn(() => pending.promise);
    const probe = new BoundedProbe(run, 20, 0);
    const first = probe.check();
    await vi.advanceTimersByTimeAsync(21);
    expect(await first).toEqual({ status: 'timeout' });
    expect(
      await Promise.all(Array.from({ length: 50 }, () => probe.check())),
    ).toEqual(Array.from({ length: 50 }, () => ({ status: 'timeout' })));
    expect(run).toHaveBeenCalledTimes(1);
    pending.resolve('late');
    await vi.advanceTimersByTimeAsync(0);
    expect(await probe.check()).toEqual({ status: 'ok', value: 'late' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each(['throw', 'reject'] as const)(
    'reports a sanitized %s failure',
    async (kind) => {
      const error = new Error(
        'participant@example.test protocol-body secret-token',
      );
      const probe = new BoundedProbe(() => {
        if (kind === 'throw') throw error;
        return Promise.reject(error);
      });
      expect(await probe.check()).toEqual({ status: 'failed' });
    },
  );

  it('abandons a late checkout without querying and releases it once', async () => {
    vi.useFakeTimers();
    const checkout = Promise.withResolvers<pg.PoolClient>();
    const connect = vi.fn(() => checkout.promise);
    const pool = { connect } as unknown as pg.Pool;
    const query = vi.fn<() => Promise<number>>();
    const release = vi.fn();
    const client = { release } as unknown as pg.PoolClient;
    const probe = new BoundedProbe(
      (signal) => withProbeClient(pool, signal, query),
      20,
      0,
    );
    const result = probe.check();
    await vi.advanceTimersByTimeAsync(21);
    expect(await result).toEqual({ status: 'timeout' });
    for (let index = 0; index < 20; index += 1) await probe.check();
    expect(connect).toHaveBeenCalledTimes(1);
    checkout.resolve(client);
    await vi.advanceTimersByTimeAsync(0);
    expect(query).not.toHaveBeenCalled();
    expect(release.mock.calls).toEqual([[false]]);
  });

  it('destroys a checked-out client at the deadline while its query is active', async () => {
    vi.useFakeTimers();
    const query = Promise.withResolvers<number>();
    const release = vi.fn(() =>
      query.reject(new Error('connection terminated')),
    );
    const client = { release } as unknown as pg.PoolClient;
    const pool = {
      connect: () => Promise.resolve(client),
    } as unknown as pg.Pool;
    const probe = new BoundedProbe(
      (signal) => withProbeClient(pool, signal, () => query.promise),
      20,
      0,
    );
    const result = probe.check();
    await vi.advanceTimersByTimeAsync(21);
    expect(await result).toEqual({ status: 'timeout' });
    expect(release.mock.calls).toEqual([[true]]);
  });

  it('shares cached observations but rechecks after expiry', async () => {
    vi.useFakeTimers();
    const run = vi.fn(() => Promise.resolve(true));
    const probe = new BoundedProbe(run, 20, 1000);
    expect(await probe.check()).toEqual({ status: 'ok', value: true });
    await probe.check();
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1001);
    await probe.check();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('stops waiting immediately and never starts another operation during shutdown', async () => {
    const run = vi.fn(() => new Promise<void>(() => undefined));
    const probe = new BoundedProbe(run);
    const result = probe.check();
    await Promise.resolve();
    probe.stop();
    expect(await result).toEqual({ status: 'failed' });
    expect(await probe.check()).toEqual({ status: 'failed' });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
