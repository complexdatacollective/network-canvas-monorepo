/**
 * Whether an IndexedDB database named `name` exists on this origin, or
 * `undefined` when the browser cannot say.
 *
 * Asked without opening anything: opening a missing database creates it, and
 * Dexie's own `Dexie.exists` answers by opening and then deleting what it
 * created — which, if another tab creates that database at the same moment,
 * can delete the other tab's new database. `indexedDB.databases()` only reads.
 */
export const databaseExists = async (
  name: string,
): Promise<boolean | undefined> => {
  if (typeof indexedDB === 'undefined') return false;
  if (typeof indexedDB.databases !== 'function') return undefined;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === name);
};
