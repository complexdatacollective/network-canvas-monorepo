import Dexie, { type Table } from 'dexie';

import type {
  StoredAssetRow,
  StoredProtocolRow,
  StoredSessionRow,
} from './recordCrypto';
import { DEFAULT_SETTINGS, type StoredSettings } from './types';

class InterviewerV8DB extends Dexie {
  protocols!: Table<StoredProtocolRow, string>;
  sessions!: Table<StoredSessionRow, string>;
  assets!: Table<StoredAssetRow, string>;
  settings!: Table<StoredSettings, 'device'>;

  constructor() {
    super('interviewer');
    this.version(1).stores({
      protocols: 'id, hash, name, importedAt',
      sessions:
        'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt',
      assets: 'id, protocolHash, assetId',
      settings: 'id',
    });
    // v2 adds the isSynthetic index so synthetic-data count/bulk-delete can
    // hit the index instead of scanning. Existing rows have no value for the
    // field; Dexie treats them as undefined which sorts/filters as non-true.
    this.version(2).stores({
      sessions:
        'id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt, isSynthetic',
    });
    // v3 adds the durable record of every schema-migration re-keying
    // (previous hash → new hash). The launch sweep uses it to heal sessions a
    // legacy writer — a tab still running the pre-update bundle, whose
    // updateSession predates the commit-time hash guard — pointed back at a
    // superseded hash after the migration ran.
    this.version(3).stores({
      protocolMigrations: 'previousHash',
    });
  }
}

export const db = new InterviewerV8DB();

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
