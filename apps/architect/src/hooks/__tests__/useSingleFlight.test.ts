import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSingleFlight } from '../useSingleFlight';

/** A promise this test decides when to settle, so a call can be held open. */
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe('useSingleFlight', () => {
  it('refuses a second call while the first is still running', async () => {
    const gate = deferred();
    const operation = vi.fn(() => gate.promise);
    const { result } = renderHook(() => useSingleFlight(operation));

    const first = result.current();
    const second = result.current();

    expect(operation).toHaveBeenCalledTimes(1);

    gate.resolve();
    await Promise.all([first, second]);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('runs again once the first call has settled', async () => {
    const operation = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useSingleFlight(operation));

    await result.current();
    await result.current();

    expect(operation).toHaveBeenCalledTimes(2);
  });

  // A latch left closed by a failure would disable the action for the rest of
  // the session, with nothing on screen to say why.
  it('releases the latch when the operation rejects', async () => {
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('export failed'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useSingleFlight(operation));

    await expect(result.current()).rejects.toThrow('export failed');
    await result.current();

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('passes its arguments through to the operation', async () => {
    const operation = vi.fn((_id: string) => Promise.resolve());
    const { result } = renderHook(() => useSingleFlight(operation));

    await result.current('protocol-1');

    expect(operation).toHaveBeenCalledWith('protocol-1');
  });
});
