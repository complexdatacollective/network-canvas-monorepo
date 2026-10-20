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
 * root suite covers what the editor does; this one covers where it lives and
 * how it fits inside Architect 9 at the origin root:
 *
 * - every request and every in-app route stays under /v8/, deep links
 *   included, and the preview popup is Architect 8's own;
 * - `?open=<id>` opens a row of this app's library, `?import=<key>` the file
 *   Architect 9 staged in the shared `ArchitectHandoffDB`;
 * - it has no start screen of its own: with nothing to open, or once the
 *   editor closes, the tab goes back to Architect 9's.
 *
 * Architect 9 itself is not served here. Its root URL is answered by a stub,
 * so a navigation there is observable without depending on what vite preview
 * does outside its base, and the specs seed storage from that stub.
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
// IndexedDB version 10. Architect 9 creates it before staging anything; the
// stub cannot, so `stageHandoff` creates it as Dexie would.
const HANDOFF_DB = 'ArchitectHandoffDB';
const HANDOFF_DB_VERSION = 10;
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

const ARCHITECT_9_STUB_HEADING = 'Architect 9 stub';

/** Architect 9's root answered by a stub page, so a navigation there lands. */
async function stubArchitect9(page: Page): Promise<void> {
  const origin = new URL('/', subpathBase());
  await page.route(
    (url) => url.origin === origin.origin && url.pathname === '/',
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><title>${ARCHITECT_9_STUB_HEADING}</title><h1>${ARCHITECT_9_STUB_HEADING}</h1>`,
      }),
  );
}

const architect9Stub = (page: Page) =>
  page.getByRole('heading', { name: ARCHITECT_9_STUB_HEADING });

/** Seed from Architect 9's root, as /v8/'s own root never stays put. */
const SEED_AT = '/';

test.beforeEach(async ({ architectPage }) => {
  await stubArchitect9(architectPage);
});

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
    async ({
      dbName,
      dbVersion,
      storeName,
      handoffKey,
      targetMajor,
      fileName,
      bytes,
    }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, dbVersion);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName)) {
            req.result
              .createObjectStore(storeName, { keyPath: 'key' })
              .createIndex('createdAt', 'createdAt');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
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
      dbVersion: HANDOFF_DB_VERSION,
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

const returnToStartScreen = (page: Page) =>
  page.getByRole('button', { name: 'Return to start screen', exact: true });

test('boots under /v8/, keeps every route and request under it, and honours deep links', async ({
  architectPage,
  context,
  seed,
}) => {
  const base = subpathBase();
  await seed(informationProtocol('Deep Link Study'), { at: SEED_AT });
  const outside = recordRequestsOutsideBase(context, base);

  await gotoProtocol(architectPage);
  await expect(architectPage).toHaveURL(new URL('protocol', base).href);
  await expect(protocolNameField(architectPage)).toHaveValue('Deep Link Study');

  // In-app navigation goes through wouter's <Router base>.
  await new Timeline(architectPage).openStage(STAGE_LABEL);
  const stageUrl = new URL(architectPage.url());
  expect(stageUrl.pathname).toMatch(/^\/v8\/protocol\/stage\/[^/]+$/);

  // A full load of that deep link (a bookmark, a reload) restores the same
  // screen rather than leaving the editor.
  await architectPage.reload();
  await settle(architectPage);
  await expect(architectPage).toHaveURL(stageUrl.href);
  await expect(
    architectPage.getByRole('textbox', { name: 'Page heading' }),
  ).toBeVisible();

  expect(outside).toEqual([]);
});

test('the preview popup is Architect 8’s own, under /v8/preview/', async ({
  architectPage,
  context,
  seed,
}) => {
  const base = subpathBase();
  await seed(informationProtocol('Preview Study'), { at: SEED_AT });
  const outside = recordRequestsOutsideBase(context, base);

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

test('/v8/ with nothing to open goes back to Architect 9, in place of itself', async ({
  architectPage,
}) => {
  subpathBase();
  // An entry of Architect 9's own to come back to.
  await architectPage.goto('/?came-from=architect-9');

  await architectPage.goto('./');
  await expect(architectPage).toHaveURL(new URL('/', architectPage.url()).href);
  await expect(architect9Stub(architectPage)).toBeVisible();

  // Replaced rather than pushed: Back skips the empty /v8/ page, which would
  // only send the tab forward again.
  await architectPage.goBack();
  await expect(architectPage).toHaveURL(/\/\?came-from=architect-9$/);
});

test('closing a saved editor goes back to Architect 9 without asking', async ({
  architectPage,
  seed,
}) => {
  await seed(informationProtocol('Saved Study'), { at: SEED_AT });
  await gotoProtocol(architectPage);
  await expect(protocolNameField(architectPage)).toHaveValue('Saved Study');

  await returnToStartScreen(architectPage).click();
  await expect(architect9Stub(architectPage)).toBeVisible();
  expect(new URL(architectPage.url()).pathname).toBe('/');
});

test('closing an editor with unsaved changes asks first, in Architect 9’s words', async ({
  architectPage,
  seed,
}) => {
  await seed(informationProtocol('Dirty Study'), { at: SEED_AT });
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage(STAGE_LABEL);
  const stageUrl = architectPage.url();

  await architectPage
    .getByRole('textbox', { name: 'Page heading' })
    .fill('Unsaved heading');

  const dialog = architectPage.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });

  // Cancelling stays in the editor, with the draft intact.
  await returnToStartScreen(architectPage).click();
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('dialog-cancel').click();
  await expect(dialog).toBeHidden();
  await expect(architectPage).toHaveURL(stageUrl);
  await expect(
    architectPage.getByRole('textbox', { name: 'Page heading' }),
  ).toHaveValue('Unsaved heading');

  // The prompt names where the tab goes: Architect 9, not a start screen of
  // this app's own.
  await returnToStartScreen(architectPage).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('If you open Architect 9 now');
  await dialog
    .getByRole('button', { name: 'Discard Changes and Open Architect 9' })
    .click();
  await expect(architect9Stub(architectPage)).toBeVisible();
  expect(new URL(architectPage.url()).pathname).toBe('/');
});

test('?open= opens that row of the library, and leaves the address bar clean', async ({
  architectPage,
  seed,
}) => {
  const base = subpathBase();
  const id = await seed(informationProtocol('Opened By URL'), {
    id: 'e2e-open-by-url',
    at: SEED_AT,
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

test('closing an editor ?open= opened leaves no /v8/ page behind in history', async ({
  architectPage,
  seed,
}) => {
  const id = await seed(informationProtocol('Round Trip Study'), {
    id: 'e2e-round-trip',
    at: SEED_AT,
  });
  await architectPage.evaluate(() => {
    sessionStorage.clear();
  });
  // Architect 9's own entry, as the page that sent the protocol here.
  await architectPage.goto('/?came-from=architect-9');

  await architectPage.goto(`./?open=${id}`);
  await settle(architectPage);
  await expect(protocolNameField(architectPage)).toHaveValue(
    'Round Trip Study',
  );
  // A step inside the editor, so the session spans several entries.
  await new Timeline(architectPage).openStage(STAGE_LABEL);

  await returnToStartScreen(architectPage).click();
  await expect(architect9Stub(architectPage)).toBeVisible();
  expect(new URL(architectPage.url()).search).toBe('');

  // Back leaves the hand-off for the page that started it, rather than
  // landing on an empty /v8/ page that would only send the tab forward again.
  await architectPage.goBack();
  await expect(architectPage).toHaveURL(/\/\?came-from=architect-9$/);
});

test('?open= with an id the library does not hold says so, then goes back to Architect 9', async ({
  architectPage,
}) => {
  const base = subpathBase();
  await architectPage.goto('./?open=e2e-no-such-protocol');
  await settle(architectPage);

  // The library's own refusal for a row that is gone, shown before the tab
  // leaves.
  const dialog = architectPage.getByRole('dialog', {
    name: 'Protocol Not Found',
  });
  await expect(dialog).toContainText(
    'This protocol could not be found in your library.',
  );
  await expect(architectPage).toHaveURL(base.href);
  await expect(protocolNameField(architectPage)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(architect9Stub(architectPage)).toBeVisible();
});

test('?import= opens the file Architect 9 staged, and consumes the record', async ({
  architectPage,
}) => {
  const base = subpathBase();
  await architectPage.goto(SEED_AT);

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
  await architectPage.goto(SEED_AT);

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

  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(architect9Stub(architectPage)).toBeVisible();
});
