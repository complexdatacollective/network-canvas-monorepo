import Dexie, { type DBCore, type DexieOptions, type Middleware } from 'dexie';

import type { Protocol } from '@codaco/protocol-validation';
import { APP_SCHEMA_VERSION } from '~/config';

import type { StoredAsset, StoredProtocolRow } from './assetDB';
import { databaseExists } from './databaseExists';
import { reportError } from './reportError';
import { LEGACY_LIBRARIES } from './storageNames';

// Reads Architect 8's protocol library, which lives on this origin beside this
// app's own (see `storageNames`). STRICTLY READ-ONLY: that library belongs to
// Architect 8, which may be open in another tab at `/v8/` and writing to it.
//
// Three things keep it that way, and each matters on its own:
//
// - The database is opened only once `indexedDB.databases()` lists it, and the
//   open itself never creates it: Architect 8 can delete its library between
//   that check and the open. Opening a database that does not exist creates
//   it, and Dexie then deletes what it created — a delete that can remove the
//   library Architect 8 is creating at the same moment. So the open aborts its
//   own upgrade from version 0, which creates nothing and leaves nothing to
//   delete. A browser that cannot list its databases is treated as having none.
// - No `version()` is declared. Dexie then opens whatever schema is installed
//   and never upgrades it, where a declared schema that differs from the
//   installed one would make Dexie bump the database's version.
// - A middleware refuses every write and every read-write transaction, so a
//   mistake in this module fails loudly instead of changing someone's work.
//
// Failures stay here. They never reach `isStorageUnavailableError` or the
// app's `storageUnavailable` flag: that flag stops autosave of this app's own
// library, and an unreadable Architect 8 library says nothing about that.

/** A document written by Architect 8 (or earlier), before any migration. */
export type LegacyProtocol = Protocol<7> | Protocol<8>;

/** A row of Architect 8's library. Same layout as this app's own rows. */
export type LegacyStoredProtocolRow = Omit<StoredProtocolRow, 'protocol'> & {
  protocol: LegacyProtocol;
};

/** A legacy row and its assets, read together in one transaction. */
export type LegacyProtocolSnapshot = {
  row: LegacyStoredProtocolRow;
  assets: StoredAsset[];
};

const [SCHEMA_8_LIBRARY] = LEGACY_LIBRARIES;

const readOnlyError = () =>
  new Dexie.ReadOnlyError(
    'Architect 8’s protocol library is read-only to this version of Architect.',
  );

/** Refuses every write that reaches the database through this connection. */
export const legacyReadOnlyMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'architectLegacyLibraryReadOnly',
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
 * An `indexedDB` for Dexie whose versionless open fails, without creating
 * anything, when the database does not exist. A missing database is upgraded
 * from version 0 inside the open itself, so aborting that upgrade is atomic
 * with the open; the abort runs before Dexie's own handler, which would delete
 * the database afterwards, once Architect 8 may have created it for real.
 */
const openingExistingOnly = (
  onMissing: () => void,
): NonNullable<DexieOptions['indexedDB']> => ({
  open: (name: string) => {
    const request = indexedDB.open(name);
    request.addEventListener('upgradeneeded', (event) => {
      if (event.oldVersion !== 0) return;
      event.stopImmediatePropagation();
      onMissing();
      request.transaction?.abort();
    });
    return request;
  },
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// The rows are another app's data, read without validation, so check the
// fields this app relies on before trusting the row's type: the library lists
// each row's stage count and dates while rendering, and Info and Download read
// its codebook, so one malformed row must not reach them. A row without a
// creation date is listed as created when it was last updated. Rows at this
// build's schema or later are not Architect 8's — pre-release builds of this
// app wrote some into that library — and are ignored.
type UncheckedLegacyRow = Omit<LegacyStoredProtocolRow, 'createdAt'> & {
  createdAt?: unknown;
};

const isLegacyRow = (value: unknown): value is UncheckedLegacyRow =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.schemaVersion === 'number' &&
  value.schemaVersion < APP_SCHEMA_VERSION &&
  typeof value.updatedAt === 'number' &&
  isObject(value.protocol) &&
  Array.isArray(value.protocol.stages) &&
  isObject(value.protocol.codebook);

const readLegacyRow = (value: unknown): LegacyStoredProtocolRow | undefined => {
  if (!isLegacyRow(value)) return undefined;
  const { createdAt, updatedAt } = value;
  return {
    ...value,
    createdAt: typeof createdAt === 'number' ? createdAt : updatedAt,
  };
};

const isAssetOf =
  (protocolId: string) =>
  (value: unknown): value is StoredAsset =>
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.assetId === 'string' &&
    value.protocolId === protocolId &&
    typeof value.name === 'string' &&
    // A Blob, but not checked with `instanceof`: a Blob from another realm
    // (a test's, or one cloned across a worker) is still a Blob.
    (typeof value.data === 'string' || isObject(value.data));

type LegacyProtocolReader = {
  /**
   * Whether the library exists on this origin yet. False, never a rejection,
   * when the browser cannot say.
   */
  legacyLibraryExists: () => Promise<boolean>;
  /** Architect 8's protocols, most recently updated first. Never rejects. */
  listLegacyProtocols: () => Promise<LegacyStoredProtocolRow[]>;
  getLegacyProtocol: (
    id: string,
  ) => Promise<LegacyStoredProtocolRow | undefined>;
  countLegacyAssets: (protocolId: string) => Promise<number>;
  /** A row and all of its assets as of one moment, for a copy or download. */
  readLegacyProtocolSnapshot: (
    id: string,
  ) => Promise<LegacyProtocolSnapshot | undefined>;
  /** Close the connection, if one is open. */
  close: () => void;
};

/**
 * A reader over one earlier major's library. The app uses the instance below;
 * tests make their own.
 *
 * Every read resolves to nothing (`undefined`, `[]`, `0`) when the library
 * does not exist. `listLegacyProtocols` also resolves to `[]` when the library
 * cannot be read; the others reject instead, because a caller that downloads or
 * copies a protocol must not mistake "could not read its resources" for "it
 * has none".
 */
export const createLegacyProtocolReader = (
  dbName: string = SCHEMA_8_LIBRARY.dbName,
): LegacyProtocolReader => {
  let db: Dexie | null = null;
  let opening: Promise<Dexie | null> | null = null;

  const close = () => {
    db?.close();
    db = null;
  };

  const connect = async (): Promise<Dexie | null> => {
    // Wrapped so the zone a Dexie `liveQuery` runs in survives the await on a
    // promise Dexie did not create.
    const exists = await Promise.resolve(databaseExists(dbName));
    if (exists === false) {
      // Removed since it was opened (site data cleared): let the old
      // connection go rather than read from a database that is gone.
      close();
      return null;
    }
    // When the browser cannot list its databases (`undefined`), the open
    // below answers instead: it fails, creating nothing, if there is none.
    if (db?.isOpen()) return db;
    close();

    // `autoOpen: false`: Dexie would otherwise reopen a closed connection by
    // itself, without asking whether the database still exists.
    let missing = false;
    const next = new Dexie(dbName, {
      addons: [],
      autoOpen: false,
      indexedDB: openingExistingOnly(() => {
        missing = true;
      }),
    });
    next.use(legacyReadOnlyMiddleware);
    try {
      await next.open();
    } catch (error) {
      // Deleted after the check above: there is nothing to read.
      if (missing) return null;
      throw error;
    }
    db = next;
    return next;
  };

  const getDb = (): Promise<Dexie | null> => {
    opening ??= connect().finally(() => {
      opening = null;
    });
    return opening;
  };

  const readAssets = async (
    database: Dexie,
    protocolId: string,
  ): Promise<StoredAsset[]> => {
    const rows: unknown[] = await database
      .table('assets')
      .where('protocolId')
      .equals(protocolId)
      .toArray();
    return rows.filter(isAssetOf(protocolId));
  };

  return {
    legacyLibraryExists: async () => {
      try {
        // Wrapped for the same reason as in `connect`.
        const exists = await Promise.resolve(databaseExists(dbName));
        if (exists !== undefined) return exists;
        return (await getDb()) !== null;
      } catch {
        return false;
      }
    },

    listLegacyProtocols: async () => {
      try {
        const database = await getDb();
        if (!database) return [];
        const rows: unknown[] = await database
          .table('protocols')
          .orderBy('updatedAt')
          .toArray();
        // Sorted as an array, as `listProtocols` does: the newest first.
        return rows.flatMap((row) => readLegacyRow(row) ?? []).toReversed();
      } catch (error) {
        reportError(error, { operation: 'legacy-library-list' });
        return [];
      }
    },

    getLegacyProtocol: async (id) => {
      const database = await getDb();
      if (!database) return undefined;
      const row: unknown = await database.table('protocols').get(id);
      return readLegacyRow(row);
    },

    countLegacyAssets: async (protocolId) => {
      const database = await getDb();
      if (!database) return 0;
      return await database
        .table('assets')
        .where('protocolId')
        .equals(protocolId)
        .count();
    },

    readLegacyProtocolSnapshot: async (id) => {
      const database = await getDb();
      if (!database) return undefined;
      // One read transaction, so an Architect 8 tab autosaving this protocol
      // cannot land between the row and its assets.
      return await database.transaction(
        'r',
        ['protocols', 'assets'],
        async () => {
          const row = readLegacyRow(await database.table('protocols').get(id));
          if (!row) return undefined;
          return { row, assets: await readAssets(database, id) };
        },
      );
    },

    close,
  };
};

const reader = createLegacyProtocolReader();

export const {
  legacyLibraryExists,
  listLegacyProtocols,
  getLegacyProtocol,
  countLegacyAssets,
  readLegacyProtocolSnapshot,
} = reader;
