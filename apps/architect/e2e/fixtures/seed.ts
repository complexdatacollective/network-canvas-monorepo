import type { Page } from '@playwright/test';

import {
  createDefaultFinishSessionStage,
  type CurrentProtocol,
  type Protocol,
} from '@codaco/protocol-validation';

import {
  LEGACY_LIBRARIES,
  PROTOCOL_DB_NAME,
  SESSION_PREFIX,
} from '../../src/utils/storageNames.js';

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

const DB_NAME = PROTOCOL_DB_NAME;

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
  opts: { id?: string; name?: string; assets?: SeedAsset[] } = {},
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

  // 1. Navigate once so Dexie creates the app's library, then write the
  //    durable protocol row + asset rows via raw IndexedDB (Dexie isn't on
  //    `window`, so this talks to the native API directly).
  await page.goto('/');
  await page.evaluate(
    async ({ dbName, storageId, protocolName, proto, assets }) => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => resolve(req.result);
          req.addEventListener('error', () => reject(req.error));
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
        tx.addEventListener('error', () => reject(tx.error));
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
  await page.evaluate(
    ({ storageId, sessionPrefix }) => {
      sessionStorage.setItem(
        `${sessionPrefix}app`,
        JSON.stringify({ activeProtocolId: storageId }),
      );
      sessionStorage.removeItem(`${sessionPrefix}activeProtocol`);
      sessionStorage.removeItem('@@remember-activeProtocol');
    },
    { storageId: id, sessionPrefix: SESSION_PREFIX },
  );
  await page.reload();

  return id;
}

const [{ dbName: LEGACY_DB_NAME }] = LEGACY_LIBRARIES;

// Architect 8's Dexie declares `version(1).stores({ protocols: 'id, updatedAt',
// assets: 'id, protocolId' })`; Dexie multiplies a declared version by ten.
const LEGACY_DB_NATIVE_VERSION = 10;

export type LegacySeed = {
  /** Architect 8 names its rows with `crypto.randomUUID()`. */
  id: string;
  protocol: Protocol<8>;
  assets?: SeedAsset[];
  updatedAt?: number;
};

// Writes protocols into Architect 8's own library, `ArchitectProtocolDB`, which
// Architect 9 lists beside its own and must never write. The database is
// created exactly as Architect 8's Dexie creates it — same native version,
// stores, key paths and indexes — because anything else would make Architect 8
// bump its schema the next time it opened it, and the "never touched" oracles
// in `read-store.ts` would then be comparing against a library Architect 8
// itself would not have made.
//
// Architect 9 lists that library once, when the library view mounts, so this
// reloads afterwards for the rows to appear.
export async function seedLegacyProtocols(
  page: Page,
  rows: LegacySeed[],
): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ dbName, version, seeds }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, version);
        req.onupgradeneeded = (event) => {
          if (event.oldVersion !== 0) return;
          const protocols = req.result.createObjectStore('protocols', {
            keyPath: 'id',
          });
          protocols.createIndex('updatedAt', 'updatedAt');
          const assets = req.result.createObjectStore('assets', {
            keyPath: 'id',
          });
          assets.createIndex('protocolId', 'protocolId');
        };
        req.onsuccess = () => resolve(req.result);
        req.addEventListener('error', () => reject(req.error));
        req.onblocked = () => reject(new Error(`${dbName} open blocked`));
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['protocols', 'assets'], 'readwrite');
        tx.oncomplete = () => resolve();
        tx.addEventListener('error', () => reject(tx.error));
        for (const { id, protocol, assets, updatedAt } of seeds) {
          tx.objectStore('protocols').put({
            id,
            protocol,
            name: protocol.name,
            description: protocol.description,
            schemaVersion: protocol.schemaVersion,
            validated: true,
            createdAt: updatedAt,
            updatedAt,
          });
          for (const asset of assets) {
            tx.objectStore('assets').put({
              id: `${id}::${asset.assetId}`,
              assetId: asset.assetId,
              protocolId: id,
              name: asset.name,
              // Built here, in the browser, for the reason `seedProtocol` gives.
              data: new Blob([asset.data]),
            });
          }
        }
      });
      db.close();
    },
    {
      dbName: LEGACY_DB_NAME,
      version: LEGACY_DB_NATIVE_VERSION,
      seeds: rows.map((row) => ({
        id: row.id,
        protocol: row.protocol,
        assets: row.assets ?? [],
        updatedAt: row.updatedAt ?? Date.now(),
      })),
    },
  );
  await page.reload();
}

// A minimal current-schema protocol for create-from-scratch specs: what
// Architect's New Protocol makes, a protocol holding only the finish stage
// that ends the interview. Built to satisfy `CurrentProtocolSchema` directly
// (all five fields are the schema's only required top-level keys;
// `codebook`'s `node`/`edge`/`ego` are all optional) rather than asserting, so
// a schema drift here is a real type error instead of a silently-stale cast.
// A stage created in it goes before the finish stage, so it is stage 0.
export function emptyProtocol(
  localization: CurrentProtocol['localization'] = {
    defaultLocale: 'en',
    locales: ['en'],
  },
): CurrentProtocol {
  return {
    name: 'E2E Protocol',
    schemaVersion: 9,
    localization,
    codebook: {},
    stages: [createDefaultFinishSessionStage({ id: 'finish', localization })],
  };
}
