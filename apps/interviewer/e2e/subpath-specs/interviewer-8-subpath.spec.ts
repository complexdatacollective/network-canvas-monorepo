import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type {
  BrowserContext,
  Frame,
  FrameLocator,
  Page,
  Request,
} from '@playwright/test';
import JSZip from 'jszip';

import { expect, test } from '../fixtures/test.js';
import { LEAN_E2E_PROTOCOL_PATH } from '../helpers/protocol-paths.js';

/**
 * Interviewer 8 as Interviewer 9 ships it: built with
 * INTERVIEWER_BASE_PATH=/v8/ and served at /v8/ of the same origin (see
 * playwright.subpath.config.ts). The root suite covers what the app does; this
 * one covers where it lives, beside Interviewer 9 at the origin root. There it
 * is the interview alone:
 *
 * - both apps use one IndexedDB database, `interviewer`, which Interviewer 9
 *   owns: it has upgraded it past Interviewer 8's version, with a table and an
 *   index of its own, and writes schema 8 protocols and sessions in
 *   Interviewer 8's row format. The specs seed it the same way;
 * - Interviewer 9 hosts each schema 8 interview at its own `/interview/<id>`
 *   by framing `/v8/interview/<id>` (`?mode=review` to review one), and hands
 *   the lock's key over by postMessage (src/lib/interviewer9Embed.ts), so the
 *   researcher unlocks once, in Interviewer 9. Interviewer 8 writes nothing
 *   but that session's row, and reads the lock rules from Interviewer 9's
 *   settings row;
 * - it unlocks with Interviewer 9's lock (the shared `interviewer:vault`
 *   record) when the key does not come, and never sets one up itself;
 * - framed, every way out of an interview, an interview it cannot run, and
 *   every other address end it with 'interviewer8:closed' and nothing else,
 *   leaving nothing in history; loaded at the top level, an interview's
 *   address is replaced with Interviewer 9's for it, and every other address
 *   with Interviewer 9's home, at once, before any lock screen.
 *
 * Interviewer 9 itself is not served here. Its root and its /interview/<id>
 * route are answered by a stub page, from which the specs write its data and
 * which performs Interviewer 9's side of the handshake, as Interviewer 9
 * would.
 */

// The shared lock, as Interviewer 9 enrols it: `interviewer:vault`, format 4
// (src/lib/vault/vaultStore.ts, pinned on both sides). A PIN record is a DEK
// wrapped with AES-KW under a PBKDF2-SHA-256 key from the PIN
// (src/lib/vault/crypto.ts). Built here with the same WebCrypto calls, so the
// app's unlock proves it reads a lock it did not make itself. The DEK is kept
// to encrypt the seeded rows as Interviewer 9 would.
const VAULT_STORAGE_KEY = 'interviewer:vault';
const PIN = '24681357';

type DataKey = webcrypto.CryptoKey;
type Lock = { record: string; dek: DataKey };

async function makePinLock(pin: string): Promise<Lock> {
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
  const record = JSON.stringify({
    version: 4,
    mode: 'pin',
    kdfSaltB64: Buffer.from(salt).toString('base64'),
    kdfIterations: iterations,
    wrappedDekB64: Buffer.from(wrapped).toString('base64'),
  });
  return { record, dek };
}

/** Give every page of the context Interviewer 9's lock, before the app runs. */
async function shareInterviewer9Lock(
  context: BrowserContext,
  lock: Lock,
): Promise<void> {
  await context.addInitScript(
    ({ key, record }) => {
      if (window.localStorage.getItem(key) === null) {
        window.localStorage.setItem(key, record);
      }
    },
    { key: VAULT_STORAGE_KEY, record: lock.record },
  );
}

// Interviewer 8's field encryption (src/lib/vault/crypto.ts `encryptJson`):
// AES-GCM, a 12-byte IV, the JSON text as plaintext, and the row's AAD string.
async function encryptJson(value: unknown, dek: DataKey, aad: string) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    dek,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return {
    iv: Buffer.from(iv).toString('base64'),
    ct: Buffer.from(new Uint8Array(ct)).toString('base64'),
  };
}

const leanProtocolDocument = async (): Promise<Record<string, unknown>> => {
  const zip = await JSZip.loadAsync(readFileSync(LEAN_E2E_PROTOCOL_PATH));
  const entry = zip.file('protocol.json');
  if (!entry) throw new Error('the e2e protocol has no protocol.json');
  const document: unknown = JSON.parse(await entry.async('string'));
  if (typeof document !== 'object' || document === null) {
    throw new Error('the e2e protocol.json is not an object');
  }
  expect(document).toHaveProperty('schemaVersion', 8);
  return { ...document };
};

const SCHEMA_8_HASH = 'e2e-schema-8-protocol';
const SCHEMA_9_HASH = 'e2e-schema-9-protocol';
const SESSION_8 = 'session-schema-8';
const SESSION_8_OTHER = 'session-schema-8-other';
const SESSION_9 = 'session-schema-9';

type Row = Record<string, unknown>;

/**
 * A protocol row and a session row, as Interviewer 8 writes them
 * (src/lib/db/protocols.ts saveProtocol, sessions.ts createSession,
 * recordCrypto.ts): plaintext index fields, and with a lock the protocol
 * document and codebook (AAD `protocols:<hash>`) and the network (AAD
 * `sessions:<id>`) in `_enc`.
 */
async function protocolRow(
  hash: string,
  schemaVersion: number,
  dek: DataKey | null,
): Promise<Row> {
  const document: Record<string, unknown> = {
    ...(await leanProtocolDocument()),
    schemaVersion,
  };
  const codebook = document.codebook;
  const row: Row = {
    id: hash,
    hash,
    name: `Schema ${schemaVersion} study`,
    schemaVersion,
    lastModified: document.lastModified,
    importedAt: '2026-10-01T00:00:00.000Z',
    description: document.description,
  };
  if (!dek) return { ...row, protocol: document, codebook };
  const aad = `protocols:${hash}`;
  return {
    ...row,
    _enc: {
      protocol: await encryptJson(document, dek, aad),
      codebook: await encryptJson(codebook, dek, aad),
    },
  };
}

async function sessionRow(
  id: string,
  protocolHash: string,
  dek: DataKey | null,
  { currentStep = 0 }: { currentStep?: number } = {},
): Promise<Row> {
  const network = {
    nodes: [],
    edges: [],
    ego: { _uid: `ego-${id}`, attributes: {} },
  };
  const row: Row = {
    id,
    protocolHash,
    protocolName: 'Study',
    caseId: `CASE-${id}`,
    startedAt: '2026-10-01T00:00:00.000Z',
    lastUpdatedAt: '2026-10-01T00:00:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep,
    isSynthetic: false,
  };
  if (!dek) return { ...row, network };
  return {
    ...row,
    _enc: { network: await encryptJson(network, dek, `sessions:${id}`) },
  };
}

/** Interviewer 9's settings row, by the field names both apps read. */
const interviewer9Settings = (rules: Row = {}): Row => ({
  id: 'device',
  exportGraphML: true,
  exportCSV: true,
  useScreenLayoutCoordinates: false,
  screenLayoutHeight: 1080,
  screenLayoutWidth: 1920,
  dismissedUpdates: [],
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
  sampleProtocolDismissed: false,
  analyticsEnabled: false,
  allowStageNavigation: true,
  lastActiveSessionId: SESSION_8_OTHER,
  ...rules,
});

// Interviewer 9's database: Interviewer 8's tables and indexes (Dexie version
// 3, native 30), upgraded by Interviewer 9 to a higher version with a table
// and a sessions index of its own.
const DB_NAME = 'interviewer';
const INTERVIEWER_9_NATIVE_VERSION = 50;

type Seed = { stores: Record<string, Row[]> };

async function seedInterviewer9Database(page: Page, seed: Seed) {
  await page.evaluate(
    async ({ name, version, stores }) => {
      const schema: Record<string, { key: string; indexes: string[] }> = {
        protocols: { key: 'id', indexes: ['hash', 'name', 'importedAt'] },
        sessions: {
          key: 'id',
          indexes: [
            'protocolHash',
            'caseId',
            'startedAt',
            'lastUpdatedAt',
            'finishedAt',
            'exportedAt',
            'isSynthetic',
            'interviewer9Index',
          ],
        },
        assets: { key: 'id', indexes: ['protocolHash', 'assetId'] },
        settings: { key: 'id', indexes: [] },
        protocolMigrations: { key: 'previousHash', indexes: [] },
        interviewer9Only: { key: 'id', indexes: [] },
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => {
          for (const [store, { key, indexes }] of Object.entries(schema)) {
            const created = request.result.createObjectStore(store, {
              keyPath: key,
            });
            for (const index of indexes) created.createIndex(index, index);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(Object.keys(stores), 'readwrite');
        for (const [store, rows] of Object.entries(stores)) {
          for (const row of rows) tx.objectStore(store).put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    {
      name: DB_NAME,
      version: INTERVIEWER_9_NATIVE_VERSION,
      stores: seed.stores,
    },
  );
}

/** Interviewer 9's data on a device with a PIN, or without a lock. */
async function interviewer9Data(
  dek: DataKey | null,
  {
    settings = interviewer9Settings(),
    currentStep = 0,
  }: { settings?: Row; currentStep?: number } = {},
): Promise<Seed> {
  return {
    stores: {
      protocols: [
        await protocolRow(SCHEMA_8_HASH, 8, dek),
        await protocolRow(SCHEMA_9_HASH, 9, dek),
      ],
      sessions: [
        await sessionRow(SESSION_8, SCHEMA_8_HASH, dek, { currentStep }),
        await sessionRow(SESSION_8_OTHER, SCHEMA_8_HASH, dek),
        await sessionRow(SESSION_9, SCHEMA_9_HASH, dek),
      ],
      settings: [settings],
      interviewer9Only: [{ id: 'kept', note: 'Interviewer 9 only' }],
    },
  };
}

type Dump = {
  version: number;
  schema: Record<string, string[]>;
  stores: Record<string, Row[]>;
};

/** Everything in the shared database, read raw, without creating it. */
async function dumpDatabase(page: Page): Promise<Dump | null> {
  return page.evaluate(async (name) => {
    const known = await indexedDB.databases();
    if (!known.some((entry) => entry.name === name)) return null;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = [...db.objectStoreNames];
    const tx = db.transaction(names, 'readonly');
    const schema: Record<string, string[]> = {};
    const stores: Record<string, Row[]> = {};
    for (const store of names) {
      const objectStore = tx.objectStore(store);
      schema[store] = [...objectStore.indexNames].toSorted();
      stores[store] = await new Promise<Row[]>((resolve, reject) => {
        const request = objectStore.getAll();
        request.onsuccess = () => resolve(request.result as Row[]);
        request.onerror = () => reject(request.error);
      });
    }
    const { version } = db;
    db.close();
    return { version, schema, stores };
  }, DB_NAME);
}

/** The dump, without one session's row. */
const withoutSession = (dump: Dump | null, sessionId: string) =>
  dump && {
    ...dump,
    stores: {
      ...dump.stores,
      sessions: dump.stores.sessions?.filter((row) => row.id !== sessionId),
    },
  };

const sessionInDump = (dump: Dump | null, sessionId: string) =>
  dump?.stores.sessions?.find((row) => row.id === sessionId);

function subpathBase(): URL {
  const { baseURL } = test.info().project.use;
  if (!baseURL) throw new Error('the sub-path suite needs a baseURL');
  const url = new URL(baseURL);
  // Every assertion below about staying "under the base" means something
  // only while the base is not the origin root.
  expect(url.pathname).toBe('/v8/');
  return url;
}

/**
 * How the stub Interviewer 9 hosts an interview (see interviewer9Embed.ts for
 * the contract): which PIN it unlocked with, so it can unwrap the shared
 * lock's key as Interviewer 9 does; whether it replies to 'ready' at all; and
 * whether it says the enter step is already satisfied.
 */
type HostConfig = {
  pin: string | null;
  reply: boolean;
  enterAuthorized: boolean;
  /** What to frame instead of /v8/<this page's own path and search>. */
  frameSrc?: string;
};

const DEFAULT_HOST: HostConfig = {
  pin: PIN,
  reply: true,
  enterAuthorized: true,
};

// Interviewer 9's side of the handshake, run by the stub at its /interview/<id>
// route: frame /v8/interview/<id> full-viewport, unwrap the lock's key from
// the shared vault record with the PIN (PBKDF2-SHA-256 → AES-KW, the DEK
// unwrapped non-extractable, as src/lib/vault/crypto.ts unwrapDek does), and
// answer 'ready' with it. Every message from the frame is recorded; on
// 'closed' the frame is removed, as Interviewer 9 would.
const HOST_SCRIPT = String.raw`
  const config = window.__interviewer9Host;
  const received = (window.__interviewer9Received = []);
  const bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  async function sessionKey() {
    const raw = localStorage.getItem('interviewer:vault');
    if (!raw || config.pin === null) return null;
    const record = JSON.parse(raw);
    if (record.mode !== 'pin') return null;
    const material = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(config.pin), { name: 'PBKDF2' }, false, ['deriveKey']);
    const kek = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: bytes(record.kdfSaltB64), iterations: record.kdfIterations, hash: 'SHA-256' },
      material, { name: 'AES-KW', length: 256 }, false, ['unwrapKey']);
    return crypto.subtle.unwrapKey(
      'raw', bytes(record.wrappedDekB64), kek, 'AES-KW',
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  if (location.pathname.startsWith('/interview/')) {
    const keyReady = sessionKey();
    const frame = document.createElement('iframe');
    frame.title = 'Interviewer 8';
    frame.src = config.frameSrc ?? '/v8' + location.pathname + location.search;
    window.addEventListener('message', async (event) => {
      if (event.source !== frame.contentWindow) return;
      if (event.origin !== location.origin) return;
      received.push(event.data);
      if (event.data?.type === 'interviewer8:ready' && config.reply) {
        frame.contentWindow.postMessage(
          { type: 'interviewer9:unlock', key: await keyReady, enterAuthorized: config.enterAuthorized },
          location.origin);
      }
      if (event.data?.type === 'interviewer8:closed') frame.remove();
    });
    document.body.append(frame);
  }
`;

const HOST_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Interviewer 9 stub</title>
<style>
  html, body { margin: 0; height: 100%; }
  iframe { position: fixed; inset: 0; width: 100%; height: 100%; border: 0; }
</style>
<h1>Interviewer 9 stub</h1>
<script>${HOST_SCRIPT}</script>`;

/**
 * Interviewer 9's root and its /interview/<id> route, answered by the stub
 * host, so navigations there land and an interview there is framed.
 */
async function stubInterviewer9(
  page: Page,
  host: Partial<HostConfig> = {},
): Promise<URL> {
  const origin = new URL('/', subpathBase());
  const config: HostConfig = { ...DEFAULT_HOST, ...host };
  await page.addInitScript((value) => {
    (
      window as unknown as { __interviewer9Host: HostConfig }
    ).__interviewer9Host = value;
  }, config);
  await page.route(
    (url) =>
      url.origin === origin.origin &&
      (url.pathname === '/' || url.pathname.startsWith('/interview/')),
    (route) => route.fulfill({ contentType: 'text/html', body: HOST_PAGE }),
  );
  return origin;
}

const interviewer9Heading = (page: Page) =>
  page.getByRole('heading', { name: 'Interviewer 9 stub' });

const interviewer8Frame = (page: Page): FrameLocator =>
  page.frameLocator('iframe[title="Interviewer 8"]');

/** Interviewer 9's own address for an interview. */
const interviewer9Interview = (interviewer9: URL, sessionId: string) =>
  new URL(`interview/${sessionId}`, interviewer9);

/** What the framed Interviewer 8 has posted to Interviewer 9, in order. */
const postedToInterviewer9 = (page: Page): Promise<unknown[]> =>
  page.evaluate(
    () =>
      (window as unknown as { __interviewer9Received?: unknown[] })
        .__interviewer9Received ?? [],
  );

const READY = { type: 'interviewer8:ready' };
const CLOSED = { type: 'interviewer8:closed' };

/** The frame said 'closed', and nothing else after 'ready', and is gone. */
async function expectClosed(page: Page): Promise<void> {
  await expect
    .poll(() => postedToInterviewer9(page), { timeout: 20_000 })
    .toEqual([READY, CLOSED]);
  await expect(page.locator('iframe')).toHaveCount(0);
}

/** Open Interviewer 9's stub, from where its data is written. */
async function openInterviewer9(
  page: Page,
  host: Partial<HostConfig> = {},
): Promise<URL> {
  const interviewer9 = await stubInterviewer9(page, host);
  await page.goto(interviewer9.href);
  await expect(interviewer9Heading(page)).toBeVisible();
  return interviewer9;
}

async function expectBackInInterviewer9(
  page: Page,
  interviewer9: URL,
): Promise<void> {
  await expect(page).toHaveURL(interviewer9.href, { timeout: 20_000 });
  await expect(interviewer9Heading(page)).toBeVisible();
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

/**
 * Every Interviewer 8 screen that ever rendered in a document under the base
 * (the frame, or a top-level page), however briefly: its lock screen, the
 * enter step's identity check, Home (the protocol deck), onboarding, or the
 * interview itself.
 */
async function recordScreensShown(context: BrowserContext): Promise<string[]> {
  const shown: string[] = [];
  await context.exposeBinding('reportInterviewer8Screen', (_, name: string) => {
    if (!shown.includes(name)) shown.push(name);
  });
  await context.addInitScript(() => {
    if (!window.location.pathname.startsWith('/v8/')) return;
    const report = (name: string) =>
      (
        window as unknown as {
          reportInterviewer8Screen: (screen: string) => void;
        }
      ).reportInterviewer8Screen(name);
    const look = () => {
      const text = document.body?.innerText ?? '';
      if (text.includes('Welcome back')) report('lock screen');
      if (text.includes('Confirm your identity')) report('identity check');
      if (document.querySelector('[data-testid="protocol-import-input"]')) {
        report('Home');
      }
      if (text.includes('Welcome to Network Canvas Interviewer')) {
        report('onboarding');
      }
      if (document.querySelector('[data-stage-step]')) report('interview');
    };
    new MutationObserver(look).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  return shown;
}

async function typePin(root: FrameLocator): Promise<void> {
  const inputs = root.getByTestId('segmented-code-pin').locator('input');
  for (let i = 0; i < PIN.length; i++) {
    await inputs.nth(i).fill(PIN[i] ?? '');
  }
}

const lockScreen = (root: FrameLocator) =>
  root.getByRole('heading', { name: 'Welcome back' });

const confirmIdentity = (root: FrameLocator) =>
  root.getByRole('heading', { name: 'Confirm your identity' });

/** A context with Interviewer 9's PIN lock and its data, on its stub page. */
async function lockedDevice(
  page: Page,
  context: BrowserContext,
  {
    host = {},
    ...options
  }: { settings?: Row; currentStep?: number; host?: Partial<HostConfig> } = {},
) {
  const lock = await makePinLock(PIN);
  await shareInterviewer9Lock(context, lock);
  const interviewer9 = await openInterviewer9(page, host);
  await seedInterviewer9Database(
    page,
    await interviewer9Data(lock.dek, options),
  );
  return { interviewer9, seeded: await dumpDatabase(page) };
}

/**
 * Open an interview the way Interviewer 9 does: its own /interview/<id>,
 * which frames Interviewer 8. Starts from a blank page, so a check of Back
 * afterwards can tell whether anything was left in history.
 */
async function hostInterview(
  page: Page,
  interviewer9: URL,
  sessionId: string,
  search = '',
): Promise<FrameLocator> {
  await page.goto('about:blank');
  await page.goto(
    `${interviewer9Interview(interviewer9, sessionId).href}${search}`,
  );
  return interviewer8Frame(page);
}

/** The framed Interviewer 8 document, once it has loaded under the base. */
function interviewer8Document(page: Page): Frame {
  const frame = page.frames().find((f) => f.url().includes('/v8/interview/'));
  if (!frame) throw new Error('no Interviewer 8 frame');
  return frame;
}

const onBackGuardEntry = (page: Page): Promise<boolean> =>
  interviewer8Document(page).evaluate(
    () =>
      (window.history.state as { ncBackGuard?: boolean } | null)
        ?.ncBackGuard === true,
  );

/**
 * Press Back twice, as a researcher would who found the first did nothing.
 * The first pops the frame's guard entry, which has the same address as the
 * one beneath it, so on its own it shows nothing; only a second Back, once
 * the guard has pinned the history again, could walk past Interviewer 9's
 * interview page.
 */
async function pressBackTwice(page: Page): Promise<void> {
  await expect.poll(() => onBackGuardEntry(page)).toBe(true);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.history.back());
    await expect.poll(() => onBackGuardEntry(page)).toBe(true);
  }
}

/** Interviewer 9 still shows its interview page, with the frame, unclosed. */
async function expectStillHosted(
  page: Page,
  interviewer9: URL,
  sessionId: string,
): Promise<void> {
  await expect(page).toHaveURL(
    interviewer9Interview(interviewer9, sessionId).href,
  );
  await expect(page.locator('iframe[title="Interviewer 8"]')).toHaveCount(1);
  expect(await postedToInterviewer9(page)).toEqual([READY]);
}

test('loaded at the top level, every address but an interview returns to Interviewer 9 at once, before any lock screen', async ({
  page,
  context,
}) => {
  const base = subpathBase();
  const outside = recordRequestsOutsideBase(context, base);
  const shown = await recordScreensShown(context);
  const { interviewer9, seeded } = await lockedDevice(page, context);

  for (const path of ['', 'data', 'welcome', 'settings', 'no-such-page']) {
    await page.goto('about:blank');
    await page.goto(path);
    await expectBackInInterviewer9(page, interviewer9);
    // Replaced, not pushed: Back must not return to a page that only sends
    // the researcher on again, but to where they were before it.
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  }

  expect(shown).toEqual([]);
  // Nothing written: the database is as Interviewer 9 left it.
  await page.goto(interviewer9.href);
  expect(await dumpDatabase(page)).toEqual(seeded);
  // Nothing outside the base but Interviewer 9's own page: Interviewer 8
  // loads nothing of Interviewer 9's.
  expect(outside.length).toBeGreaterThan(0);
  expect(outside.filter((path) => path !== '/')).toEqual([]);
});

test('loaded at the top level, /v8/interview/<id> is replaced with Interviewer 9’s /interview/<id>, which hosts it unlocked', async ({
  page,
  context,
  interviewNav,
}) => {
  const shown = await recordScreensShown(context);
  const { interviewer9 } = await lockedDevice(page, context);

  await page.goto('about:blank');
  await page.goto(`interview/${SESSION_8}?mode=review`);

  // Interviewer 9's address for it, the review kept.
  await expect(page).toHaveURL(
    `${interviewer9Interview(interviewer9, SESSION_8).href}?mode=review`,
  );
  const frame = interviewer8Frame(page);
  await interviewNav.inFrame(frame).waitForStage();
  await expect(
    frame.getByRole('heading', { name: 'Read-only review' }),
  ).toBeVisible();
  // Interviewer 9 unlocked it: the researcher unlocks once, there.
  expect(shown).toEqual(['interview']);

  await frame.getByTestId('settings-button').click();
  await frame.getByTestId('exit-button').click();
  await frame
    .getByRole('dialog', { name: 'Exit this review?' })
    .getByRole('button', { name: 'Exit review' })
    .click();
  await expectClosed(page);
  // Replaced, not pushed: Back does not return to the /v8/ address (which
  // would send it on to Interviewer 9 again), but to where it was before.
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

test('framed with the key handed over: no lock screen, no enter step, only its session row written, and exit closes it', async ({
  page,
  context,
  interviewNav,
}) => {
  const base = subpathBase();
  const shown = await recordScreensShown(context);
  // Interviewer 9's rules ask to unlock on entering an interview; Interviewer
  // 9 says it already has.
  const { interviewer9, seeded } = await lockedDevice(page, context, {
    currentStep: 1,
    settings: interviewer9Settings({ requireUnlockOnEnter: true }),
  });

  const frame = await hostInterview(page, interviewer9, SESSION_8);
  const nav = interviewNav.inFrame(frame);
  await nav.waitForStage();
  await expect(frame.locator('[data-stage-step]')).toHaveAttribute(
    'data-stage-step',
    '1',
  );
  // Interviewer 8 itself, framed under the base.
  expect(page.frames().map((f) => f.url())).toContain(
    new URL(`interview/${SESSION_8}`, base).href,
  );

  await nav.fillEgoName('Ada');
  await expect(frame.getByTestId('next-button')).toHaveClass(/bg-success/);
  await nav.next();
  await expect
    .poll(
      async () =>
        sessionInDump(await dumpDatabase(page), SESSION_8)?.currentStep,
      { timeout: 10_000 },
    )
    .toBe(2);

  // Back inside the interview does not leave it, however often it is pressed.
  await pressBackTwice(page);
  await expect(frame.locator('[data-stage-step]')).toHaveAttribute(
    'data-stage-step',
    '2',
  );
  await expectStillHosted(page, interviewer9, SESSION_8);

  await nav.exitInterview();
  await expectClosed(page);
  // Neither the lock screen nor the enter step's identity check ever showed.
  expect(shown).toEqual(['interview']);
  // Closing left nothing of the interview in history: Back from Interviewer
  // 9 goes to where it was before, not back over a dead frame entry.
  await page.goBack();
  await expect(page).toHaveURL('about:blank');

  await page.goto(interviewer9.href);
  const after = await dumpDatabase(page);
  // Its own row took the answers, still in Interviewer 8's format: the
  // network encrypted under the shared key.
  expect(sessionInDump(after, SESSION_8)).toMatchObject({
    id: SESSION_8,
    protocolHash: SCHEMA_8_HASH,
    currentStep: 2,
    finishedAt: null,
    _enc: { network: { iv: expect.any(String), ct: expect.any(String) } },
  });
  expect(sessionInDump(after, SESSION_8)).not.toHaveProperty('network');
  // Everything else — the other sessions, the protocols, Interviewer 9's
  // settings row (its last-opened interview too), its own table — and the
  // database's version, tables and indexes are as Interviewer 9 left it.
  expect(withoutSession(after, SESSION_8)).toEqual(
    withoutSession(seeded, SESSION_8),
  );
  expect(after?.version).toBe(INTERVIEWER_9_NATIVE_VERSION);
});

test('framed with the key but no word on the enter step, the enter step asks, as Interviewer 9’s rules say', async ({
  page,
  context,
  interviewNav,
}) => {
  const shown = await recordScreensShown(context);
  const { interviewer9 } = await lockedDevice(page, context, {
    settings: interviewer9Settings({ requireUnlockOnEnter: true }),
    host: { enterAuthorized: false },
  });

  const frame = await hostInterview(page, interviewer9, SESSION_8);
  await expect(confirmIdentity(frame)).toBeVisible({ timeout: 15_000 });
  await typePin(frame);
  await interviewNav.inFrame(frame).waitForStage();

  // The key was handed over: still no lock screen.
  expect(shown).toEqual(['identity check', 'interview']);
});

test('framed with no reply from Interviewer 9, the lock screen shows after the wait, and its unlock is the only one', async ({
  page,
  context,
  interviewNav,
}) => {
  const shown = await recordScreensShown(context);
  const { interviewer9 } = await lockedDevice(page, context, {
    settings: interviewer9Settings({ requireUnlockOnEnter: true }),
    host: { reply: false },
  });

  const openedAt = Date.now();
  const frame = await hostInterview(page, interviewer9, SESSION_8);
  await expect(lockScreen(frame)).toBeVisible({ timeout: 15_000 });
  // Not before Interviewer 9 had its five seconds to reply.
  expect(Date.now() - openedAt).toBeGreaterThanOrEqual(4_500);
  await typePin(frame);
  await interviewNav.inFrame(frame).waitForStage();

  // Unlocking here stood in for the enter step: no second prompt.
  expect(shown).toEqual(['lock screen', 'interview']);
  expect(await postedToInterviewer9(page)).toEqual([READY]);
});

test('?mode=review opens the interview read-only, writes nothing, and its exit closes it', async ({
  page,
  context,
  interviewNav,
}) => {
  const { interviewer9, seeded } = await lockedDevice(page, context);

  const frame = await hostInterview(
    page,
    interviewer9,
    SESSION_8,
    '?mode=review',
  );
  await interviewNav.inFrame(frame).waitForStage();
  await expect(
    frame.getByRole('heading', { name: 'Read-only review' }),
  ).toBeVisible();

  await frame.getByTestId('settings-button').click();
  await frame.getByTestId('exit-button').click();
  await frame
    .getByRole('dialog', { name: 'Exit this review?' })
    .getByRole('button', { name: 'Exit review' })
    .click();
  await expectClosed(page);
  expect(await dumpDatabase(page)).toEqual(seeded);
});

test('finishing an interview marks its row finished, and leaving the completion screen closes it', async ({
  page,
  context,
  interviewNav,
}) => {
  const { interviewer9, seeded } = await lockedDevice(page, context);

  const frame = await hostInterview(page, interviewer9, SESSION_8);
  const nav = interviewNav.inFrame(frame);
  await nav.waitForStage();

  // The lean protocol: information, ego form, quick-add name generator,
  // sociogram, then the finish stage.
  await nav.next();
  await nav.fillEgoName('Ada');
  await expect(frame.getByTestId('next-button')).toHaveClass(/bg-success/);
  await nav.next();
  await nav.quickAddNode('Grace');
  await nav.next();
  await nav.next();
  await nav.finish();
  await expect(frame.getByTestId('interview-complete')).toBeVisible();
  // The completion screen is the interview's own, as before: nothing is
  // said to Interviewer 9 until it is left.
  expect(await postedToInterviewer9(page)).toEqual([READY]);

  await frame.getByTestId('interview-complete-exit').click();
  await expectClosed(page);
  await page.goBack();
  await expect(page).toHaveURL('about:blank');

  await page.goto(interviewer9.href);
  const after = await dumpDatabase(page);
  expect(sessionInDump(after, SESSION_8)?.finishedAt).toEqual(
    expect.any(String),
  );
  expect(withoutSession(after, SESSION_8)).toEqual(
    withoutSession(seeded, SESSION_8),
  );
});

test('the lock rules come from Interviewer 9’s settings row: leaving asks to unlock when it says so, then closes', async ({
  page,
  context,
  interviewNav,
}) => {
  const { interviewer9 } = await lockedDevice(page, context, {
    settings: interviewer9Settings({ requireUnlockOnExit: true }),
  });

  const frame = await hostInterview(page, interviewer9, SESSION_8);
  await interviewNav.inFrame(frame).waitForStage();

  await frame.getByTestId('settings-button').click();
  await frame.getByTestId('exit-button').click();
  await frame
    .getByRole('dialog', { name: 'Exit this interview?' })
    .getByRole('button', { name: 'Exit interview' })
    .click();
  await expect(confirmIdentity(frame)).toBeVisible();
  expect(await postedToInterviewer9(page)).toEqual([READY]);
  await typePin(frame);
  await expectClosed(page);
});

test('its own idle lock still locks the framed interview, without a word to Interviewer 9, and unlocking resumes it', async ({
  page,
  context,
  interviewNav,
}) => {
  await page.clock.install();
  const shown = await recordScreensShown(context);
  const { interviewer9 } = await lockedDevice(page, context, {
    settings: interviewer9Settings({
      idleTimeoutMinutes: 1,
      requireUnlockOnEnter: true,
    }),
  });

  const frame = await hostInterview(page, interviewer9, SESSION_8);
  const nav = interviewNav.inFrame(frame);
  await nav.waitForStage();
  expect(shown).toEqual(['interview']);

  await page.clock.fastForward('01:01');
  await expect(lockScreen(frame)).toBeVisible();
  await expect(frame.locator('[data-stage-step]')).toHaveCount(0);
  expect(await postedToInterviewer9(page)).toEqual([READY]);

  // Back from the lock screen goes nowhere: not out of Interviewer 9's
  // interview page, past the lock, to an Interviewer 9 that is still unlocked.
  await pressBackTwice(page);
  await expectStillHosted(page, interviewer9, SESSION_8);
  await expect(lockScreen(frame)).toBeVisible();

  await typePin(frame);
  await nav.waitForStage();
  // The lock screen's unlock stands in for the enter step on the way back.
  expect(shown).toEqual(['interview', 'lock screen']);
  expect(await postedToInterviewer9(page)).toEqual([READY]);
});

test('framed, an interview it cannot run closes at once, before any screen of its own', async ({
  page,
  context,
}) => {
  const shown = await recordScreensShown(context);
  const { interviewer9, seeded } = await lockedDevice(page, context);

  // A schema 9 interview's id, and an id that is not on this device at all.
  for (const id of [SESSION_9, 'no-such-session']) {
    await hostInterview(page, interviewer9, id);
    await expectClosed(page);
  }

  expect(shown).toEqual([]);
  expect(await dumpDatabase(page)).toEqual(seeded);
});

test('framed at an address that is not an interview, closes at once, before any screen of its own', async ({
  page,
  context,
}) => {
  const shown = await recordScreensShown(context);
  const { interviewer9 } = await lockedDevice(page, context, {
    host: { frameSrc: '/v8/data' },
  });

  await hostInterview(page, interviewer9, SESSION_8);
  await expectClosed(page);
  expect(shown).toEqual([]);
});

test('installed with no lock set up, closes at once: Interviewer 9 owns set-up', async ({
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
  const shown = await recordScreensShown(context);
  const page = await context.newPage();
  const interviewer9 = await openInterviewer9(page, { pin: null });
  await seedInterviewer9Database(page, await interviewer9Data(null));

  await hostInterview(page, interviewer9, SESSION_8);
  await expectClosed(page);
  expect(shown).toEqual([]);
  await context.close();
});

test('in a browser tab with no lock set up, runs the framed interview without a lock screen, as Interviewer 9 does', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: subpathBase().href,
    serviceWorkers: 'block',
  });
  const shown = await recordScreensShown(context);
  const page = await context.newPage();
  const interviewer9 = await openInterviewer9(page, { pin: null });
  await seedInterviewer9Database(page, await interviewer9Data(null));
  const seeded = await dumpDatabase(page);

  const frame = await hostInterview(page, interviewer9, SESSION_8);
  await expect(frame.locator('[data-stage-step]')).toBeVisible({
    timeout: 15_000,
  });
  await frame.getByTestId('next-button').click();
  await expect
    .poll(
      async () =>
        sessionInDump(await dumpDatabase(page), SESSION_8)?.currentStep,
      { timeout: 10_000 },
    )
    .toBe(1);

  expect(shown).toEqual(['interview']);
  const after = await dumpDatabase(page);
  // Plaintext, as on a device without a lock.
  expect(sessionInDump(after, SESSION_8)).toHaveProperty('network');
  expect(withoutSession(after, SESSION_8)).toEqual(
    withoutSession(seeded, SESSION_8),
  );
  await context.close();
});

// The other origin is a page Playwright answers, which Chromium counts as
// public and lets frame a local address only because
// playwright.subpath.config.ts turns its local network access checks off.
test('framed by a page of another origin, renders nothing and goes nowhere', async ({
  page,
  context,
}) => {
  const base = subpathBase();
  const shown = await recordScreensShown(context);
  const outside = recordRequestsOutsideBase(context, base);
  const lock = await makePinLock(PIN);
  await shareInterviewer9Lock(context, lock);
  const framed = new URL(`interview/${SESSION_8}`, base).href;
  const other = 'http://another-origin.test/';
  await page.route(other, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Another origin</title><iframe title="Interviewer 8" src="${framed}"></iframe>`,
    }),
  );

  await page.goto(other);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  if (!frame) throw new Error('no frame');
  // Its own code ran (React has rendered into #root), and yet it stayed
  // where it was put, went nowhere, and showed nothing.
  await expect
    .poll(() =>
      frame.evaluate(
        () => (document.querySelector('#root')?.childElementCount ?? 0) > 0,
      ),
    )
    .toBe(true);
  await page.waitForLoadState('networkidle');
  expect(frame.url()).toBe(framed);
  expect(outside).toEqual([]);
  expect(shown).toEqual([]);
  expect(await frame.evaluate(() => document.body.innerText.trim())).toBe('');
});
