import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { BrowserContext, Page, Request } from '@playwright/test';

import {
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { readStoreCounts } from '../helpers/read-store.js';
import { StagePreview } from '../pageobjects/preview.js';
import { Timeline } from '../pageobjects/timeline.js';

/**
 * Architect 8 as Architect 9 ships it: built with ARCHITECT_BASE_PATH=/v8/ and
 * served at /v8/ of the same origin (see playwright.subpath.config.ts). The
 * root suite covers what the app does; this one covers where it lives and the
 * hand-off contract with Architect 9 at the origin root:
 *
 * - every request and every in-app route stays under /v8/, deep links
 *   included, and the preview popup is Architect 8's own;
 * - `?open=<id>` opens a row of this app's library, `?import=<key>` the file
 *   Architect 9 staged in the shared `ArchitectHandoffDB`;
 * - the Architect 8 banner and the library's "Upgrade to schema 9" send the
 *   protocol to Architect 9's `/?upgrade=<id>`, through the leave-editor
 *   prompt when an editor has unsaved work.
 *
 * Architect 9 itself is not served here. Its root URL is answered by a stub,
 * so a navigation there is observable without depending on what vite preview
 * does outside its base.
 */

const STAGE_LABEL = 'Welcome';

function informationProtocol(name: string): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    name,
    schemaVersion: 8,
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: STAGE_LABEL,
        title: 'Welcome',
        items: [
          {
            id: 'welcome-text',
            type: 'text',
            content: 'Thank you for taking part.',
          },
        ],
      },
    ],
  });
}

const ALL_INTERFACES_NETCANVAS = path.resolve(
  import.meta.dirname,
  '../fixtures/files/all-interfaces.netcanvas',
);

// The hand-off store's contract, as pinned by
// src/utils/__tests__/handoffStore.contract.test.ts. Dexie's `version(1)` is
// IndexedDB version 10; the store is created by the app on startup (it prunes
// stale records), so the helpers below only ever open what the app made.
const HANDOFF_DB = 'ArchitectHandoffDB';
const HANDOFF_STORE = 'handoffs';

function subpathBase(): URL {
  const { baseURL } = test.info().project.use;
  if (!baseURL) throw new Error('the sub-path suite needs a baseURL');
  const url = new URL(baseURL);
  // Every assertion below about staying "under the base" means something
  // only while the base is not the origin root.
  expect(url.pathname).toBe('/v8/');
  return url;
}

/** Architect 9's `/?upgrade=` answered by a stub page, so the navigation lands. */
async function stubArchitect9(page: Page): Promise<URL> {
  const origin = new URL('/', subpathBase());
  await page.route(
    (url) => url.origin === origin.origin && url.pathname === '/',
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Architect 9 stub</title><h1>Architect 9 stub</h1>',
      }),
  );
  return origin;
}

/** Same-origin requests that left the base, across every page of the context. */
function recordRequestsOutsideBase(
  context: BrowserContext,
  base: URL,
): string[] {
  const outside: string[] = [];
  context.on('request', (request: Request) => {
    const url = new URL(request.url());
    if (url.origin !== base.origin) return;
    if (!url.pathname.startsWith(base.pathname)) outside.push(url.pathname);
  });
  return outside;
}

async function settle(page: Page): Promise<void> {
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

/** Stage a file for an app, as the other app would before navigating. */
async function stageHandoff(
  page: Page,
  record: { targetMajor: 8 | 9; fileName: string; bytes: number[] },
): Promise<string> {
  const key = randomUUID();
  await page.evaluate(
    async ({ dbName, storeName, handoffKey, targetMajor, fileName, bytes }) => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(dbName);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      // A versionless open that won the race with Dexie's would create an
      // empty database; wait for the app's own to exist, as seed.ts does.
      let db = await open();
      const deadline = Date.now() + 10_000;
      while (!db.objectStoreNames.contains(storeName)) {
        db.close();
        if (Date.now() > deadline) {
          throw new Error(`${dbName} was never created by the app`);
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        db = await open();
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(storeName).put({
          key: handoffKey,
          kind: 'import',
          targetMajor,
          fileName,
          file: new Blob([new Uint8Array(bytes)], {
            type: 'application/octet-stream',
          }),
          createdAt: Date.now(),
        });
      });
      db.close();
    },
    {
      dbName: HANDOFF_DB,
      storeName: HANDOFF_STORE,
      handoffKey: key,
      ...record,
    },
  );
  return key;
}

async function readHandoffKeys(page: Page): Promise<string[]> {
  const keys: unknown = await page.evaluate(
    async ({ dbName, storeName }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains(storeName)) {
        db.close();
        throw new Error(`${dbName} has no ${storeName} store`);
      }
      const result = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = db
          .transaction(storeName, 'readonly')
          .objectStore(storeName)
          .getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return result.map(String);
    },
    { dbName: HANDOFF_DB, storeName: HANDOFF_STORE },
  );
  return Array.isArray(keys) ? keys.map(String) : [];
}

const protocolNameField = (page: Page) =>
  page.getByRole('textbox', { name: 'Protocol name' });

const architect8Banner = (page: Page) =>
  page.getByText('This is Architect 8, for schema 8 protocols.');

test('boots under /v8/, keeps every route and request under it, and honours deep links', async ({
  architectPage,
  context,
  seed,
}) => {
  const base = subpathBase();
  const outside = recordRequestsOutsideBase(context, base);

  await seed(informationProtocol('Deep Link Study'));
  await gotoProtocol(architectPage);
  await expect(architectPage).toHaveURL(new URL('protocol', base).href);
  await expect(protocolNameField(architectPage)).toHaveValue('Deep Link Study');

  // In-app navigation goes through wouter's <Router base>.
  await new Timeline(architectPage).openStage(STAGE_LABEL);
  const stageUrl = new URL(architectPage.url());
  expect(stageUrl.pathname).toMatch(/^\/v8\/protocol\/stage\/[^/]+$/);

  // A full load of that deep link (a bookmark, a reload) restores the same
  // screen rather than falling back to the start screen.
  await architectPage.reload();
  await settle(architectPage);
  await expect(architectPage).toHaveURL(stageUrl.href);
  await expect(
    architectPage.getByRole('textbox', { name: 'Page heading' }),
  ).toBeVisible();

  // And back out, to the base itself rather than the origin root.
  await architectPage
    .getByRole('button', { name: 'Return to start screen', exact: true })
    .click();
  await architectPage
    .getByRole('dialog', { name: 'Return to start screen?' })
    .getByRole('button', { name: 'Return to Start Screen' })
    .click();
  await expect(architectPage).toHaveURL(base.href);
  await expect(architectPage.getByText('Deep Link Study')).toBeVisible();

  expect(outside).toEqual([]);
});

test('the preview popup is Architect 8’s own, under /v8/preview/', async ({
  architectPage,
  context,
  seed,
}) => {
  const base = subpathBase();
  const outside = recordRequestsOutsideBase(context, base);

  await seed(informationProtocol('Preview Study'));
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage(STAGE_LABEL);

  // `open()` waits for the stage to render inside the popup, which only
  // happens once the popup's bundle has loaded and the opener handshake
  // delivered the protocol — Architect 9's preview at /preview/ would get
  // neither.
  const preview = await new StagePreview(architectPage).open();
  expect(new URL(preview.url()).pathname).toBe('/v8/preview/');
  await expect(preview.getByText('Thank you for taking part.')).toBeVisible();

  expect(outside).toEqual([]);
});

test('?open= opens that row of the library, and leaves the address bar clean', async ({
  architectPage,
  seed,
}) => {
  const base = subpathBase();
  const id = await seed(informationProtocol('Opened By URL'), {
    id: 'e2e-open-by-url',
  });
  // Start from a tab with nothing open, as a navigation from Architect 9 does.
  await architectPage.evaluate(() => {
    sessionStorage.clear();
  });

  await architectPage.goto(`./?open=${id}`);
  await settle(architectPage);

  await expect(architectPage).toHaveURL(new URL('protocol', base).href);
  await expect(protocolNameField(architectPage)).toHaveValue('Opened By URL');
});

test('?open= with an id the library does not hold opens nothing', async ({
  architectPage,
}) => {
  const base = subpathBase();
  await architectPage.goto('./?open=e2e-no-such-protocol');
  await settle(architectPage);

  // The library's own refusal for a row that is gone.
  await expect(
    architectPage.getByRole('dialog', { name: 'Protocol Not Found' }),
  ).toContainText('This protocol could not be found in your library.');
  await expect(architectPage).toHaveURL(base.href);
  await expect(protocolNameField(architectPage)).toHaveCount(0);
});

test('?import= opens the file Architect 9 staged, and consumes the record', async ({
  architectPage,
}) => {
  const base = subpathBase();
  await architectPage.goto('./');
  await settle(architectPage);
  expect(await readStoreCounts(architectPage)).toEqual({
    protocols: 0,
    assets: 0,
  });

  const key = await stageHandoff(architectPage, {
    targetMajor: 8,
    fileName: 'Staged Study.netcanvas',
    bytes: [...readFileSync(ALL_INTERFACES_NETCANVAS)],
  });
  expect(await readHandoffKeys(architectPage)).toEqual([key]);

  await architectPage.goto(`./?import=${key}`);
  await settle(architectPage);

  // Through Open file's path: the protocol lands in this app's library and
  // opens.
  await expect(architectPage).toHaveURL(new URL('protocol', base).href);
  await expect(protocolNameField(architectPage)).toHaveValue(
    'All Interfaces (e2e)',
  );
  await expect
    .poll(async () => (await readStoreCounts(architectPage)).protocols)
    .toBe(1);
  // Read and deleted in one go, so a reload cannot import it twice.
  expect(await readHandoffKeys(architectPage)).toEqual([]);
});

test('?import= leaves a record staged for Architect 9 alone', async ({
  architectPage,
}) => {
  const base = subpathBase();
  await architectPage.goto('./');
  await settle(architectPage);

  const key = await stageHandoff(architectPage, {
    targetMajor: 9,
    fileName: 'For Architect 9.netcanvas',
    bytes: [...readFileSync(ALL_INTERFACES_NETCANVAS)],
  });

  await architectPage.goto(`./?import=${key}`);
  await settle(architectPage);

  const dialog = architectPage.getByRole('dialog', {
    name: 'Could not open file',
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('The launched file could not be read.');
  await expect(architectPage).toHaveURL(base.href);
  expect(await readStoreCounts(architectPage)).toEqual({
    protocols: 0,
    assets: 0,
  });
  expect(await readHandoffKeys(architectPage)).toEqual([key]);
});

test('the Architect 8 banner sends the open protocol to Architect 9’s upgrade', async ({
  architectPage,
  seed,
}) => {
  const architect9 = await stubArchitect9(architectPage);
  const id = await seed(informationProtocol('Banner Study'));

  // Not on the start screen: the banner belongs to the protocol editor.
  await expect(architectPage.getByText('Banner Study')).toBeVisible();
  await expect(architect8Banner(architectPage)).toHaveCount(0);

  await gotoProtocol(architectPage);
  await expect(architect8Banner(architectPage)).toBeVisible();

  await architectPage
    .getByRole('button', { name: 'Upgrade to schema 9', exact: true })
    .click();
  await expect(architectPage).toHaveURL(
    new URL(`/?upgrade=${id}`, architect9).href,
  );
  await expect(
    architectPage.getByRole('heading', { name: 'Architect 9 stub' }),
  ).toBeVisible();
});

test('the banner goes through the leave-editor prompt when a stage has unsaved changes', async ({
  architectPage,
  seed,
}) => {
  const architect9 = await stubArchitect9(architectPage);
  const id = await seed(informationProtocol('Dirty Banner Study'));
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage(STAGE_LABEL);
  const stageUrl = architectPage.url();

  await architectPage
    .getByRole('textbox', { name: 'Page heading' })
    .fill('Unsaved heading');

  const upgrade = architectPage.getByRole('button', {
    name: 'Upgrade to schema 9',
    exact: true,
  });
  const dialog = architectPage.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });

  // Cancelling stays in the editor, with the draft intact.
  await upgrade.click();
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('dialog-cancel').click();
  await expect(dialog).toBeHidden();
  await expect(architectPage).toHaveURL(stageUrl);
  await expect(
    architectPage.getByRole('textbox', { name: 'Page heading' }),
  ).toHaveValue('Unsaved heading');

  // Confirming the discard is what lets the navigation happen. The prompt
  // names where it goes: Architect 9, not this app's start screen.
  await upgrade.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('If you open Architect 9 now');
  await dialog
    .getByRole('button', { name: 'Discard Changes and Open Architect 9' })
    .click();
  await expect(architectPage).toHaveURL(
    new URL(`/?upgrade=${id}`, architect9).href,
  );
});

test('the library row offers Upgrade to schema 9', async ({
  architectPage,
  seed,
}) => {
  const architect9 = await stubArchitect9(architectPage);
  const id = await seed(informationProtocol('Library Study'), {
    id: 'e2e-library-upgrade',
  });
  await architectPage.evaluate(() => {
    sessionStorage.clear();
  });
  await architectPage.goto('./');
  await settle(architectPage);

  await architectPage
    .getByRole('button', { name: 'Actions for Library Study' })
    .click();
  await architectPage
    .getByRole('menuitem', { name: 'Upgrade to schema 9' })
    .click();

  await expect(architectPage).toHaveURL(
    new URL(`/?upgrade=${id}`, architect9).href,
  );
});
