import { expect, type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

// The Dexie DB the app opens in `apps/architect/src/utils/assetDB.ts`, whose
// `protocols` store (keyPath `id`) holds `StoredProtocolRow { id, protocol:
// CurrentProtocol, ... }`. `StoredProtocolRow` itself isn't imported here: it
// lives under `~/templates`, which uses `import.meta.glob` and only
// typechecks under the app's Vite tsconfig, not this Node-typed e2e project.
type Row = { protocol: CurrentProtocol };

const DB_NAME = 'ArchitectProtocolDB';

// Read the `protocols` library row for the tab's active protocol. The id is
// read from the `activeProtocolId` field the app stamps into its
// `@@remember-app` sessionStorage slice (redux-remember's default
// `@@remember-<key>` prefix over the `app` duck — see `ducks/store.ts` and
// `getActiveProtocolId`/`setActiveProtocolId` in `ducks/modules/app.ts`).
// Falls back to the most-recently-updated row so a read before that key
// exists still resolves to something.
async function readActiveRow(page: Page): Promise<Row | null> {
  return page.evaluate(async (dbName) => {
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
    const row = await new Promise<unknown>((resolve, reject) => {
      const store = db
        .transaction('protocols', 'readonly')
        .objectStore('protocols');
      // Prefer the active id; fall back to the most-recently-updated row.
      const req = activeId ? store.get(activeId) : store.getAll();
      req.onsuccess = () => {
        const result: unknown = req.result;
        resolve(Array.isArray(result) ? result[result.length - 1] : result);
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return (row as Row) ?? null;
  }, DB_NAME);
}

export async function readProtocolJson(
  page: Page,
): Promise<Record<string, unknown>> {
  const row = await readActiveRow(page);
  if (!row) {
    throw new Error('no autosaved protocol row in ArchitectProtocolDB');
  }
  return row.protocol;
}

export async function readStageJson(
  page: Page,
  index: number,
): Promise<Record<string, unknown>> {
  let stage: Record<string, unknown> | undefined;
  // Poll past the 600ms autosave debounce (protocolLibraryListener.ts) until
  // the stage at `index` exists in the durable row.
  await expect
    .poll(
      async () => {
        const row = await readActiveRow(page);
        stage = row?.protocol.stages[index];
        return stage ? 'ready' : 'pending';
      },
      { timeout: 5_000 },
    )
    .toBe('ready');
  if (!stage) {
    throw new Error(`stage at index ${index} not found after autosave poll`);
  }
  return stage;
}
