import { describe, expect, it } from 'vitest';

import {
  isEngaged,
  nearestStop,
  nextStop,
  swipeTurnsPage,
  wheelDelta,
} from '../useScrollCarousel';

// Four cards, 720px apart.
const stops = [1000, 1720, 2440, 3160];

describe('the scroll carousel', () => {
  it('holds the page only between its first and last cards', () => {
    expect(isEngaged(stops, 1000)).toBe(true);
    expect(isEngaged(stops, 2000)).toBe(true);
    expect(isEngaged(stops, 3160)).toBe(true);
    expect(isEngaged(stops, 990)).toBe(false);
    expect(isEngaged(stops, 3170)).toBe(false);
    expect(isEngaged([], 1000)).toBe(false);
  });

  it('turns to the next card either way, and lets go past the ends', () => {
    expect(nextStop(stops, 1000, 1)).toBe(1);
    expect(nextStop(stops, 1720, -1)).toBe(0);
    // Resting a pixel off a card still counts as resting on it.
    expect(nextStop(stops, 1001, 1)).toBe(1);
    expect(nextStop(stops, 3160, 1)).toBeNull();
    expect(nextStop(stops, 1000, -1)).toBeNull();
    // From between cards, the next one that way.
    expect(nextStop(stops, 2000, 1)).toBe(2);
    expect(nextStop(stops, 2000, -1)).toBe(1);
    // From outside, the first card reached.
    expect(nextStop(stops, 400, 1)).toBe(0);
    expect(nextStop(stops, 4000, -1)).toBe(3);
  });

  it('brings a page left between cards to the nearest', () => {
    expect(nearestStop(stops, 1300)).toBe(0);
    expect(nearestStop(stops, 1500)).toBe(1);
    expect(nearestStop([], 1500)).toBeNull();
  });

  it('turns the page for a long swipe or a quick flick, and springs back otherwise', () => {
    // 15% of an 800px screen is 120px.
    expect(swipeTurnsPage(130, 0.1, 800)).toBe(true);
    expect(swipeTurnsPage(-130, -0.1, 800)).toBe(true);
    expect(swipeTurnsPage(60, 0.6, 800)).toBe(true);
    expect(swipeTurnsPage(60, 0.2, 800)).toBe(false);
    // A flick back the other way at the end does not carry the page on.
    expect(swipeTurnsPage(60, -0.6, 800)).toBe(false);
  });

  it('reads wheel travel in px whatever unit the wheel reports', () => {
    expect(wheelDelta({ deltaY: 100, deltaMode: 0 })).toBe(100);
    expect(wheelDelta({ deltaY: 3, deltaMode: 1 })).toBe(48);
    expect(wheelDelta({ deltaY: 1, deltaMode: 2 })).toBe(window.innerHeight);
  });
});
