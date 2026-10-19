import { randomUUID, webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import type { BrowserContext, Page, Request } from '@playwright/test';
import JSZip from 'jszip';

import { expect, test } from '../fixtures/test.js';
import {
  LEAN_E2E_PROTOCOL_NAME,
  LEAN_E2E_PROTOCOL_PATH,
} from '../helpers/protocol-paths.js';

/**
 * Interviewer 8 as Interviewer 9 ships it: built with
 * INTERVIEWER_BASE_PATH=/v8/ and served at /v8/ of the same origin (see
 * playwright.subpath.config.ts). The root suite covers what the app does; this
 * one covers where it lives and the hand-off contract with Interviewer 9 at
 * the origin root:
 *
 * - it unlocks with Interviewer 9's lock (the shared `interviewer:vault`
 *   record) and never sets one up itself: where Interviewer 9 would force
 *   set-up it hands the page over, and in a browser tab it runs without a
 *   lock, as Interviewer 9 does;
 * - `?start=<hash>` opens the new-interview form for that protocol,
 *   `/v8/interview/<id>` resumes an interview, and `?import=<key>` imports
 *   the file Interviewer 9 staged in the shared `InterviewerHandoffDB`;
 * - a protocol made for a newer schema is staged for Interviewer 9 and sent
 *   to its `/?import=<key>`;
 * - the "Interviewer 8, for schema 8 protocols" banner, with its way back to
 *   Interviewer 9, is on Home and the data view and never in an interview.
 *
 * Interviewer 9 itself is not served here. Its root URL is answered by a stub,
 * so a navigation there is observable without depending on what vite preview
 * does outside its base.
 */

// The shared lock, as Interviewer 9 enrols it: `interviewer:vault`, format 4
// (src/lib/vault/vaultStore.ts, pinned on both sides). A PIN record is a DEK
// wrapped with AES-KW under a PBKDF2-SHA-256 key from the PIN
// (src/lib/vault/crypto.ts). Built here with the same WebCrypto calls, so the
// app's unlock proves it reads a lock it did not make itself.
const VAULT_STORAGE_KEY = 'interviewer:vault';
const PIN = '24681357';

async function pinVaultRecord(pin: string): Promise<string> {
  const { subtle } = webcrypto;
  const salt = webcrypto.getRandomValues(new Uint8Array(32));
  const iterations = 600_000;
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  const kek = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey'],
  );
  const dek = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const wrapped = await subtle.wrapKey('raw', dek, kek, 'AES-KW');
  return JSON.stringify({
    version: 4,
    mode: 'pin',
    kdfSaltB64: Buffer.from(salt).toString('base64'),
    kdfIterations: iterations,
    wrappedDekB64: Buffer.from(wrapped).toString('base64'),
  });
}

/** Give every page of the context Interviewer 9's lock, before the app runs. */
async function shareInterviewer9Lock(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ key, record }) => {
      if (window.localStorage.getItem(key) === null) {
        window.localStorage.setItem(key, record);
      }
    },
    { key: VAULT_STORAGE_KEY, record: await pinVaultRecord(PIN) },
  );
}

function subpathBase(): URL {
  const { baseURL } = test.info().project.use;
  if (!baseURL) throw new Error('the sub-path suite needs a baseURL');
  const url = new URL(baseURL);
  // Every assertion below about staying "under the base" means something
  // only while the base is not the origin root.
  expect(url.pathname).toBe('/v8/');
  return url;
}

/** Interviewer 9's root, answered by a stub page so a navigation there lands. */
async function stubInterviewer9(page: Page): Promise<URL> {
  const origin = new URL('/', subpathBase());
  await page.route(
    (url) => url.origin === origin.origin && url.pathname === '/',
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Interviewer 9 stub</title><h1>Interviewer 9 stub</h1>',
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

const banner = (page: Page) =>
  page.getByText('Interviewer 8, for schema 8 protocols');
const protocolHeading = (page: Page) =>
  page.getByRole('heading', { name: LEAN_E2E_PROTOCOL_NAME });

async function unlock(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible(
    { timeout: 15_000 },
  );
  const inputs = page.getByTestId('segmented-code-pin').locator('input');
  for (let i = 0; i < PIN.length; i++) {
    await inputs.nth(i).fill(PIN[i] ?? '');
  }
}

/** Open Home under the base, unlock, and import the lean e2e protocol. */
async function openWithProtocol(page: Page): Promise<string> {
  await page.goto('');
  await unlock(page);
  return importLeanProtocol(page);
}

/** Import the lean e2e protocol from Home, and return its hash. */
async function importLeanProtocol(page: Page): Promise<string> {
  await page
    .getByTestId('protocol-import-input')
    .setInputFiles(LEAN_E2E_PROTOCOL_PATH);
  await expect(protocolHeading(page)).toBeVisible({ timeout: 15_000 });
  // The card shows while the import is still saving; wait for the row.
  await expect
    .poll(() => readStoreKeys(page, 'interviewer', 'protocols'))
    .toHaveLength(1);
  const [hash = ''] = await readStoreKeys(page, 'interviewer', 'protocols');
  return hash;
}

// The hand-off store's contract, as pinned by
// src/lib/handoff/__tests__/handoffStore.contract.test.ts. The app creates
// the database on startup (it prunes stale records), so the helpers below
// only ever open what the app made.
const HANDOFF_DB = 'InterviewerHandoffDB';
const HANDOFF_STORE = 'handoffs';

async function readStoreKeys(
  page: Page,
  dbName: string,
  storeName: string,
): Promise<string[]> {
  const keys: unknown = await page.evaluate(
    async ({ dbName: name, storeName: store }) => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const req = indexedDB.open(name);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      // A versionless open that won the race with Dexie's would create an
      // empty database; wait for the app's own to exist.
      let db = await open();
      const deadline = Date.now() + 10_000;
      while (!db.objectStoreNames.contains(store)) {
        db.close();
        if (Date.now() > deadline) {
          throw new Error(`${name} was never created by the app`);
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        db = await open();
      }
      const result = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = db
          .transaction(store, 'readonly')
          .objectStore(store)
          .getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return result.map(String);
    },
    { dbName, storeName },
  );
  return Array.isArray(keys) ? keys.map(String) : [];
}

/** Stage a file for Interviewer 8, as Interviewer 9 would before navigating. */
async function stageHandoff(
  page: Page,
  record: { targetMajor: 8 | 9; fileName: string; bytes: number[] },
): Promise<string> {
  // Only after the app has created the store (see readStoreKeys).
  await readStoreKeys(page, HANDOFF_DB, HANDOFF_STORE);
  const key = randomUUID();
  await page.evaluate(
    async ({ dbName, storeName, handoffKey, targetMajor, fileName, bytes }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
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
      storeName: HANDOFF_STORE,
      handoffKey: key,
      ...record,
    },
  );
  return key;
}

type StagedRecord = {
  kind: string;
  targetMajor: number;
  fileName: string;
  size: number;
};

async function readHandoff(
  page: Page,
  key: string,
): Promise<StagedRecord | null> {
  return page.evaluate(
    async ({ dbName, storeName, handoffKey }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const row = await new Promise<unknown>((resolve, reject) => {
        const req = db
          .transaction(storeName, 'readonly')
          .objectStore(storeName)
          .get(handoffKey);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (typeof row !== 'object' || row === null) return null;
      const record = row as Record<string, unknown>;
      return {
        kind: String(record.kind),
        targetMajor: Number(record.targetMajor),
        fileName: String(record.fileName),
        size: record.file instanceof Blob ? record.file.size : -1,
      };
    },
    { dbName: HANDOFF_DB, storeName: HANDOFF_STORE, handoffKey: key },
  );
}

/** The lean e2e protocol, rewritten to declare a schema newer than 8. */
async function newerSchemaProtocol(outputPath: string): Promise<number> {
  const zip = await JSZip.loadAsync(readFileSync(LEAN_E2E_PROTOCOL_PATH));
  const entry = zip.file('protocol.json');
  if (!entry) throw new Error('the e2e protocol has no protocol.json');
  const protocol = JSON.parse(await entry.async('string')) as Record<
    string,
    unknown
  >;
  expect(protocol.schemaVersion).toBe(8);
  zip.file('protocol.json', JSON.stringify({ ...protocol, schemaVersion: 9 }));
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  writeFileSync(outputPath, bytes);
  return bytes.length;
}

test.beforeEach(async ({ context }) => {
  await shareInterviewer9Lock(context);
});

test('boots under /v8/ with Interviewer 9’s lock, keeps every request under it, and names itself', async ({
  page,
  context,
}) => {
  const base = subpathBase();
  const outside = recordRequestsOutsideBase(context, base);
  const interviewer9 = await stubInterviewer9(page);

  await openWithProtocol(page);
  await expect(page).toHaveURL(base.href);
  await expect(banner(page)).toBeVisible();

  // The data view is a route under the base, and carries the banner too.
  await page.goto('data');
  await expect(page).toHaveURL(new URL('data', base).href);
  await unlock(page);
  await expect(banner(page)).toBeVisible();

  // Every request so far stayed under the base: Interviewer 8 never loads,
  // or navigates to, anything of Interviewer 9's on its own.
  expect(outside).toEqual([]);

  // "Back to Interviewer" is the way back to Interviewer 9, by a full-page
  // navigation to the origin root.
  await page.getByRole('button', { name: 'Back to Interviewer' }).click();
  await expect(page).toHaveURL(interviewer9.href);
  await expect(
    page.getByRole('heading', { name: 'Interviewer 9 stub' }),
  ).toBeVisible();
});

test('installed with no lock set up, hands the page to Interviewer 9, which owns set-up', async ({
  browser,
}) => {
  // A context without the shared lock: nothing configured yet. The page
  // reports itself as an installed app (iOS's flag, which isRunningInstalled
  // reads alongside the display-mode query), where Interviewer 9 forces set-up.
  const context = await browser.newContext({
    baseURL: subpathBase().href,
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
  });
  const page = await context.newPage();
  const interviewer9 = await stubInterviewer9(page);
  await page.goto('');
  await expect(page).toHaveURL(interviewer9.href, { timeout: 15_000 });
  // Replaced, not pushed: Back must not return to a page that only sends the
  // researcher on again, but to where they were before it.
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
  await context.close();
});

test('in a browser tab with no lock set up, runs without one as Interviewer 9 does, so ?start= reaches the form', async ({
  browser,
}) => {
  // Interviewer 9 runs without a lock in a browser tab and offers its schema
  // 8 protocols from there: each of its ways in must open here, not bounce
  // back to it.
  const base = subpathBase();
  const context = await browser.newContext({
    baseURL: base.href,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const outside = recordRequestsOutsideBase(context, base);
  await page.goto('');
  await expect(banner(page)).toBeVisible({ timeout: 15_000 });
  const hash = await importLeanProtocol(page);

  await page.goto(`?start=${encodeURIComponent(hash)}`);
  await expect(page.getByTestId('new-session-case-id')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(base.href);
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toHaveCount(
    0,
  );
  expect(outside).toEqual([]);
  await context.close();
});

test('?start= opens the new-interview form for that protocol, and the interview starts without asking to unlock again', async ({
  page,
  interviewNav,
}) => {
  const base = subpathBase();
  const hash = await openWithProtocol(page);

  await page.goto(`?start=${encodeURIComponent(hash)}`);
  await unlock(page);
  // The request is stripped from the address bar once read.
  await expect(page).toHaveURL(base.href);
  const caseId = page.getByTestId('new-session-case-id');
  await expect(caseId).toBeVisible({ timeout: 15_000 });
  // On that protocol's card.
  await expect(protocolHeading(page)).toBeVisible();

  await caseId.fill('V8-START');
  await page.getByTestId('new-session-submit').click();
  // Unlocked a moment ago on a page Interviewer 9 opened: no second unlock
  // before the interview (the next test shows the step is otherwise there).
  await expect(page).toHaveURL(
    new RegExp(`^${base.href.replaceAll('/', '\\/')}interview\\/[^/]+$`),
    { timeout: 15_000 },
  );
  await interviewNav.waitForStage();
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toHaveCount(0);
  // Never during an interview.
  await expect(banner(page)).toHaveCount(0);
});

test('starting from Home itself still asks to unlock before the interview', async ({
  page,
  interviewNav,
}) => {
  await openWithProtocol(page);
  await page.getByRole('button', { name: 'Start new interview' }).click();
  await page.getByTestId('new-session-case-id').fill('V8-HOME');
  await page.getByTestId('new-session-submit').click();
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toBeVisible({ timeout: 15_000 });
  const inputs = page.getByTestId('segmented-code-pin').locator('input');
  for (let i = 0; i < PIN.length; i++) {
    await inputs.nth(i).fill(PIN[i] ?? '');
  }
  await interviewNav.waitForStage();
});

test('/v8/interview/<id> resumes the interview at the stage it reached', async ({
  page,
  interviewNav,
}) => {
  const base = subpathBase();
  const hash = await openWithProtocol(page);
  await page.goto(`?start=${encodeURIComponent(hash)}`);
  await unlock(page);
  await page.getByTestId('new-session-case-id').fill('V8-RESUME');
  await page.getByTestId('new-session-submit').click();
  await interviewNav.waitForStage();
  await interviewNav.next();
  const stage = page.locator('[data-stage-step]');
  const stepReached = await stage.getAttribute('data-stage-step');
  expect(stepReached).not.toBe('0');
  const interviewUrl = page.url();
  const sessionId = /\/interview\/([^/?#]+)$/.exec(interviewUrl)?.[1] ?? '';
  expect(sessionId).not.toBe('');

  // The step is persisted fire-and-forget; wait for it before leaving.
  await expect
    .poll(
      () =>
        page.evaluate(
          (id) =>
            new Promise<number | null>((resolve) => {
              const req = indexedDB.open('interviewer');
              req.onsuccess = () => {
                const get = req.result
                  .transaction('sessions', 'readonly')
                  .objectStore('sessions')
                  .get(id);
                get.onsuccess = () =>
                  resolve(
                    (get.result as { currentStep?: number } | undefined)
                      ?.currentStep ?? null,
                  );
                get.onerror = () => resolve(null);
              };
              req.onerror = () => resolve(null);
            }),
          sessionId,
        ),
      { timeout: 10_000 },
    )
    .toBe(Number(stepReached));

  // What Interviewer 9's resume link does: a fresh page at the interview's
  // address under the base. The key never left the old page, so it unlocks
  // again, then lands straight in the interview.
  await page.goto('about:blank');
  await page.goto(`interview/${sessionId}`);
  await unlock(page);
  await interviewNav.waitForStage();
  await expect(page).toHaveURL(new URL(`interview/${sessionId}`, base).href);
  await expect(stage).toHaveAttribute('data-stage-step', stepReached ?? '');
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toHaveCount(0);
  await expect(banner(page)).toHaveCount(0);
});

test('?import= imports the file Interviewer 9 staged, and takes the record', async ({
  page,
}) => {
  const base = subpathBase();
  await page.goto('');
  await unlock(page);
  await expect(banner(page)).toBeVisible();
  const bytes = [...readFileSync(LEAN_E2E_PROTOCOL_PATH)];

  // A record staged for Interviewer 9 is not this app's to take.
  const foreignKey = await stageHandoff(page, {
    targetMajor: 9,
    fileName: 'for-interviewer-9.netcanvas',
    bytes,
  });
  const key = await stageHandoff(page, {
    targetMajor: 8,
    fileName: 'interviewer-e2e.netcanvas',
    bytes,
  });

  await page.goto(`?import=${key}`);
  await unlock(page);
  await expect(protocolHeading(page)).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(base.href);
  await expect
    .poll(() => readStoreKeys(page, HANDOFF_DB, HANDOFF_STORE))
    .toEqual([foreignKey]);
  await expect
    .poll(() => readStoreKeys(page, 'interviewer', 'protocols'))
    .toHaveLength(1);

  // The foreign record imports nothing and stays for its owner.
  await page.goto(`?import=${foreignKey}`);
  await unlock(page);
  await expect(page.getByText('Could not open file')).toBeVisible({
    timeout: 15_000,
  });
  expect(await readStoreKeys(page, HANDOFF_DB, HANDOFF_STORE)).toEqual([
    foreignKey,
  ]);
  expect(await readStoreKeys(page, 'interviewer', 'protocols')).toHaveLength(1);
});

test('a protocol made for a newer schema is staged for Interviewer 9 and sent to its ?import=', async ({
  page,
}, testInfo) => {
  const interviewer9 = await stubInterviewer9(page);
  const file = testInfo.outputPath('newer-schema.netcanvas');
  const size = await newerSchemaProtocol(file);

  await page.goto('');
  await unlock(page);
  await page.getByTestId('protocol-import-input').setInputFiles(file);

  await expect(page).toHaveURL(
    new RegExp(
      `^${interviewer9.href.replaceAll('/', '\\/')}\\?import=[0-9a-f-]{36}$`,
    ),
    { timeout: 15_000 },
  );
  const key = new URL(page.url()).searchParams.get('import') ?? '';
  expect(await readHandoff(page, key)).toEqual({
    kind: 'import',
    targetMajor: 9,
    fileName: 'newer-schema.netcanvas',
    size,
  });
  // Nothing was imported here.
  expect(await readStoreKeys(page, 'interviewer', 'protocols')).toEqual([]);
});
