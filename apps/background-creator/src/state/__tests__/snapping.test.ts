import { describe, expect, it } from 'vitest';

import type { BackgroundDocument, RectElement } from '~/model/types';

import type { StageBox } from '../documentGeometry';
import { computeSnap, snapLines, SNAP_THRESHOLD_PX } from '../snapping';

// A 100×100 stage makes 1 normalized unit == 100px, so the 6px threshold is
// 0.06 in normalized space on both axes — convenient round numbers for tests.
const STAGE: StageBox = { width: 100, height: 100 };

function rect(id: string, over: Partial<RectElement> = {}): RectElement {
  return {
    id,
    kind: 'rect',
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
    zoneLabel: null,
    ...over,
  };
}

function doc(elements: RectElement[]): BackgroundDocument {
  return { version: 1, title: 't', description: 'd', elements };
}

// Rounds normalized lines so binary float artifacts (0.2 + 0.4 → 0.6000…1) don't
// make exact-array assertions flaky.
const round = (ns: number[]): number[] =>
  ns.map((n) => Math.round(n * 1000) / 1000);

describe('snapLines', () => {
  it('always includes the canvas frame lines on both axes', () => {
    const lines = snapLines(doc([]), null);
    expect(lines.x).toEqual([0, 0.5, 1]);
    expect(lines.y).toEqual([0, 0.5, 1]);
  });

  it('adds each element bounding-box edge and centre', () => {
    // rect at x 0.2..0.6 (centre 0.4), y 0.1..0.3 (centre 0.2)
    const lines = snapLines(
      doc([rect('a', { x: 0.2, y: 0.1, width: 0.4, height: 0.2 })]),
      null,
    );
    expect(round(lines.x)).toEqual([0, 0.5, 1, 0.2, 0.4, 0.6]);
    expect(round(lines.y)).toEqual([0, 0.5, 1, 0.1, 0.2, 0.3]);
  });

  it('excludes the dragged element so a shape never snaps to itself', () => {
    const lines = snapLines(
      doc([
        rect('dragged', { x: 0.2, y: 0.2, width: 0.1, height: 0.1 }),
        rect('other', { x: 0.7, y: 0.7, width: 0.1, height: 0.1 }),
      ]),
      'dragged',
    );
    // Only 'other' contributes 0.7/0.75/0.8; none of the dragged element's lines.
    expect(round(lines.x)).toEqual([0, 0.5, 1, 0.7, 0.75, 0.8]);
    expect(round(lines.x)).not.toContain(0.2);
  });
});

describe('computeSnap — canvas frame', () => {
  it('snaps to the canvas centre within the threshold', () => {
    const result = computeSnap(
      { x: 0.53, y: 0.48 },
      snapLines(doc([]), null),
      STAGE,
    );
    expect(result.point.x).toBeCloseTo(0.5);
    expect(result.point.y).toBeCloseTo(0.5);
    expect(result.guides).toEqual({ x: 0.5, y: 0.5 });
  });

  it('snaps to the near and far edges', () => {
    const result = computeSnap(
      { x: 0.03, y: 0.97 },
      snapLines(doc([]), null),
      STAGE,
    );
    expect(result.point.x).toBeCloseTo(0);
    expect(result.point.y).toBeCloseTo(1);
    expect(result.guides).toEqual({ x: 0, y: 1 });
  });
});

describe('computeSnap — threshold', () => {
  it('snaps just inside the threshold', () => {
    // 0.5 + 0.059 is within 0.06 of centre.
    const result = computeSnap(
      { x: 0.559, y: 0.2 },
      snapLines(doc([]), null),
      STAGE,
    );
    expect(result.guides.x).toBe(0.5);
    expect(result.point.x).toBeCloseTo(0.5);
  });

  it('leaves the point untouched just outside the threshold', () => {
    // 0.5 + 0.061 is beyond 0.06, and no other candidate is near.
    const result = computeSnap(
      { x: 0.561, y: 0.2 },
      snapLines(doc([]), null),
      STAGE,
    );
    expect(result.guides.x).toBeNull();
    expect(result.point.x).toBeCloseTo(0.561);
  });

  it('scales the threshold to the stage: a wider stage snaps in a tighter normalized band', () => {
    const wide: StageBox = { width: 1000, height: 100 };
    // 0.02 from centre is 20px on a 1000px-wide stage — beyond the 6px band.
    const result = computeSnap(
      { x: 0.52, y: 0.2 },
      snapLines(doc([]), null),
      wide,
    );
    expect(result.guides.x).toBeNull();
    expect(SNAP_THRESHOLD_PX / wide.width).toBeCloseTo(0.006);
  });
});

describe('computeSnap — nearest wins', () => {
  it('chooses the closer of two in-range candidates', () => {
    // Element edge at 0.48 and canvas centre at 0.5; point 0.485 is closer to 0.48.
    const lines = snapLines(
      doc([rect('a', { x: 0.48, y: 0.1, width: 0.2, height: 0.2 })]),
      null,
    );
    const result = computeSnap({ x: 0.485, y: 0.2 }, lines, STAGE);
    expect(result.guides.x).toBe(0.48);
  });

  it('keeps the earlier candidate on an exact tie', () => {
    // Canvas centre 0.5 (earlier) vs an element edge 0.53125; the midpoint
    // 0.515625 is exactly equidistant (all binary-exact), so the frame line wins.
    const lines = snapLines(
      doc([rect('a', { x: 0.53125, y: 0.1, width: 0.2, height: 0.2 })]),
      null,
    );
    const result = computeSnap({ x: 0.515625, y: 0.2 }, lines, STAGE);
    expect(result.guides.x).toBe(0.5);
  });
});

describe('computeSnap — per-axis control', () => {
  it('skips the y axis when axes.y is false, leaving y unchanged', () => {
    const result = computeSnap(
      { x: 0.51, y: 0.49 },
      snapLines(doc([]), null),
      STAGE,
      { axes: { x: true, y: false } },
    );
    expect(result.point.x).toBeCloseTo(0.5);
    expect(result.guides.x).toBe(0.5);
    expect(result.point.y).toBeCloseTo(0.49);
    expect(result.guides.y).toBeNull();
  });
});

describe('computeSnap — degenerate stage', () => {
  it('does nothing when the stage has no size', () => {
    const result = computeSnap({ x: 0.51, y: 0.49 }, snapLines(doc([]), null), {
      width: 0,
      height: 0,
    });
    expect(result.guides).toEqual({ x: null, y: null });
    expect(result.point).toEqual({ x: 0.51, y: 0.49 });
  });
});
