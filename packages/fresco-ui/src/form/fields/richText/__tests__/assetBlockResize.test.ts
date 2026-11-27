import { describe, expect, it } from 'vitest';

import {
  nameOfStep,
  nearestStep,
  stepBeside,
  widthDraggedTo,
  widthsOfSteps,
} from '../assetBlockResize';

// The bands in a window 900 pixels tall: 12rem, 24rem and 60vh.
const HEIGHTS = { small: 192, medium: 384, large: 540 } as const;

describe('widthsOfSteps', () => {
  it('draws a square picture as wide as each band is tall, and the full size as wide as the page', () => {
    expect(widthsOfSteps({ full: 800, ratio: 1, heights: HEIGHTS })).toEqual([
      { size: 'small', width: 192 },
      { size: 'medium', width: 384 },
      { size: 'large', width: 540 },
      { size: null, width: 800 },
    ]);
  });

  it('never draws a picture wider than the page', () => {
    expect(
      widthsOfSteps({ full: 600, ratio: 2, heights: HEIGHTS }).map(
        ({ width }) => width,
      ),
    ).toEqual([384, 600, 600, 600]);
  });
});

describe('nearestStep', () => {
  const square = widthsOfSteps({ full: 800, ratio: 1, heights: HEIGHTS });

  it.each([
    [10, 'small'],
    [250, 'small'],
    [300, 'medium'],
    [470, 'large'],
    [700, null],
    [5000, null],
  ] as const)('takes a picture %i pixels wide to %s', (width, size) => {
    expect(nearestStep(width, square, 'medium')).toBe(size);
  });

  // A wide picture that the page cuts down at every band but the smallest.
  const wide = widthsOfSteps({ full: 600, ratio: 2, heights: HEIGHTS });

  it('keeps the size a picture has where others draw it as wide', () => {
    expect(nearestStep(600, wide, 'medium')).toBe('medium');
    expect(nearestStep(600, wide, 'large')).toBe('large');
  });

  it('takes the largest of sizes that draw it as wide, where its own is not one', () => {
    expect(nearestStep(600, wide, 'small')).toBe(null);
  });
});

describe('widthDraggedTo', () => {
  const start = { width: 400, height: 200 };
  const limits = { min: 24, max: 800 };

  it('grows a centred picture by twice the move across, so the handle stays under the pointer', () => {
    expect(widthDraggedTo(start, { across: 50, down: 0 }, limits)).toBe(500);
    expect(widthDraggedTo(start, { across: -50, down: 0 }, limits)).toBe(300);
  });

  it('keeps the picture’s shape for a move down', () => {
    expect(widthDraggedTo(start, { across: 0, down: 50 }, limits)).toBe(500);
  });

  it('takes the move that says the most', () => {
    expect(widthDraggedTo(start, { across: 10, down: -100 }, limits)).toBe(200);
    expect(widthDraggedTo(start, { across: 120, down: 10 }, limits)).toBe(640);
  });

  it('keeps the width within its limits', () => {
    expect(widthDraggedTo(start, { across: 1000, down: 0 }, limits)).toBe(800);
    expect(widthDraggedTo(start, { across: -1000, down: 0 }, limits)).toBe(24);
  });
});

describe('stepBeside', () => {
  it.each([
    ['small', 1, 'medium'],
    ['medium', 1, 'large'],
    ['large', 1, null],
    [null, 1, null],
    [null, -1, 'large'],
    ['small', -1, 'small'],
  ] as const)('goes from %s by %i to %s', (from, by, to) => {
    expect(stepBeside(from, by)).toBe(to);
  });
});

describe('nameOfStep', () => {
  it('names every size in English', () => {
    expect(
      ([null, 'small', 'medium', 'large'] as const).map(nameOfStep),
    ).toEqual(['Full size', 'Small', 'Medium', 'Large']);
  });
});
