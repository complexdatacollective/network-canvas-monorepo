import { openLegacyReadOnly } from './legacyReadOnly';
import { LEGACY_LIBRARIES } from './storageNames';
import type { IdleTimeoutMinutes, StoredSettings } from './types';

// The settings a device already chose in Interviewer 8, carried into this
// app's database the first time it has none, so updating does not silently
// reset how the device exports, locks and reports. Only device preferences
// are carried: not dismissed update notes, the last active protocol or
// interview, or the sample-protocol dismissal, which name things in
// Interviewer 8's library rather than this one.

export type CarriedSettings = Partial<
  Pick<
    StoredSettings,
    | 'exportGraphML'
    | 'exportCSV'
    | 'useScreenLayoutCoordinates'
    | 'screenLayoutHeight'
    | 'screenLayoutWidth'
    | 'idleTimeoutMinutes'
    | 'requireUnlockOnEnter'
    | 'requireUnlockOnExit'
    | 'requireUnlockOnExport'
    | 'analyticsEnabled'
    | 'allowStageNavigation'
  >
>;

const BOOLEAN_FIELDS = [
  'exportGraphML',
  'exportCSV',
  'useScreenLayoutCoordinates',
  'requireUnlockOnEnter',
  'requireUnlockOnExit',
  'requireUnlockOnExport',
  'analyticsEnabled',
  'allowStageNavigation',
] as const;

const DIMENSION_FIELDS = ['screenLayoutHeight', 'screenLayoutWidth'] as const;

const IDLE_TIMEOUTS: readonly number[] = [
  1, 5, 15, 30, 60,
] satisfies IdleTimeoutMinutes[];

const isIdleTimeout = (value: unknown): value is IdleTimeoutMinutes =>
  typeof value === 'number' && IDLE_TIMEOUTS.includes(value);

/**
 * The carried fields of another app's settings row, each only when it holds a
 * value this app would have written itself.
 */
export function pickCarriedSettings(row: unknown): CarriedSettings {
  if (typeof row !== 'object' || row === null) return {};
  const source = row as Record<string, unknown>;
  const carried: CarriedSettings = {};
  for (const field of BOOLEAN_FIELDS) {
    const value = source[field];
    if (typeof value === 'boolean') carried[field] = value;
  }
  for (const field of DIMENSION_FIELDS) {
    const value = source[field];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      carried[field] = value;
    }
  }
  if (isIdleTimeout(source.idleTimeoutMinutes)) {
    carried.idleTimeoutMinutes = source.idleTimeoutMinutes;
  }
  return carried;
}

/**
 * Interviewer 8's `'device'` settings, read read-only, or `{}` when there is
 * no such database or row or it cannot be read. Never rejects: carrying
 * settings over is a courtesy and must never stop this app from starting.
 */
export async function readLegacyDeviceSettings(): Promise<CarriedSettings> {
  for (const { dbName } of LEGACY_LIBRARIES) {
    let connection: Awaited<ReturnType<typeof openLegacyReadOnly>> = null;
    try {
      connection = await openLegacyReadOnly(dbName);
      if (!connection?.tables.some(({ name }) => name === 'settings')) {
        continue;
      }
      const row: unknown = await connection.table('settings').get('device');
      const carried = pickCarriedSettings(row);
      if (Object.keys(carried).length > 0) return carried;
    } catch (error) {
      // oxlint-disable-next-line no-console -- the only diagnostic for settings not carried over from Interviewer 8; this app starts with its defaults instead
      console.error("Reading Interviewer 8's settings failed", error);
    } finally {
      connection?.close();
    }
  }
  return {};
}
