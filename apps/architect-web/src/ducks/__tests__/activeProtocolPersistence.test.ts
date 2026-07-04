import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import {
  reconcileRehydratedActiveProtocol,
  serializeActiveProtocol,
} from '../activeProtocolPersistence';

const makeProtocol = (name: string): CurrentProtocol =>
  ({
    name,
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  }) as CurrentProtocol;

const timeline = (present: CurrentProtocol | null) => ({
  past: present ? [makeProtocol('old-1'), makeProtocol('old-2')] : [],
  present,
  timeline: [{ id: 'a', path: '/protocol' }],
  future: present ? [makeProtocol('redo')] : [],
  futureTimeline: [{ id: 'b', path: '/protocol' }],
});

describe('serializeActiveProtocol', () => {
  it('persists only the present, dropping past/future history', () => {
    const present = makeProtocol('current');
    const json = serializeActiveProtocol(timeline(present), 'proto-1');
    const parsed = JSON.parse(json);

    expect(parsed.present).toEqual(present);
    expect(parsed.activeProtocolId).toBe('proto-1');
    expect(parsed).not.toHaveProperty('past');
    expect(parsed).not.toHaveProperty('future');
    expect(parsed).not.toHaveProperty('timeline');
  });

  it('stamps a null id when there is no active protocol', () => {
    const json = serializeActiveProtocol(timeline(makeProtocol('x')), null);
    expect(JSON.parse(json).activeProtocolId).toBeNull();
  });
});

describe('reconcileRehydratedActiveProtocol', () => {
  it('restores the present as an empty-history timeline when ids match', () => {
    const present = makeProtocol('current');
    const persisted = { present, activeProtocolId: 'proto-1' };

    const result = reconcileRehydratedActiveProtocol(persisted, 'proto-1');

    expect(result.clearActiveProtocolId).toBe(false);
    expect(result.activeProtocol.present).toEqual(present);
    expect(result.activeProtocol.past).toEqual([]);
    expect(result.activeProtocol.future).toEqual([]);
  });

  it('drops the present and clears the id when the stamped id mismatches', () => {
    const persisted = {
      present: makeProtocol('from-other-tab'),
      activeProtocolId: 'proto-OTHER',
    };

    const result = reconcileRehydratedActiveProtocol(persisted, 'proto-1');

    expect(result.clearActiveProtocolId).toBe(true);
    expect(result.activeProtocol.present).toBeNull();
  });

  it('keeps the present when no id was stamped (legacy persisted value)', () => {
    const present = makeProtocol('legacy');
    const result = reconcileRehydratedActiveProtocol({ present }, 'proto-1');

    expect(result.clearActiveProtocolId).toBe(false);
    expect(result.activeProtocol.present).toEqual(present);
  });

  it('yields an empty timeline for an absent persisted value', () => {
    const result = reconcileRehydratedActiveProtocol(undefined, 'proto-1');

    expect(result.clearActiveProtocolId).toBe(false);
    expect(result.activeProtocol.present).toBeNull();
    expect(result.activeProtocol.past).toEqual([]);
  });
});
