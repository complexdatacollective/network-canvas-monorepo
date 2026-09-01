// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { hashProtocol } from '@codaco/protocol-validation';

import type { StoredProtocol } from '../types';

// A controllable pause inside `encryptProtocol`, so a test can
// deterministically land a peer tab's write (a re-import or a delete) in the
// gap between the sweep's read of a row and its commit. Everything else passes
// through to the real implementation, so seeding rows is unaffected while no
// pause is armed.
let encryptPause: {
  reached: Promise<void>;
  signalReached: () => void;
  blocked: Promise<void>;
} | null = null;

vi.mock('../recordCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../recordCrypto')>();
  return {
    ...actual,
    encryptProtocol: async (
      ...args: Parameters<typeof actual.encryptProtocol>
    ) => {
      if (encryptPause) {
        // One-shot: disarm before blocking, so the peer write a test performs
        // while the sweep is suspended (which also encrypts) passes through.
        const pause = encryptPause;
        encryptPause = null;
        pause.signalReached();
        await pause.blocked;
      }
      return actual.encryptProtocol(...args);
    },
  };
});

// Import AFTER the mock so the sweep binds the wrapped encryptProtocol.
const { db } = await import('../db');
const { migrateStoredProtocols } = await import('../migrateStoredProtocols');
const { encryptProtocol } = await import('../recordCrypto');

function pauseNextEncrypt() {
  let signalReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  encryptPause = { reached, signalReached, blocked };
  return { reached, release };
}

const asStoredDocument = (document: Record<string, unknown>): CurrentProtocol =>
  document as unknown as CurrentProtocol;

// An empty v7 document migrates to an identical structure (the hash covers
// codebook + stages only), so its row keeps its key — the rewrite-in-place
// path. The person-typed document changes structurally, so its hash moves.
const emptyV7 = (): Record<string, unknown> => ({
  schemaVersion: 7,
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [],
});
const structuralV7 = (): Record<string, unknown> => ({
  schemaVersion: 7,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        iconVariant: 'add-a-person',
        displayVariable: 'name',
        variables: { name: { name: 'Name', type: 'text' } },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [],
});

function storedRow(
  hash: string,
  name: string,
  document: Record<string, unknown>,
  importedAt = '2026-01-01T00:00:00.000Z',
): StoredProtocol {
  return {
    id: hash,
    hash,
    name,
    schemaVersion: document.schemaVersion as number,
    importedAt,
    codebook: document.codebook as CurrentProtocol['codebook'],
    protocol: asStoredDocument(document),
  };
}

async function seedProtocol(row: StoredProtocol): Promise<void> {
  await db.protocols.put(await encryptProtocol(row));
}

describe('the sweep against concurrent writers', () => {
  afterEach(async () => {
    encryptPause = null;
    await db.protocols.clear();
    await db.sessions.clear();
    await db.assets.clear();
  });

  it('leaves a row re-imported mid-migration alone (rewrite-in-place path)', async () => {
    const doc = emptyV7();
    const hash = hashProtocol(asStoredDocument(doc));
    await seedProtocol(storedRow(hash, 'Empty Study', doc));

    const pause = pauseNextEncrypt();
    const pending = migrateStoredProtocols();
    await pause.reached;
    // A peer tab re-imports the same file: same hash, fresh importedAt — and,
    // because the hash excludes assets and experiments, possibly different
    // resources. Its write must win.
    await seedProtocol(
      storedRow(hash, 'Empty Study', doc, '2026-03-03T00:00:00.000Z'),
    );
    pause.release();
    const result = await pending;

    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual([]);
    const row = await db.protocols.get(hash);
    expect(row?.importedAt).toBe('2026-03-03T00:00:00.000Z');
    expect(row?.schemaVersion).toBe(7);
  });

  it('does not resurrect a row deleted mid-migration (re-keying path)', async () => {
    const doc = structuralV7();
    const hash = 'old-structural-hash';
    await seedProtocol(storedRow(hash, 'Deleted Study', doc));

    const pause = pauseNextEncrypt();
    const pending = migrateStoredProtocols();
    await pause.reached;
    await db.protocols.delete(hash);
    pause.release();
    const result = await pending;

    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual([]);
    // Nothing was written anywhere — not the old key, not the migrated key.
    expect(await db.protocols.count()).toBe(0);
  });
});
