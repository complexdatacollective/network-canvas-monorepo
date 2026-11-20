import { describe, expect, it } from 'vitest';

import { heightDraggedTo, sizeNearest } from '../ResizeCorner.tsx';

describe('the size a picture is dragged to', () => {
  const heights = [
    ['small', 192],
    ['medium', 384],
    ['large', 600],
    ['full', 900],
  ] as const;

  it.each([
    [0, 'small'],
    [287, 'small'],
    [289, 'medium'],
    [491, 'medium'],
    [493, 'large'],
    [749, 'large'],
    [751, 'full'],
    [5000, 'full'],
  ] as const)(
    'is the size drawn nearest to %i pixels tall: %s',
    (wanted, size) => {
      expect(sizeNearest(wanted, heights)).toBe(size);
    },
  );

  it('is the largest of the sizes that draw a small picture the same', () => {
    // A picture 300 pixels tall at the page's width: medium, large and full
    // size all draw it whole.
    const small = [
      ['small', 192],
      ['medium', 300],
      ['large', 300],
      ['full', 300],
    ] as const;
    expect(sizeNearest(300, small)).toBe('full');
    expect(sizeNearest(200, small)).toBe('small');
  });
});

describe('the height a picture’s corner is dragged to', () => {
  // A picture twice as wide as it is tall, 100 pixels tall when taken hold of.
  const RATIO = 2;

  it('is the height it was until the corner moves', () => {
    expect(heightDraggedTo(100, { across: 0, down: 0 }, RATIO)).toBe(100);
  });

  it('follows the corner down, or up', () => {
    expect(heightDraggedTo(100, { across: 0, down: 40 }, RATIO)).toBe(140);
    expect(heightDraggedTo(100, { across: 0, down: -40 }, RATIO)).toBe(60);
  });

  it('follows the corner across as the picture’s shape has it', () => {
    // 80 pixels wider is 40 pixels taller, at twice as wide as tall.
    expect(heightDraggedTo(100, { across: 80, down: 0 }, RATIO)).toBe(140);
    expect(heightDraggedTo(100, { across: -80, down: 0 }, RATIO)).toBe(60);
  });

  it('takes the move that says the most', () => {
    // Down by 10 says 110; across by 80 says 140.
    expect(heightDraggedTo(100, { across: 80, down: 10 }, RATIO)).toBe(140);
    // Across by 10 says 105; down by 50 says 150.
    expect(heightDraggedTo(100, { across: 10, down: 50 }, RATIO)).toBe(150);
    // Shrinking counts as much as growing: up by 30 says 70.
    expect(heightDraggedTo(100, { across: 20, down: -30 }, RATIO)).toBe(70);
  });
});
