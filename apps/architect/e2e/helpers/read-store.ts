import { expect, type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

// The Dexie DB the app opens in `apps/architect/src/utils/assetDB.ts`, whose
// `protocols` store (keyPath `id`) holds `StoredProtocolRow { id, protocol:
// CurrentProtocol, ... }`. `StoredProtocolRow` itself isn't imported here: it
// lives under `~/templates`, which uses `import.meta.glob` and only
// typechecks under the app's Vite tsconfig, not this Node-typed e2e project.
type Row = { protocol: CurrentProtocol };

const DB_NAME = 'ArchitectProtocolDB';

// The IDB read is `unknown`; narrow it with a real runtime guard (mirroring
// Narrow the IndexedDB value at runtime rather than asserting, so a
// malformed/absent row resolves to null instead of a mis-typed object every
// downstream assertion would then trust.
const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && 'protocol' in value;

// Read the `protocols` library row for the tab's active protocol. The id is
// read from the `activeProtocolId` field the app stamps into its
// `@@remember-app` sessionStorage slice (redux-remember's default
// `@@remember-<key>` prefix over the `app` duck — see `ducks/store.ts` and
// `getActiveProtocolId`/`setActiveProtocolId` in `ducks/modules/app.ts`).
// Falls back to the most-recently-updated row so a read before that key
// exists still resolves to something.
async function readActiveRow(page: Page): Promise<Row | null> {
  const row: unknown = await page.evaluate(async (dbName) => {
    const activeId = (() => {
      try {
        const app = JSON.parse(
          sessionStorage.getItem('@@remember-app') ?? '{}',
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
  }, DB_NAME);
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
    throw new Error('no canonical protocol row in ArchitectProtocolDB');
  }
  return protocol;
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
