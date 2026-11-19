// Display refresh rates run from 60 to 240 frames a second, and a frame
// arrives a fraction of a millisecond early as often as late. Without this
// allowance a loop asked for 30 frames a second on a 60Hz display would skip
// every frame that came in at 33.2ms instead of 33.4ms, and run at 20.
export const EARLY_FRAME_ALLOWANCE = 2;

/**
 * Calls `onFrame` in step with the display, but no more often than
 * `framesPerSecond`, until the returned function is called.
 *
 * A loop that only draws something slow, or something expensive to draw, has
 * no use for every frame a 120Hz display offers: each one is a repaint. This
 * keeps the loop on the display's own frames, so its pace stays even, and
 * lets the extra ones pass.
 *
 * `elapsed` is the time since the last call, in milliseconds, and 0 for the
 * first.
 */
export function startFrameLoop(
  onFrame: (elapsed: number, timestamp: number) => void,
  framesPerSecond: number,
) {
  const interval = 1000 / framesPerSecond - EARLY_FRAME_ALLOWANCE;
  let frame = 0;
  let last: number | null = null;

  const tick = (timestamp: number) => {
    frame = requestAnimationFrame(tick);
    if (last !== null && timestamp - last < interval) return;
    const elapsed = last === null ? 0 : timestamp - last;
    last = timestamp;
    onFrame(elapsed, timestamp);
  };
  frame = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(frame);
}
