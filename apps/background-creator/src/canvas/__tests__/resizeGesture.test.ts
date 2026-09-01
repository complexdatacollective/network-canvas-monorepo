import { describe, expect, it } from 'vitest';

import type { BackgroundDocument, RectElement } from '~/model/types';

import type { Handle } from '../canvasGeometry';
import { resizeDocumentFromSnapshot } from '../resizeGesture';

const NORTH_WEST: Handle = { kind: 'corner', corner: 'nw' };

function rectangle(): RectElement {
  return {
    id: 'rect',
    kind: 'rect',
    x: 0.2,
    y: 0.2,
    width: 0.3,
    height: 0.3,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
    zoneLabel: null,
  };
}

describe('resizeDocumentFromSnapshot', () => {
  it('keeps the original opposite corner fixed across cross-drag frames', () => {
    const snapshot: BackgroundDocument = {
      version: 1,
      title: '',
      description: '',
      elements: [rectangle()],
    };

    const firstFrame = resizeDocumentFromSnapshot(
      snapshot,
      'rect',
      NORTH_WEST,
      { x: 0.6, y: 0.6 },
      null,
    );
    const finalFrame = resizeDocumentFromSnapshot(
      snapshot,
      'rect',
      NORTH_WEST,
      { x: 0.7, y: 0.7 },
      null,
    );

    const first = firstFrame.elements[0];
    const final = finalFrame.elements[0];
    expect(first).toMatchObject({ kind: 'rect', x: 0.5, y: 0.5 });
    expect(final).toMatchObject({ kind: 'rect', x: 0.5, y: 0.5 });
    if (first?.kind !== 'rect' || final?.kind !== 'rect') {
      throw new Error('Expected the resized element to remain a rectangle');
    }
    expect(first.width).toBeCloseTo(0.1);
    expect(first.height).toBeCloseTo(0.1);
    expect(final.width).toBeCloseTo(0.2);
    expect(final.height).toBeCloseTo(0.2);
  });
});
