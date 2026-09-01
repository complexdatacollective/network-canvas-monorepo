import { describe, expect, it, vi } from 'vitest';

import { createLatestFrame } from '../latestFrame';

describe('createLatestFrame', () => {
  it('consumes the latest value when several updates share one frame', () => {
    let frameCallback: FrameRequestCallback | null = null;
    const consume = vi.fn();
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    });
    const latestFrame = createLatestFrame(consume, requestFrame, vi.fn());

    latestFrame.schedule({ x: 0.1, y: 0.1 });
    latestFrame.schedule({ x: 0.8, y: 0.7 });

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(frameCallback).not.toBeNull();
    const runFrame = frameCallback as unknown as FrameRequestCallback;
    runFrame(0);
    expect(consume).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledWith({ x: 0.8, y: 0.7 });
  });

  it('cancels a queued value before it can update feedback', () => {
    let frameCallback: FrameRequestCallback | null = null;
    const consume = vi.fn();
    const cancelFrame = vi.fn();
    const latestFrame = createLatestFrame(
      consume,
      (callback) => {
        frameCallback = callback;
        return 7;
      },
      cancelFrame,
    );

    latestFrame.schedule('stale');
    latestFrame.cancel();
    const runFrame = frameCallback as unknown as FrameRequestCallback;
    runFrame(0);

    expect(cancelFrame).toHaveBeenCalledWith(7);
    expect(consume).not.toHaveBeenCalled();
  });
});
