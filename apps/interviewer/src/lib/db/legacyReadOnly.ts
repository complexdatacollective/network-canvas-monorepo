import Dexie, { type DBCore, type Middleware } from 'dexie';

import { databaseExists } from './databaseExists';

// How this app opens an earlier major's database to read it. Three things
// keep such a connection read-only, and each matters on its own:
//
// - The database is opened only once `indexedDB.databases()` lists it.
//   Opening a database that does not exist creates it, and Dexie then deletes
//   what it created, which can remove a database Interviewer 8 is creating at
//   the same moment. A browser that cannot list its databases is treated as
//   having none.
// - No `version()` is declared. Dexie then opens whatever schema is installed
//   and never upgrades it, where a declared schema that differs from the
//   installed one would make Dexie bump the database's version.
// - A middleware refuses every write and every read-write transaction, so a
//   mistake fails loudly instead of changing someone's data.
//
// The only writes this app ever makes there are the lock maintenance in
// `legacyVaultMaintenance`, through a connection of its own.

const readOnlyError = () =>
  new Dexie.ReadOnlyError(
    'Interviewer 8’s database is read-only to this version of Interviewer.',
  );

/** Refuses every write that reaches the database through this connection. */
export const legacyReadOnlyMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'interviewerLegacyLibraryReadOnly',
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

/**
 * A read-only connection to `dbName`, or null when the database is not
 * listed. `autoOpen: false`: Dexie would otherwise reopen a closed connection
 * by itself, without asking whether the database still exists. Dexie closes
 * the connection on its own when another connection deletes or upgrades the
 * database, so it never blocks Interviewer 8 or a device reset.
 */
export async function openLegacyReadOnly(
  dbName: string,
): Promise<Dexie | null> {
  // Wrapped so the zone a Dexie `liveQuery` runs in survives the await on a
  // promise Dexie did not create.
  const exists = await Promise.resolve(databaseExists(dbName));
  if (exists !== true) return null;
  const connection = new Dexie(dbName, { addons: [], autoOpen: false });
  connection.use(legacyReadOnlyMiddleware);
  await connection.open();
  return connection;
}
