import { databaseExists } from './databaseExists';
import { db, DB_NAME } from './db';
import {
  DEFAULT_SETTINGS,
  type IdleTimeoutMinutes,
  type StoredSettings,
} from './types';

// Interviewer 8 served inside Interviewer 9's deploy (a /v8/ build) shares
// Interviewer 9's database, its lock, and the rules for that lock. Interviewer
// 9 keeps those rules in its settings row — the `'device'` row of this same
// database's `settings` table — and this module reads, from there, what the
// interview route and the lock around it need. Nothing here writes: a /v8/
// build never changes a setting (api.ts refuses, and so does the connection;
// see sessionRowWriteScope).
//
// The row is Interviewer 9's, read by the field names Interviewer 9 uses, so
// only fields with a value this app understands are taken; anything else is
// this app's default.

/** The id of Interviewer 9's settings row in the shared `settings` table. */
const INTERVIEWER_9_SETTINGS_ROW_ID = 'device';

/** The settings a /v8/ build takes from Interviewer 9's row. */
type SharedSettings = Partial<
  Pick<
    StoredSettings,
    | 'idleTimeoutMinutes'
    | 'requireUnlockOnEnter'
    | 'requireUnlockOnExit'
    | 'requireUnlockOnExport'
    | 'allowStageNavigation'
    | 'analyticsEnabled'
  >
>;

const BOOLEAN_FIELDS = [
  'requireUnlockOnEnter',
  'requireUnlockOnExit',
  'requireUnlockOnExport',
  'allowStageNavigation',
  'analyticsEnabled',
] as const;

const IDLE_TIMEOUTS: readonly IdleTimeoutMinutes[] = [1, 5, 15, 30, 60];

const isIdleTimeout = (value: unknown): value is IdleTimeoutMinutes =>
  IDLE_TIMEOUTS.some((minutes) => minutes === value);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const pickSharedSettings = (row: unknown): SharedSettings => {
  const shared: SharedSettings = {};
  if (!isObject(row)) return shared;
  if (isIdleTimeout(row.idleTimeoutMinutes)) {
    shared.idleTimeoutMinutes = row.idleTimeoutMinutes;
  }
  for (const field of BOOLEAN_FIELDS) {
    const value = row[field];
    if (typeof value === 'boolean') shared[field] = value;
  }
  return shared;
};

/**
 * The settings a /v8/ build runs under: Interviewer 9's, over this app's
 * defaults. A database or row that does not exist yet reads as the defaults,
 * and the database is not opened (which would create it) unless it exists.
 */
export async function readInterviewer9Settings(): Promise<StoredSettings> {
  if ((await databaseExists(DB_NAME)) === false) return DEFAULT_SETTINGS;
  const row: unknown = await db
    .table('settings')
    .get(INTERVIEWER_9_SETTINGS_ROW_ID);
  return { ...DEFAULT_SETTINGS, ...pickSharedSettings(row), id: 'device' };
}
