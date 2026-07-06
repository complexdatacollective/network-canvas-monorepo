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
