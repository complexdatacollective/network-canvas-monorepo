import Dexie, { type DBCore, type Middleware } from 'dexie';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import type { Protocol } from '@codaco/protocol-validation';

import { databaseExists } from './databaseExists';
import {
  decryptAsset,
  decryptProtocolDocument,
  type StoredAssetRow,
  type StoredProtocolRow,
  type StoredSessionRow,
} from './recordCrypto';
import { LEGACY_LIBRARIES } from './storageNames';
import type { StoredAsset, StoredProtocol, StoredSession } from './types';

// Reads Interviewer 8's database (`interviewer`), which lives on this origin
// beside this app's own (see `storageNames`). STRICTLY READ-ONLY: that
// database belongs to Interviewer 8, which may be open in another tab at
// `/v8/` and running an interview against it. The only writes this app ever
// makes there are the lock maintenance in `legacyVaultMaintenance`, through a
// connection of its own.
//
// Three things keep this reader read-only, and each matters on its own:
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
//   mistake in this module fails loudly instead of changing someone's data.
//
// Rows are another app's data, read without its validation, so the fields this
// app relies on are checked before a row is trusted. Protocol rows at schema 9
// or later (pre-release builds of this app wrote some there) are not
// Interviewer 8's, and are ignored with their interviews.

/** A protocol document written for Interviewer 8 (or earlier). */
export type LegacyProtocolDocument = Protocol<7> | Protocol<8>;

/** A protocol in Interviewer 8's database, with its document decrypted. */
export type LegacyStoredProtocol = Omit<
  StoredProtocol,
  'protocol' | 'codebook'
> & {
  protocol: LegacyProtocolDocument;
  codebook: LegacyProtocolDocument['codebook'];
};

/** What can be shown of a legacy protocol without decrypting anything. */
export type LegacyProtocolSummary = Pick<
  StoredProtocol,
  | 'id'
  | 'hash'
  | 'name'
  | 'schemaVersion'
  | 'importedAt'
  | 'description'
  | 'lastModified'
> & { sessionCount: number };

/**
 * A legacy interview's plaintext fields only. Its answers stay encrypted (and
 * unread): Interviewer 8 runs and exports its own interviews.
 */
export type LegacySessionSummary = Pick<
  StoredSession,
  | 'id'
  | 'protocolHash'
  | 'protocolName'
  | 'caseId'
  | 'startedAt'
  | 'lastUpdatedAt'
  | 'finishedAt'
  | 'exportedAt'
  | 'currentStep'
  | 'progress'
  | 'isSynthetic'
>;

/** A legacy protocol and its assets, read together. */
export type LegacyProtocolSnapshot = {
  protocol: LegacyStoredProtocol;
  assets: StoredAsset[];
};

type LegacyProtocolRow = Omit<StoredProtocolRow, 'protocol' | 'codebook'> & {
  protocol?: LegacyProtocolDocument;
  codebook?: LegacyProtocolDocument['codebook'];
};

const [SCHEMA_8_LIBRARY] = LEGACY_LIBRARIES;

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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isOptionalString = (value: unknown) =>
  value === undefined || typeof value === 'string';

const isLegacyProtocolRow = (value: unknown): value is LegacyProtocolRow =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.hash === 'string' &&
  typeof value.name === 'string' &&
  typeof value.schemaVersion === 'number' &&
  value.schemaVersion < COMPATIBLE_PROTOCOL_SCHEMA_VERSION &&
  typeof value.importedAt === 'string' &&
  isOptionalString(value.description) &&
  isOptionalString(value.lastModified) &&
  (isObject(value._enc) || isObject(value.protocol));

const isNullableString = (value: unknown) =>
  value === null || typeof value === 'string';

const isLegacySessionRow = (value: unknown): value is StoredSessionRow =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.protocolHash === 'string' &&
  typeof value.protocolName === 'string' &&
  typeof value.caseId === 'string' &&
  typeof value.startedAt === 'string' &&
  typeof value.lastUpdatedAt === 'string' &&
  isNullableString(value.finishedAt) &&
  isNullableString(value.exportedAt) &&
  typeof value.currentStep === 'number' &&
  (value.progress === undefined || typeof value.progress === 'number') &&
  (value.isSynthetic === undefined || typeof value.isSynthetic === 'boolean');

const isAssetOf =
  (protocolHash: string) =>
  (value: unknown): value is StoredAssetRow =>
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.assetId === 'string' &&
    value.protocolHash === protocolHash &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    (isObject(value._enc) ||
      typeof value.data === 'string' ||
      // A Blob, but not checked with `instanceof`: a Blob from another realm
      // (a test's, or one cloned across a worker) is still a Blob.
      isObject(value.data));

const toSummary = (
  row: LegacyProtocolRow,
  sessionCount: number,
): LegacyProtocolSummary => ({
  id: row.id,
  hash: row.hash,
  name: row.name,
  schemaVersion: row.schemaVersion,
  importedAt: row.importedAt,
  description: row.description,
  lastModified: row.lastModified,
  sessionCount,
});

const toSessionSummary = (row: StoredSessionRow): LegacySessionSummary => ({
  id: row.id,
  protocolHash: row.protocolHash,
  protocolName: row.protocolName,
  caseId: row.caseId,
  startedAt: row.startedAt,
  lastUpdatedAt: row.lastUpdatedAt,
  finishedAt: row.finishedAt,
  exportedAt: row.exportedAt,
  currentStep: row.currentStep,
  progress: row.progress,
  isSynthetic: row.isSynthetic,
});

const decryptLegacyProtocol = async (
  row: LegacyProtocolRow,
): Promise<LegacyStoredProtocol> => {
  const { _enc, protocol: _protocol, codebook: _codebook, ...rest } = row;
  return { ...rest, ...(await decryptProtocolDocument(row)) };
};

const reportReadFailure = (operation: string, error: unknown) => {
  // oxlint-disable-next-line no-console -- the only diagnostic for an unreadable Interviewer 8 database; the caller shows nothing from it rather than an error
  console.error(
    `Reading Interviewer 8's database failed (${operation})`,
    error,
  );
};

type LegacyLibraryReader = {
  /** Interviewer 8's protocols, most recently imported first. Never rejects. */
  listLegacyProtocols: () => Promise<LegacyProtocolSummary[]>;
  /** One protocol, decrypted with the held key. */
  getLegacyProtocol: (
    hash: string,
  ) => Promise<LegacyStoredProtocol | undefined>;
  /** One protocol's assets, decrypted with the held key. */
  getLegacyAssets: (hash: string) => Promise<StoredAsset[]>;
  /** A protocol and all of its assets as of one moment, for making a copy. */
  readLegacyProtocolSnapshot: (
    hash: string,
  ) => Promise<LegacyProtocolSnapshot | undefined>;
  /**
   * The interviews of Interviewer 8's protocols, most recently updated first,
   * plaintext fields only. Never rejects.
   */
  listLegacySessions: () => Promise<LegacySessionSummary[]>;
  /** How many interviews `listLegacySessions` would list. Never rejects. */
  countLegacySessions: () => Promise<number>;
  /** Close the connection, if one is open. */
  close: () => void;
};

/**
 * A reader over one earlier major's database. The app uses the instance
 * below; tests make their own.
 *
 * Every read resolves to nothing (`undefined`, `[]`, `0`) when the database
 * does not exist. The listings and the count also resolve to nothing when the
 * database cannot be read. The reads of one protocol reject instead, because
 * a caller that copies a protocol must not mistake "could not read its
 * resources" for "it has none".
 */
export const createLegacyLibraryReader = (
  dbName: string = SCHEMA_8_LIBRARY.dbName,
): LegacyLibraryReader => {
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
    if (exists !== true) {
      // Removed since it was opened (a device reset): let the old connection
      // go rather than read from a database that is gone.
      close();
      return null;
    }
    if (db?.isOpen()) return db;
    close();

    // `autoOpen: false`: Dexie would otherwise reopen a closed connection by
    // itself, without asking whether the database still exists. Dexie closes
    // this connection on its own when another connection deletes or upgrades
    // the database, so it never blocks Interviewer 8 or a device reset.
    const next = new Dexie(dbName, { addons: [], autoOpen: false });
    next.use(legacyReadOnlyMiddleware);
    await next.open();
    db = next;
    return next;
  };

  const getDb = (): Promise<Dexie | null> => {
    opening ??= connect().finally(() => {
      opening = null;
    });
    return opening;
  };

  // Plaintext rows only: nothing here needs the key.
  const readListing = async (
    database: Dexie,
  ): Promise<{
    protocols: LegacyProtocolRow[];
    sessions: StoredSessionRow[];
  }> =>
    database.transaction('r', ['protocols', 'sessions'], async () => {
      const protocolRows: unknown[] = await database
        .table('protocols')
        .toArray();
      const sessionRows: unknown[] = await database.table('sessions').toArray();
      const protocols = protocolRows.filter(isLegacyProtocolRow);
      const hashes = new Set(protocols.map((row) => row.hash));
      const sessions = sessionRows
        .filter(isLegacySessionRow)
        .filter((row) => hashes.has(row.protocolHash));
      return { protocols, sessions };
    });

  const readProtocolRow = async (
    database: Dexie,
    hash: string,
  ): Promise<LegacyProtocolRow | undefined> => {
    const row: unknown = await database
      .table('protocols')
      .where('hash')
      .equals(hash)
      .first();
    return isLegacyProtocolRow(row) ? row : undefined;
  };

  const readAssetRows = async (
    database: Dexie,
    hash: string,
  ): Promise<StoredAssetRow[]> => {
    const rows: unknown[] = await database
      .table('assets')
      .where('protocolHash')
      .equals(hash)
      .toArray();
    return rows.filter(isAssetOf(hash));
  };

  return {
    listLegacyProtocols: async () => {
      try {
        const database = await getDb();
        if (!database) return [];
        const { protocols, sessions } = await readListing(database);
        const counts = new Map<string, number>();
        for (const session of sessions) {
          counts.set(
            session.protocolHash,
            (counts.get(session.protocolHash) ?? 0) + 1,
          );
        }
        return protocols
          .toSorted((a, b) => b.importedAt.localeCompare(a.importedAt))
          .map((row) => toSummary(row, counts.get(row.hash) ?? 0));
      } catch (error) {
        reportReadFailure('list protocols', error);
        return [];
      }
    },

    getLegacyProtocol: async (hash) => {
      const database = await getDb();
      if (!database) return undefined;
      const row = await readProtocolRow(database, hash);
      return row ? await decryptLegacyProtocol(row) : undefined;
    },

    getLegacyAssets: async (hash) => {
      const database = await getDb();
      if (!database) return [];
      const rows = await readAssetRows(database, hash);
      return await Promise.all(rows.map((row) => decryptAsset(row)));
    },

    readLegacyProtocolSnapshot: async (hash) => {
      const database = await getDb();
      if (!database) return undefined;
      // One read transaction, so an Interviewer 8 tab re-importing this
      // protocol cannot land between the row and its assets. Decrypted only
      // afterwards: the crypto awaits would let the transaction commit.
      const raw = await database.transaction(
        'r',
        ['protocols', 'assets'],
        async () => {
          const row = await readProtocolRow(database, hash);
          if (!row) return undefined;
          return { row, assets: await readAssetRows(database, hash) };
        },
      );
      if (!raw) return undefined;
      return {
        protocol: await decryptLegacyProtocol(raw.row),
        assets: await Promise.all(raw.assets.map((row) => decryptAsset(row))),
      };
    },

    listLegacySessions: async () => {
      try {
        const database = await getDb();
        if (!database) return [];
        const { sessions } = await readListing(database);
        return sessions
          .toSorted((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt))
          .map(toSessionSummary);
      } catch (error) {
        reportReadFailure('list sessions', error);
        return [];
      }
    },

    countLegacySessions: async () => {
      try {
        const database = await getDb();
        if (!database) return 0;
        return (await readListing(database)).sessions.length;
      } catch (error) {
        reportReadFailure('count sessions', error);
        return 0;
      }
    },

    close,
  };
};

const reader = createLegacyLibraryReader();

export const {
  listLegacyProtocols,
  getLegacyProtocol,
  getLegacyAssets,
  readLegacyProtocolSnapshot,
  listLegacySessions,
  countLegacySessions,
} = reader;

/** Let go of this app's connection to Interviewer 8's database. */
export const closeLegacyLibrary = (): void => {
  reader.close();
};
