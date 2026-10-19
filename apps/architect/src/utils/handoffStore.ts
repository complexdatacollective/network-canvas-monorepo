import Dexie, { type EntityTable } from 'dexie';

// The same-origin hand-off between Architect 8 (served at /v8/) and Architect
// 9 (served at /). A navigation cannot carry a file, so the app handing one
// over stages it here, then navigates to the other app with the record's key
// in the URL; the other app takes the record (reading and deleting it in one
// transaction) and opens the file through its normal open path.
//
// This is a contract shared with Architect 9's copy of this file, on another
// branch: the database name, the store schema and the record fields must stay
// identical on both sides, and `handoffStore.contract.test.ts` pins them.

export const HANDOFF_DB_NAME = 'ArchitectHandoffDB';
export const HANDOFF_DB_VERSION = 1;
export const HANDOFF_STORES = { handoffs: 'key, createdAt' } as const;

/** Records older than this are deleted when either app starts. */
export const HANDOFF_TTL_MS = 60 * 60 * 1000;

/** The major version of the app this build is, as a hand-off target. */
const THIS_ARCHITECT_MAJOR = 8;

export type HandoffTargetMajor = 8 | 9;

export type HandoffRecord = {
  /** `crypto.randomUUID()`. */
  key: string;
  kind: 'import';
  /** The app that must consume it. */
  targetMajor: HandoffTargetMajor;
  fileName: string;
  file: Blob;
  /** Epoch milliseconds. */
  createdAt: number;
};

type HandoffDatabase = Dexie & {
  handoffs: EntityTable<HandoffRecord, 'key'>;
};

// Opened lazily: most sessions never hand anything over, and a startup that
// only prunes should not fail because IndexedDB is unavailable.
let database: HandoffDatabase | null = null;

const getDatabase = (): HandoffDatabase => {
  if (database) return database;
  const db = new Dexie(HANDOFF_DB_NAME) as HandoffDatabase;
  db.version(HANDOFF_DB_VERSION).stores(HANDOFF_STORES);
  database = db;
  return db;
};

/** Stage a file for the app `targetMajor`; resolves with the record's key. */
export const writeHandoff = async ({
  targetMajor,
  fileName,
  file,
  now = Date.now(),
}: {
  targetMajor: HandoffTargetMajor;
  fileName: string;
  file: Blob;
  now?: number;
}): Promise<string> => {
  const key = crypto.randomUUID();
  const record: HandoffRecord = {
    key,
    kind: 'import',
    targetMajor,
    fileName,
    file,
    createdAt: now,
  };
  await getDatabase().handoffs.add(record);
  return key;
};

/**
 * Take the record staged for this app under `key`: read and delete it in one
 * transaction, so a second consumer (a reload, another tab) finds nothing.
 *
 * Resolves `null` when there is no such record, or when it was staged for the
 * other app — that record is left for its owner, and expires with the rest.
 */
export const takeHandoff = async (
  key: string,
  targetMajor: HandoffTargetMajor = THIS_ARCHITECT_MAJOR,
): Promise<HandoffRecord | null> => {
  const db = getDatabase();
  return db.transaction('rw', db.handoffs, async () => {
    const record = await db.handoffs.get(key);
    if (record?.kind !== 'import' || record.targetMajor !== targetMajor) {
      return null;
    }
    await db.handoffs.delete(key);
    return record;
  });
};

/** Delete every record older than the TTL, whichever app it was for. */
export const pruneStaleHandoffs = async (now = Date.now()): Promise<number> =>
  getDatabase()
    .handoffs.where('createdAt')
    .below(now - HANDOFF_TTL_MS)
    .delete();
