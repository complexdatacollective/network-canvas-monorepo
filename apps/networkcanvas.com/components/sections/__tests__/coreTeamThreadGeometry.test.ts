import { describe, expect, it } from 'vitest';

import {
  type Box,
  layoutThread,
  PANEL_DOT,
  reachedDots,
  smoothPath,
  threadProgress,
} from '../coreTeamThreadGeometry';

const CARD = { width: 200, height: 300 };

// Two rows of four cards, 28px apart across and 84px down, as on a laptop.
function gridCards(): Box[] {
  return Array.from({ length: 8 }, (_, index) => ({
    left: (index % 4) * (CARD.width + 28),
    top: Math.floor(index / 4) * (CARD.height + 84),
    ...CARD,
  }));
}

// One column of stacked cards, as on a phone.
function columnCards(count: number): Box[] {
  return Array.from({ length: count }, (_, index) => ({
    left: 22,
    top: index * 120,
    width: 340,
    height: 102,
  }));
}

const panel: Box = { left: 50, top: 900, width: 800, height: 220 };

describe('smoothPath', () => {
  it('draws nothing through no points', () => {
    expect(smoothPath([])).toEqual({ d: '', lengths: [], total: 0 });
  });

  it('runs straight between two points, measuring their distance', () => {
    const { d, lengths, total } = smoothPath([
      { x: 0, y: 0 },
      { x: 30, y: 40 },
    ]);
    expect(d.startsWith('M 0 0 C ')).toBe(true);
    expect(d.endsWith(' 30 40')).toBe(true);
    expect(total).toBeCloseTo(50, 5);
    expect(lengths).toEqual([0, total]);
  });

  it('passes every point, at increasing lengths along the curve', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: 40, y: 160 },
      { x: 220, y: 200 },
    ];
    const { d, lengths, total } = smoothPath(points);
    for (const { x, y } of points.slice(1)) {
      expect(d).toContain(` ${x} ${y}`);
    }
    expect(lengths).toHaveLength(points.length);
    for (let index = 1; index < lengths.length; index += 1) {
      expect(lengths[index]).toBeGreaterThan(lengths[index - 1] ?? Infinity);
    }
    expect(lengths.at(-1)).toBe(total);
  });
});

describe('layoutThread', () => {
  it('has nothing to draw without a card', () => {
    expect(
      layoutThread({
        cards: [],
        panel,
        width: 1000,
        height: 1200,
        offsetLeft: 120,
      }),
    ).toBeNull();
  });

  it('weaves down from each top card to the card below in two rows', () => {
    const cards = gridCards();
    const geometry = layoutThread({
      cards,
      panel,
      width: 884,
      height: 1200,
      offsetLeft: 120,
    });
    if (!geometry) throw new Error('Expected a thread');

    expect(geometry.dots.map((dot) => dot.card)).toEqual([
      0,
      4,
      1,
      5,
      2,
      6,
      3,
      7,
      PANEL_DOT,
    ]);
    // A top card's node sits on its bottom edge, left of centre; the node of
    // the card below sits on that card's top edge, right of centre.
    const [top, below] = geometry.dots;
    expect(top).toMatchObject({ x: 100 - 44, y: 300 });
    expect(below).toMatchObject({ x: 100 + 44, y: 384 });
    // It ends at the middle of the panel's top edge.
    expect(geometry.dots.at(-1)).toMatchObject({ x: 442, y: 900 });
    // It enters from beyond the window's left edge.
    expect(geometry.d.startsWith('M -160 -90 ')).toBe(true);
    for (let index = 1; index < geometry.dots.length; index += 1) {
      expect(geometry.dots[index]?.at).toBeGreaterThan(
        geometry.dots[index - 1]?.at ?? Infinity,
      );
    }
    expect(geometry.dots.at(-1)?.at).toBe(geometry.total);
  });

  it('runs down the left edge of stacked cards', () => {
    const cards = columnCards(3);
    const geometry = layoutThread({
      cards,
      panel,
      width: 362,
      height: 1200,
      offsetLeft: 14,
    });
    if (!geometry) throw new Error('Expected a thread');

    expect(geometry.dots.map((dot) => dot.card)).toEqual([0, 1, 2, PANEL_DOT]);
    cards.forEach((card, index) => {
      expect(geometry.dots[index]).toMatchObject({
        x: card.left,
        y: card.top + card.height / 2,
      });
    });
    expect(geometry.dots.at(-1)).toMatchObject({ x: 181, y: 900 });
    expect(geometry.d.startsWith('M -44 -80 ')).toBe(true);
  });

  it('keeps to one column when a single row holds fewer than eight cards', () => {
    const cards = gridCards().slice(0, 4);
    const geometry = layoutThread({
      cards,
      panel,
      width: 884,
      height: 1200,
      offsetLeft: 0,
    });
    expect(geometry?.dots.map((dot) => dot.card)).toEqual([
      0,
      1,
      2,
      3,
      PANEL_DOT,
    ]);
  });
});

describe('threadProgress', () => {
  const viewport = 1000;
  const height = 1500;

  it('draws nothing until the wrapper top rises past 82% of the window', () => {
    expect(threadProgress(820, height, viewport)).toBe(0);
    expect(threadProgress(2000, height, viewport)).toBe(0);
    expect(threadProgress(800, height, viewport)).toBeGreaterThan(0);
  });

  it('draws it all once the wrapper bottom has risen to 55%', () => {
    expect(threadProgress(550 - height, height, viewport)).toBe(1);
    expect(threadProgress(-5000, height, viewport)).toBe(1);
    expect(threadProgress(560 - height, height, viewport)).toBeLessThan(1);
  });
});

describe('reachedDots', () => {
  const geometry = layoutThread({
    cards: gridCards(),
    panel,
    width: 884,
    height: 1200,
    offsetLeft: 0,
  });
  if (!geometry) throw new Error('Expected a thread');

  it('lights no node before the line reaches one, and every node at the end', () => {
    expect(reachedDots(geometry, 0)).toBe(0);
    expect(reachedDots(geometry, 1)).toBe(geometry.dots.length);
  });

  it('lights a node as the drawn line arrives at it', () => {
    const third = geometry.dots[2];
    if (!third) throw new Error('Expected a third node');
    expect(reachedDots(geometry, third.at / geometry.total)).toBe(3);
    expect(reachedDots(geometry, (third.at - 10) / geometry.total)).toBe(2);
  });
});
