import { describe, expect, it } from 'vitest';

import {
  besideTarget,
  keepInside,
  PANEL_GAP,
  ringAround,
  scrollToCentre,
} from '../panelGeometry';

const room = { top: 100, left: 0, width: 1200, height: 700 };

describe('besideTarget', () => {
  it('puts the panel on the side with the most room, lined up with the top', () => {
    const target = { top: 200, left: 100, width: 400, height: 300 };
    expect(besideTarget(target, room, 300, 200)).toEqual({
      left: 500 + PANEL_GAP,
      top: 200,
    });
  });

  it('goes to the left when that side has more room', () => {
    const target = { top: 200, left: 700, width: 400, height: 300 };
    expect(besideTarget(target, room, 300, 200)).toEqual({
      left: 700 - PANEL_GAP - 300,
      top: 200,
    });
  });

  it('goes below a wide section, centred on it', () => {
    const target = { top: 120, left: 0, width: 1200, height: 100 };
    expect(besideTarget(target, room, 300, 200)).toEqual({
      left: 450,
      top: 220 + PANEL_GAP,
    });
  });

  it('goes above a wide section near the bottom of the room', () => {
    const target = { top: 650, left: 0, width: 1200, height: 100 };
    expect(besideTarget(target, room, 300, 200)).toEqual({
      left: 450,
      top: 650 - PANEL_GAP - 200,
    });
  });
});

describe('keepInside', () => {
  it('leaves a placement inside the room alone', () => {
    const placement = { left: 10, top: 150, tall: 300 };
    expect(keepInside(placement, room, 300)).toEqual(placement);
  });

  it('moves a placement back inside the room as little as it can', () => {
    expect(keepInside({ left: 1100, top: 700, tall: 300 }, room, 300)).toEqual({
      left: 900,
      top: 500,
      tall: 300,
    });
    expect(keepInside({ left: -50, top: 0, tall: 300 }, room, 300)).toEqual({
      left: 0,
      top: 100,
      tall: 300,
    });
  });

  it('caps the height at the room, with the top at the top of the room', () => {
    expect(keepInside({ left: 0, top: 50, tall: 900 }, room, 300)).toEqual({
      left: 0,
      top: 100,
      tall: 700,
    });
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
