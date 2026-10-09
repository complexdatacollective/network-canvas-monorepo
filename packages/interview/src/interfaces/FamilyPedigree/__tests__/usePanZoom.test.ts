import { describe, expect, test } from 'vitest';

import {
  clampPanToKeep,
  shiftIntoArea,
  viewCentredOn,
  viewKeepingInArea,
} from '../usePanZoom';

const viewport = { width: 1000, height: 800 };

// A family drawn inside a content layer padded by 160 on every side: a
// parent at the top left and a child at the bottom right.
const people = [
  { left: 160, top: 160, right: 256, bottom: 256 },
  { left: 400, top: 400, right: 496, bottom: 496 },
];

/** How much of the most visible person lies inside the box, across and
 * down. */
const mostVisible = (
  at: { x: number; y: number },
  scale: number,
  area: { left: number; top: number; right: number; bottom: number },
) =>
  Math.max(
    ...people.map((person) => {
      const across =
        Math.min(at.x + person.right * scale, area.right) -
        Math.max(at.x + person.left * scale, area.left);
      const down =
        Math.min(at.y + person.bottom * scale, area.bottom) -
        Math.max(at.y + person.top * scale, area.top);
      return Math.min(across, down);
    }),
  );

describe('clampPanToKeep', () => {
  test('keeps 120 pixels of someone on screen, not of the padding, however far the family is dragged', () => {
    const area = { left: 0, top: 0, right: 1000, bottom: 800 };
    for (const scale of [0.3, 1, 2.5]) {
      for (const far of [
        { x: 10_000, y: 10_000 },
        { x: -10_000, y: -10_000 },
        { x: 10_000, y: -10_000 },
        { x: -10_000, y: 10_000 },
      ]) {
        const at = clampPanToKeep({ ...far, scale }, people, viewport);
        expect(mostVisible(at, scale, area)).toBeGreaterThanOrEqual(
          Math.min(120, 96 * scale) - 0.001,
        );
      }
    }
  });

  test('keeps someone clear of what covers the edges', () => {
    const insets = { top: 150, right: 0, bottom: 120, left: 0 };
    const area = { left: 0, top: 150, right: 1000, bottom: 680 };
    for (const y of [10_000, -10_000]) {
      const at = clampPanToKeep(
        { x: 0, y, scale: 1 },
        people,
        viewport,
        insets,
      );
      expect(mostVisible(at, 1, area)).toBeGreaterThanOrEqual(96 - 0.001);
    }
  });

  test('leaves an offset that already shows someone as it is', () => {
    expect(
      clampPanToKeep({ x: 100, y: 50, scale: 1 }, people, viewport),
    ).toEqual({ x: 100, y: 50 });
  });
});

describe('viewKeepingInArea', () => {
  const area = { left: 0, top: 100, right: 1000, bottom: 700 };
  const box = (top: number) => ({
    left: 400,
    top,
    right: 500,
    bottom: top + 100,
  });

  test('moves just far enough to show the one required, when everyone fits', () => {
    const view = viewKeepingInArea({
      view: { x: 0, y: 0, scale: 1 },
      required: box(0),
      keep: [box(300)],
      area,
      pivot: { x: 450, y: 350 },
    });
    expect(view).toEqual({ x: 0, y: 100, scale: 1 });
  });

  test('zooms out about the pivot, rather than push someone kept out of the area', () => {
    const view = viewKeepingInArea({
      view: { x: 0, y: 0, scale: 1 },
      required: box(-200),
      keep: [box(500)],
      area,
      pivot: { x: 450, y: 550 },
    });
    expect(view.scale).toBeCloseTo(600 / 800);
    for (const kept of [box(-200), box(500)]) {
      expect(view.y + kept.top * view.scale).toBeGreaterThanOrEqual(
        area.top - 0.001,
      );
      expect(view.y + kept.bottom * view.scale).toBeLessThanOrEqual(
        area.bottom + 0.001,
      );
    }
  });

  test('never zooms in', () => {
    const view = viewKeepingInArea({
      view: { x: 0, y: 0, scale: 0.5 },
      required: box(300),
      keep: [],
      area,
      pivot: { x: 0, y: 0 },
    });
    expect(view.scale).toBe(0.5);
  });
});

describe('shiftIntoArea', () => {
  // A short canvas on a phone held sideways: the clear band between the
  // prompt and the toolbar.
  const area = { left: 32, top: 100, right: 812, bottom: 290 };
  const at = (top: number, bottom: number) => ({
    left: 400,
    top,
    right: 460,
    bottom,
  });

  test('moves just far enough to bring everything in, when nothing is kept', () => {
    // A menu reaching above the band.
    expect(shiftIntoArea({ targets: [at(60, 180)], area })).toEqual({
      x: 0,
      y: 40,
    });
  });

  test('never pushes someone kept out of the area', () => {
    // The participant's menu reaches above the band, and the child just
    // added, with room for their own menu, sits at its bottom.
    const shift = shiftIntoArea({
      targets: [at(60, 180)],
      keep: [[at(200, 280)]],
      area,
    });
    expect(shift.y).toBe(10);
    expect(280 + shift.y).toBeLessThanOrEqual(area.bottom);
  });

  test('ignores what is kept when the area cannot hold it', () => {
    expect(
      shiftIntoArea({ targets: [at(60, 180)], keep: [[at(0, 400)]], area }).y,
    ).toBe(40);
  });

  test('keeps the first of the alternatives the area can hold', () => {
    // With room for their menu the child does not fit; alone, they do.
    const shift = shiftIntoArea({
      targets: [at(60, 180)],
      keep: [[at(150, 360)], [at(230, 280)]],
      area,
    });
    expect(shift.y).toBe(10);
  });
});

describe('viewCentredOn', () => {
  const area = { left: 32, top: 120, right: 288, bottom: 900 };

  test('centres the middle of everyone given, at the same zoom when they fit', () => {
    const view = viewCentredOn({
      view: { x: 0, y: 0, scale: 1 },
      boxes: [
        { left: 100, top: 100, right: 190, bottom: 190 },
        { left: 200, top: 300, right: 290, bottom: 390 },
      ],
      area,
    });
    expect(view.scale).toBe(1);
    expect(view.x + 195).toBeCloseTo(160);
    expect(view.y + 245).toBeCloseTo(510);
  });

  test('zooms out so that the person a panel adds to stays beside the one added', () => {
    const boxes = [
      { left: 0, top: 0, right: 90, bottom: 90 },
      { left: 430, top: 200, right: 520, bottom: 290 },
    ];
    const view = viewCentredOn({ view: { x: 0, y: 0, scale: 1 }, boxes, area });
    expect(view.scale).toBeLessThan(1);
    for (const box of boxes) {
      expect(view.x + box.left * view.scale).toBeGreaterThanOrEqual(
        area.left - 0.001,
      );
      expect(view.x + box.right * view.scale).toBeLessThanOrEqual(
        area.right + 0.001,
      );
    }
  });
});
