import { describe, expect, it } from 'vitest';

import type { BackgroundDocument, Zone } from '~/model/types';

import { evaluateScriptExport } from '../exportGate';

function docWith(zones: Zone[]): BackgroundDocument {
  return {
    version: 1,
    title: 'Test',
    description: '',
    elements: [],
    zones,
  };
}

function rectZone(id: string, label: string): Zone {
  return { id, label, shape: 'rect', x: 0, y: 0, width: 0.5, height: 0.5 };
}

describe('evaluateScriptExport', () => {
  it('blocks export when there are no zones', () => {
    const gate = evaluateScriptExport(docWith([]));
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
