// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { hashProtocol, migrateProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

import type { StoredProtocol, StoredSession } from '../types';

// Every write here prepares its rows (encrypting them, or leaving them
// plaintext while no vault is configured) before the transaction that commits
// them opens. These tests stop a write right after its last row is prepared,
// secure the device from "another tab" in that gap — enrolment's
// re-encryption sweep, run with the new key — and then let the write commit.
// The rule under test: no row may be stored as plaintext once the device is
// secured.
type EncryptFunction = 'encryptAsset' | 'encryptProtocol' | 'encryptSession';

let armed: {
  fn: EncryptFunction;
  signalReached: () => void;
  blocked: Promise<void>;
} | null = null;

async function pauseAfter<T>(fn: EncryptFunction, result: T): Promise<T> {
  if (armed?.fn === fn) {
    // One-shot: disarm before blocking, so the other tab's sweep, which
    // encrypts too, passes straight through.
    const pause = armed;
    armed = null;
    pause.signalReached();
    await pause.blocked;
  }
  return result;
}

vi.mock('../recordCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../recordCrypto')>();
  return {
    ...actual,
    encryptAsset: async (...args: Parameters<typeof actual.encryptAsset>) =>
      pauseAfter('encryptAsset', await actual.encryptAsset(...args)),
    encryptProtocol: async (
      ...args: Parameters<typeof actual.encryptProtocol>
    ) => pauseAfter('encryptProtocol', await actual.encryptProtocol(...args)),
    encryptSession: async (...args: Parameters<typeof actual.encryptSession>) =>
      pauseAfter('encryptSession', await actual.encryptSession(...args)),
  };
});

// Import AFTER the mock so the code under test binds the wrapped functions.
const { db } = await import('../db');
const { migrateStoredProtocols } = await import('../migrateStoredProtocols');
const { saveProtocol } = await import('../protocols');
const { decryptSession, encryptProtocol, encryptSession, DeviceSecuredError } =
  await import('../recordCrypto');
const { setSessionDek } = await import('../sessionKey');
const { createSession, updateSession } = await import('../sessions');
const { clearVault, writeVault } = await import('../../vault/vaultStore');

// The other tab: its own copies of the modules, so its own session write
// queue, over the same database.
vi.resetModules();
const otherTab = {
  ...(await import('../reencrypt')),
  ...(await import('../sessionKey')),
};

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Stops the next call of `fn` after it has produced its row, until released.
 * `run` settles either way, so a write that never reaches the pause fails
 * the test rather than hanging it.
 */
async function secureAfter<T>(
  fn: EncryptFunction,
  dek: CryptoKey,
  view: VaultView,
  run: () => Promise<T>,
): Promise<PromiseSettledResult<T>> {
  let signalReached!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    signalReached = resolve;
  });
  armed = {
    fn,
    signalReached,
    blocked: new Promise<void>((resolve) => {
      release = resolve;
    }),
  };
  const pending = run().then(
    (value): PromiseSettledResult<T> => ({ status: 'fulfilled', value }),
    (reason: unknown): PromiseSettledResult<T> => ({
      status: 'rejected',
      reason,
    }),
  );
  const paused = await Promise.race([
    reached.then(() => true),
    pending.then(() => false),
  ]);
  expect(paused, `the write never reached ${fn}`).toBe(true);
  await secureFromAnotherTab(dek, view);
  release();
  return pending;
}

/**
 * How this tab sees the vault record when the write commits. localStorage
 * reaches other tabs asynchronously, so this tab may still read the device as
 * unsecured after another tab has secured it and swept its rows.
 */
type VaultView = 'stale' | 'current';

// Initial enrolment in another tab: it writes the vault record, takes the new
// key, and re-encrypts every row it lists. This tab is left without a key.
async function secureFromAnotherTab(
  dek: CryptoKey,
  view: VaultView,
): Promise<void> {
  if (view === 'current') {
    writeVault({
      version: 4,
      mode: 'pin',
      kdfSaltB64: 'c2FsdA==',
      kdfIterations: 1,
      wrappedDekB64: 'd3JhcHBlZA==',
    });
  }
  // The mocked crypto module is shared by both copies and reads this tab's
  // key, so the key is held here too while the other tab sweeps. This tab's
  // write is suspended with its rows already prepared, so it cannot use it.
  otherTab.setSessionDek(dek);
  setSessionDek(dek);
  try {
    expect((await otherTab.reencryptAllRecords()).failed).toBe(0);
  } finally {
    otherTab.setSessionDek(null);
    setSessionDek(null);
  }
}

/** Every stored row that holds its payload as plaintext. */
async function plaintextRows(): Promise<string[]> {
  const found: string[] = [];
  for (const row of await db.protocols.toArray()) {
    if (!row._enc || row.protocol !== undefined || row.codebook !== undefined) {
      found.push(`protocol ${row.id}`);
    }
  }
  for (const row of await db.sessions.toArray()) {
    if (!row._enc || row.network !== undefined) found.push(`session ${row.id}`);
  }
  for (const row of await db.assets.toArray()) {
    if (!row._enc || row.data !== undefined) found.push(`asset ${row.id}`);
  }
  for (const record of await db.protocolMigrations.toArray()) {
    const source = record.source?.row;
    if (source && (!source._enc || source.protocol !== undefined)) {
      found.push(`re-keying record ${record.previousHash}`);
    }
  }
  return found;
}

const network: NcNetwork = {
  ego: { _uid: 'ego', attributes: {} },
  nodes: [],
  edges: [],
};

// Migrating drops the empty form at stage 0, so a session at stage 1 moves to
// stage 0: its migration re-encrypts it.
const formStudy = (): Record<string, unknown> => ({
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
});

function storedProtocol(
  hash: string,
  document: Record<string, unknown>,
): StoredProtocol {
  return {
    id: hash,
    hash,
    name: 'Form Study',
    schemaVersion: document.schemaVersion as number,
    importedAt: '2026-01-01T00:00:00.000Z',
    codebook: document.codebook as CurrentProtocol['codebook'],
    protocol: document as unknown as CurrentProtocol,
  };
}

function storedSession(id: string, protocolHash: string): StoredSession {
  return {
    id,
    protocolHash,
    protocolName: 'Form Study',
    caseId: `case-${id}`,
    startedAt: '2026-01-02T00:00:00.000Z',
    lastUpdatedAt: '2026-01-02T00:00:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 1,
    network,
    localePreference: null,
    locale: null,
  };
}

async function seed(
  hash: string,
  document: Record<string, unknown>,
  sessionIds: string[],
  assetIds: string[] = [],
): Promise<void> {
  await db.protocols.put(await encryptProtocol(storedProtocol(hash, document)));
  for (const id of sessionIds) {
    await db.sessions.put(await encryptSession(storedSession(id, hash)));
  }
  for (const assetId of assetIds) {
    await db.assets.put({
      id: `${hash}::${assetId}`,
      protocolHash: hash,
      assetId,
      name: 'Key',
      type: 'apikey',
      data: `secret-${assetId}`,
    });
  }
}

async function clearAll(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()));
}

describe.each<VaultView>(['stale', 'current'])(
  'securing the device while a write is prepared (%s vault view)',
  (view) => {
    let dek: CryptoKey;
    beforeEach(async () => {
      await clearAll();
      clearVault();
      setSessionDek(null);
      dek = await makeDek();
    });
    afterEach(async () => {
      armed = null;
      clearVault();
      setSessionDek(null);
      await clearAll();
    });

    // The migration cannot finish in this tab once the device is secured:
    // this tab holds no key. Unlocking it starts the sweep again.
    async function unlockAndMigrate() {
      setSessionDek(dek);
      return migrateStoredProtocols();
    }

    it('re-keying migration: commits no plaintext, and migrates once unlocked', async () => {
      await seed('old-hash', formStudy(), ['s1'], ['key-1']);

      const outcome = await secureAfter('encryptAsset', dek, view, () =>
        migrateStoredProtocols(),
      );

      expect(outcome).toEqual({
        status: 'fulfilled',
        value: { migrated: [], failed: [] },
      });
      expect(await plaintextRows()).toEqual([]);
      expect(await db.protocols.get('old-hash')).toBeDefined();

      const retried = await unlockAndMigrate();
      expect(retried.failed).toEqual([]);
      expect(retried.migrated).toHaveLength(1);
      expect(await plaintextRows()).toEqual([]);
      const row = await db.sessions.get('s1');
      if (!row) throw new Error('expected the session to survive');
      expect(row.protocolHash).toBe(retried.migrated[0]?.hash);
      expect((await decryptSession(row)).currentStep).toBe(0);
    });

    it('in-place migration: commits no plaintext, and migrates once unlocked', async () => {
      const document = formStudy();
      const hash = hashProtocol(
        migrateProtocol(document, COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {
          name: 'Form Study',
        }),
      );
      await seed(hash, document, ['s1']);

      const outcome = await secureAfter('encryptSession', dek, view, () =>
        migrateStoredProtocols(),
      );

      expect(outcome).toEqual({
        status: 'fulfilled',
        value: { migrated: [], failed: [] },
      });
      expect(await plaintextRows()).toEqual([]);
      expect((await db.protocols.get(hash))?.schemaVersion).toBe(7);

      const retried = await unlockAndMigrate();
      expect(retried.failed).toEqual([]);
      expect(retried.migrated).toHaveLength(1);
      expect(await plaintextRows()).toEqual([]);
      const row = await db.sessions.get('s1');
      if (!row) throw new Error('expected the session to survive');
      expect((await decryptSession(row)).currentStep).toBe(0);
    });

    it('healing a late session: commits no plaintext, and heals once unlocked', async () => {
      await seed('old-hash', formStudy(), []);
      const first = await migrateStoredProtocols();
      const hash = first.migrated[0]?.hash;
      if (!hash) throw new Error('expected the protocol to migrate');
      // A tab still running against the old protocol writes its session back.
      await db.sessions.put(
        await encryptSession(storedSession('late', 'old-hash')),
      );

      const outcome = await secureAfter('encryptSession', dek, view, () =>
        migrateStoredProtocols(),
      );

      expect(outcome).toEqual({
        status: 'fulfilled',
        value: { migrated: [], failed: [] },
      });
      expect(await plaintextRows()).toEqual([]);
      expect((await db.sessions.get('late'))?.protocolHash).toBe('old-hash');

      const retried = await unlockAndMigrate();
      expect(retried.failed).toEqual([]);
      expect(await plaintextRows()).toEqual([]);
      const row = await db.sessions.get('late');
      if (!row) throw new Error('expected the session to survive');
      expect(row.protocolHash).toBe(hash);
      expect((await decryptSession(row)).currentStep).toBe(0);
    });

    it('updateSession: refuses the plaintext write and keeps the stored session', async () => {
      await seed('h1', formStudy(), ['s1']);

      const outcome = await secureAfter('encryptSession', dek, view, () =>
        updateSession('s1', { caseId: 'renamed' }, { protocolHash: 'h1' }),
      );

      expect(outcome.status).toBe('rejected');
      expect(
        outcome.status === 'rejected' &&
          outcome.reason instanceof DeviceSecuredError,
      ).toBe(true);
      expect(await plaintextRows()).toEqual([]);
      expect((await db.sessions.get('s1'))?.caseId).toBe('case-s1');
    });

    it('createSession: refuses the plaintext write', async () => {
      await seed('h1', formStudy(), []);

      const outcome = await secureAfter('encryptSession', dek, view, () =>
        createSession({
          protocolHash: 'h1',
          protocolName: 'Form Study',
          caseId: 'new',
          initialNetwork: network,
        }),
      );

      expect(outcome.status).toBe('rejected');
      expect(
        outcome.status === 'rejected' &&
          outcome.reason instanceof DeviceSecuredError,
      ).toBe(true);
      expect(await plaintextRows()).toEqual([]);
      expect(await db.sessions.count()).toBe(0);
    });

    it('saveProtocol: refuses the plaintext import', async () => {
      const document = migrateProtocol(
        formStudy(),
        COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        { name: 'Form Study' },
      ) as CurrentProtocol;

      const outcome = await secureAfter('encryptAsset', dek, view, () =>
        saveProtocol(document, hashProtocol(document), [
          { id: 'key-1', name: 'Key', data: 'secret' },
        ]),
      );

      expect(outcome.status).toBe('rejected');
      expect(
        outcome.status === 'rejected' &&
          outcome.reason instanceof DeviceSecuredError,
      ).toBe(true);
      expect(await plaintextRows()).toEqual([]);
      expect(await db.protocols.count()).toBe(0);
    });
  },
);
