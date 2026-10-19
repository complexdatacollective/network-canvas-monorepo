import Dexie, { type DBCore, type Middleware } from 'dexie';

import { databaseExists } from './databaseExists';
import type { IdleTimeoutMinutes, StoredSettings } from './types';

// Interviewer 8 served inside Interviewer 9's deploy (a /v8/ build) shares one
// lock with Interviewer 9, and one set of rules for it: how long the app may
// sit idle before it locks, and whether entering an interview, leaving one or
// exporting asks for the lock again. Interviewer 9 owns those rules, in the
// `'device'` row of its own database; this module reads them from there.
//
// STRICTLY READ-ONLY: that database belongs to Interviewer 9, which may be
// open in another tab and writing to it. Three things keep it that way:
//
// - The database is opened only once `indexedDB.databases()` lists it.
//   Opening a database that does not exist creates it, and Interviewer 9 must
//   be the one to create it with its own schema. A browser that cannot list
//   its databases is treated as having none.
// - No `version()` is declared, so Dexie opens whatever schema is installed
//   and never upgrades it.
// - A middleware refuses every write and every read-write transaction.
//
// Each read opens and closes its own connection, so this app never holds one
// open while Interviewer 9 upgrades its database.

export const INTERVIEWER_9_DB_NAME = 'interviewer-v9';

/** The security behaviour Interviewer 9 decides for both apps. */
export type SharedSecurityBehaviour = Partial<
  Pick<
    StoredSettings,
    | 'idleTimeoutMinutes'
    | 'requireUnlockOnEnter'
    | 'requireUnlockOnExit'
    | 'requireUnlockOnExport'
  >
>;

const readOnlyError = () =>
  new Dexie.ReadOnlyError(
    'Interviewer 9’s database is read-only to Interviewer 8.',
  );

/** Refuses every write that reaches the database through this connection. */
export const interviewer9ReadOnlyMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'interviewer9SettingsReadOnly',
  create: (down) => ({
    ...down,
    transaction: (stores, mode, options) => {
      if (mode === 'readwrite') throw readOnlyError();
      return down.transaction(stores, mode, options);
    },
    table: (tableName) => {
      const table = down.table(tableName);
      return {
        ...table,
        mutate: () => Promise.reject(readOnlyError()),
      };
    },
  }),
};

const IDLE_TIMEOUTS: readonly IdleTimeoutMinutes[] = [1, 5, 15, 30, 60];

const isIdleTimeout = (value: unknown): value is IdleTimeoutMinutes =>
  IDLE_TIMEOUTS.some((minutes) => minutes === value);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// The row is another app's data, read without its types, so only fields with
// a value this app understands are taken. Anything else falls back to this
// app's own setting.
const pickSecurityBehaviour = (
  row: unknown,
): SharedSecurityBehaviour | null => {
  if (!isObject(row)) return null;
  const behaviour: SharedSecurityBehaviour = {};
  if (isIdleTimeout(row.idleTimeoutMinutes)) {
    behaviour.idleTimeoutMinutes = row.idleTimeoutMinutes;
  }
  if (typeof row.requireUnlockOnEnter === 'boolean') {
    behaviour.requireUnlockOnEnter = row.requireUnlockOnEnter;
  }
  if (typeof row.requireUnlockOnExit === 'boolean') {
    behaviour.requireUnlockOnExit = row.requireUnlockOnExit;
  }
  if (typeof row.requireUnlockOnExport === 'boolean') {
    behaviour.requireUnlockOnExport = row.requireUnlockOnExport;
  }
  return Object.keys(behaviour).length > 0 ? behaviour : null;
};

/**
 * Interviewer 9's security behaviour, or `null` when it has none to give: its
 * database or settings row does not exist yet, or cannot be read. Never
 * rejects; the caller then uses this app's own settings.
 */
export async function readInterviewer9SecurityBehaviour(
  dbName: string = INTERVIEWER_9_DB_NAME,
): Promise<SharedSecurityBehaviour | null> {
  let db: Dexie | null = null;
  try {
    if ((await databaseExists(dbName)) !== true) return null;
    db = new Dexie(dbName, { addons: [], autoOpen: false });
    db.use(interviewer9ReadOnlyMiddleware);
    await db.open();
    if (!db.tables.some((table) => table.name === 'settings')) return null;
    const row: unknown = await db.table('settings').get('device');
    return pickSecurityBehaviour(row);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
