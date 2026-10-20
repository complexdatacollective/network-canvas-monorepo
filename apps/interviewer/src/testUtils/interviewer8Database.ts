import Dexie from 'dexie';

import type {
  StoredAssetRow,
  StoredProtocolRow,
  StoredSessionRow,
} from '~/lib/db/recordCrypto';
import { DB_NAME } from '~/lib/db/storageNames';
import { fromBase64 } from '~/lib/vault/crypto';

// The shared database (`interviewer`) as Interviewer 8 sees it. Frozen copies
// of Interviewer 8's released declarations (v1 a4b08d828, v2 04b74a6fc, v3 on
// main) and of its record decoders (main's `lib/db/recordCrypto.ts`), kept
// independent of this app's own: tests seed an 8.x device through them, and
// read back what this app wrote the way Interviewer 8 will. Never update them
// to track this app's db.ts or codec.

const INTERVIEWER_8_SCHEMA_HISTORY: Record<string, string>[] = [
  {
    protocols: 'id, hash, name, importedAt',
    sessions:
      'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt',
    assets: 'id, protocolHash, assetId',
    settings: 'id',
  },
  {
    sessions:
      'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic',
  },
  { protocolMigrations: 'previousHash' },
];

/**
 * A connection the way Interviewer 8's `InterviewerV8DB` makes it: the same
 * name, declaring its own versions 1 to 3 and nothing of this app's.
 */
export function openAsInterviewer8(): Dexie {
  const connection = new Dexie(DB_NAME);
  for (const [index, stores] of INTERVIEWER_8_SCHEMA_HISTORY.entries()) {
    connection.version(index + 1).stores(stores);
  }
  return connection;
}

type Interviewer8Seed = {
  protocols?: unknown[];
  sessions?: unknown[];
  assets?: unknown[];
  settings?: unknown[];
};

/**
 * Create the database as an 8.x device has it (native version 30) and fill
 * it, as Interviewer 8 would have before this app ever ran.
 */
export async function seedAsInterviewer8(
  seed: Interviewer8Seed,
): Promise<void> {
  const connection = openAsInterviewer8();
  await connection.open();
  try {
    await connection.table('protocols').bulkPut(seed.protocols ?? []);
    await connection.table('sessions').bulkPut(seed.sessions ?? []);
    await connection.table('assets').bulkPut(seed.assets ?? []);
    await connection.table('settings').bulkPut(seed.settings ?? []);
  } finally {
    connection.close();
  }
}

/** Every row of `table`, read raw, with no schema or codec of this app's. */
export async function readRawRows(table: string): Promise<unknown[]> {
  const idb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const request = idb
        .transaction(table, 'readonly')
        .objectStore(table)
        .getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    idb.close();
  }
}

// ---------------------------------------------------------------------------
// Interviewer 8's record decoders, frozen: AES-GCM, base64 iv and ciphertext,
// additional data `sessions:<id>`, `protocols:<hash>` and `assets:<row id>`,
// JSON plaintext for record fields, raw bytes (with `kind` and `mime`) for
// asset data. Written out here from main's codec rather than borrowed from
// this app's, so a change to this app's format fails these tests. They do
// not run main's zod parses, which check the values, not the format.
// ---------------------------------------------------------------------------

type EncryptedField = { iv: string; ct: string };
type EncryptedAsset = EncryptedField & {
  kind: 'string' | 'blob';
  mime?: string;
};
type Row = Record<string, unknown>;

const decryptBytes = async (
  field: EncryptedField,
  key: CryptoKey,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(field.iv),
        additionalData: new TextEncoder().encode(aad),
      },
      key,
      fromBase64(field.ct),
    ),
  );

const decryptField = async (
  field: EncryptedField,
  key: CryptoKey,
  aad: string,
): Promise<unknown> =>
  JSON.parse(new TextDecoder().decode(await decryptBytes(field, key, aad)));

const encOf = (row: Row): Record<string, EncryptedField> | undefined =>
  row._enc as Record<string, EncryptedField> | undefined;

/** Main's `decryptSession`, minus its zod parses. */
export async function interviewer8DecryptSession(
  row: Row,
  key: CryptoKey,
): Promise<Row> {
  const { _enc: _ignored, ...rest } = row;
  const enc = encOf(row);
  if (!enc) return rest;
  if (!enc.network) throw new Error('No encrypted network');
  // Main reads exactly these two fields; anything else in `_enc` is lost.
  const aad = `sessions:${String(row.id)}`;
  return {
    ...rest,
    network: await decryptField(enc.network, key, aad),
    stageMetadata: enc.stageMetadata
      ? await decryptField(enc.stageMetadata, key, aad)
      : undefined,
  };
}

/** Main's `decryptProtocol`. */
export async function interviewer8DecryptProtocol(
  row: Row,
  key: CryptoKey,
): Promise<Row> {
  const { _enc: _ignored, ...rest } = row;
  const enc = encOf(row);
  if (!enc) return rest;
  if (!enc.protocol || !enc.codebook) throw new Error('No encrypted document');
  const aad = `protocols:${String(row.hash)}`;
  return {
    ...rest,
    protocol: await decryptField(enc.protocol, key, aad),
    codebook: await decryptField(enc.codebook, key, aad),
  };
}

/** Main's `decryptAsset`: a string, or a Blob of the recorded type. */
export async function interviewer8DecryptAsset(
  row: Row,
  key: CryptoKey,
): Promise<Row> {
  const { _enc: _ignored, ...rest } = row;
  const enc = row._enc as { data?: EncryptedAsset } | undefined;
  if (!enc) return rest;
  if (!enc.data) throw new Error('No encrypted data');
  const bytes = await decryptBytes(enc.data, key, `assets:${String(row.id)}`);
  return {
    ...rest,
    data:
      enc.data.kind === 'string'
        ? new TextDecoder().decode(bytes)
        : new Blob([bytes], { type: enc.data.mime ?? '' }),
  };
}

/**
 * Everything in a database, through the raw IndexedDB API (no Dexie, so no
 * middleware or schema of this app's is involved): its native version, stores
 * with their key paths and indexes, and every row. Two equal fingerprints mean
 * nothing was created, upgraded or written. `undefined` when the database does
 * not exist, checked without creating it.
 */
export async function fingerprintDatabase(
  name: string,
): Promise<string | undefined> {
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === name)) return undefined;
  const idb = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const storeNames = Array.from(idb.objectStoreNames).toSorted();
    const stores: Record<string, unknown> = {};
    for (const storeName of storeNames) {
      const store = idb
        .transaction(storeName, 'readonly')
        .objectStore(storeName);
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });
      stores[storeName] = {
        keyPath: store.keyPath,
        indexes: Array.from(store.indexNames).toSorted(),
        rows,
      };
    }
    return JSON.stringify({ version: idb.version, stores });
  } finally {
    idb.close();
  }
}

// ---------------------------------------------------------------------------
// Frozen ciphertext, encrypted ONCE with the persisted format the released
// app writes (AES-GCM-256, 12-byte IV, additionalData "<table>:<row id or
// hash>", base64 iv/ct, JSON plaintext) under the fixed key below. Moved here
// from the former in-place upgrade test: a device's Interviewer 8 rows look
// exactly like this, and this app must still decrypt them with the shared key.
// Never regenerate these to make a failure pass.
// ---------------------------------------------------------------------------
const FROZEN_DEK_B64 = 'AAcOFRwjKjE4P0ZNVFtiaXB3foWMk5qhqK+2vcTL0tk=';

export function importFrozenDek(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    fromBase64(FROZEN_DEK_B64),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}

export const FROZEN_PROTOCOL_PLAINTEXT = {
  schemaVersion: 8,
  codebook: {
    node: {
      person: { name: 'Person', color: 'node-color-seq-1', variables: {} },
    },
    edge: {},
    ego: {},
  },
  stages: [],
};

export const FROZEN_ROWS: {
  protocol: StoredProtocolRow;
  session: StoredSessionRow;
  apiKeyAsset: StoredAssetRow;
  imageAsset: StoredAssetRow;
} = {
  protocol: {
    id: 'frozen-hash',
    hash: 'frozen-hash',
    name: 'Frozen Study',
    schemaVersion: 8,
    importedAt: '2026-01-01T00:00:00.000Z',
    _enc: {
      protocol: {
        iv: 'AQEBAQEBAQEBAQEB',
        ct: 'D0VMJDJa95FaLwb9noMTZBezNpPpwwIUpTnr6F9bpsCqcjsaVs4KhFv9tXCVoyjQYs5PtJFhTNzm+8lKSxaoe6+9POH4/aIpePF24DFM5tx+bJMXcIqr4ol13RaXjI5NrXfDMbw19TGZ9Rl7grk8xUXJ2rCE1YsTXK2wXIwrZ/vI+ulKS9+8T7DkT0uePoe4PvFXjr6HzcoW1aOrWQ==',
      },
      codebook: {
        iv: 'AgICAgICAgICAgIC',
        ct: 'aWG29fp6x8c2G5s2xBNHR4RSEhUWip+hNJzOAvkQfFCBLHHOw5nHWUyraI8a8UMHL5u8h4MrfjPu+aO6MR6vbPTQipOk73VLr0E8Xo914n86tcHXK4MQ66rUUoi9cXs6eK6mWn3M/T2O3slbU2GdbjMk',
      },
    },
  },
  session: {
    id: 'frozen-session',
    protocolHash: 'frozen-hash',
    protocolName: 'Frozen Study',
    caseId: 'frozen-case',
    startedAt: '2026-01-05T10:00:00.000Z',
    lastUpdatedAt: '2026-01-05T10:30:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 1,
    _enc: {
      network: {
        iv: 'AwMDAwMDAwMDAwMD',
        ct: '1NDlJ1geOJIzVv0olpvyxEZ+AO3reu2XzpdLAN3JYzXaYnCT8v7CuA1DRlzBD2gdDd5vbdUZlmosUWVLTBocGEezgu2LS0rJLCBLRghx50lVv0WX6aEEZMB4P2iLe/4Jt9/O+0aCTHMgxX51h2TuBE3bdOPpW7cDEDBWF+2o72ePIOG4Pf2G1BeIdtsNRah+UYSMbDulpD2rDnZQBtO/nbtoBA==',
      },
      stageMetadata: {
        iv: 'BAQEBAQEBAQEBAQE',
        ct: 'eAqlD/+UmPCZb/aAR10ccwk1rrz2ce8h95i+zfovJ7Qw11KCscT4czZ9ebUE7Q==',
      },
    },
  },
  apiKeyAsset: {
    id: 'frozen-hash::frozen-key',
    protocolHash: 'frozen-hash',
    assetId: 'frozen-key',
    name: 'Map key',
    type: 'apikey',
    _enc: {
      data: {
        kind: 'string',
        iv: 'BQUFBQUFBQUFBQUF',
        ct: 'xdoX1MxNy0vAKbYvIaSezL+TJ9a44dWVm3HBuss=',
      },
    },
  },
  imageAsset: {
    id: 'frozen-hash::frozen-image',
    protocolHash: 'frozen-hash',
    assetId: 'frozen-image',
    name: 'Background',
    type: 'image',
    _enc: {
      data: {
        kind: 'blob',
        mime: 'image/png',
        iv: 'BgYGBgYGBgYGBgYG',
        ct: 'NopaNyGSqNEolH4yRg0DWFlg1EEpvg==',
      },
    },
  },
};
