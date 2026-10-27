import { Dexie, type EntityTable } from 'dexie';

import { databaseExists } from './databaseExists';

// Passes a file from this app to Architect 8 on this origin.
//
// Architect 8 is served at `/v8/` beside this app, as the protocol editor
// alone: every protocol is opened here, and only ever goes one way. When the
// researcher keeps editing a schema 8 file as schema 8, this app stages it
// here, then navigates to `/v8/?import=<key>`. Architect 8 takes the record
// and opens the file through its own normal open path.
//
// SHARED CONTRACT. Architect 8 (on main) declares this database too, and both
// sides must declare exactly the same schema: a mismatch makes Dexie bump the
// database's version on every open, from both sides. The names below are
// pinned by a contract test on each side; change them on both or neither.

export const HANDOFF_DB_NAME = 'ArchitectHandoffDB';

export const HANDOFF_DB_SCHEMA = { handoffs: 'key, createdAt' } as const;

/** How long an untaken record is kept before startup clean-up removes it. */
export const HANDOFF_TTL_MS = 60 * 60 * 1000;

export type HandoffRecord = {
  /** `crypto.randomUUID()`; also what goes in the URL. */
  key: string;
  kind: 'import';
  /**
   * The Architect major that must consume the record. Part of the shared
   * contract; this app only ever stages records for Architect 8.
   */
  targetMajor: 8 | 9;
  fileName: string;
  file: Blob;
  /** Epoch milliseconds. */
  createdAt: number;
};

type HandoffDb = Dexie & {
  handoffs: EntityTable<HandoffRecord, 'key'>;
};

let handoffDb: HandoffDb | null = null;

// Created on first use, not at import: an app that never hands anything off
// should not create the database.
const getHandoffDb = (): HandoffDb => {
  if (!handoffDb) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Dexie's documented TypeScript pattern: the tables are added at runtime by version().stores(), so the instance is typed with them
    const db = new Dexie(HANDOFF_DB_NAME) as HandoffDb;
    db.version(1).stores(HANDOFF_DB_SCHEMA);
    handoffDb = db;
  }
  return handoffDb;
};

/**
 * Stage `file` for another Architect major, returning the key to put in the
 * URL. The caller navigates only after this resolves, so the record is durable
 * before this page goes away.
 */
export const stageHandoff = async ({
  targetMajor,
  file,
  fileName,
}: {
  targetMajor: HandoffRecord['targetMajor'];
  file: Blob;
  fileName: string;
}): Promise<string> => {
  const key = crypto.randomUUID();
  await getHandoffDb().handoffs.add({
    key,
    kind: 'import',
    targetMajor,
    fileName,
    file,
    createdAt: Date.now(),
  });
  return key;
};

/**
 * Withdraw a record this app staged and then did not navigate for (the
 * researcher cancelled). Best left to the startup prune if it fails.
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
  // Nothing to prune — and nothing to create — until some app has staged a
  // record. A browser that cannot list its databases just opens it: both
  // majors declare the same schema, so creating it is harmless.
  if ((await databaseExists(HANDOFF_DB_NAME)) === false) return;
  await getHandoffDb()
    .handoffs.where('createdAt')
    .below(now - HANDOFF_TTL_MS)
    .delete();
};
