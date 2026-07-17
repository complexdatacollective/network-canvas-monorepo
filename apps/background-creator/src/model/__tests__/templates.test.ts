import { describe, expect, it } from 'vitest';

import { backgroundDocumentSchema } from '~/model/schema';
import {
  createBlankDocument,
  createConcentricCirclesTemplate,
  createQuadrantsTemplate,
} from '~/model/templates';

describe('templates', () => {
  it('all templates validate against the schema', () => {
    for (const template of [
      createBlankDocument(),
      createQuadrantsTemplate(),
      createConcentricCirclesTemplate(),
    ]) {
      expect(backgroundDocumentSchema.safeParse(template).success).toBe(true);
    }
  });

  it('mints fresh UUIDs on every call', () => {
    const first = createQuadrantsTemplate();
    const second = createQuadrantsTemplate();
    const firstIds = [
      ...first.elements.map((element) => element.id),
      ...first.zones.map((zone) => zone.id),
    ];
    const secondIds = new Set([
      ...second.elements.map((element) => element.id),
      ...second.zones.map((zone) => zone.id),
    ]);
    expect(firstIds.every((id) => !secondIds.has(id))).toBe(true);
    expect(new Set(firstIds).size).toBe(firstIds.length);
  });

  it('blank document is empty', () => {
    const blank = createBlankDocument();
    expect(blank.elements).toHaveLength(0);
    expect(blank.zones).toHaveLength(0);
  });

  it('quadrants template has four rect zones with the specified labels', () => {
    const doc = createQuadrantsTemplate();
    expect(doc.zones).toHaveLength(4);
    expect(doc.zones.every((zone) => zone.shape === 'rect')).toBe(true);
    expect(doc.zones.map((zone) => zone.label).toSorted()).toEqual([
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

  it('concentric template has three nested circle zones with strictly increasing r', () => {
    const doc = createConcentricCirclesTemplate();
    expect(doc.zones).toHaveLength(3);
    const radii: number[] = [];
    const labels: string[] = [];
    for (const zone of doc.zones) {
      expect(zone.shape).toBe('circle');
      if (zone.shape === 'circle') {
        radii.push(zone.r);
      }
      labels.push(zone.label);
    }
    expect(labels).toEqual(['inner', 'middle', 'outer']);
    expect(radii).toHaveLength(3);
    let previous = Number.NEGATIVE_INFINITY;
    let strictlyIncreasing = true;
    for (const radius of radii) {
      if (!(radius > previous)) {
        strictlyIncreasing = false;
      }
      previous = radius;
    }
    expect(strictlyIncreasing).toBe(true);
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
