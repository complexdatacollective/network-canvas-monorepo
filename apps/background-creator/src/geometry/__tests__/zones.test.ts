import { describe, expect, it } from 'vitest';

import type { Zone } from '../../model/types';
import { fixturePoints, fixtureZones } from '../../scripts/fixtures';
import {
  assignZone,
  pointInZone,
  validateZoneLabels,
  zoneArea,
} from '../zones';

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
    const zones: Zone[] = [
      {
        id: 'small',
        label: 'small',
        shape: 'rect',
        x: 0.4,
        y: 0.4,
        width: 0.1,
        height: 0.1,
      },
      {
        id: 'big',
        label: 'big',
        shape: 'rect',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    ];
    expect(assignZone({ x: 0.45, y: 0.45 }, zones)).toBe('small');
  });

  it('breaks an exact area tie towards the later zone', () => {
    const zones: Zone[] = [
      {
        id: 'a',
        label: 'first',
        shape: 'rect',
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
      },
      {
        id: 'b',
        label: 'second',
        shape: 'rect',
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
      },
    ];
    expect(assignZone({ x: 0.25, y: 0.25 }, zones)).toBe('second');
  });
});

describe('zoneArea', () => {
  it('computes rect area as width times height', () => {
    expect(
      zoneArea({
        id: 'r',
        label: 'r',
        shape: 'rect',
        x: 0.1,
        y: 0.2,
        width: 0.2,
        height: 0.2,
      }),
    ).toBeCloseTo(0.04, 12);
  });

  it('computes circle area as pi r squared', () => {
    expect(
      zoneArea({
        id: 'c',
        label: 'c',
        shape: 'circle',
        cx: 0.5,
        cy: 0.5,
        r: 0.15,
      }),
    ).toBeCloseTo(Math.PI * 0.15 * 0.15, 12);
  });

  it('computes polygon area via the shoelace formula for a non-convex polygon', () => {
    // Concave "arrowhead" (the vertex at 0.1,0.2 notches inward); shoelace must
    // still give the correct 0.06 area, which a convex-only method would miss.
    const concave: Zone = {
      id: 'p',
      label: 'p',
      shape: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 0.4, y: 0.2 },
        { x: 0, y: 0.4 },
        { x: 0.1, y: 0.2 },
      ],
    };
    expect(zoneArea(concave)).toBeCloseTo(0.06, 12);
  });
});

describe('pointInZone circle boundary', () => {
  const circle: Zone = {
    id: 'c',
    label: 'c',
    shape: 'circle',
    cx: 0.5,
    cy: 0.5,
    r: 0.5,
  };

  it('treats a point exactly on the boundary as inside (<=)', () => {
    // (1, 0.5) is exactly r from the centre; the arithmetic is exact in binary
    // floating point (0.5 and 1 are representable), so this is deterministic.
    expect(pointInZone({ x: 1, y: 0.5 }, circle)).toBe(true);
  });

  it('excludes a point outside the circle', () => {
    expect(pointInZone({ x: 0.95, y: 0.95 }, circle)).toBe(false);
  });
});

describe('validateZoneLabels', () => {
  it('accepts unique, non-empty labels', () => {
    expect(validateZoneLabels(fixtureZones)).toEqual({ ok: true });
  });

  it('flags an empty (whitespace-only) label', () => {
    const result = validateZoneLabels([
      { id: 'a', label: '   ', shape: 'rect', x: 0, y: 0, width: 1, height: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.problems.some((problem) => problem.includes('empty label')),
      ).toBe(true);
    }
  });

  it('flags duplicate labels (trimmed, case-sensitive) with an actionable message', () => {
    const result = validateZoneLabels([
      {
        id: 'a',
        label: 'inner',
        shape: 'rect',
        x: 0,
        y: 0,
        width: 0.1,
        height: 0.1,
      },
      { id: 'b', label: ' inner ', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.1 },
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
        {
          id: 'a',
          label: 'Inner',
          shape: 'rect',
          x: 0,
          y: 0,
          width: 0.1,
          height: 0.1,
        },
        {
          id: 'b',
          label: 'inner',
          shape: 'rect',
          x: 0,
          y: 0,
          width: 0.1,
          height: 0.1,
        },
      ]),
    ).toEqual({ ok: true });
  });
});
