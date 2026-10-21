import Dexie, { type Table } from 'dexie';

import { IS_SUBPATH_BUILD } from '~/lib/appBase';
import { OPENED_INTERVIEW_SESSION_ID } from '~/lib/openedInterview';

import type {
  StoredAssetRow,
  StoredProtocolRow,
  StoredSessionRow,
} from './recordCrypto';
import { sessionRowWriteScope } from './sessionRowWriteScope';
import {
  DEFAULT_SETTINGS,
  type StoredProtocolMigrationRecord,
  type StoredSettings,
} from './types';

export const DB_NAME = 'interviewer';

// Interviewer 8 inside Interviewer 9 (a /v8/ build) opens this same database,
// which Interviewer 9 owns from then on: it declares versions above these, with
// more tables and indexes but never fewer, and runs every upgrade. Dexie opens
// a database installed at a higher version than declared here at that version
// (it retries the open without one on a VersionError), and this app only uses
// the tables and indexes below, so these declarations keep working there and
// never upgrade anything. Standalone Interviewer 8 still upgrades through them.
class InterviewerV8DB extends Dexie {
  protocols!: Table<StoredProtocolRow, string>;
  sessions!: Table<StoredSessionRow, string>;
  assets!: Table<StoredAssetRow, string>;
  settings!: Table<StoredSettings, 'device'>;
  protocolMigrations!: Table<StoredProtocolMigrationRecord, string>;

  constructor() {
    super(DB_NAME);
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

// In a /v8/ build the only row this app may write is the session of the
// interview the page was opened for (see sessionRowWriteScope).
if (IS_SUBPATH_BUILD) db.use(sessionRowWriteScope(OPENED_INTERVIEW_SESSION_ID));

// This app's own settings, for the root build. A /v8/ build reads Interviewer
// 9's instead and never writes any (interviewer9Settings.ts, api.ts).
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
