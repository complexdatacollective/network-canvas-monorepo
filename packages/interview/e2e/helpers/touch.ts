import type { Page } from '@playwright/test';

type Point = { x: number; y: number };

// Each gesture moves in steps of a few pixels, as a finger reports itself.
const STEPS = 40;

/**
 * Fingers on a touch screen, for a page in a context with `hasTouch`.
 * Playwright's own touchscreen only taps, so the touches go through the
 * Chrome DevTools Protocol: real input, which the browser turns into the
 * touch and pointer events a finger would (and so honours `touch-action`).
 * Chromium only.
 */
export async function touchscreen(page: Page) {
  const session = await page.context().newCDPSession(page);
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: Point[],
  ) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point, id) => ({ ...point, id })),
    });
  const between = (from: Point, to: Point, step: number): Point => ({
    x: from.x + ((to.x - from.x) * step) / STEPS,
    y: from.y + ((to.y - from.y) * step) / STEPS,
  });

  return {
    /** One finger, pressed at `from`, moved to `to`, and lifted. */
    drag: async (from: Point, to: Point) => {
      await touch('touchStart', [from]);
      for (let step = 1; step <= STEPS; step++) {
        await touch('touchMove', [between(from, to, step)]);
      }
      await touch('touchEnd', []);
    },
    /** Two fingers either side of `centre`, level with it, `from` pixels
     * apart, moved until they are `to` pixels apart, and lifted. */
    pinch: async (centre: Point, from: number, to: number) => {
      const fingers = (distance: number): Point[] => [
        { x: centre.x - distance / 2, y: centre.y },
        { x: centre.x + distance / 2, y: centre.y },
      ];
      await touch('touchStart', fingers(from));
      for (let step = 1; step <= STEPS; step++) {
        await touch('touchMove', fingers(from + ((to - from) * step) / STEPS));
      }
      await touch('touchEnd', []);
    },
  };
}
