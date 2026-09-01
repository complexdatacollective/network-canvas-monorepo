export type LatestFrame<T> = {
  schedule: (value: T) => void;
  cancel: () => void;
};

// Coalesces a burst to one animation-frame callback while retaining the newest
// value. A plain "frame already pending" guard would discard later values and
// can leave hover feedback stuck on the first point in a burst.
export function createLatestFrame<T>(
  consume: (value: T) => void,
  requestFrame: (
    callback: FrameRequestCallback,
  ) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
): LatestFrame<T> {
  let frame: number | null = null;
  let hasValue = false;
  let latest: T;

  return {
    schedule(value) {
      latest = value;
      hasValue = true;
      if (frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        if (!hasValue) return;
        hasValue = false;
        consume(latest);
      });
    },
    cancel() {
      hasValue = false;
      if (frame === null) return;
      cancelFrame(frame);
      frame = null;
    },
  };
}
