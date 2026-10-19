import Dexie, { type Table } from 'dexie';

import { IS_SUBPATH_BUILD } from '~/lib/appBase';

import { readInterviewer9SecurityBehaviour } from './interviewer9Settings';
import type {
  StoredAssetRow,
  StoredProtocolRow,
  StoredSessionRow,
} from './recordCrypto';
import {
  DEFAULT_SETTINGS,
  type StoredProtocolMigrationRecord,
  type StoredSettings,
} from './types';

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
  }
}

export const db = new InterviewerV8DB();

async function getOwnSettings(): Promise<StoredSettings> {
  const existing = await db.settings.get('device');
  if (existing) {
    return { ...DEFAULT_SETTINGS, ...existing, id: 'device' };
  }
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

// Interviewer 8 served inside Interviewer 9 (a /v8/ build) shares Interviewer
// 9's lock, so the rules for that lock — idle timeout, and unlocking on enter,
// exit and export — come from Interviewer 9's settings, read-only. This app's
// own row is the fallback for any rule Interviewer 9 has not stored yet. The
// root build only ever reads its own row.
export async function getSettings(): Promise<StoredSettings> {
  const own = await getOwnSettings();
  if (!IS_SUBPATH_BUILD) return own;
  const shared = await readInterviewer9SecurityBehaviour();
  return shared ? { ...own, ...shared } : own;
}

export async function updateSettings(
  patch: Partial<Omit<StoredSettings, 'id'>>,
): Promise<StoredSettings> {
  // From this app's own row, so a write never copies Interviewer 9's rules
  // into it.
  const current = await getOwnSettings();
  const next: StoredSettings = { ...current, ...patch };
  await db.settings.put(next);
  return next;
}
