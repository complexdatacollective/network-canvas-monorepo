import { describe, expect, it } from 'vitest';

import {
  besideTarget,
  keepInside,
  PANEL_GAP,
  ringAround,
  scrollToCentre,
  scrollToTop,
} from '../panelGeometry';

const room = { top: 100, left: 0, width: 1200, height: 700 };

const fit = { preferred: 300, min: 200 };
const MIN_TALL = 150;

describe('besideTarget', () => {
  it('puts the panel on the side with the most room, lined up with the top', () => {
    const target = { top: 200, left: 100, width: 400, height: 300 };
    expect(besideTarget(target, room, fit, 200, MIN_TALL)).toEqual({
      left: 500 + PANEL_GAP,
      top: 200,
      width: 300,
      tall: 200,
    });
  });

  it('goes to the left when that side has more room', () => {
    const target = { top: 200, left: 700, width: 400, height: 300 };
    expect(besideTarget(target, room, fit, 200, MIN_TALL)).toEqual({
      left: 700 - PANEL_GAP - 300,
      top: 200,
      width: 300,
      tall: 200,
    });
  });

  it('narrows to a side too narrow for its preferred width', () => {
    const target = { top: 200, left: 250, width: 900, height: 300 };
    expect(besideTarget(target, room, fit, 200, MIN_TALL)).toEqual({
      left: 0,
      top: 200,
      width: 250 - PANEL_GAP,
      tall: 200,
    });
  });

  it('goes below a wide section, centred on it', () => {
    const target = { top: 120, left: 0, width: 1200, height: 100 };
    expect(besideTarget(target, room, fit, 200, MIN_TALL)).toEqual({
      left: 450,
      top: 220 + PANEL_GAP,
      width: 300,
      tall: 200,
    });
  });

  it('goes above a wide section near the bottom of the room', () => {
    const target = { top: 650, left: 0, width: 1200, height: 100 };
    expect(besideTarget(target, room, fit, 200, MIN_TALL)).toEqual({
      left: 450,
      top: 650 - PANEL_GAP - 200,
      width: 300,
      tall: 200,
    });
  });

  it('shortens to fit above or below a wide section', () => {
    // Below has 800 - 580 - PANEL_GAP = 196 to spare, above 156.
    const target = { top: 280, left: 0, width: 1200, height: 300 };
    expect(besideTarget(target, room, fit, 400, MIN_TALL)).toEqual({
      left: 450,
      top: 580 + PANEL_GAP,
      width: 300,
      tall: 800 - 580 - PANEL_GAP,
    });
  });

  it('covers the section, as large as it likes, where nothing else fits', () => {
    const target = { top: 120, left: 0, width: 1200, height: 660 };
    const placed = besideTarget(target, room, fit, 400, MIN_TALL);
    expect(placed.width).toBe(300);
    expect(placed.tall).toBe(400);
  });
});

describe('keepInside', () => {
  it('leaves a placement inside the room alone', () => {
    const placement = { left: 10, top: 150, width: 300, tall: 300 };
    expect(keepInside(placement, room)).toEqual(placement);
  });

  it('moves a placement back inside the room as little as it can', () => {
    expect(
      keepInside({ left: 1100, top: 700, width: 300, tall: 300 }, room),
    ).toEqual({ left: 900, top: 500, width: 300, tall: 300 });
    expect(
      keepInside({ left: -50, top: 0, width: 300, tall: 300 }, room),
    ).toEqual({ left: 0, top: 100, width: 300, tall: 300 });
  });

  it('caps the height at the room, with the top at the top of the room', () => {
    expect(
      keepInside({ left: 0, top: 50, width: 300, tall: 900 }, room),
    ).toEqual({ left: 0, top: 100, width: 300, tall: 700 });
  });

  it('caps the width at the room', () => {
    expect(
      keepInside({ left: 0, top: 100, width: 1500, tall: 300 }, room),
    ).toEqual({ left: 0, top: 100, width: 1200, tall: 300 });
  });
});

describe('scrollToCentre', () => {
  it('scrolls a target into the middle of the room', () => {
    const target = { top: 1000, left: 0, width: 100, height: 100 };
    // Centred, its top is at 100 + (700 - 100) / 2 = 400.
    expect(scrollToCentre(target, room, 50, 5000)).toBe(50 + 1000 - 400);
  });

  it('puts the top of a target taller than the room at the top of the room', () => {
    const target = { top: 1000, left: 0, width: 100, height: 900 };
    expect(scrollToCentre(target, room, 0, 5000)).toBe(900);
  });

  it('stays within what the scroller can reach', () => {
    const near = { top: 110, left: 0, width: 100, height: 100 };
    expect(scrollToCentre(near, room, 0, 5000)).toBe(0);
    const far = { top: 9000, left: 0, width: 100, height: 100 };
    expect(scrollToCentre(far, room, 0, 2000)).toBe(2000);
  });
});

describe('scrollToTop', () => {
  it('scrolls the top of a target to the top of the room', () => {
    const target = { top: 1000, left: 0, width: 100, height: 100 };
    expect(scrollToTop(target, room, 50, 5000)).toBe(50 + 1000 - 100);
  });

  it('stays within what the scroller can reach', () => {
    const near = { top: 50, left: 0, width: 100, height: 100 };
    expect(scrollToTop(near, room, 0, 5000)).toBe(0);
    const far = { top: 9000, left: 0, width: 100, height: 100 };
    expect(scrollToTop(far, room, 0, 2000)).toBe(2000);
  });
});

describe('ringAround', () => {
  it('surrounds the box with a margin', () => {
    expect(ringAround({ top: 10, left: 20, width: 30, height: 40 })).toEqual({
      top: 2,
      left: 12,
      width: 46,
      height: 56,
    });
  });
});
