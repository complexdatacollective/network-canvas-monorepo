import Dexie, { type Table } from 'dexie';

import type { VersionedProtocol } from '@codaco/protocol-validation';

import type {
  StoredAssetRow,
  StoredProtocolRow,
  StoredSessionRow,
} from './recordCrypto';
import { DEFAULT_SETTINGS, type StoredSettings } from './types';

/**
 * A durable record that a schema migration re-keyed a stored protocol from
 * `previousHash` to `hash`. Written in the same transaction as the re-keying,
 * and deleted only with the protocol the chain of records leads to. The launch
 * sweep follows these records to heal any session a legacy writer (a tab still
 * running the pre-update bundle) wrote back under a superseded hash after the
 * migration ran.
 */
export type StoredProtocolMigrationRecord = {
  previousHash: string;
  hash: string;
  migratedAt: string;
  /**
   * The protocol row the migration replaced, exactly as it was stored
   * (encrypted when the vault is secured), and the schema version it was
   * migrated to. A session written back under `previousHash` holds data in
   * that row's schema, so healing replays the migration's session migrator
   * from it rather than only repointing the session.
   *
   * Absent on records written before sessions were migrated with their
   * protocol (Interviewer 8.3 and earlier). Those migrations repointed every
   * session without changing it, so healing does the same for them.
   */
  source?: {
    row: StoredProtocolRow;
    toVersion: VersionedProtocol['schemaVersion'];
  };
};

class InterviewerV8DB extends Dexie {
  protocols!: Table<StoredProtocolRow, string>;
  sessions!: Table<StoredSessionRow, string>;
  assets!: Table<StoredAssetRow, string>;
  settings!: Table<StoredSettings, 'device'>;
  protocolMigrations!: Table<StoredProtocolMigrationRecord, string>;

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
    // v4 gives every session the two plaintext locale fields. Neither is
    // known for a session started before protocols declared languages, so
    // both start empty and the interview records `locale` when it next runs.
    this.version(4).upgrade((tx) =>
      tx
        .table<StoredSessionRow, string>('sessions')
        .toCollection()
        .modify((session) => {
          session.localePreference = null;
          session.locale = null;
        }),
    );
  }
}

export const db = new InterviewerV8DB();

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
