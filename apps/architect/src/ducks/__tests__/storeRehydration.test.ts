import { afterEach, describe, expect, it, vi } from 'vitest';

import { storeRehydrated } from '../store';
import { createStoreRehydrationGate } from '../storeRehydration';

describe('storeRehydrated', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles after redux-remember restores the session id', async () => {
    await expect(storeRehydrated).resolves.toBe('rehydrated');
  });

  it('settles through a bounded fallback and ignores a later result', async () => {
    vi.useFakeTimers();
    const gate = createStoreRehydrationGate(50);

    await vi.advanceTimersByTimeAsync(50);

    await expect(gate.promise).resolves.toBe('timed-out');
    gate.settle('rehydrated');

    expect(gate.getResult()).toBe('timed-out');
  });

  it('preserves an initialization failure as the first outcome', async () => {
    vi.useFakeTimers();
    const gate = createStoreRehydrationGate(50);

    gate.settle('failed');
    gate.settle('rehydrated');

    await expect(gate.promise).resolves.toBe('failed');
    expect(gate.getResult()).toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
  });
});
