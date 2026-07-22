import { describe, expect, it } from 'vitest';

import type { BackgroundDocument, RectElement } from '~/model/types';

import type { Bounds, StageBox } from '../documentGeometry';
import {
  computeBoundsSnap,
  computeSnap,
  type SnapLines,
  snapLines,
  SNAP_THRESHOLD_PX,
} from '../snapping';

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

const bounds = (
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): Bounds => ({ minX, maxX, minY, maxY });

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

  it('clamps element-derived candidates to the canvas', () => {
    // A shape (or a text element's measured extent) reaching past an edge would
    // otherwise offer an off-canvas snap line; a draw could adopt it and commit
    // an endpoint outside [0,1] that the document schema rejects.
    const lines = snapLines(
      doc([rect('wide', { x: 0.9, y: 0.9, width: 0.3, height: 0.3 })]),
      null,
    );
    expect(Math.max(...lines.x)).toBeLessThanOrEqual(1);
    expect(Math.min(...lines.x)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...lines.y)).toBeLessThanOrEqual(1);
    expect(Math.min(...lines.y)).toBeGreaterThanOrEqual(0);
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

describe('computeBoundsSnap — canvas centre', () => {
  it('aligns the shape centre to the canvas centre on both axes', () => {
    // Bounds centre x = 0.49, y = 0.51; only the centre probe is near 0.5.
    const result = computeBoundsSnap(
      bounds(0.3, 0.68, 0.3, 0.72),
      snapLines(doc([]), null),
      STAGE,
    );
    expect(result.guides).toEqual({ x: 0.5, y: 0.5 });
    expect(result.delta.x).toBeCloseTo(0.01);
    expect(result.delta.y).toBeCloseTo(-0.01);
  });
});

describe('computeBoundsSnap — another element', () => {
  it('snaps an edge to another element edge', () => {
    // 'other' spans x 0.6..0.7; the moving shape's left edge (0.72) snaps to 0.7.
    const candidates = snapLines(
      doc([rect('other', { x: 0.6, y: 0.1, width: 0.1, height: 0.1 })]),
      'moving',
    );
    const result = computeBoundsSnap(
      bounds(0.72, 0.92, 0.75, 0.9),
      candidates,
      STAGE,
    );
    expect(result.guides.x).toBe(0.7);
    expect(result.delta.x).toBeCloseTo(-0.02);
    // The y probes sit far from every candidate, so that axis stays free.
    expect(result.guides.y).toBeNull();
    expect(result.delta.y).toBe(0);
  });

  it('snaps centre to another element centre', () => {
    // 'other' spans x 0.6..0.8 (centre 0.7); the moving centre (0.69) is nearest.
    const candidates = snapLines(
      doc([rect('other', { x: 0.6, y: 0.6, width: 0.2, height: 0.2 })]),
      'moving',
    );
    const result = computeBoundsSnap(
      bounds(0.63, 0.75, 0.3, 0.4),
      candidates,
      STAGE,
    );
    expect(result.guides.x).toBe(0.7);
    expect(result.delta.x).toBeCloseTo(0.01);
  });
});

describe('computeBoundsSnap — nearest wins', () => {
  it('prefers the closer probe when two are in range', () => {
    // Left edge sits 4px (0.04) from the line 0.2; centre sits 2px (0.02) from
    // 0.5. The nearer centre snap wins over the edge snap.
    const candidates: SnapLines = { x: [0.2, 0.5], y: [0.5] };
    const result = computeBoundsSnap(
      bounds(0.24, 0.72, 0.4, 0.6),
      candidates,
      STAGE,
    );
    expect(result.guides.x).toBe(0.5);
    expect(result.delta.x).toBeCloseTo(0.02);
  });
});

describe('computeBoundsSnap — per-axis independence', () => {
  it('resolves x while y finds nothing in range', () => {
    const result = computeBoundsSnap(
      bounds(0.44, 0.56, 0.8, 0.9),
      { x: [0.5], y: [0.5] },
      STAGE,
    );
    expect(result.guides.x).toBe(0.5);
    expect(result.delta.x).toBeCloseTo(0);
    expect(result.guides.y).toBeNull();
    expect(result.delta.y).toBe(0);
  });
});

describe('computeBoundsSnap — guide reports the line', () => {
  it('reports the candidate line, not the probe that matched it', () => {
    // Probes are at 0.33; the only candidate is 0.3. The guide is the line 0.3.
    const result = computeBoundsSnap(
      bounds(0.33, 0.5, 0.33, 0.5),
      { x: [0.3], y: [0.3] },
      STAGE,
    );
    expect(result.guides).toEqual({ x: 0.3, y: 0.3 });
    expect(result.delta.x).toBeCloseTo(-0.03);
    expect(result.delta.y).toBeCloseTo(-0.03);
  });
});

describe('computeBoundsSnap — no candidates in range', () => {
  it('leaves both axes free with a zero delta', () => {
    const result = computeBoundsSnap(
      bounds(0.1, 0.3, 0.1, 0.3),
      { x: [0.9], y: [0.9] },
      STAGE,
    );
    expect(result.guides).toEqual({ x: null, y: null });
    expect(result.delta).toEqual({ x: 0, y: 0 });
  });
});

describe('computeBoundsSnap — stage scaling', () => {
  it('applies a tighter normalized band on a wider stage', () => {
    // Centre is 0.02 off 0.5 on both axes. On a 1000px-wide stage that is 20px
    // (beyond the 6px band) for x, but only 2px for the 100px-tall y.
    const wide: StageBox = { width: 1000, height: 100 };
    const result = computeBoundsSnap(
      bounds(0.44, 0.52, 0.44, 0.52),
      { x: [0.5], y: [0.5] },
      wide,
    );
    expect(result.guides.x).toBeNull();
    expect(result.delta.x).toBe(0);
    expect(result.guides.y).toBe(0.5);
    expect(result.delta.y).toBeCloseTo(0.02);
  });
});
