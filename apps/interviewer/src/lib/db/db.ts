import Dexie, { type Table } from 'dexie';

import { readLegacyDeviceSettings } from './legacySettings';
import type {
  StoredAssetRow,
  StoredProtocolRow,
  StoredSessionRow,
} from './recordCrypto';
import { DB_NAME } from './storageNames';
import { DEFAULT_SETTINGS, type StoredSettings } from './types';

/**
 * That a schema 8 protocol in Interviewer 8's database was upgraded into this
 * one, under a new hash. Written with the upgraded copy, so the deck can say
 * so and a second upgrade opens the existing copy instead of making another.
 */
export type LegacyUpgradeRecord = {
  /** The hash of the schema 8 protocol in Interviewer 8's database. */
  legacyHash: string;
  /** The hash of the schema 9 copy in this database. */
  upgradedHash: string;
  /**
   * The schema 8 protocol's `importedAt` when the copy was made. Interviewer 8
   * re-imports a file with the same hash in place (new name, description or
   * assets keep the hash) and gives the row a new `importedAt`, so a copy made
   * before that no longer matches its original.
   */
  legacyImportedAt: string;
  /** ISO timestamp, like every other timestamp this app stores. */
  upgradedAt: string;
};

/** Whether `record` was made from the schema 8 protocol as it is now. */
export const isCurrentUpgrade = (
  record: LegacyUpgradeRecord,
  legacy: { hash: string; importedAt: string },
): boolean =>
  record.legacyHash === legacy.hash &&
  record.legacyImportedAt === legacy.importedAt;

/**
 * The stores of `DB_NAME`. Its own database, separate from Interviewer 8's
 * (`interviewer`), and so a fresh `version(1)`: none of Interviewer 8's version
 * history applies to it. The indexes are those Interviewer 8's tables have.
 */
const DB_SCHEMA = {
  protocols: 'id, hash, name, importedAt',
  sessions:
    'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic',
  assets: 'id, protocolHash, assetId',
  settings: 'id',
  legacyUpgrades: 'legacyHash',
} as const;

class InterviewerDB extends Dexie {
  protocols!: Table<StoredProtocolRow, string>;
  sessions!: Table<StoredSessionRow, string>;
  assets!: Table<StoredAssetRow, string>;
  settings!: Table<StoredSettings, 'device'>;
  legacyUpgrades!: Table<LegacyUpgradeRecord, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores(DB_SCHEMA);
  }
}

export const db = new InterviewerDB();

/**
 * The settings-table row recording that this device's vault has been
 * secured. Initial enrolment's re-encryption sweep writes it before it lists
 * the rows to encrypt, and every write that prepared plaintext rows reads it
 * inside the transaction that commits them (`assertPlaintextStillAllowed`).
 * IndexedDB orders the two transactions, so a plaintext write either commits
 * before the sweep lists rows — and is encrypted by it — or sees this row and
 * writes nothing. The vault record cannot serve here: it is in localStorage,
 * which reaches other tabs only some time after it is written.
 */
type SecuredMarker = { id: 'secured'; securedAt: string };

const securedMarkers = () => db.table<SecuredMarker, 'secured'>('settings');

export async function markDatabaseSecured(): Promise<void> {
  await securedMarkers().put({
    id: 'secured',
    securedAt: new Date().toISOString(),
  });
}

/** Inside a transaction, its scope must include `db.settings`. */
export async function isDatabaseSecured(): Promise<boolean> {
  return (await securedMarkers().get('secured')) !== undefined;
}

const withDefaults = (row: StoredSettings): StoredSettings => ({
  ...DEFAULT_SETTINGS,
  ...row,
  id: 'device',
});

/**
 * This device's settings. The first time this database has none, they start
 * from Interviewer 8's (see `legacySettings`) over the defaults.
 */
export async function getSettings(): Promise<StoredSettings> {
  const existing = await db.settings.get('device');
  if (existing) return withDefaults(existing);

  // Read before the write transaction: it is another database, and the await
  // would let this one's transaction commit.
  const initial: StoredSettings = {
    ...DEFAULT_SETTINGS,
    ...(await readLegacyDeviceSettings()),
    id: 'device',
  };
  return db.transaction('rw', db.settings, async () => {
    // Another caller may have written the row meanwhile, perhaps already
    // changed by the user: theirs stands.
    const written = await db.settings.get('device');
    if (written) return withDefaults(written);
    await db.settings.put(initial);
    return initial;
  });
}

export async function updateSettings(
  patch: Partial<Omit<StoredSettings, 'id'>>,
): Promise<StoredSettings> {
  const current = await getSettings();
  const next: StoredSettings = { ...current, ...patch };
  await db.settings.put(next);
  return next;
}
