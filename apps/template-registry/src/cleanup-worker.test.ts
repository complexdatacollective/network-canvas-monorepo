import { afterEach, expect, it, vi } from 'vitest';

import { startRegistryCleanup } from './cleanup-worker.ts';
import type { RegistryStore } from './store.ts';

afterEach(() => vi.useRealTimers());

it('waits for the active pass before scheduling another and before shutdown finishes', async () => {
  vi.useFakeTimers();
  const work = Promise.withResolvers<number>();
  const store = {
    cleanupDeletedArtifacts: vi.fn(() => work.promise),
    cleanupOrphanArtifacts: vi.fn<RegistryStore['cleanupOrphanArtifacts']>(),
  };
  const onFailure = vi.fn();
  const worker = startRegistryCleanup({ store, onFailure, intervalMs: 1000 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(store.cleanupDeletedArtifacts).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(store.cleanupDeletedArtifacts).toHaveBeenCalledTimes(1);
  expect(store.cleanupOrphanArtifacts).not.toHaveBeenCalled();
  const stopped = vi.fn();
  const stopping = worker.stop().then(stopped);
  await vi.advanceTimersByTimeAsync(0);
  expect(stopped).not.toHaveBeenCalled();
  work.resolve(1);
  await stopping;
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(store.cleanupOrphanArtifacts).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(store.cleanupDeletedArtifacts).toHaveBeenCalledTimes(1);
  expect(onFailure).not.toHaveBeenCalled();
});

it('retains its pagination cursor on a failed page and resumes from the last completed page', async () => {
  vi.useFakeTimers();
  const store = {
    cleanupDeletedArtifacts: vi.fn(async () => 0),
    cleanupOrphanArtifacts: vi
      .fn<RegistryStore['cleanupOrphanArtifacts']>()
      .mockResolvedValueOnce({
        removed: 0,
        retry: false,
        nextCursor: 'page-two',
      })
      .mockResolvedValueOnce({
        removed: 0,
        retry: true,
        nextCursor: 'must-not-advance',
      })
      .mockRejectedValueOnce(new Error('private-provider-credential-canary'))
      .mockResolvedValueOnce({ removed: 2, retry: false })
      .mockResolvedValueOnce({ removed: 0, retry: false }),
  };
  const onFailure = vi.fn();
  const worker = startRegistryCleanup({ store, onFailure, intervalMs: 1000 });
  try {
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.cleanupOrphanArtifacts.mock.calls).toEqual([
      [undefined],
      ['page-two'],
      ['page-two'],
      ['page-two'],
      [undefined],
    ]);
    expect(store.cleanupDeletedArtifacts).toHaveBeenCalledTimes(5);
    expect(onFailure.mock.calls).toEqual([[]]);
  } finally {
    await worker.stop();
  }
});

it('retries a failed deletion pass before attempting another orphan page', async () => {
  vi.useFakeTimers();
  const store = {
    cleanupDeletedArtifacts: vi
      .fn<RegistryStore['cleanupDeletedArtifacts']>()
      .mockRejectedValueOnce(new Error('private-database-error-canary'))
      .mockResolvedValue(0),
    cleanupOrphanArtifacts: vi
      .fn<RegistryStore['cleanupOrphanArtifacts']>()
      .mockResolvedValue({ removed: 0, retry: false }),
  };
  const onFailure = vi.fn();
  const worker = startRegistryCleanup({ store, onFailure, intervalMs: 1000 });
  try {
    await vi.advanceTimersByTimeAsync(1000);
    expect(onFailure.mock.calls).toEqual([[]]);
    expect(store.cleanupOrphanArtifacts).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.cleanupDeletedArtifacts).toHaveBeenCalledTimes(2);
    expect(store.cleanupOrphanArtifacts).toHaveBeenCalledExactlyOnceWith(
      undefined,
    );
  } finally {
    await worker.stop();
  }
});
