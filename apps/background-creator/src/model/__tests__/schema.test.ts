import { describe, expect, it } from 'vitest';

import {
  backgroundDocumentSchema,
  parseBackgroundDocument,
} from '~/model/schema';
import { createBlankDocument } from '~/model/templates';

const baseRect = {
  id: 'r1',
  kind: 'rect',
  x: 0,
  y: 0,
  width: 0.5,
  height: 0.5,
  fill: '#ffffff',
  fillOpacity: 1,
  stroke: null,
  strokeWidth: 1,
  zoneLabel: null,
};

function docWith(elements: unknown[]): unknown {
  return { version: 1, title: 't', description: 'd', elements };
}

describe('backgroundDocumentSchema', () => {
  it('accepts a minimal valid document', () => {
    expect(
      backgroundDocumentSchema.safeParse(createBlankDocument()).success,
    ).toBe(true);
  });

  it('rejects coordinates outside [0, 1]', () => {
    expect(
      backgroundDocumentSchema.safeParse(docWith([{ ...baseRect, x: 1.5 }]))
        .success,
    ).toBe(false);
    expect(
      backgroundDocumentSchema.safeParse(docWith([{ ...baseRect, y: -0.1 }]))
        .success,
    ).toBe(false);
  });

  it('rejects non-finite numbers', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, width: Number.POSITIVE_INFINITY }]),
      ).success,
    ).toBe(false);
  });

  it('rejects a stroke width outside the sane px range', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, stroke: '#000000', strokeWidth: 0.1 }]),
      ).success,
    ).toBe(false);
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, stroke: '#000000', strokeWidth: 21 }]),
      ).success,
    ).toBe(false);
  });

  it('rejects a fill opacity outside [0, 1]', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, fillOpacity: 1.2 }]),
      ).success,
    ).toBe(false);
  });

  it('rejects a polygon with fewer than three points', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([
          {
            id: 'p1',
            kind: 'polygon',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
            ],
            fill: '#ffffff',
            fillOpacity: 1,
            stroke: null,
            strokeWidth: 1,
            zoneLabel: null,
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it('rejects text with no lines', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([
          {
            id: 't1',
            kind: 'text',
            x: 0.5,
            y: 0.5,
            lines: [],
            fill: '#ffffff',
            fontMinPx: 14,
            fontVmin: 2,
            fontMaxPx: 32,
            fontWeight: 400,
            anchor: 'middle',
            opacity: 1,
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it('rejects an unknown font weight', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([
          {
            id: 't1',
            kind: 'text',
            x: 0.5,
            y: 0.5,
            lines: ['x'],
            fill: '#ffffff',
            fontMinPx: 14,
            fontVmin: 2,
            fontMaxPx: 32,
            fontWeight: 350,
            anchor: 'middle',
            opacity: 1,
          },
        ]),
      ).success,
    ).toBe(false);
  });

  it('rejects an unknown element kind', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ id: 'x', kind: 'triangle' }]),
      ).success,
    ).toBe(false);
  });

  it('rejects an unknown version', () => {
    expect(
      backgroundDocumentSchema.safeParse({
        version: 2,
        title: 't',
        description: 'd',
        elements: [],
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys at the document level (strict object)', () => {
    expect(
      backgroundDocumentSchema.safeParse({
        version: 1,
        title: 't',
        description: 'd',
        elements: [],
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys on an element (strict object)', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, extra: true }]),
      ).success,
    ).toBe(false);
  });

  it('rejects an empty element id', () => {
    expect(
      backgroundDocumentSchema.safeParse(docWith([{ ...baseRect, id: '' }]))
        .success,
    ).toBe(false);
  });

  it('rejects duplicate element ids', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([
          { ...baseRect, id: 'dup' },
          { ...baseRect, id: 'dup' },
        ]),
      ).success,
    ).toBe(false);
  });

  it('accepts distinct ids and does not enforce zone-label uniqueness while editing', () => {
    // Duplicate/blank zone labels are normal mid-edit and are surfaced at export
    // time (validateZoneLabels), so the persisted schema must not reject them.
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([
          { ...baseRect, id: 'a', zoneLabel: 'zone-1' },
          { ...baseRect, id: 'b', zoneLabel: 'zone-1' },
          { ...baseRect, id: 'c', zoneLabel: '' },
        ]),
      ).success,
    ).toBe(true);
  });

  it('rejects a rect that is missing its zoneLabel', () => {
    const { zoneLabel: _omit, ...rectWithoutLabel } = baseRect;
    expect(
      backgroundDocumentSchema.safeParse(docWith([rectWithoutLabel])).success,
    ).toBe(false);
  });

  it('accepts a null or string zoneLabel on a rect', () => {
    for (const zoneLabel of [null, '', 'top-left']) {
      expect(
        backgroundDocumentSchema.safeParse(
          docWith([{ ...baseRect, zoneLabel }]),
        ).success,
      ).toBe(true);
    }
  });

  it('accepts a warping ellipse with rx != ry', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([
          {
            id: 'e1',
            kind: 'ellipse',
            cx: 0.5,
            cy: 0.5,
            rx: 0.3,
            ry: 0.1,
            fill: '#ffffff',
            fillOpacity: 1,
            stroke: null,
            strokeWidth: 1,
            zoneLabel: 'oval',
          },
        ]),
      ).success,
    ).toBe(true);
  });

  it('rejects a fill that references an external url', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, fill: 'url(https://evil.example/x.svg)' }]),
      ).success,
    ).toBe(false);
  });

  it('rejects a named colour that is not a hex value', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, fill: 'red' }]),
      ).success,
    ).toBe(false);
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, stroke: 'currentColor', strokeWidth: 1 }]),
      ).success,
    ).toBe(false);
  });

  it('accepts 3-, 4-, 6-, and 8-digit hex colours', () => {
    for (const fill of ['#fff', '#ffff', '#ffffff', '#ffffff80']) {
      expect(
        backgroundDocumentSchema.safeParse(docWith([{ ...baseRect, fill }]))
          .success,
      ).toBe(true);
    }
  });

  it('rejects a hex colour of an unsupported length', () => {
    expect(
      backgroundDocumentSchema.safeParse(
        docWith([{ ...baseRect, fill: '#fffff' }]),
      ).success,
    ).toBe(false);
  });
});

describe('parseBackgroundDocument', () => {
  it('returns the typed document for valid input', () => {
    const parsed = parseBackgroundDocument(createBlankDocument());
    expect(parsed.version).toBe(1);
  });

  it('throws for invalid input', () => {
    expect(() => parseBackgroundDocument({ version: 2 })).toThrow();
  });
});
