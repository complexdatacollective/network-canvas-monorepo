import Dexie, { type Table } from 'dexie';

import type {
  StoredAssetRow,
  StoredProtocolRow,
  StoredSessionRow,
} from './recordCrypto';
import { DB_NAME } from './storageNames';
import { DEFAULT_SETTINGS, type StoredSettings } from './types';

/**
 * A row of Interviewer 8's `protocolMigrations` store: its launch migration
 * recorded each protocol it re-keyed there. This app never reads or writes
 * it; the store is kept because Interviewer 8 declares it.
 */
type ProtocolMigrationRow = {
  previousHash: string;
  hash: string;
  migratedAt: string;
};

// THE DATABASE IS SHARED WITH INTERVIEWER 8 (see `storageNames`).
//
// Versions 1 to 3 are Interviewer 8's own declarations, exactly as it makes
// them (native versions 10 to 30), so a device that ran 8.x upgrades in place
// and keeps every row. Interviewer 9 owns everything above them: version 4 is
// its own, with the same stores. Interviewer 8 still declares version 3, and
// Dexie opens a database installed at a higher version at that version
// instead of refusing it, so Interviewer 8 at `/v8/` keeps working on a
// database this app has upgraded (pinned by `db.schema.test.ts`).
//
// Never remove or rename a store or an index below: Interviewer 8 reads and
// writes them. Add new ones in a new version.
const INTERVIEWER_8_SCHEMA_HISTORY = [
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
] as const;

/** Every store and index as of this app's newest version. */
const DB_SCHEMA = {
  protocols: 'id, hash, name, importedAt',
  sessions:
    'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic',
  assets: 'id, protocolHash, assetId',
  settings: 'id',
  protocolMigrations: 'previousHash',
} as const;

/** The first version that is Interviewer 9's rather than Interviewer 8's. */
const FIRST_INTERVIEWER_9_VERSION = INTERVIEWER_8_SCHEMA_HISTORY.length + 1;

class InterviewerDB extends Dexie {
  protocols!: Table<StoredProtocolRow, string>;
  sessions!: Table<StoredSessionRow, string>;
  assets!: Table<StoredAssetRow, string>;
  settings!: Table<StoredSettings, 'device'>;
  protocolMigrations!: Table<ProtocolMigrationRow, string>;

  constructor() {
    super(DB_NAME);
    for (const [index, stores] of INTERVIEWER_8_SCHEMA_HISTORY.entries()) {
      this.version(index + 1).stores(stores);
    }
    this.version(FIRST_INTERVIEWER_9_VERSION).stores(DB_SCHEMA);
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
 * This device's settings. A device updated from 8.x already has this row:
 * Interviewer 8 wrote it, under the same id and field names, so its export,
 * lock and analytics choices carry on. Interviewer 8 at `/v8/` reads the lock
 * rules from this row, by these names; never rename the row or those fields.
 */
export async function getSettings(): Promise<StoredSettings> {
  const existing = await db.settings.get('device');
  if (existing) return withDefaults(existing);
  return db.transaction('rw', db.settings, async () => {
    // Another caller may have written the row meanwhile, perhaps already
    // changed by the user: theirs stands.
    const written = await db.settings.get('device');
    if (written) return withDefaults(written);
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
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
