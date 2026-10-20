import type { Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

export type SeedAsset = {
  assetId: string;
  name: string;
  // Utf8 text content of the asset file. Wrapped into a real `Blob` inside
  // `seedProtocol`'s `page.evaluate` callback (browser context) rather than
  // here: a `Blob` constructed in Node wouldn't survive serialisation across
  // the evaluate boundary intact (Playwright's argument serializer has no
  // special case for it, so it arrives as an empty plain object) — and every
  // row this writes into the `assets` store represents a file-backed asset,
  // which `~/utils/bundleProtocol.ts` requires to carry `Blob` data (a
  // string there is treated as an apikey value and skipped from exports).
  data: string;
};

const DB_NAME = 'ArchitectProtocolDB';
// The app's `assetDb.version(1).stores(...)` in `~/utils/assetDB`: Dexie
// multiplies its version by ten, so the IndexedDB version is 10.
const DB_VERSION = 10;

export type SeedOptions = {
  id?: string;
  name?: string;
  assets?: SeedAsset[];
  /**
   * The page to seed from, relative to the config's baseURL. Storage is per
   * origin, so any page of it will do. The sub-path suite passes Architect 9's
   * root (stubbed), because /v8/'s own root never stays put: it returns to
   * Architect 9.
   */
  at?: string;
};

// Deterministic id so create-from-scratch snapshots are stable across runs.
const FIXED_ID = 'e2e-protocol';

// Writes a protocol straight into the app's real storage contract (raw
// IndexedDB `protocols`/`assets` stores + the redux-remember `app` key) rather
// than driving an import UI, so specs can start from an arbitrary protocol
// state in one fast, hook-free call. The row shape
// mirrors `StoredProtocolRow`/`StoredAsset` in `~/utils/assetDB` (not imported
// here — see `read-store.ts` for why). Session storage remembers only the row
// id; the protocol body is always restored from this canonical IndexedDB row.
export async function seedProtocol(
  page: Page,
  protocol: CurrentProtocol,
  opts: SeedOptions = {},
): Promise<string> {
  const id = opts.id ?? FIXED_ID;
  const name = opts.name ?? protocol.name;
  // Mirror the app's commit invariant: protocolLibraryListener always writes
  // `name: protocol.name`, so the library row's display name and the protocol
  // JSON's own `name` field are
  // never independent. A caller-supplied `opts.name` must land in both, not
  // just the row's denormalized field, or a read-back of the protocol JSON
  // would disagree with what was asked to be seeded.
  const seededProtocol: CurrentProtocol =
    opts.name === undefined ? protocol : { ...protocol, name };

  // 1. Navigate to a page of the app's origin, then write the durable
  //    protocol row + asset rows via raw IndexedDB (Dexie isn't on `window`,
  //    so this talks to the native API directly). `./` is the config's
  //    baseURL itself: the origin root for the root suite, /v8/ for the
  //    sub-path suite (playwright.subpath.config.ts).
  await page.goto(opts.at ?? './');
  await page.evaluate(
    async ({ dbName, dbVersion, storageId, protocolName, proto, assets }) => {
      // Opened at the app's own version, creating the stores exactly as Dexie
      // declares them when this open is the first: nothing on a page that
      // never shows the start screen has opened the database yet. A
      // versionless open would instead create an empty version-1 database
      // that Dexie then has to upgrade. If the app's Dexie got there first,
      // this is an ordinary open of what it made.
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onupgradeneeded = () => {
          const created = req.result;
          if (!created.objectStoreNames.contains('assets')) {
            created
              .createObjectStore('assets', { keyPath: 'id' })
              .createIndex('protocolId', 'protocolId');
          }
          if (!created.objectStoreNames.contains('protocols')) {
            created
              .createObjectStore('protocols', { keyPath: 'id' })
              .createIndex('updatedAt', 'updatedAt');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['protocols', 'assets'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        // A reseed with the same storageId must not leave asset rows from a
        // previous seed behind: a stale Blob could satisfy a later fixture
        // that forgot to declare the asset, masking missing fixture data.
        // Keys are `${storageId}::<assetId>`, so a prefix range delete
        // clears exactly this protocol's rows before the fresh puts.
        tx.objectStore('assets').delete(
          IDBKeyRange.bound(`${storageId}::`, `${storageId}::\uffff`),
        );
        tx.objectStore('protocols').put({
          id: storageId,
          protocol: proto,
          name: protocolName,
          description: proto.description,
          sourceRef: { kind: 'e2e', id: 'e2e-fixture' },
          schemaVersion: proto.schemaVersion,
          validated: true,
          createdAt: now,
          updatedAt: now,
        });
        for (const asset of assets) {
          tx.objectStore('assets').put({
            id: `${storageId}::${asset.assetId}`,
            assetId: asset.assetId,
            protocolId: storageId,
            name: asset.name,
            // Built here (inside the evaluate callback) so it's a real,
            // browser-native `Blob` — see the `SeedAsset.data` comment.
            data: new Blob([asset.data]),
          });
        }
      });
      db.close();
    },
    {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      storageId: id,
      protocolName: name,
      proto: seededProtocol,
      assets: opts.assets ?? [],
    },
  );

  // 2. Remember only the active row id, then reload so startup exercises the
  //    same canonical IndexedDB restore path as a real tab refresh. Delete the
  //    legacy body key explicitly so a stale test context cannot mask a
  //    regression by rehydrating protocol content from sessionStorage.
  await page.evaluate((storageId) => {
    sessionStorage.setItem(
      '@@remember-app',
      JSON.stringify({ activeProtocolId: storageId }),
    );
    sessionStorage.removeItem('@@remember-activeProtocol');
  }, id);
  await page.reload();

  return id;
}

// A minimal empty schema-8 protocol for create-from-scratch specs. Built to
// satisfy `CurrentProtocolSchema` directly (all four fields are the schema's
// only required top-level keys; `codebook`'s `node`/`edge`/`ego` are all
// optional) rather than asserting, so a schema drift here is a real type
// error instead of a silently-stale cast.
export function emptyProtocol(): CurrentProtocol {
  return {
    name: 'E2E Protocol',
    schemaVersion: 8,
    codebook: {},
    stages: [],
  };
}
