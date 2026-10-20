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

  test('a tie goes to the one on the left, whatever order they come in', () => {
    expect(nearestInDirection(from('ego'), others('ego'), 'up')).toBe('mum');
    const reversed = new Map([...others('ego')].reverse());
    expect(nearestInDirection(from('ego'), reversed, 'up')).toBe('mum');
  });

  // Rows and columns the same distance apart: a person one row up and one
  // column across sits on the edge of the direction's cone, and scores the
  // same as someone two rows up and half a column across.
  describe('with rows and columns equally spaced', () => {
    const pitch = 240;
    const dana = { x: 0, y: 2 * pitch };
    const grid = new Map([
      // Two rows up, half a column across, either side.
      ['flo', { x: pitch / 2, y: 0 }],
      ['gus', { x: (3 * pitch) / 2, y: 0 }],
      // One row up, one column across.
      ['ana', { x: pitch, y: pitch }],
    ]);

    test('the next row wins', () => {
      expect(nearestInDirection(dana, grid, 'up')).toBe('ana');
    });

    test('a neighbour a fraction of a pixel past the cone’s edge still counts', () => {
      const nudged = new Map(grid).set('ana', { x: pitch + 0.4, y: pitch });
      expect(nearestInDirection(dana, nudged, 'up')).toBe('ana');
    });

    test('of two equally placed, the one on the left wins', () => {
      expect(nearestInDirection(grid.get('ana')!, grid, 'up')).toBe('flo');
      const reversed = new Map([...grid].reverse());
      expect(nearestInDirection(grid.get('ana')!, reversed, 'up')).toBe('flo');
    });

    test('moving across, the same row wins over a nearer one in the next', () => {
      const row = new Map([
        ['near', { x: pitch, y: pitch }],
        ['far', { x: 2 * pitch, y: 0 }],
      ]);
      expect(nearestInDirection({ x: 0, y: 0 }, row, 'right')).toBe('far');
    });
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
