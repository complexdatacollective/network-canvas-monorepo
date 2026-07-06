// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { db } from '../db';
import {
  decryptAsset,
  decryptProtocol,
  decryptSession,
  encryptAsset,
  encryptProtocol,
  encryptSession,
} from '../recordCrypto';
import { reencryptAllRecords } from '../reencrypt';
import { setSessionDek } from '../sessionKey';
import type { StoredAsset, StoredProtocol, StoredSession } from '../types';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const network: NcNetwork = {
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'n1',
      type: 'person',
      [entityAttributesProperty]: { name: 'Ada' },
    },
  ],
  edges: [],
};

function makeSession(id: string): StoredSession {
  return {
    id,
    protocolHash: 'h1',
    protocolName: 'Study',
    caseId: `case-${id}`,
    startedAt: '2026-01-01T00:00:00.000Z',
    lastUpdatedAt: '2026-01-02T03:04:05.678Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 3,
    progress: 40,
    network,
    stageMetadata: { '0': { visited: true } },
    isSynthetic: false,
  };
}

const protocol: StoredProtocol = {
  id: 'h1',
  hash: 'h1',
  name: 'Study',
  schemaVersion: 8,
  importedAt: '2026-01-01T09:08:07.654Z',
  description: 'A study',
  codebook: { node: {}, edge: {}, ego: {} },
  protocol: {
    name: 'Study',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
  } as CurrentProtocol,
};

// A string-valued asset (real `apikey` type). Storing a raw Blob plaintext in
// jsdom's fake-indexeddb loses the Blob prototype on read-back (structuredClone
// limitation) — irrelevant to the sweep logic, which is fully exercised by a
// string asset plus the encrypted-blob survival check below.
const stringAsset: StoredAsset = {
  id: 'h1::key-1',
  protocolHash: 'h1',
  assetId: 'key-1',
  name: 'Key',
  type: 'apikey',
  data: 'secret-token',
};

const blobAsset: StoredAsset = {
  id: 'h1::img-1',
  protocolHash: 'h1',
  assetId: 'img-1',
  name: 'Photo',
  type: 'image',
  data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
};

async function clearAll(): Promise<void> {
  await db.sessions.clear();
  await db.protocols.clear();
  await db.assets.clear();
}

// Write each row in the PLAINTEXT (mode-none) shape: no DEK held, so the
// encrypt* setters pass the sensitive fields straight through with no `_enc`.
// This models data collected before the device was secured.
async function seedPlaintext(): Promise<void> {
  setSessionDek(null);
  await db.sessions.put(await encryptSession(makeSession('s1')));
  await db.protocols.put(await encryptProtocol(protocol));
  await db.assets.put(await encryptAsset(stringAsset));
}

describe('reencryptAllRecords — sweep after enrolment', () => {
  beforeEach(clearAll);
  afterEach(async () => {
    await clearAll();
    setSessionDek(null);
  });

  it('encrypts plaintext rows and still decrypts them to the original values', async () => {
    await seedPlaintext();

    // Sanity: rows are plaintext before the sweep.
    expect((await db.sessions.get('s1'))?._enc).toBeUndefined();
    expect((await db.sessions.get('s1'))?.network).toEqual(network);
    expect((await db.protocols.get('h1'))?._enc).toBeUndefined();
    expect((await db.assets.get('h1::key-1'))?._enc).toBeUndefined();

    setSessionDek(await makeDek());
    await reencryptAllRecords();

    const sessionRow = await db.sessions.get('s1');
    expect(sessionRow?._enc?.network).toBeDefined();
    expect(sessionRow?.network).toBeUndefined();
    expect(sessionRow?.stageMetadata).toBeUndefined();

    const protocolRow = await db.protocols.get('h1');
    expect(protocolRow?._enc?.protocol).toBeDefined();
    expect(protocolRow?.protocol).toBeUndefined();
    expect(protocolRow?.codebook).toBeUndefined();

    const assetRow = await db.assets.get('h1::key-1');
    expect(assetRow?._enc?.data).toBeDefined();
    expect(assetRow?.data).toBeUndefined();

    // Round-trips back to the originals under the same DEK.
    if (!sessionRow || !protocolRow || !assetRow) {
      throw new Error('expected all rows to be present');
    }
    const backSession = await decryptSession(sessionRow);
    expect(backSession.network).toEqual(network);
    expect(backSession.stageMetadata).toEqual({ '0': { visited: true } });
    const backProtocol = await decryptProtocol(protocolRow);
    expect(backProtocol.protocol.name).toBe('Study');
    const backAsset = await decryptAsset(assetRow);
    expect(backAsset.data).toBe('secret-token');
  });

  it('leaves rows already encrypted under the DEK intact (round-trips a stored blob)', async () => {
    const dek = await makeDek();
    setSessionDek(dek);
    // Seed an already-encrypted blob asset: storage holds `_enc` ciphertext
    // bytes, not a raw Blob, so no jsdom Blob-clone limitation applies. This is
    // the state of any row written after the device was secured.
    await db.assets.put(await encryptAsset(blobAsset));
    const before = await db.assets.get('h1::img-1');
    expect(before?._enc?.data).toBeDefined();

    await reencryptAllRecords();

    const after = await db.assets.get('h1::img-1');
    expect(after?._enc?.data).toBeDefined();
    if (!after) throw new Error('expected asset row');
    const back = await decryptAsset(after);
    if (!(back.data instanceof Blob)) throw new Error('expected a Blob');
    const bytes = new Uint8Array(await back.data.arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4]);
  });

  it('leaves every plaintext index field, including timestamps, unchanged', async () => {
    await seedPlaintext();
    setSessionDek(await makeDek());
    await reencryptAllRecords();

    const sessionRow = await db.sessions.get('s1');
    expect(sessionRow?.lastUpdatedAt).toBe('2026-01-02T03:04:05.678Z');
    expect(sessionRow?.startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(sessionRow?.caseId).toBe('case-s1');
    expect(sessionRow?.currentStep).toBe(3);
    expect(sessionRow?.progress).toBe(40);
    expect(sessionRow?.finishedAt).toBeNull();
    expect(sessionRow?.isSynthetic).toBe(false);

    const protocolRow = await db.protocols.get('h1');
    expect(protocolRow?.importedAt).toBe('2026-01-01T09:08:07.654Z');
    expect(protocolRow?.name).toBe('Study');

    const assetRow = await db.assets.get('h1::key-1');
    expect(assetRow?.assetId).toBe('key-1');
    expect(assetRow?.name).toBe('Key');
  });

  it('is a safe no-op re-run on rows already encrypted under the same DEK', async () => {
    await seedPlaintext();
    const dek = await makeDek();
    setSessionDek(dek);
    await reencryptAllRecords();

    const firstSweep = await db.sessions.get('s1');

    // Re-run: rows stay encrypted and still round-trip.
    await reencryptAllRecords();
    const secondSweep = await db.sessions.get('s1');
    expect(secondSweep?._enc?.network).toBeDefined();
    expect(secondSweep?.lastUpdatedAt).toBe(firstSweep?.lastUpdatedAt);

    if (!secondSweep) throw new Error('expected session row');
    const back = await decryptSession(secondSweep);
    expect(back.network).toEqual(network);
  });

  it('is a no-op on an empty database', async () => {
    setSessionDek(await makeDek());
    await expect(reencryptAllRecords()).resolves.toEqual({
      total: 0,
      failed: 0,
    });
    expect(await db.sessions.count()).toBe(0);
    expect(await db.protocols.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
  });

  it('skips a failing row and keeps encrypting the rest, counting the failure', async () => {
    // Seed one healthy plaintext session and one malformed row (no `network`
    // and no `_enc`, so decryptSession throws), both stored as plaintext.
    setSessionDek(null);
    await db.sessions.put(await encryptSession(makeSession('good')));
    const { network: _network, ...broken } = makeSession('broken');
    await db.sessions.put(broken as unknown as StoredSession);

    // A single failing row must NOT abort the whole sweep.
    setSessionDek(await makeDek());
    const result = await reencryptAllRecords();

    expect(result.failed).toBe(1);
    // The healthy row was still encrypted despite the earlier failure.
    expect((await db.sessions.get('good'))?._enc).toBeDefined();
    // The broken row was left as-is (not corrupted further).
    expect((await db.sessions.get('broken'))?._enc).toBeUndefined();
  });

  it('throws a clear error when no session DEK is held', async () => {
    await seedPlaintext();
    setSessionDek(null);
    await expect(reencryptAllRecords()).rejects.toThrow(/DEK|unlocked/i);
    // The plaintext rows are untouched.
    expect((await db.sessions.get('s1'))?._enc).toBeUndefined();
  });

  it('reports progress up to the total row count', async () => {
    await seedPlaintext();
    setSessionDek(await makeDek());
    const events: { done: number; total: number }[] = [];
    await reencryptAllRecords((done, total) => events.push({ done, total }));

    // 3 rows: 1 session + 1 protocol + 1 asset.
    expect(events.at(-1)).toEqual({ done: 3, total: 3 });
    expect(events.every((e) => e.total === 3)).toBe(true);
    expect(events.map((e) => e.done)).toEqual([0, 1, 2, 3]);
  });
});
