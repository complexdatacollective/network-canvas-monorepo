import Dexie, { type Table } from 'dexie';

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
  /** ISO timestamp, like every other timestamp this app stores. */
  upgradedAt: string;
};

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

export async function getSettings(): Promise<StoredSettings> {
  const existing = await db.settings.get('device');
  if (existing) {
    return { ...DEFAULT_SETTINGS, ...existing, id: 'device' };
  }
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function updateSettings(
  patch: Partial<Omit<StoredSettings, 'id'>>,
): Promise<StoredSettings> {
  const current = await getSettings();
  const next: StoredSettings = { ...current, ...patch };
  await db.settings.put(next);
  return next;
}
