import { randomUUID } from 'node:crypto';

import { expect, type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { HANDOFF_DB_NAME } from '../../src/utils/handoffStore.js';
import {
  LEGACY_LIBRARIES,
  PROTOCOL_DB_NAME,
  SESSION_PREFIX,
} from '../../src/utils/storageNames.js';

// The Dexie DB the app opens in `apps/architect/src/utils/assetDB.ts`, whose
// `protocols` store (keyPath `id`) holds `StoredProtocolRow { id, protocol:
// CurrentProtocol, ... }`. `StoredProtocolRow` itself isn't imported here: it
// lives under `~/templates`, which uses `import.meta.glob` and only
// typechecks under the app's Vite tsconfig, not this Node-typed e2e project.
type Row = { protocol: CurrentProtocol };

const DB_NAME = PROTOCOL_DB_NAME;
const APP_SESSION_KEY = `${SESSION_PREFIX}app`;

// The IDB read is `unknown`; narrow it with a real runtime guard (mirroring
// Narrow the IndexedDB value at runtime rather than asserting, so a
// malformed/absent row resolves to null instead of a mis-typed object every
// downstream assertion would then trust.
const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && 'protocol' in value;

// Read the `protocols` library row for the tab's active protocol. The id is
// read from the `activeProtocolId` field the app stamps into its
// `@@remember-v9-app` sessionStorage slice (redux-remember's
// `<prefix><key>` over the `app` duck, with the per-major `SESSION_PREFIX` —
// see `ducks/store.ts` and `getActiveProtocolId`/`setActiveProtocolId` in
// `ducks/modules/app.ts`).
// Falls back to the most-recently-updated row so a read before that key
// exists still resolves to something.
async function readActiveRow(page: Page): Promise<Row | null> {
  const row: unknown = await page.evaluate(
    async ({ dbName, sessionKey }) => {
      const activeId = (() => {
        try {
          const app = JSON.parse(
            sessionStorage.getItem(sessionKey) ?? '{}',
          ) as Record<string, unknown>;
          return typeof app.activeProtocolId === 'string'
            ? app.activeProtocolId
            : undefined;
        } catch {
          return undefined;
        }
      })();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const result = await new Promise<unknown>((resolve, reject) => {
        const store = db
          .transaction('protocols', 'readonly')
          .objectStore('protocols');
        // Prefer the active id; fall back to the most-recently-updated row.
        const req = activeId ? store.get(activeId) : store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      // getAll() returns rows ordered by primary key (id), not recency, so sort
      // by the stored `updatedAt` (written on every accepted commit) and take the
      // newest — the genuinely most-recently-updated row. Narrow each element at
      // runtime (Array.isArray gives `any[]`) instead of trusting `any` access.
      if (Array.isArray(result)) {
        const rows: unknown[] = result;
        const updatedAtOf = (candidate: unknown): number => {
          if (
            typeof candidate !== 'object' ||
            candidate === null ||
            !('updatedAt' in candidate)
          ) {
            return 0;
          }
          const { updatedAt } = candidate;
          return typeof updatedAt === 'number' ? updatedAt : 0;
        };
        return rows.toSorted((a, b) => updatedAtOf(b) - updatedAtOf(a))[0];
      }
      return result;
    },
    { dbName: DB_NAME, sessionKey: APP_SESSION_KEY },
  );
  return isRow(row) ? row : null;
}

// A read after editing top-level protocol data can land while validation or
// the accepted IndexedDB write is still in progress. Callers asserting a field
// they just changed pass `until`, a predicate the poll also waits on.
export async function readProtocolJson(
  page: Page,
  until?: (protocol: CurrentProtocol) => boolean,
): Promise<CurrentProtocol> {
  let protocol: CurrentProtocol | undefined;
  await expect
    .poll(
      async () => {
        protocol = (await readActiveRow(page))?.protocol;
        if (!protocol) return 'pending';
        return until === undefined || until(protocol) ? 'ready' : 'pending';
      },
      { timeout: 5_000 },
    )
    .toBe('ready');
  if (!protocol) {
    throw new Error(`no canonical protocol row in ${DB_NAME}`);
  }
  return protocol;
}

// A refused edit writes nothing, so a caller asserting "nothing was written"
// has no state change of its own to wait for — every such condition is already
// true at 0 ms. Rather than sleep, make a write that DOES persist and wait for
// that: `mutate` puts `token` somewhere in the protocol through the UI (a
// description, a name, a resource filename), and this returns once the token is
// readable from the canonical row.
//
// That makes the caller's assertion conclusive rather than hopeful, because the
// row carrying the token is a snapshot of the protocol AS IT STOOD AFTER the
// refusal, not a patch: `protocolValidationListener.ts` captures each canonical
// change as an immutable FIFO candidate carrying the whole protocol, and
// `protocolLibraryListener.ts` writes accepted snapshots under a per-protocol
// lock that preserves that order. A write the guard should have refused is
// therefore inside the very row the caller then reads.
//
// This synchronises on the guard's own decision point: all three guards it
// serves (AssetBrowser's `handleDelete`, Timeline's `handleDeleteStage` and
// `commitReorder`) decide SYNCHRONOUSLY within the interaction that opened the
// dialog — a click for the first two, an ArrowUp for the reorder guard — and
// return before dispatching. A path that deferred its destructive dispatch
// behind its own await would land after the token and would need its own
// synchronisation.
export async function settleAfterRefusal(
  page: Page,
  mutate: (token: string) => Promise<void>,
): Promise<void> {
  const token = `refusal-settle-${randomUUID()}`;
  await mutate(token);
  // Field-agnostic on purpose, so each caller can use whatever persisting edit
  // its own screen already offers: a token this unique matches nothing else in
  // the protocol, wherever `mutate` chose to put it.
  await readProtocolJson(page, (protocol) =>
    JSON.stringify(protocol).includes(token),
  );
}

// Every key in the `assets` store, across all protocols (`${protocolId}::${assetId}`
// — see `assetKey` in `~/utils/assetDB`). A tab that may not edit a protocol
// must not be able to write a blob into that protocol's asset scope, and
// `readProtocolJson` cannot see such a write: the manifest entry naming the
// blob never reaches the protocol row, so only the asset store shows it.
export async function readAssetKeys(page: Page): Promise<string[]> {
  const keys: unknown = await page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // A versionless open in a session where the app has not created its Dexie
    // DB yet yields a store-less database, and a transaction on it throws.
    if (!db.objectStoreNames.contains('assets')) {
      db.close();
      return [];
    }
    const result = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = db
        .transaction('assets', 'readonly')
        .objectStore('assets')
        .getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result.map(String);
  }, DB_NAME);
  return Array.isArray(keys) ? keys.map(String) : [];
}

export type StoreCounts = { protocols: number; assets: number };

const isStoreCounts = (value: unknown): value is StoreCounts =>
  typeof value === 'object' &&
  value !== null &&
  'protocols' in value &&
  'assets' in value &&
  typeof value.protocols === 'number' &&
  typeof value.assets === 'number';

// How many rows each library store holds. This is the oracle behind "the
// import was refused and the library is untouched", so every failure path
// REJECTS rather than resolving to a sentinel: a read that resolved to -1 on
// error compared -1 to -1 across the refusal and passed while reading nothing
// at all. The only non-error absence — a store the app has not created in this
// session — is genuinely a count of zero, and is reported as such.
export async function readStoreCounts(page: Page): Promise<StoreCounts> {
  const counts: unknown = await page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(new Error(`indexedDB.open(${dbName}) failed: ${req.error}`));
    });
    const count = (store: string) =>
      new Promise<number>((resolve, reject) => {
        if (!db.objectStoreNames.contains(store)) {
          resolve(0);
          return;
        }
        const req = db
          .transaction(store, 'readonly')
          .objectStore(store)
          .count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(new Error(`count("${store}") failed: ${req.error}`));
      });
    try {
      return {
        protocols: await count('protocols'),
        assets: await count('assets'),
      };
    } finally {
      db.close();
    }
  }, DB_NAME);
  if (!isStoreCounts(counts)) {
    throw new Error(
      `readStoreCounts read a value that is not a count pair: ${JSON.stringify(counts)}`,
    );
  }
  return counts;
}

type Stage = CurrentProtocol['stages'][number];

// Poll until the accepted stage commit reaches the durable row. Existence alone
// is only a meaningful wait for create-from-scratch specs (the seeded row has
// no stage at `index` until the commit lands); when editing a stage that ALREADY
// exists in the seeded protocol, existence passes immediately and can return
// the pre-commit JSON — those callers must pass `until`, a predicate on the
// stage (e.g. checking the field they just changed) that the poll also waits
// on.
export async function readStageJson(
  page: Page,
  index: number,
  until?: (stage: Stage) => boolean,
): Promise<Stage> {
  let stage: Stage | undefined;
  await expect
    .poll(
      async () => {
        const row = await readActiveRow(page);
        stage = row?.protocol.stages[index];
        if (!stage) return 'pending';
        return until === undefined || until(stage) ? 'ready' : 'pending';
      },
      { timeout: 5_000 },
    )
    .toBe('ready');
  if (!stage) {
    throw new Error(`stage at index ${index} not found after commit poll`);
  }
  return stage;
}

// The names of every IndexedDB database on the page's origin. Listing never
// opens (and so never creates) one, which is what the oracles below need.
export async function readDatabaseNames(page: Page): Promise<string[]> {
  const names: unknown = await page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name),
  );
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === 'string')
    : [];
}

const [{ dbName: LEGACY_DB_NAME }] = LEGACY_LIBRARIES;

// Everything in Architect 8's library, as one string: the database's native
// version, each store's key path and indexes, and every row in key order, with
// each resource's Blob read out as base64. Two equal fingerprints mean the
// library was not written, upgraded or re-created in between — the oracle for
// "Architect 9 only ever reads it".
//
// Null when the library does not exist. It is never opened before
// `indexedDB.databases()` lists it: a versionless open of a missing database
// creates one, which would make the read itself the write it is meant to catch.
export async function readLegacyLibraryFingerprint(
  page: Page,
): Promise<string | null> {
  const fingerprint: unknown = await page.evaluate(async (dbName) => {
    const listed = (await indexedDB.databases()).find(
      (database) => database.name === dbName,
    );
    if (!listed) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      const storeNames = [...db.objectStoreNames].toSorted();
      const tx = db.transaction(storeNames, 'readonly');
      const stores = await Promise.all(
        storeNames.map(async (storeName) => {
          const store = tx.objectStore(storeName);
          const rows = await new Promise<unknown[]>((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          return {
            name: storeName,
            keyPath: store.keyPath,
            autoIncrement: store.autoIncrement,
            indexes: [...store.indexNames].toSorted().map((indexName) => {
              const index = store.index(indexName);
              return {
                name: indexName,
                keyPath: index.keyPath,
                unique: index.unique,
                multiEntry: index.multiEntry,
              };
            }),
            rows,
          };
        }),
      );
      // Blobs read after the transaction: they stay readable once it ends.
      const encodeBlobs = async (value: unknown): Promise<unknown> => {
        if (value instanceof Blob) {
          const bytes = new Uint8Array(await value.arrayBuffer());
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return { blob: value.type, base64: btoa(binary) };
        }
        if (Array.isArray(value)) return Promise.all(value.map(encodeBlobs));
        if (typeof value === 'object' && value !== null) {
          const entries = await Promise.all(
            Object.entries(value).map(
              async ([key, entry]) => [key, await encodeBlobs(entry)] as const,
            ),
          );
          return Object.fromEntries(entries);
        }
        return value;
      };
      return JSON.stringify({
        version: db.version,
        listedVersion: listed.version,
        stores: await encodeBlobs(stores),
      });
    } finally {
      db.close();
    }
  }, LEGACY_DB_NAME);
  if (fingerprint !== null && typeof fingerprint !== 'string') {
    throw new Error('readLegacyLibraryFingerprint read a non-string value');
  }
  return fingerprint;
}

// Reads every row of one store of this app's own library (`assets`,
// `protocols` or `legacyProtocolChoices`), so a spec can assert exactly what
// an action wrote there.
export async function readLibraryRows(
  page: Page,
  storeName: 'assets' | 'protocols' | 'legacyProtocolChoices',
): Promise<unknown[]> {
  const rows: unknown = await page.evaluate(
    async ({ dbName, store }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      try {
        if (!db.objectStoreNames.contains(store)) {
          throw new Error(`${dbName} has no "${store}" store`);
        }
        return await new Promise<unknown[]>((resolve, reject) => {
          const req = db
            .transaction(store, 'readonly')
            .objectStore(store)
            .getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    },
    { dbName: DB_NAME, store: storeName },
  );
  if (!Array.isArray(rows)) {
    throw new Error(`readLibraryRows(${storeName}) did not read an array`);
  }
  const values: unknown[] = rows;
  return values;
}

export type HandoffRecordSummary = {
  key: string;
  kind: unknown;
  targetMajor: unknown;
  fileName: unknown;
  createdAt: unknown;
  /** The staged file's bytes, base64; null when `file` is not a Blob. */
  fileBase64: string | null;
};

const isHandoffSummary = (value: unknown): value is HandoffRecordSummary =>
  typeof value === 'object' &&
  value !== null &&
  'key' in value &&
  typeof value.key === 'string' &&
  'fileBase64' in value;

// Every record in the hand-off store the two Architect majors pass files
// through (`ArchitectHandoffDB`), with each staged file read out as base64.
// Empty when the store does not exist; like the legacy fingerprint, it is
// listed before it is opened, so reading never creates it.
export async function readHandoffRecords(
  page: Page,
): Promise<HandoffRecordSummary[]> {
  const records: unknown = await page.evaluate(async (dbName) => {
    const listed = (await indexedDB.databases()).some(
      (database) => database.name === dbName,
    );
    if (!listed) return [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      if (!db.objectStoreNames.contains('handoffs')) return [];
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const req = db
          .transaction('handoffs', 'readonly')
          .objectStore('handoffs')
          .getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return await Promise.all(
        rows.map(async (row) => {
          const record = new Map<string, unknown>(
            typeof row === 'object' && row !== null ? Object.entries(row) : [],
          );
          const file = record.get('file');
          let fileBase64: string | null = null;
          if (file instanceof Blob) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            fileBase64 = btoa(binary);
          }
          return {
            key: record.get('key'),
            kind: record.get('kind'),
            targetMajor: record.get('targetMajor'),
            fileName: record.get('fileName'),
            createdAt: record.get('createdAt'),
            fileBase64,
          };
        }),
      );
    } finally {
      db.close();
    }
  }, HANDOFF_DB_NAME);
  if (!Array.isArray(records)) {
    throw new Error('readHandoffRecords did not read an array');
  }
  const values: unknown[] = records;
  return values.filter(isHandoffSummary);
}
