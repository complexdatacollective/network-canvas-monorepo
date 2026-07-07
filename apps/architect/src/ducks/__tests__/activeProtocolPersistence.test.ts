import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import {
  deserializeActiveProtocol,
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
    const parsed = JSON.parse(
      serializeActiveProtocol(timeline(present), 'lib-1'),
    );

    expect(parsed.present).toEqual(present);
    expect(parsed).not.toHaveProperty('past');
    expect(parsed).not.toHaveProperty('future');
    expect(parsed).not.toHaveProperty('timeline');
  });

  it('stamps the owning library id so a mismatch can be detected on reload', () => {
    const parsed = JSON.parse(
      serializeActiveProtocol(timeline(makeProtocol('current')), 'lib-1'),
    );
    expect(parsed.activeProtocolId).toBe('lib-1');
  });

  it('persists a null present when there is no active protocol', () => {
    const parsed = JSON.parse(serializeActiveProtocol(timeline(null), null));
    expect(parsed.present).toBeNull();
  });
});

describe('deserializeActiveProtocol', () => {
  it('restores the present into an empty-history timeline', () => {
    const present = makeProtocol('current');
    const raw = serializeActiveProtocol(timeline(present), 'lib-1');

    const result = deserializeActiveProtocol(raw);

    expect(result.present).toEqual(present);
    expect(result.past).toEqual([]);
    expect(result.future).toEqual([]);
    expect(result.timeline).toEqual([]);
    expect(result.futureTimeline).toEqual([]);
  });

  it('carries the stamped owner id through so rehydrate can reconcile it', () => {
    const raw = serializeActiveProtocol(
      timeline(makeProtocol('current')),
      'lib-1',
    );

    const result = deserializeActiveProtocol(raw);

    expect(result.activeProtocolId).toBe('lib-1');
  });

  it('yields an empty timeline when nothing was persisted', () => {
    const result = deserializeActiveProtocol(JSON.stringify({ present: null }));

    expect(result.present).toBeNull();
    expect(result.past).toEqual([]);
    expect(result.future).toEqual([]);
  });
});

describe('reconcileRehydratedActiveProtocol', () => {
  it('keeps the present when the stamped id matches app.activeProtocolId', () => {
    const present = makeProtocol('current');
    const activeProtocol = deserializeActiveProtocol(
      serializeActiveProtocol(timeline(present), 'lib-1'),
    );

    const result = reconcileRehydratedActiveProtocol(activeProtocol, 'lib-1');

    expect(result.activeProtocol.present).toEqual(present);
    expect(result.clearActiveProtocolId).toBe(false);
  });

  it('discards the present and flags the stale id when the stamped id mismatches', () => {
    // Intra-tab non-atomic persist: `app` already holds the new id, but the
    // `activeProtocol` key still carries the previous protocol's present stamped
    // with the previous id. Rehydrating that pair must not autosave the old
    // content into the new library row.
    const oldPresent = makeProtocol('old');
    const activeProtocol = deserializeActiveProtocol(
      serializeActiveProtocol(timeline(oldPresent), 'old-id'),
    );

    const result = reconcileRehydratedActiveProtocol(activeProtocol, 'new-id');

    expect(result.activeProtocol.present).toBeNull();
    expect(result.clearActiveProtocolId).toBe(true);
  });

  it('keeps the present when no owner id was stamped (legacy payload)', () => {
    const present = makeProtocol('current');
    const legacy = deserializeActiveProtocol(JSON.stringify({ present }));

    const result = reconcileRehydratedActiveProtocol(legacy, 'any-id');

    expect(result.activeProtocol.present).toEqual(present);
    expect(result.clearActiveProtocolId).toBe(false);
  });
});
