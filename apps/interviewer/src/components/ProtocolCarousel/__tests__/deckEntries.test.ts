import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { ProtocolWithCounts } from '~/lib/db/types';
import type { PendingImport } from '~/lib/protocol/useProtocolImport';

import { buildDeck, entryKey } from '../deckEntries';

function makeProtocol(name: string, hash = `hash-${name}`): ProtocolWithCounts {
  const protocol: CurrentProtocol = {
    name,
    description: '',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };
  return {
    id: `test-${hash}`,
    hash,
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
  it('namespaces the import key so it can never collide with a protocol key', () => {
    expect(entryKey({ kind: 'import' })).toBe('import');
    expect(
      entryKey({ kind: 'protocol', protocol: makeProtocol('import') }),
    ).toBe('hash:hash-import');
  });

  it('keys installed protocols by hash so same-name/different-hash never collapse', () => {
    expect(
      entryKey({ kind: 'protocol', protocol: makeProtocol('Study', 'abc') }),
    ).toBe('hash:abc');
    expect(
      entryKey({ kind: 'protocol', protocol: makeProtocol('Study', 'def') }),
    ).toBe('hash:def');
  });

  it('keys the sample teaser and pending imports by name so their card can morph in place', () => {
    expect(entryKey({ kind: 'sample' })).toBe('slot:Sample Protocol');
    expect(
      entryKey({ kind: 'pending', pending: makePending('Sample Protocol') }),
    ).toBe('slot:Sample Protocol');
  });
});

describe('buildDeck', () => {
  it('returns only the import card for empty input', () => {
    const deck = buildDeck({
      protocols: [],
      showSampleCard: false,
      showDevelopmentCard: false,
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
      showDevelopmentCard: false,
      pendingImports: [],
    });
    expect(deck.map((e) => entryKey(e))).toEqual([
      'hash:hash-Alpha',
      'hash:hash-beta',
      'slot:Sample Protocol',
      'hash:hash-zeta',
      'import',
    ]);
  });

  it('keeps both cards when two installed protocols share a name but differ in hash', () => {
    const deck = buildDeck({
      protocols: [
        makeProtocol('MyStudy', 'hash-old'),
        makeProtocol('MyStudy', 'hash-new'),
      ],
      showSampleCard: false,
      showDevelopmentCard: false,
      pendingImports: [],
    });
    expect(deck.map((e) => entryKey(e))).toEqual([
      'hash:hash-old',
      'hash:hash-new',
      'import',
    ]);
  });

  it('lets a pending import shadow the sample card in the same slot', () => {
    const deck = buildDeck({
      protocols: [],
      showSampleCard: true,
      showDevelopmentCard: false,
      pendingImports: [makePending('Sample Protocol')],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('pending');
  });

  it('lets a pending import shadow an installed protocol with the same name', () => {
    const deck = buildDeck({
      protocols: [makeProtocol('Study A')],
      showSampleCard: false,
      showDevelopmentCard: false,
      pendingImports: [makePending('Study A')],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('pending');
  });

  it('lets the sample card shadow a protocol named Sample Protocol', () => {
    const deck = buildDeck({
      protocols: [makeProtocol('Sample Protocol')],
      showSampleCard: true,
      showDevelopmentCard: false,
      pendingImports: [],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('sample');
  });

  it('includes the development teaser in its own name slot when requested', () => {
    const deck = buildDeck({
      protocols: [],
      showSampleCard: true,
      showDevelopmentCard: true,
      pendingImports: [],
    });
    expect(deck.map((e) => entryKey(e))).toEqual([
      'slot:Development Protocol',
      'slot:Sample Protocol',
      'import',
    ]);
  });

  it('lets a pending import shadow the development teaser in the same slot', () => {
    const deck = buildDeck({
      protocols: [],
      showSampleCard: false,
      showDevelopmentCard: true,
      pendingImports: [makePending('Development Protocol')],
    });
    expect(deck).toHaveLength(2);
    expect(deck[0]?.kind).toBe('pending');
  });
});
