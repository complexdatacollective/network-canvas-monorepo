import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

import { buildDeck, entryKey } from '../deckEntries';

function makeProtocol(name: string): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };
  return {
    id: `test-${name}`,
    hash: `hash-${name}`,
    name,
    schemaVersion: 8,
    importedAt: '2026-05-20T10:00:00.000Z',
    description: '',
    codebook: {},
    protocol,
    sessionCount: 0,
  };
}

function makePending(label: string): PendingImport {
  return { id: `pending-${label}`, label, source: 'file', phase: 'extracting' };
}

describe('entryKey', () => {
  it('namespaces slot keys so the import entry can never collide with a protocol name', () => {
    expect(entryKey({ kind: 'import' })).toBe('import');
    expect(
      entryKey({ kind: 'protocol', protocol: makeProtocol('import') }),
    ).toBe('slot:import');
  });

  it('gives sample, pending, and protocol entries name-based keys so they share slots', () => {
    expect(entryKey({ kind: 'sample' })).toBe('slot:Sample Protocol');
    expect(
      entryKey({ kind: 'pending', pending: makePending('Sample Protocol') }),
    ).toBe('slot:Sample Protocol');
    expect(
      entryKey({ kind: 'protocol', protocol: makeProtocol('Sample Protocol') }),
    ).toBe('slot:Sample Protocol');
  });
});

describe('buildDeck', () => {
  it('returns only the import card for empty input', () => {
    const deck = buildDeck({
      protocols: [],
      showSampleCard: false,
      pendingImports: [],
    });
    expect(deck).toEqual([{ kind: 'import' }]);
  });

  it('sorts protocols case-insensitively and always puts the import card last', () => {
    const deck = buildDeck({
      protocols: [
        makeProtocol('zeta'),
        makeProtocol('Alpha'),
        makeProtocol('beta'),
      ],
      showSampleCard: true,
      pendingImports: [],
    });
    expect(deck.map((e) => entryKey(e))).toEqual([
      'slot:Alpha',
      'slot:beta',
      'slot:Sample Protocol',
      'slot:zeta',
      'import',
    ]);
  });

  it('lets a pending import shadow the sample card in the same slot', () => {
    const deck = buildDeck({
      protocols: [],
      showSampleCard: true,
      pendingImports: [makePending('Sample Protocol')],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('pending');
  });

  it('lets a pending import shadow an installed protocol with the same name', () => {
    const deck = buildDeck({
      protocols: [makeProtocol('Study A')],
      showSampleCard: false,
      pendingImports: [makePending('Study A')],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('pending');
  });

  it('lets the sample card shadow a protocol named Sample Protocol', () => {
    const deck = buildDeck({
      protocols: [makeProtocol('Sample Protocol')],
      showSampleCard: true,
      pendingImports: [],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('sample');
  });
});
