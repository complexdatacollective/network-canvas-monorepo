import type { Locator, Page } from '@playwright/test';

import { expect } from '../fixtures/matrix-test.js';
import { touchscreen } from '../helpers/touch.js';

/** How far the canvas is zoomed: the scale of its panned content. */
const canvasScale = (page: Page): Promise<number> =>
  page
    .getByTestId('pedigree-canvas-content')
    .evaluate(
      (content) => new DOMMatrix(getComputedStyle(content).transform).a,
    );

const centreOf = async (element: Locator) => {
  const box = await element.boundingBox();
  if (!box) throw new Error('The person is not shown');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/**
 * The pedigree canvas (Family and Narrative Pedigree alike) on a touch
 * screen: two fingers pinch to zoom about the point between them, by as much
 * as they spread or close, and one finger drags the family, even from a
 * person. `person` is someone drawn on the canvas, who starts the pinch
 * between the fingers.
 */
export async function expectCanvasFollowsFingers(page: Page, person: Locator) {
  const fingers = await touchscreen(page);
  await expect(person).toBeVisible();
  const opened = await canvasScale(page);
  const between = await centreOf(person);

  // Fingers spread to twice as far apart: the family is drawn twice as
  // large, and the person between them stays between them.
  await fingers.pinch(between, 100, 200);
  await expect
    .poll(async () => (await canvasScale(page)) / opened)
    .toBeCloseTo(2, 1);
  const spread = await centreOf(person);
  expect(Math.abs(spread.x - between.x)).toBeLessThan(2);
  expect(Math.abs(spread.y - between.y)).toBeLessThan(2);

  // Closed back together, they undo it.
  await fingers.pinch(between, 200, 100);
  await expect
    .poll(async () => (await canvasScale(page)) / opened)
    .toBeCloseTo(1, 1);
  const closed = await centreOf(person);
  expect(Math.abs(closed.x - between.x)).toBeLessThan(2);
  expect(Math.abs(closed.y - between.y)).toBeLessThan(2);

  // One finger, pressed on the person, drags the family with it, at the
  // same zoom: all the way, less the few pixels a press moves before it
  // counts as a drag rather than a tap (5 on each axis).
  const pressed = await centreOf(person);
  const lifted = { x: pressed.x + 120, y: pressed.y + 60 };
  await fingers.drag(pressed, lifted);
  await expect
    .poll(async () => {
      const dragged = await centreOf(person);
      return Math.hypot(dragged.x - lifted.x, dragged.y - lifted.y);
    })
    .toBeLessThan(10);
  expect((await canvasScale(page)) / opened).toBeCloseTo(1, 1);
}
