import { describe, expect, it } from 'vitest';

import { assignZone, zonesOf } from '~/geometry/zones';
import { backgroundDocumentSchema } from '~/model/schema';
import {
  createBlankDocument,
  createConcentricCirclesTemplate,
  createPoliticalCompassDocument,
  createQuadrantsTemplate,
} from '~/model/templates';

describe('templates', () => {
  it('all templates validate against the schema', () => {
    for (const template of [
      createBlankDocument(),
      createQuadrantsTemplate(),
      createConcentricCirclesTemplate(),
      createPoliticalCompassDocument(),
    ]) {
      expect(backgroundDocumentSchema.safeParse(template).success).toBe(true);
    }
  });

  it('political compass models the sample-protocol asset with five zone fills', () => {
    const doc = createPoliticalCompassDocument();
    expect(doc.title).toBe('Responsive political compass');
    const rects = doc.elements.filter((element) => element.kind === 'rect');
    expect(rects.map((rect) => rect.fill)).toEqual([
      '#f1f5f6',
      '#ffafb3',
      '#71cef0',
      '#bee7b5',
      '#e5c0df',
    ]);
    const zones = zonesOf(doc);
    const labels = zones.map((zone) => zone.zoneLabel);
    expect(labels).toEqual([
      'unsure',
      'authoritarian-left',
      'authoritarian-right',
      'libertarian-left',
      'libertarian-right',
    ]);
    expect(new Set(labels).size).toBe(labels.length);

    // Sampled points inside the fills are assigned to the expected zone.
    const inside: Array<[{ x: number; y: number }, string]> = [
      [{ x: 0.1, y: 0.5 }, 'unsure'],
      [{ x: 0.4, y: 0.25 }, 'authoritarian-left'],
      [{ x: 0.8, y: 0.25 }, 'authoritarian-right'],
      [{ x: 0.4, y: 0.75 }, 'libertarian-left'],
      [{ x: 0.8, y: 0.75 }, 'libertarian-right'],
    ];
    for (const [point, expected] of inside) {
      expect(assignZone(point, zones)).toBe(expected);
    }

    // The 0.21–0.23 visual gutter is honestly unassigned.
    for (const y of [0.25, 0.75]) {
      expect(assignZone({ x: 0.22, y }, zones)).toBeNull();
    }
  });

  it('mints fresh UUIDs on every call', () => {
    const first = createQuadrantsTemplate();
    const second = createQuadrantsTemplate();
    const firstIds = first.elements.map((element) => element.id);
    const secondIds = new Set(second.elements.map((element) => element.id));
    expect(firstIds.every((id) => !secondIds.has(id))).toBe(true);
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });

  it('blank document is empty', () => {
    const blank = createBlankDocument();
    expect(blank.elements).toHaveLength(0);
    expect(zonesOf(blank)).toHaveLength(0);
  });

  it('quadrants template marks four rects as zones with the specified labels', () => {
    const doc = createQuadrantsTemplate();
    const zones = zonesOf(doc);
    expect(zones).toHaveLength(4);
    expect(zones.every((zone) => zone.kind === 'rect')).toBe(true);
    const labels = zones
      .map((zone) => zone.zoneLabel)
      .filter((label): label is string => label !== null);
    expect(labels.toSorted()).toEqual([
      'bottom-left',
      'bottom-right',
      'top-left',
      'top-right',
    ]);
  });

  it('quadrants template draws centred axis lines with arrows at both ends', () => {
    const doc = createQuadrantsTemplate();
    const lines = doc.elements.filter((element) => element.kind === 'line');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      if (line.kind === 'line') {
        expect(line.startArrow).toBe(true);
        expect(line.endArrow).toBe(true);
        expect(line.stroke).toBe('#ffffff');
        expect(line.strokeWidth).toBe(3);
      }
    }
  });

  it('concentric template marks three nested ellipse zones, label matching radius', () => {
    const doc = createConcentricCirclesTemplate();
    const zones = zonesOf(doc);
    expect(zones).toHaveLength(3);
    // Document (paint) order runs outermost-first so the smallest ring paints on
    // top; each ring's label matches its own radius.
    const byLabel = new Map<string, number>();
    for (const zone of zones) {
      expect(zone.kind).toBe('ellipse');
      if (zone.kind === 'ellipse') {
        expect(zone.rx).toBe(zone.ry);
        if (zone.zoneLabel !== null) byLabel.set(zone.zoneLabel, zone.rx);
      }
    }
    expect(byLabel.get('outer')).toBe(0.45);
    expect(byLabel.get('middle')).toBe(0.3);
    expect(byLabel.get('inner')).toBe(0.15);

    // Smallest-wins: the centre resolves to the innermost ring.
    expect(assignZone({ x: 0.5, y: 0.5 }, zones)).toBe('inner');
  });

  it('concentric template rings are centred and stroke-only', () => {
    const doc = createConcentricCirclesTemplate();
    const ellipses = doc.elements.filter(
      (element) => element.kind === 'ellipse',
    );
    expect(ellipses).toHaveLength(3);
    for (const ellipse of ellipses) {
      if (ellipse.kind === 'ellipse') {
        expect(ellipse.cx).toBe(0.5);
        expect(ellipse.cy).toBe(0.5);
        expect(ellipse.rx).toBe(ellipse.ry);
        expect(ellipse.fillOpacity).toBe(0);
        expect(ellipse.stroke).toBe('#ffffff');
      }
    }
  });
});
