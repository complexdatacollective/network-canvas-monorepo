import { describe, expect, it } from 'vitest';

import {
  arrival,
  enteredAt,
  isEngaged,
  nearestStop,
  nextStop,
  readingRoom,
  restOn,
  type Stop,
  swipeTurnsPage,
  wheelDelta,
} from '../useScrollCarousel';

const at = (position: number): Stop => ({ start: position, end: position });

// Four cards, 720px apart.
const stops = [at(1000), at(1720), at(2440), at(3160)];

// The same, but the second card is too tall for its area and is read through
// from 1720 to 2120.
const tall = [at(1000), { start: 1720, end: 2120 }, at(2840), at(3560)];

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

  it('lets a jump clean across the section stay where it was sent', () => {
    // End from above the section, and Home from below it.
    expect(enteredAt(stops, 200, 6000)).toBeNull();
    expect(enteredAt(stops, 6000, 200)).toBeNull();
    // A scroll that crosses into the section lands on the first card it
    // reaches.
    expect(enteredAt(stops, 900, 1100)).toBe(1000);
    expect(enteredAt(stops, 3300, 3000)).toBe(3160);
    // Moving within the section is not an entrance.
    expect(enteredAt(stops, 1100, 1300)).toBeNull();
  });
});

describe('a card too tall for its area', () => {
  it('is read through before the page turns', () => {
    // At its top going down, and anywhere short of its bottom, there is more
    // of it to read; at its bottom the next move turns the page.
    expect(readingRoom(tall, 1720, 1)).toEqual(tall[1]);
    expect(readingRoom(tall, 1900, 1)).toEqual(tall[1]);
    expect(readingRoom(tall, 2120, 1)).toBeNull();
    // Going back, likewise from its bottom to its top.
    expect(readingRoom(tall, 2120, -1)).toEqual(tall[1]);
    expect(readingRoom(tall, 1720, -1)).toBeNull();
    // A card that fits has nothing to read through.
    expect(readingRoom(tall, 1000, 1)).toBeNull();
    expect(readingRoom(stops, 1720, 1)).toBeNull();
  });

  it('is entered from its top going down and from its bottom going back', () => {
    const card = tall[1]!;
    expect(arrival(card, 1)).toBe(1720);
    expect(arrival(card, -1)).toBe(2120);
    // From its top, the next card down is the one after it; from inside it,
    // the cards either side.
    expect(nextStop(tall, 1720, 1)).toBe(2);
    expect(nextStop(tall, 1900, 1)).toBe(2);
    expect(nextStop(tall, 1900, -1)).toBe(0);
    expect(nextStop(tall, 2120, -1)).toBe(0);
  });

  it('keeps a page left part way through it where it is', () => {
    expect(nearestStop(tall, 1900)).toBe(1);
    expect(restOn(tall[1]!, 1900)).toBe(1900);
    // Just past its bottom, the page comes back to it.
    expect(nearestStop(tall, 2200)).toBe(1);
    expect(restOn(tall[1]!, 2200)).toBe(2120);
  });
});
