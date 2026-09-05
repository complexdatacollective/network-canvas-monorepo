import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OutboxObserver } from '../instrumentation.ts';
import { startOutboxWorker } from '../worker.ts';

describe('shared outbox polling worker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('bounds each drain and ends an empty drain before the next poll', async () => {
    const runOnce = vi
      .fn<() => Promise<{ claimed: number }>>()
      .mockResolvedValueOnce({ claimed: 1 })
      .mockResolvedValueOnce({ claimed: 1 })
      .mockResolvedValue({ claimed: 0 });
    const worker = startOutboxWorker({
      queue: 'audit_alert_outbox',
      runOnce,
      drainLimit: 2,
      pollIntervalMs: 50,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(runOnce).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(49);
    expect(runOnce).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(runOnce).toHaveBeenCalledTimes(3);

    await worker.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(runOnce).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never overlaps drains and waits for an active attempt when stopped', async () => {
    let finish!: (result: { claimed: number }) => void;
    const attempt = new Promise<{ claimed: number }>((resolve) => {
      finish = resolve;
    });
    const runOnce = vi
      .fn<() => Promise<{ claimed: number }>>()
      .mockReturnValue(attempt);
    const worker = startOutboxWorker({
      queue: 'message_deliveries',
      runOnce,
      pollIntervalMs: 50,
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(runOnce).toHaveBeenCalledOnce();
    let stopped = false;
    const stopping = worker.stop().then(() => {
      stopped = true;
      return undefined;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(stopped).toBe(false);
    expect(runOnce).toHaveBeenCalledOnce();

    finish({ claimed: 1 });
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(runOnce).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['throws', 'rejects'] as const)(
    'recovers after failure even when diagnostics %s',
    async (failureMode) => {
      const failure = new Error('secret-provider-response');
      const runOnce = vi
        .fn<() => Promise<{ claimed: number }>>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValue({ claimed: 0 });
      const observer = vi.fn<OutboxObserver>(() => {
        if (failureMode === 'throws') throw new Error('broken metrics');
        return Promise.reject(new Error('broken metrics'));
      });
      const onError = vi.fn(() => {
        if (failureMode === 'throws') throw new Error('broken logger');
        return Promise.reject(new Error('broken logger'));
      });
      const worker = startOutboxWorker({
        queue: 'audit_alert_outbox',
        runOnce,
        observer,
        onError,
        pollIntervalMs: 50,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(observer).toHaveBeenCalledExactlyOnceWith({
        queue: 'audit_alert_outbox',
        kind: 'worker_error',
      });
      expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
      await vi.advanceTimersByTimeAsync(50);
      expect(runOnce).toHaveBeenCalledTimes(2);

      await worker.stop();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('can stop before the first scheduled drain', async () => {
    const runOnce = vi
      .fn<() => Promise<{ claimed: number }>>()
      .mockResolvedValue({ claimed: 1 });
    const worker = startOutboxWorker({ queue: 'audit_export_jobs', runOnce });
    await worker.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runOnce).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { pollIntervalMs: 0 },
    { pollIntervalMs: Infinity },
    { drainLimit: 0 },
    { drainLimit: 1.5 },
  ])('refuses an unbounded or non-progressing worker: %j', (limits) => {
    expect(() =>
      startOutboxWorker({
        queue: 'audit_alert_outbox',
        runOnce: async () => ({ claimed: 0 }),
        ...limits,
      }),
    ).toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
