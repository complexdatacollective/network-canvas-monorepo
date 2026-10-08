// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { hashProtocol, migrateProtocol } from '@codaco/protocol-validation';

import type { StoredProtocol, StoredSession } from '../types';

// A controllable pause inside `encryptProtocol`, so a test can
// deterministically land a peer tab's write (a re-import or a delete) in the
// gap between the sweep's read of a row and its commit. Everything else passes
// through to the real implementation, so seeding rows is unaffected while no
// pause is armed.
type Pause = {
  reached: Promise<void>;
  signalReached: () => void;
  blocked: Promise<void>;
};

let encryptPause: Pause | null = null;
// The same, inside `encryptSession`: the sweep re-encrypts a migrated session
// after reading the protocol's sessions and before committing.
let sessionEncryptPause: Pause | null = null;

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
    encryptSession: async (
      ...args: Parameters<typeof actual.encryptSession>
    ) => {
      if (sessionEncryptPause) {
        const pause = sessionEncryptPause;
        sessionEncryptPause = null;
        pause.signalReached();
        await pause.blocked;
      }
      return actual.encryptSession(...args);
    },
  };
});

// Import AFTER the mock so the sweep binds the wrapped encryptProtocol.
const { db } = await import('../db');
const { migrateStoredProtocols } = await import('../migrateStoredProtocols');
const { decryptSession, encryptProtocol, encryptSession } =
  await import('../recordCrypto');

function makePause() {
  let signalReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { pause: { reached, signalReached, blocked }, reached, release };
}

function pauseNextEncrypt() {
  const { pause, reached, release } = makePause();
  encryptPause = pause;
  return { reached, release };
}

function pauseNextSessionEncrypt() {
  const { pause, reached, release } = makePause();
  sessionEncryptPause = pause;
  return { reached, release };
}

const asStoredDocument = (document: Record<string, unknown>): CurrentProtocol =>
  document as unknown as CurrentProtocol;

// Every migration to schema 9 adds the localization declaration, which the
// hash covers, so no real document keeps its hash. A row stored under the hash
// its migration produces keeps its key, which reaches the rewrite-in-place
// path. A row stored under any other key takes the re-keying path.
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
    sessionEncryptPause = null;
    await db.protocols.clear();
    await db.sessions.clear();
    await db.assets.clear();
  });

  it('leaves a row re-imported mid-migration alone (rewrite-in-place path)', async () => {
    const doc = emptyV7();
    const hash = hashProtocol(
      migrateProtocol(doc, COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {
        name: 'Empty Study',
      }),
    );
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

  it('does not undo a session write that lands mid-migration', async () => {
    // Migrating drops the empty form at stage 0, so a session at stage 1
    // moves to stage 0 and has to be re-encrypted.
    const doc: Record<string, unknown> = {
      schemaVersion: 7,
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [
        { id: 'empty', type: 'EgoForm', label: 'Empty', form: { fields: [] } },
        {
          id: 'info',
          type: 'Information',
          label: 'Info',
          title: 'Info',
          items: [{ id: 'text', type: 'text', content: 'Hello' }],
        },
      ],
    };
    await seedProtocol(storedRow('old-hash', 'Form Study', doc));
    const session: StoredSession = {
      id: 's1',
      protocolHash: 'old-hash',
      protocolName: 'Form Study',
      caseId: 'case-1',
      startedAt: '2026-01-02T00:00:00.000Z',
      lastUpdatedAt: '2026-01-02T00:00:00.000Z',
      finishedAt: null,
      exportedAt: null,
      currentStep: 1,
      network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
      localePreference: null,
      locale: null,
    };
    await db.sessions.put(await encryptSession(session));

    const pause = pauseNextSessionEncrypt();
    const pending = migrateStoredProtocols();
    await pause.reached;
    // The interview, still running against the old protocol, saves an answer.
    await db.sessions.put(
      await encryptSession({
        ...session,
        lastUpdatedAt: '2026-01-03T00:00:00.000Z',
        network: {
          ...session.network,
          ego: { _uid: 'ego', attributes: { answered: true } },
        },
      }),
    );
    pause.release();
    const first = await pending;

    // Nothing was committed; the next launch migrates what is stored then.
    expect(first.migrated).toEqual([]);
    expect(first.failed).toEqual([]);
    expect((await db.sessions.get('s1'))?.protocolHash).toBe('old-hash');

    const second = await migrateStoredProtocols();
    expect(second.migrated).toHaveLength(1);
    const row = await db.sessions.get('s1');
    if (!row) throw new Error('expected the session to survive');
    const migrated = await decryptSession(row);
    expect(migrated.currentStep).toBe(0);
    expect(migrated.network.ego.attributes).toEqual({ answered: true });
  });
});
