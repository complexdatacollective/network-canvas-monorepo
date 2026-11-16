import { describe, expect, it } from 'vitest';

import {
  columnMask,
  safeArea,
  type StageView,
} from '../publicationNetworkFraming';

const WIDTH = 1440;
// The text column at the start of a left-to-right page.
const columnOnTheLeft: StageView = {
  width: WIDTH,
  height: 900,
  columnLeft: 40,
  columnRight: 584,
};
// The same layout in a right-to-left language: its mirror image.
const columnOnTheRight: StageView = {
  ...columnOnTheLeft,
  columnLeft: WIDTH - columnOnTheLeft.columnRight,
  columnRight: WIDTH - columnOnTheLeft.columnLeft,
};

describe('where the publications network is framed', () => {
  it('is to the right of a text column on the left', () => {
    const area = safeArea(columnOnTheLeft, false);
    expect(area.x).toBe(columnOnTheLeft.columnRight + 56);
    expect(area.x + area.width).toBe(WIDTH - 48);
  });

  it('is to the left of a text column on the right', () => {
    const area = safeArea(columnOnTheRight, false);
    expect(area.x).toBe(48);
    expect(area.x + area.width).toBe(columnOnTheRight.columnLeft - 56);
  });

  it.each([false, true])(
    'is the mirror image when the column is (tucked: %s)',
    (tucked) => {
      const ltr = safeArea(columnOnTheLeft, tucked);
      const rtl = safeArea(columnOnTheRight, tucked);
      expect(rtl.width).toBeCloseTo(ltr.width);
      expect(rtl.x).toBeCloseTo(WIDTH - (ltr.x + ltr.width));
      expect({ y: rtl.y, height: rtl.height }).toEqual({
        y: ltr.y,
        height: ltr.height,
      });
    },
  );

  it('reaches in under the column before the first card', () => {
    const ltr = safeArea(columnOnTheLeft, true);
    expect(ltr.x).toBeGreaterThan(columnOnTheLeft.columnLeft);
    expect(ltr.x).toBeLessThan(columnOnTheLeft.columnRight);
    const rtl = safeArea(columnOnTheRight, true);
    expect(rtl.x + rtl.width).toBeGreaterThan(columnOnTheRight.columnLeft);
    expect(rtl.x + rtl.width).toBeLessThan(columnOnTheRight.columnRight);
  });
});

describe('where the publications network recedes', () => {
  it('fades from the left edge to past a column on the left', () => {
    expect(columnMask(columnOnTheLeft)).toBe(
      'linear-gradient(to right, rgb(0 0 0 / 0.3) 560px, black 656px)',
    );
  });

  it('fades from the right edge to past a column on the right', () => {
    // The same distances, measured from the other edge.
    expect(columnMask(columnOnTheRight)).toBe(
      'linear-gradient(to left, rgb(0 0 0 / 0.3) 560px, black 656px)',
    );
  });
});
