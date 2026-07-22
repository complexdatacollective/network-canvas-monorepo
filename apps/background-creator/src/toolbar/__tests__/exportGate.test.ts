import { describe, expect, it } from 'vitest';

import type { BackgroundDocument, RectElement } from '~/model/types';

import { evaluateScriptExport } from '../exportGate';

function docWith(elements: RectElement[]): BackgroundDocument {
  return {
    version: 1,
    title: 'Test',
    description: '',
    elements,
  };
}

function rectZone(id: string, zoneLabel: string | null): RectElement {
  return {
    id,
    kind: 'rect',
    x: 0,
    y: 0,
    width: 0.5,
    height: 0.5,
    fill: '#ffffff',
    fillOpacity: 0.25,
    stroke: null,
    strokeWidth: 3,
    zoneLabel,
  };
}

describe('evaluateScriptExport', () => {
  it('blocks export when there are no zones', () => {
    const gate = evaluateScriptExport(docWith([rectZone('a', null)]));
    expect(gate).toEqual({ ok: false, reason: 'no-zones' });
  });

  it('blocks export when a zone label is empty', () => {
    const gate = evaluateScriptExport(
      docWith([rectZone('a', 'left'), rectZone('b', '  ')]),
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok && gate.reason === 'invalid-labels') {
      expect(gate.problems.length).toBeGreaterThan(0);
    } else {
      expect.unreachable('expected invalid-labels gate');
    }
  });

  it('blocks export when zone labels are duplicated', () => {
    const gate = evaluateScriptExport(
      docWith([rectZone('a', 'zone'), rectZone('b', 'zone')]),
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok && gate.reason === 'invalid-labels') {
      expect(gate.problems.some((p) => p.includes('zone'))).toBe(true);
    } else {
      expect.unreachable('expected invalid-labels gate');
    }
  });

  it('allows export when every zone has a unique, non-empty label', () => {
    const gate = evaluateScriptExport(
      docWith([rectZone('a', 'left'), rectZone('b', 'right')]),
    );
    expect(gate).toEqual({ ok: true });
  });
});
