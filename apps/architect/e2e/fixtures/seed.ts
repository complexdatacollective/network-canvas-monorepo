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

// Deterministic id so create-from-scratch snapshots are stable across runs.
const FIXED_ID = 'e2e-protocol';

// Distinguishes each seedProtocol call's init script within a worker, so two
// seeds in one test each apply exactly once (see the one-shot guard below).
let seedCallCount = 0;

// Writes a protocol straight into the app's real storage contract (raw
// IndexedDB `protocols`/`assets` stores + the two redux-remember
// sessionStorage keys) rather than driving an import UI, so specs can start
// from an arbitrary protocol state in one fast, hook-free call. The row shape
// mirrors `StoredProtocolRow`/`StoredAsset` in `~/utils/assetDB` (not imported
// here — see `read-store.ts` for why) and the id is shared between both
// `@@remember-*` keys, matching what the app's own autosave path
// (`putStoredProtocol`) writes on every debounced flush.
export async function seedProtocol(
  page: Page,
  protocol: CurrentProtocol,
  opts: { id?: string; name?: string; assets?: SeedAsset[] } = {},
): Promise<string> {
  const id = opts.id ?? FIXED_ID;
  const name = opts.name ?? protocol.name;
  // Mirror the app's own autosave invariant: protocolLibraryListener.ts always
  // flushes `name: protocol.name` (protocolLibraryListener.ts:185), so the
  // library row's display name and the protocol JSON's own `name` field are
  // never independent. A caller-supplied `opts.name` must land in both, not
  // just the row's denormalized field, or a read-back of the protocol JSON
  // would disagree with what was asked to be seeded.
  const seededProtocol: CurrentProtocol =
    opts.name === undefined ? protocol : { ...protocol, name };

  // 1. Seed sessionStorage BEFORE the app boots, so redux-remember rehydrates
  //    straight into /protocol with this protocol active. Both keys must
  //    carry the same id — a mismatch makes redux-remember discard `present`
  //    on rehydrate. Init scripts run before EVERY document load in the
  //    context, so guard with a per-call sessionStorage flag (sessionStorage
  //    survives same-tab navigations): without it, a reload/navigation after
  //    the spec edits the protocol would rewrite the redux-remember keys back
  //    to the original seed, masking the autosaved edits under test.
  const seedFlag = `__e2eSeeded:${++seedCallCount}`;
  await page.addInitScript(
    ([storageId, proto, flag]) => {
      if (sessionStorage.getItem(flag)) return;
      sessionStorage.setItem(flag, '1');
      sessionStorage.setItem(
        '@@remember-app',
        JSON.stringify({ activeProtocolId: storageId }),
      );
      sessionStorage.setItem(
        '@@remember-activeProtocol',
        JSON.stringify({ present: proto, activeProtocolId: storageId }),
      );
    },
    [id, seededProtocol, seedFlag] as const,
  );

  // 2. Navigate once so Dexie creates ArchitectProtocolDB, then write the
  //    durable protocol row + asset rows via raw IndexedDB (Dexie isn't on
  //    `window`, so this talks to the native API directly).
  await page.goto('/');
  await page.evaluate(
    async ({ dbName, storageId, protocolName, proto, assets }) => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      // A versionless open that wins the race with Dexie's first open would
      // CREATE an empty version-1 DB with no object stores, and the
      // transaction below would then throw NotFoundError. Wait until the
      // app's Dexie instance (assetDB.ts) has created both stores, closing
      // between polls so an in-flight Dexie upgrade is never blocked by this
      // connection.
      let db = await open();
      const deadline = Date.now() + 10_000;
      while (
        !db.objectStoreNames.contains('protocols') ||
        !db.objectStoreNames.contains('assets')
      ) {
        db.close();
        if (Date.now() > deadline) {
          throw new Error(
            `stores missing from ${dbName} — app never opened its Dexie DB`,
          );
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        db = await open();
      }
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
      storageId: id,
      protocolName: name,
      proto: seededProtocol,
      assets: opts.assets ?? [],
    },
  );

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
