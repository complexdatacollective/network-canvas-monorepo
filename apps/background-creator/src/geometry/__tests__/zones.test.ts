import { describe, expect, it } from 'vitest';

import type { Vec, ZoneElement } from '../../model/types';
import { fixturePoints, fixtureZones } from '../../scripts/fixtures';
import {
  assignZone,
  pointInZone,
  validateZoneLabels,
  zoneArea,
} from '../zones';

function rect(
  label: string | null,
  x: number,
  y: number,
  width: number,
  height: number,
): ZoneElement {
  return {
    id: label ?? 'rect',
    kind: 'rect',
    x,
    y,
    width,
    height,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 1,
    zoneLabel: label,
  };
}

function ellipse(
  label: string | null,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): ZoneElement {
  return {
    id: label ?? 'ellipse',
    kind: 'ellipse',
    cx,
    cy,
    rx,
    ry,
    fill: '#ffffff',
    fillOpacity: 0,
    stroke: '#ffffff',
    strokeWidth: 2,
    zoneLabel: label,
  };
}

function polygon(label: string | null, points: Vec[]): ZoneElement {
  return {
    id: label ?? 'polygon',
    kind: 'polygon',
    points,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 1,
    zoneLabel: label,
  };
}

describe('assignZone (shared fixture table)', () => {
  it.each(fixturePoints)(
    '$name -> assigns $expected',
    ({ point, expected }) => {
      expect(assignZone(point, fixtureZones)).toBe(expected);
    },
  );

  it('returns null for an empty zone list', () => {
    expect(assignZone({ x: 0.5, y: 0.5 }, [])).toBeNull();
  });

  it('prefers the smallest-area zone regardless of document order', () => {
    // The larger zone is later in the array; area, not order, must decide.
    const zones: ZoneElement[] = [
      rect('small', 0.4, 0.4, 0.1, 0.1),
      rect('big', 0, 0, 1, 1),
    ];
    expect(assignZone({ x: 0.45, y: 0.45 }, zones)).toBe('small');
  });

  it('breaks an exact area tie towards the later zone', () => {
    const zones: ZoneElement[] = [
      rect('first', 0, 0, 0.5, 0.5),
      rect('second', 0, 0, 0.5, 0.5),
    ];
    expect(assignZone({ x: 0.25, y: 0.25 }, zones)).toBe('second');
  });
});

describe('zoneArea', () => {
  it('computes rect area as width times height', () => {
    expect(zoneArea(rect('r', 0.1, 0.2, 0.2, 0.2))).toBeCloseTo(0.04, 12);
  });

  it('computes ellipse area as pi rx ry (including a warping rx != ry)', () => {
    expect(zoneArea(ellipse('c', 0.5, 0.5, 0.15, 0.15))).toBeCloseTo(
      Math.PI * 0.15 * 0.15,
      12,
    );
    expect(zoneArea(ellipse('oval', 0.5, 0.5, 0.3, 0.1))).toBeCloseTo(
      Math.PI * 0.3 * 0.1,
      12,
    );
  });

  it('computes polygon area via the shoelace formula for a non-convex polygon', () => {
    // Concave "arrowhead" (the vertex at 0.1,0.2 notches inward); shoelace must
    // still give the correct 0.06 area, which a convex-only method would miss.
    const concave = polygon('p', [
      { x: 0, y: 0 },
      { x: 0.4, y: 0.2 },
      { x: 0, y: 0.4 },
      { x: 0.1, y: 0.2 },
    ]);
    expect(zoneArea(concave)).toBeCloseTo(0.06, 12);
  });
});

describe('pointInZone ellipse boundary', () => {
  const circle = ellipse('c', 0.5, 0.5, 0.5, 0.5);

  it('treats a point exactly on the boundary as inside (<=)', () => {
    // (1, 0.5) is exactly rx from the centre; the arithmetic is exact in binary
    // floating point (0.5 and 1 are representable), so this is deterministic.
    expect(pointInZone({ x: 1, y: 0.5 }, circle)).toBe(true);
  });

  it('excludes a point outside the ellipse', () => {
    expect(pointInZone({ x: 0.95, y: 0.95 }, circle)).toBe(false);
  });
});

describe('pointInZone warping ellipse (rx != ry)', () => {
  // Wider horizontally than vertically: a point can be inside via the wide x
  // radius yet outside a circle of the smaller radius.
  const oval = ellipse('oval', 0.5, 0.5, 0.4, 0.1);

  it('admits a point inside the wide horizontal radius', () => {
    // 0.3 left of centre is within rx = 0.4 but well beyond ry = 0.1.
    expect(pointInZone({ x: 0.2, y: 0.5 }, oval)).toBe(true);
  });

  it('excludes a point beyond the narrow vertical radius', () => {
    // 0.2 below centre exceeds ry = 0.1 even though it is within rx = 0.4.
    expect(pointInZone({ x: 0.5, y: 0.7 }, oval)).toBe(false);
  });
});

describe('pointInZone zero-radius ellipse', () => {
  // An ellipse with rx = ry = 0 is schema-valid. It must contain nothing, and
  // the membership test must never divide by a radius (which would give NaN at
  // the centre and Infinity elsewhere), mirroring the guards in the generated
  // Python and R.
  const degenerate = ellipse('z', 0.5, 0.5, 0, 0);

  it('contains nothing, including its exact centre', () => {
    expect(pointInZone({ x: 0.5, y: 0.5 }, degenerate)).toBe(false);
    expect(pointInZone({ x: 0.1, y: 0.1 }, degenerate)).toBe(false);
  });

  it('contains nothing when only one radius is zero', () => {
    expect(
      pointInZone({ x: 0.5, y: 0.5 }, ellipse('z', 0.5, 0.5, 0, 0.2)),
    ).toBe(false);
  });

  it('is skipped by assignZone so a surrounding zone still wins', () => {
    const surrounding = rect('big', 0, 0, 1, 1);
    expect(assignZone({ x: 0.5, y: 0.5 }, [degenerate, surrounding])).toBe(
      'big',
    );
  });
});

describe('validateZoneLabels', () => {
  it('accepts unique, non-empty labels', () => {
    expect(validateZoneLabels(fixtureZones)).toEqual({ ok: true });
  });

  it('flags an empty (whitespace-only) label', () => {
    const result = validateZoneLabels([rect('   ', 0, 0, 1, 1)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.problems.some((problem) => problem.includes('empty label')),
      ).toBe(true);
    }
  });

  it('flags duplicate labels (trimmed, case-sensitive) with an actionable message', () => {
    const result = validateZoneLabels([
      rect('inner', 0, 0, 0.1, 0.1),
      ellipse(' inner ', 0.5, 0.5, 0.1, 0.1),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContain(
        'Two zones share the label "inner". Zone labels become variable values and must be unique.',
      );
    }
  });

  it('treats labels differing only in case as distinct', () => {
    expect(
      validateZoneLabels([
        rect('Inner', 0, 0, 0.1, 0.1),
        rect('inner', 0, 0, 0.1, 0.1),
      ]),
    ).toEqual({ ok: true });
  });
});
