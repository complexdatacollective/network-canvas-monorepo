import Dexie from 'dexie';

import { RETIRED_DB_NAMES } from './storageNames';

/**
 * Whether an IndexedDB database named `name` exists on this origin, or
 * `undefined` when the browser cannot say. Asked without opening anything:
 * opening a missing database creates it, and `indexedDB.databases()` only
 * reads.
 */
const databaseExists = async (name: string): Promise<boolean | undefined> => {
  if (typeof indexedDB === 'undefined') return false;
  if (typeof indexedDB.databases !== 'function') return undefined;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === name);
};

/**
 * Delete the databases an unreleased build left behind (`RETIRED_DB_NAMES`),
 * best-effort: one rows encrypted under a key a reset discards, the other
 * protocol files staged for a hand-off that no longer exists, possibly in
 * plaintext. Never throws: a failure leaves only data nothing reads, and must
 * not stop a reset or the app's start-up.
 */
export async function deleteRetiredDatabases(): Promise<void> {
  for (const name of RETIRED_DB_NAMES) {
    try {
      // A browser that cannot list its databases deletes anyway: deleting a
      // database that does not exist creates nothing.
      if ((await databaseExists(name)) === false) continue;
      await Dexie.delete(name);
    } catch (error) {
      // oxlint-disable-next-line no-console -- best-effort cleanup with no other reporting
      console.warn(`Could not delete the retired database ${name}`, error);
    }
  }
}
