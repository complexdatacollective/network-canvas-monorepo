import type { Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

export type SeedAsset = {
  assetId: string;
  name: string;
  data: Blob | string;
};

const DB_NAME = 'ArchitectProtocolDB';

// Deterministic id so create-from-scratch snapshots are stable across runs.
const FIXED_ID = 'e2e-protocol';

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
  //    on rehydrate.
  await page.addInitScript(
    ([storageId, proto]) => {
      sessionStorage.setItem(
        '@@remember-app',
        JSON.stringify({ activeProtocolId: storageId }),
      );
      sessionStorage.setItem(
        '@@remember-activeProtocol',
        JSON.stringify({ present: proto, activeProtocolId: storageId }),
      );
    },
    [id, seededProtocol] as const,
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
      const db = await open();
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['protocols', 'assets'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
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
            data: asset.data,
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
