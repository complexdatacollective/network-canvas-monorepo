import Dexie from 'dexie';

import {
  encryptAssetData,
  encryptJson,
  type EncryptedAssetData,
  type EncryptedField,
} from '../vault/crypto';
import { databaseExists } from './databaseExists';
import { closeLegacyLibrary } from './legacyLibrary';
import { getSessionDek } from './sessionKey';
import { LEGACY_LIBRARIES } from './storageNames';

// THE ONLY MODULE IN INTERVIEWER 9 THAT WRITES INTERVIEWER 8'S DATABASE.
//
// Both apps share one lock (one vault record, one key), and Interviewer 9 is
// the only place it is set up, changed or reset. So the lock's two
// destructive moments reach Interviewer 8's database too, and nothing else
// ever does:
//
// 1. When a lock is first set up, Interviewer 8's plaintext rows (written
//    while the device had no lock) are encrypted under the new key, exactly as
//    Interviewer 8's own `recordCrypto.ts` on main encrypts them: the same
//    fields and the same additional data. They are written out here, not
//    borrowed from this app's codec, because Interviewer 8's format is frozen
//    while this app's may change; a fixture made by main's codec pins it.
// 2. When the lock is revoked (device reset, recovery by resetting, a mode
//    switch), Interviewer 8's database is deleted with this app's, so a reset
//    really clears the device.
//
// Everything else reads that database through `legacyLibrary`.

/** Interviewer 8's encrypted session fields, AAD `sessions:${id}`. */
const sessionAad = (id: string) => `sessions:${id}`;
/** Interviewer 8's encrypted protocol fields, AAD `protocols:${hash}`. */
const protocolAad = (hash: string) => `protocols:${hash}`;
/** Interviewer 8's encrypted asset data, AAD `assets:${id}`. */
const assetAad = (id: string) => `assets:${id}`;

type Row = Record<string, unknown>;

const isObject = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null;

/** A row Interviewer 8 wrote while the device had no lock. */
const isPlaintextRow = (value: unknown): value is Row =>
  isObject(value) && value._enc === undefined;

type SessionEnc = { network: EncryptedField; stageMetadata?: EncryptedField };
type ProtocolEnc = { protocol: EncryptedField; codebook: EncryptedField };
type AssetEnc = { data: EncryptedAssetData };

/** Main's `encryptSession`: `network` and, when present, `stageMetadata`. */
export async function encryptLegacySessionRow(
  row: Row,
  dek: CryptoKey,
): Promise<Row & { _enc: SessionEnc }> {
  const { network, stageMetadata, ...rest } = row;
  if (typeof rest.id !== 'string' || network === undefined) {
    throw new Error('Not an Interviewer 8 session row');
  }
  const aad = sessionAad(rest.id);
  const _enc: SessionEnc = { network: await encryptJson(network, dek, aad) };
  if (stageMetadata !== undefined) {
    _enc.stageMetadata = await encryptJson(stageMetadata, dek, aad);
  }
  return { ...rest, _enc };
}

/** Main's `encryptProtocol`: `protocol` and `codebook`, bound to the hash. */
export async function encryptLegacyProtocolRow(
  row: Row,
  dek: CryptoKey,
): Promise<Row & { _enc: ProtocolEnc }> {
  const { protocol, codebook, ...rest } = row;
  if (
    typeof rest.hash !== 'string' ||
    protocol === undefined ||
    codebook === undefined
  ) {
    throw new Error('Not an Interviewer 8 protocol row');
  }
  const aad = protocolAad(rest.hash);
  return {
    ...rest,
    _enc: {
      protocol: await encryptJson(protocol, dek, aad),
      codebook: await encryptJson(codebook, dek, aad),
    },
  };
}

/** Main's `encryptAsset`: `data`, a string or a Blob, bound to the row id. */
export async function encryptLegacyAssetRow(
  row: Row,
  dek: CryptoKey,
): Promise<Row & { _enc: AssetEnc }> {
  const { data, ...rest } = row;
  if (
    typeof rest.id !== 'string' ||
    (typeof data !== 'string' && !(data instanceof Blob))
  ) {
    throw new Error('Not an Interviewer 8 asset row');
  }
  return {
    ...rest,
    _enc: { data: await encryptAssetData(data, dek, assetAad(rest.id)) },
  };
}

type TableSweep = {
  table: 'sessions' | 'protocols' | 'assets';
  encrypt: (row: Row, dek: CryptoKey) => Promise<Row>;
  /**
   * The fields that say a row is still the one that was encrypted. Interviewer
   * 8 rewrites a row with a fresh value in one of these whenever it changes it.
   */
  sameRow: (a: Row, b: Row) => boolean;
};

const SWEEPS: TableSweep[] = [
  {
    table: 'sessions',
    encrypt: encryptLegacySessionRow,
    sameRow: (a, b) => a.lastUpdatedAt === b.lastUpdatedAt,
  },
  {
    table: 'protocols',
    encrypt: encryptLegacyProtocolRow,
    sameRow: (a, b) => a.hash === b.hash && a.importedAt === b.importedAt,
  },
  {
    table: 'assets',
    encrypt: encryptLegacyAssetRow,
    sameRow: (a, b) => a.protocolHash === b.protocolHash && a.name === b.name,
  },
];

/** Same meaning as `reencryptAllRecords`' result: `failed > 0` means retry. */
export type LegacyEncryptionResult = { total: number; failed: number };

/** A write connection to `dbName`, or null when there is no such database. */
const openForMaintenance = async (dbName: string): Promise<Dexie | null> => {
  const exists = await databaseExists(dbName);
  if (exists === false) return null;
  // No version(): the installed schema is used as it is and never upgraded.
  const connection = new Dexie(dbName, { addons: [], autoOpen: false });
  try {
    await connection.open();
  } catch (error) {
    // A browser that cannot list its databases learns only now that there is
    // none. Dexie has already removed the empty one its open created.
    if (exists === undefined && error instanceof Dexie.NoSuchDatabaseError) {
      return null;
    }
    throw error;
  }
  return connection;
};

const sweepTable = async (
  connection: Dexie,
  { table, encrypt, sameRow }: TableSweep,
  dek: CryptoKey,
): Promise<LegacyEncryptionResult> => {
  if (!connection.tables.some(({ name }) => name === table)) {
    return { total: 0, failed: 0 };
  }
  const keys = await connection.table(table).toCollection().primaryKeys();
  let total = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      const row: unknown = await connection.table(table).get(key);
      if (!isPlaintextRow(row)) continue;
      total += 1;
      // Encrypted outside the transaction: crypto awaits would let it commit.
      const encrypted = await encrypt(row, dek);
      const committed = await connection.transaction('rw', table, async () => {
        const latest: unknown = await connection.table(table).get(key);
        // Deleted, or encrypted by someone else, meanwhile: nothing to do.
        if (!isPlaintextRow(latest)) return true;
        // Changed by Interviewer 8 meanwhile: leave it for the retry.
        if (!sameRow(latest, row)) return false;
        await connection.table(table).put(encrypted);
        return true;
      });
      if (!committed) failed += 1;
    } catch (error) {
      failed += 1;
      // oxlint-disable-next-line no-console -- the only diagnostic for a row of Interviewer 8's database left plaintext; the pending flag retries it
      console.error(
        `Encrypting an Interviewer 8 ${table} row failed; skipping it`,
        error,
      );
    }
  }
  return { total, failed };
};

/**
 * Encrypt every plaintext row of Interviewer 8's database under the held key.
 * Run with the first-enrolment sweep, and again on unlock while the pending
 * flag is set. Rows already encrypted are left exactly as they are, so this
 * can be repeated until it reports no failures.
 */
export async function encryptLegacyDatabases(): Promise<LegacyEncryptionResult> {
  const dek = getSessionDek();
  if (!dek) {
    throw new Error(
      'encryptLegacyDatabases requires an unlocked session key (call it after enrolment sets the key)',
    );
  }
  let total = 0;
  let failed = 0;
  for (const { dbName } of LEGACY_LIBRARIES) {
    const connection = await openForMaintenance(dbName);
    if (!connection) continue;
    try {
      for (const sweep of SWEEPS) {
        const result = await sweepTable(connection, sweep, dek);
        total += result.total;
        failed += result.failed;
      }
    } finally {
      connection.close();
    }
  }
  return { total, failed };
}

/**
 * Delete Interviewer 8's database. Run with every revoke of the shared lock.
 * Deleting a database that does not exist creates nothing.
 */
export async function deleteLegacyDatabases(): Promise<void> {
  // This app's own read connection would hold up the delete until Dexie
  // noticed; let it go first.
  closeLegacyLibrary();
  for (const { dbName } of LEGACY_LIBRARIES) {
    await Dexie.delete(dbName);
  }
}
