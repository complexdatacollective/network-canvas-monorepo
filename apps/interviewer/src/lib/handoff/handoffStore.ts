import Dexie, { type EntityTable } from 'dexie';

import { databaseExists } from '../db/databaseExists';

// Passes a `.netcanvas` file between Interviewer majors on this origin.
//
// Interviewer 8 is served at `/v8/` beside this app. When a file has to be
// imported by the other app (a schema 8 file the researcher keeps on schema 8,
// or a file an Interviewer 8 window was launched with or could not read), the
// writer stages it here, then navigates to the other app with the record's key
// in the URL (`/v8/?import=<key>` or `/?import=<key>`). The other app takes
// the record and imports the file through its own normal import.
//
// Only protocol files travel this way: never interview data, and never the
// lock's keys, which stay in each page's memory.
//
// SHARED CONTRACT. Interviewer 8 (on main) declares this database too, and
// both sides must declare exactly the same schema: a mismatch makes Dexie bump
// the database's version on every open, from both sides. The literals below
// are pinned by a contract test on each side; change them on both or neither.

export const HANDOFF_DB_NAME = 'InterviewerHandoffDB';

export const HANDOFF_DB_VERSION = 1;

export const HANDOFF_DB_SCHEMA = { handoffs: 'key, createdAt' } as const;

/** How long an untaken record is kept before startup clean-up removes it. */
export const HANDOFF_TTL_MS = 60 * 60 * 1000;

export type HandoffTargetMajor = 8 | 9;

export type HandoffRecord = {
  /** `crypto.randomUUID()`; also what goes in the URL. */
  key: string;
  kind: 'import';
  /** The Interviewer major that must consume the record. */
  targetMajor: HandoffTargetMajor;
  fileName: string;
  /** A `.netcanvas` file. */
  file: Blob;
  /** Epoch milliseconds. */
  createdAt: number;
};

/** The major this app is, so the one it may take records for. */
const OWN_MAJOR: HandoffTargetMajor = 9;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` has the shape of a hand-off key. */
export const isHandoffKey = (value: string): boolean =>
  UUID_PATTERN.test(value);

type HandoffDb = Dexie & {
  handoffs: EntityTable<HandoffRecord, 'key'>;
};

let handoffDb: HandoffDb | null = null;

// Created on first use, not at import: an app that never hands anything off
// should not create the database.
const getHandoffDb = (): HandoffDb => {
  if (!handoffDb) {
    const db = new Dexie(HANDOFF_DB_NAME) as HandoffDb;
    db.version(HANDOFF_DB_VERSION).stores(HANDOFF_DB_SCHEMA);
    handoffDb = db;
  }
  return handoffDb;
};

/**
 * Stage `file` for another Interviewer major, returning the key to put in the
 * URL. The caller navigates only after this resolves, so the record is durable
 * before this page goes away.
 */
export const stageHandoff = async ({
  targetMajor,
  file,
  fileName,
  now = Date.now(),
}: {
  targetMajor: HandoffTargetMajor;
  file: Blob;
  fileName: string;
  now?: number;
}): Promise<string> => {
  const key = crypto.randomUUID();
  await getHandoffDb().handoffs.add({
    key,
    kind: 'import',
    targetMajor,
    fileName,
    file,
    createdAt: now,
  });
  return key;
};

/**
 * Take the record staged for this app under `key`: read it and delete it in
 * one transaction, so it is consumed exactly once even if two tabs race for
 * it. A record meant for the other major is left for its owner (it expires
 * with the rest); one past its time is deleted and not taken.
 */
export const takeHandoff = async (
  key: string,
  now: number = Date.now(),
): Promise<HandoffRecord | undefined> => {
  if (!isHandoffKey(key)) return undefined;
  // Nothing has ever been staged: do not create the database to find that out.
  if ((await databaseExists(HANDOFF_DB_NAME)) === false) return undefined;
  const db = getHandoffDb();
  return db.transaction('rw', db.handoffs, async () => {
    const record = await db.handoffs.get(key);
    if (record?.kind !== 'import' || record.targetMajor !== OWN_MAJOR) {
      return undefined;
    }
    await db.handoffs.delete(key);
    if (now - record.createdAt > HANDOFF_TTL_MS) return undefined;
    return record;
  });
};

/**
 * Withdraw a record this app staged and then did not navigate for. Best left
 * to the startup prune if it fails.
 */
export const discardHandoff = async (key: string): Promise<void> => {
  await getHandoffDb().handoffs.delete(key);
};

/**
 * Remove records older than `HANDOFF_TTL_MS`, for either major. Run at startup:
 * a record is only ever left behind when the navigation that should have
 * consumed it never happened.
 */
export const pruneExpiredHandoffs = async (
  now: number = Date.now(),
): Promise<void> => {
  // Nothing to prune, and nothing to create, until some app has staged a
  // record. A browser that cannot list its databases just opens it: both
  // majors declare the same schema, so creating it is harmless.
  if ((await databaseExists(HANDOFF_DB_NAME)) === false) return;
  await getHandoffDb()
    .handoffs.where('createdAt')
    .below(now - HANDOFF_TTL_MS)
    .delete();
};
