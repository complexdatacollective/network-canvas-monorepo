import { describe, expect, test } from 'vitest';

import { nearestInDirection, type Point } from '../spatialNavigation';

// A small family laid out on a grid:
//
//   mum(0,0)   dad(200,0)
//        ego(100,200)   sib(300,200)
//        kid(100,400)
const layout = new Map<string, Point>([
  ['mum', { x: 0, y: 0 }],
  ['dad', { x: 200, y: 0 }],
  ['ego', { x: 100, y: 200 }],
  ['sib', { x: 300, y: 200 }],
  ['kid', { x: 100, y: 400 }],
]);

const others = (id: string) =>
  new Map([...layout].filter(([candidate]) => candidate !== id));

const from = (id: string) => layout.get(id)!;

describe('nearestInDirection', () => {
  test('moves to the neighbour on the same row', () => {
    expect(nearestInDirection(from('ego'), others('ego'), 'right')).toBe('sib');
    expect(nearestInDirection(from('sib'), others('sib'), 'left')).toBe('ego');
    expect(nearestInDirection(from('mum'), others('mum'), 'right')).toBe('dad');
  });

  test('moves between generations, preferring the closest across', () => {
    expect(nearestInDirection(from('ego'), others('ego'), 'down')).toBe('kid');
    expect(nearestInDirection(from('kid'), others('kid'), 'up')).toBe('ego');
    expect(nearestInDirection(from('sib'), others('sib'), 'up')).toBe('dad');
  });

  test('a tie goes to the first candidate', () => {
    expect(nearestInDirection(from('ego'), others('ego'), 'up')).toBe('mum');
  });

  test('returns nothing when nobody lies that way', () => {
    expect(
      nearestInDirection(from('mum'), others('mum'), 'up'),
    ).toBeUndefined();
    expect(
      nearestInDirection(from('mum'), others('mum'), 'left'),
    ).toBeUndefined();
    expect(
      nearestInDirection(from('kid'), others('kid'), 'down'),
    ).toBeUndefined();
  });

  test('ignores people far off to the side', () => {
    // From mum, `kid` is down but `sib` is too far across to count as "down".
    const candidates = new Map([['sib', { x: 300, y: 200 }]]);
    expect(nearestInDirection(from('mum'), candidates, 'down')).toBeUndefined();
  });
});
