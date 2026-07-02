import { afterEach, describe, expect, it } from 'vitest';

import type { NcNetwork } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { clearVault, writeVault } from '../../vault/vaultStore';
import {
  decryptAsset,
  decryptProtocol,
  decryptSession,
  encryptAsset,
  encryptProtocol,
  encryptSession,
} from '../recordCrypto';
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

const session: StoredSession = {
  id: 's1',
  protocolHash: 'h1',
  protocolName: 'Study',
  caseId: 'case-1',
  startedAt: '2026-01-01T00:00:00.000Z',
  lastUpdatedAt: '2026-01-02T00:00:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 3,
  progress: 40,
  network,
  stageMetadata: { '0': { visited: true } },
  isSynthetic: false,
};

const protocol: StoredProtocol = {
  id: 'h1',
  hash: 'h1',
  name: 'Study',
  schemaVersion: 8,
  importedAt: '2026-01-01T00:00:00.000Z',
  description: 'A study',
  codebook: { node: {}, edge: {}, ego: {} },
  // Minimal but structurally valid CurrentProtocol shape for a round-trip.
  protocol: {
    name: 'Study',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
  } as StoredProtocol['protocol'],
};

const blobAsset: StoredAsset = {
  id: 'h1::img-1',
  protocolHash: 'h1',
  assetId: 'img-1',
  name: 'Photo',
  type: 'image',
  data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }),
};

const stringAsset: StoredAsset = {
  id: 'h1::key-1',
  protocolHash: 'h1',
  assetId: 'key-1',
  name: 'Key',
  type: 'apikey',
  data: 'secret-token',
};

describe('recordCrypto — encrypted mode', () => {
  afterEach(() => setSessionDek(null));

  it('round-trips a session and stores no plaintext network/stageMetadata', async () => {
    setSessionDek(await makeDek());
    const row = await encryptSession(session);
    expect(row.network).toBeUndefined();
    expect(row.stageMetadata).toBeUndefined();
    expect(row._enc?.network).toBeDefined();
    expect(row._enc?.stageMetadata).toBeDefined();
    // Index fields remain plaintext.
    expect(row.id).toBe('s1');
    expect(row.caseId).toBe('case-1');
    expect(row.currentStep).toBe(3);
    expect(row.progress).toBe(40);
    expect(row.isSynthetic).toBe(false);

    const back = await decryptSession(row);
    expect(back).toEqual(session);
  });

  it('omits _enc.stageMetadata when the session has none', async () => {
    setSessionDek(await makeDek());
    const row = await encryptSession({ ...session, stageMetadata: undefined });
    expect(row._enc?.stageMetadata).toBeUndefined();
    const back = await decryptSession(row);
    expect(back.stageMetadata).toBeUndefined();
  });

  it('round-trips a protocol and stores no plaintext protocol/codebook', async () => {
    setSessionDek(await makeDek());
    const row = await encryptProtocol(protocol);
    expect(row.protocol).toBeUndefined();
    expect(row.codebook).toBeUndefined();
    expect(row._enc?.protocol).toBeDefined();
    expect(row._enc?.codebook).toBeDefined();
    expect(row.hash).toBe('h1');
    expect(row.name).toBe('Study');

    const back = await decryptProtocol(row);
    expect(back).toEqual(protocol);
  });

  it('round-trips a blob asset and stores no plaintext data', async () => {
    setSessionDek(await makeDek());
    const row = await encryptAsset(blobAsset);
    expect(row.data).toBeUndefined();
    expect(row._enc?.data).toBeDefined();

    const back = await decryptAsset(row);
    expect(back.data).toBeInstanceOf(Blob);
    const bytes = new Uint8Array(await (back.data as Blob).arrayBuffer());
    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect((back.data as Blob).type).toBe('image/png');
  });

  it('round-trips a string asset', async () => {
    setSessionDek(await makeDek());
    const row = await encryptAsset(stringAsset);
    expect(row.data).toBeUndefined();
    const back = await decryptAsset(row);
    expect(back.data).toBe('secret-token');
  });

  it('rejects decryption with a different key', async () => {
    setSessionDek(await makeDek());
    const row = await encryptSession(session);
    setSessionDek(await makeDek());
    await expect(decryptSession(row)).rejects.toThrow();
  });

  it('rejects decryption when the key is absent', async () => {
    setSessionDek(await makeDek());
    const row = await encryptSession(session);
    setSessionDek(null);
    await expect(decryptSession(row)).rejects.toThrow(/locked|key/i);
  });
});

describe('recordCrypto — none mode (passthrough)', () => {
  afterEach(() => {
    setSessionDek(null);
    clearVault();
  });

  it('stores plaintext session with no _enc when no vault record exists', async () => {
    setSessionDek(null);
    const row = await encryptSession(session);
    expect(row._enc).toBeUndefined();
    expect(row.network).toEqual(network);
    expect(row.stageMetadata).toEqual(session.stageMetadata);
    const back = await decryptSession(row);
    expect(back).toEqual(session);
  });

  it('stores plaintext session with no _enc under an explicit mode:none vault', async () => {
    writeVault({ version: 4, mode: 'none' });
    setSessionDek(null);
    const row = await encryptSession(session);
    expect(row._enc).toBeUndefined();
    expect(row.network).toEqual(network);
    expect(row.stageMetadata).toEqual(session.stageMetadata);
    const back = await decryptSession(row);
    expect(back).toEqual(session);
  });

  it('stores plaintext protocol with no _enc', async () => {
    writeVault({ version: 4, mode: 'none' });
    setSessionDek(null);
    const row = await encryptProtocol(protocol);
    expect(row._enc).toBeUndefined();
    expect(row.protocol).toEqual(protocol.protocol);
    const back = await decryptProtocol(row);
    expect(back).toEqual(protocol);
  });

  it('stores plaintext asset data with no _enc', async () => {
    writeVault({ version: 4, mode: 'none' });
    setSessionDek(null);
    const row = await encryptAsset(blobAsset);
    expect(row._enc).toBeUndefined();
    expect(row.data).toBe(blobAsset.data);
    const back = await decryptAsset(row);
    expect(back.data).toBe(blobAsset.data);
  });
});

describe('recordCrypto — locked secured vault (fail closed)', () => {
  afterEach(() => {
    setSessionDek(null);
    clearVault();
  });

  it('rejects encryptSession when a pin vault is locked (no DEK)', async () => {
    writeVault({
      version: 4,
      mode: 'pin',
      kdfSaltB64: 'c2FsdA==',
      kdfIterations: 600_000,
      wrappedDekB64: 'd3JhcHBlZA==',
    });
    setSessionDek(null);
    await expect(encryptSession(session)).rejects.toThrow(/locked|key/i);
  });

  it('rejects encryptProtocol when a pin vault is locked (no DEK)', async () => {
    writeVault({
      version: 4,
      mode: 'pin',
      kdfSaltB64: 'c2FsdA==',
      kdfIterations: 600_000,
      wrappedDekB64: 'd3JhcHBlZA==',
    });
    setSessionDek(null);
    await expect(encryptProtocol(protocol)).rejects.toThrow(/locked|key/i);
  });

  it('rejects encryptAsset when a pin vault is locked (no DEK)', async () => {
    writeVault({
      version: 4,
      mode: 'pin',
      kdfSaltB64: 'c2FsdA==',
      kdfIterations: 600_000,
      wrappedDekB64: 'd3JhcHBlZA==',
    });
    setSessionDek(null);
    await expect(encryptAsset(blobAsset)).rejects.toThrow(/locked|key/i);
  });
});
