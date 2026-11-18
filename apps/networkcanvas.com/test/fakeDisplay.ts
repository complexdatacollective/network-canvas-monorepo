import { vi } from 'vitest';

/**
 * A display to drive `requestAnimationFrame` with: `run` calls every pending
 * callback once per frame, at the given refresh rate, for a length of time.
 * Restore the real functions with `vi.unstubAllGlobals()`.
 */
export function createFakeDisplay() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, FrameRequestCallback>();

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const handle = nextHandle;
    nextHandle += 1;
    pending.set(handle, callback);
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    pending.delete(handle);
  });

  return {
    run(refreshRate: number, milliseconds: number) {
      const frames = Math.round((milliseconds / 1000) * refreshRate);
      for (let frame = 0; frame < frames; frame += 1) {
        now += 1000 / refreshRate;
        const callbacks = [...pending.values()];
        pending.clear();
        for (const callback of callbacks) callback(now);
      }
    },
    /** How many callbacks are waiting for the next frame. */
    waiting: () => pending.size,
  };
}
