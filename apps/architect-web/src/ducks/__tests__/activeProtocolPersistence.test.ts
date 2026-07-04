import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import {
  deserializeActiveProtocol,
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
    const parsed = JSON.parse(serializeActiveProtocol(timeline(present)));

    expect(parsed.present).toEqual(present);
    expect(parsed).not.toHaveProperty('past');
    expect(parsed).not.toHaveProperty('future');
    expect(parsed).not.toHaveProperty('timeline');
  });

  it('persists a null present when there is no active protocol', () => {
    const parsed = JSON.parse(serializeActiveProtocol(timeline(null)));
    expect(parsed.present).toBeNull();
  });
});

describe('deserializeActiveProtocol', () => {
  it('restores the present into an empty-history timeline', () => {
    const present = makeProtocol('current');
    const raw = serializeActiveProtocol(timeline(present));

    const result = deserializeActiveProtocol(raw);

    expect(result.present).toEqual(present);
    expect(result.past).toEqual([]);
    expect(result.future).toEqual([]);
    expect(result.timeline).toEqual([]);
    expect(result.futureTimeline).toEqual([]);
  });

  it('yields an empty timeline when nothing was persisted', () => {
    const result = deserializeActiveProtocol(JSON.stringify({ present: null }));

    expect(result.present).toBeNull();
    expect(result.past).toEqual([]);
    expect(result.future).toEqual([]);
  });
});
