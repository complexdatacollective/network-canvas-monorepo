#!/usr/bin/env node
// Canonical walker for the Interviewer release smoke test's
// offline-readiness journey, against a DEPLOYED Interviewer origin in fresh
// browser profiles.
//
// Working without a network is Interviewer's promise to the field, and the
// home screen states it as ONE app-wide status: "Ready for offline" means
// Interviewer, and every protocol on the device whatever its schema, can be
// used with no connection. This walk holds the app to that word:
// - the status is honest: it does not claim readiness before the download
//   has finished (nor ever, in a browser that cannot install the service
//   worker), it then reaches "Ready for offline", and it stays one status
//   for the app however many protocols, of whatever schema, the device holds;
// - with the network cut, the app boots on every route and switches its own
//   language from the precache alone;
// - protocols IMPORTED FROM A FILE WHILE OFFLINE are saved with their assets
//   and are fully usable offline: a schema 9 protocol (an image, and a roster
//   read from a network asset and searched through a worker) is conducted,
//   reloaded mid-interview, finished, reviewed and exported offline, and a
//   schema 8 protocol is conducted offline in the bundled Interviewer 8;
// - a protocol that needs the internet (a map stage) says so on its card,
//   warns before an offline start (Cancel creates nothing), runs every other
//   stage offline with the map stage's own offline notice, loads its map once
//   the connection returns, and starts without a warning while online.
//
// The fixtures are packages/protocols/e2e/release-offline,
// release-online-map and release-smoke-schema8; their archives are built from
// the reviewable protocol.json files and assets at run time. Interactions are
// lifted from the other release walkers and the e2e suites
// (packages/interview/e2e/fixtures/name-generator-roster-fixture.ts for the
// roster's keyboard drag). Change interactions HERE — never let a
// release-test agent rebuild this from scratch.
//
// Usage (from the repo root):
//   node scripts/release-test/interviewer-offline-readiness-walker.mjs \
//     --url https://interviewer.networkcanvas.dev \
//     --artifacts /path/to/artifacts [--timeout-ms 600000]
//
// Exit codes: 0 all checks passed; 1 one or more checks failed (see
// result.json); 2 watchdog timeout (a hang, not a verdict); 3 setup error.
// Always writes <artifacts>/result.json and numbered evidence screenshots;
// the final stdout line is the result JSON.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The app's database name (an import-free module, loaded through Node's type
// stripping), so the walker reads the one database the deployed app writes,
// which Interviewer 8 at /v8/ shares.
import { DB_NAME } from '../../apps/interviewer/src/lib/db/storageNames.ts';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const require = createRequire(
  path.join(repoRoot, 'apps/interviewer/package.json'),
);
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 15_000 });
const JSZip = require('jszip');

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}
const url = arg('url', 'https://interviewer.networkcanvas.dev');
const artifactsDir = arg('artifacts', null);
const timeoutMs = Number(arg('timeout-ms', '600000'));

const E2E = path.join(repoRoot, 'packages/protocols/e2e');
const FILE_PROTOCOL = 'Release Offline';
const MAP_PROTOCOL = 'Release Online Map';
const SCHEMA8_PROTOCOL = 'Interviewer 8 Release Check';
// Both image fixtures are the same 160 px wide marker: a decoded image of
// exactly that width is the asset's own bytes, read back out of the database.
const ASSET_WIDTH = 160;
const ROSTER = ['Amara', 'Beto', 'Chidi'];
const ROSTER_PICK = 'Beto';
const MAPPED_PERSON = 'Mapped Person';
const SCHEMA8_PASSPHRASE = 'relcheck1';
const SCHEMA8_EGO = 'Offline Ego';
const SCHEMA8_PERSON = 'Offline File Node';
const FILE_CASE = 'offline-file-schema9';
const SCHEMA8_CASE = 'offline-file-schema8';
const MAP_CASE = 'offline-map';
const MAP_ONLINE_CASE = 'online-map';
const MAP_CANCELLED_CASE = 'cancelled-map';
// The home screen's one offline status (apps/interviewer/src/components/
// offlineMessages.ts).
const READY_CHIP = 'Ready for offline';
const READY_HELP =
  'Interviewer is saved on this device, so every protocol can be used without an internet connection.';
const MAP_OFFLINE_NOTICE =
  'You are offline — the map will not load until you reconnect.';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// A message of the app's German catalog, which the walk loads offline: read
// from the catalog itself, so a retranslation never breaks the walk.
const GERMAN = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'apps/interviewer/src/locales/de.json'),
    'utf8',
  ),
);
const german = (id) => {
  if (typeof GERMAN[id] !== 'string')
    throw new Error(`no German catalog entry ${id}`);
  return GERMAN[id];
};

if (!artifactsDir) {
  console.error('Missing required --artifacts <dir>');
  process.exit(3);
}
fs.mkdirSync(artifactsDir, { recursive: true });

const result = { ok: false, url, steps: [], failures: [] };
function record(step, ok, note) {
  result.steps.push({ step, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${note ? ` :: ${note}` : ''}`);
  if (!ok) result.failures.push(`${step}: ${note ?? 'failed'}`);
}
function finish(code) {
  result.ok = code === 0;
  fs.writeFileSync(
    path.join(artifactsDir, 'result.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  process.exit(code);
}
function setupFailure(note) {
  record('setup', false, note);
  finish(3);
}

// The archives are BUILT from the reviewable fixtures at run time — a
// committed binary could silently drift from the JSON reviewers inspect.
async function buildArchive(dir) {
  const zip = new JSZip();
  const protocolJson = fs.readFileSync(
    path.join(E2E, dir, 'protocol.json'),
    'utf8',
  );
  zip.file('protocol.json', protocolJson);
  for (const asset of Object.values(
    JSON.parse(protocolJson).assetManifest ?? {},
  )) {
    if (asset.source)
      zip.file(
        `assets/${asset.source}`,
        fs.readFileSync(path.join(E2E, dir, 'assets', asset.source)),
      );
  }
  const archive = path.join(artifactsDir, `${dir}.netcanvas`);
  fs.writeFileSync(archive, await zip.generateAsync({ type: 'nodebuffer' }));
  return archive;
}
let archives;
try {
  archives = {
    file: await buildArchive('release-offline'),
    map: await buildArchive('release-online-map'),
    schema8: await buildArchive('release-smoke-schema8'),
  };
} catch (err) {
  setupFailure(
    `archive build failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}

// Every non-whitelisted console error is reportable under the gate's shared
// journey contract. Network-failure lines are exempt ONLY while the walk has
// deliberately cut the network — the same class while online is reportable.
const consoleErrors = [];
let deliberatelyOffline = false;
const NOISE = [
  /frame-ancestors.*ignored when delivered via a <meta> element/i,
  // Cloudflare's injected beacon: the refused INLINE bootstrap and the
  // blocked cloudflareinsights.com load. Any OTHER CSP violation surfaces.
  /Refused to execute inline script.*Content Security Policy/i,
  /cloudflareinsights/i,
  /ph-relay\.networkcanvas\.com/i,
  /__offline-probe-/,
];
const OFFLINE_NOISE = [
  /Failed to load resource: net::ERR_(INTERNET_DISCONNECTED|FAILED)/,
  // The service worker's update check cannot fetch sw.js while offline;
  // the app catches its own update() rejection.
  /An unknown error occurred when fetching the script/i,
  // The map stage's own style request, which cannot succeed offline — the
  // condition the stage's offline notice is about.
  /Failed to fetch https:\/\/api\.mapbox\.com\//,
];

let browser;
let context;
let page;
function listenForErrors(target, label) {
  target.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Chromium's generic "Failed to load resource" text omits the URL — it
    // lives in the message location, so match against both.
    const text = `${m.text()} ${m.location()?.url ?? ''}`;
    if (NOISE.some((p) => p.test(text))) return;
    if (deliberatelyOffline && OFFLINE_NOISE.some((p) => p.test(text))) return;
    consoleErrors.push(`${label}${text.trim()}`);
  });
  target.on('pageerror', (err) =>
    consoleErrors.push(`${label}pageerror: ${err.message}`),
  );
}
async function newProfile(options = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    ...options,
  });
  // The relay is blocked in every context: analytics defaults on, and a fresh
  // profile would otherwise emit real events to product analytics.
  await ctx.route('**://ph-relay.networkcanvas.com/**', (r) => r.abort());
  // Force the plain-download rung the way the e2e suite does: Chromium
  // prefers the native Save-As picker, which never emits Playwright's
  // download event (apps/interviewer/e2e/fixtures/download-fixture.ts).
  await ctx.addInitScript(() => {
    delete window.showSaveFilePicker;
    delete navigator.canShare;
    delete navigator.share;
  });
  return ctx;
}
try {
  browser = await chromium.launch();
  context = await newProfile();
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  listenForErrors(page, '');
} catch (err) {
  setupFailure(
    `browser setup failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}

const watchdog = setTimeout(async () => {
  try {
    await page.screenshot({
      path: path.join(artifactsDir, 'watchdog-timeout.png'),
    });
    record(
      'watchdog',
      false,
      `no completion within ${timeoutMs}ms at ${page.url()}`,
    );
  } catch {
    record(
      'watchdog',
      false,
      `no completion within ${timeoutMs}ms (page gone)`,
    );
  }
  finish(2);
}, timeoutMs);

let shots = 0;
async function shot(name, target = page) {
  shots += 1;
  await target.screenshot({
    path: path.join(
      artifactsDir,
      `${String(shots).padStart(2, '0')}-${name}.png`,
    ),
  });
}

const statusChip = (target = page) =>
  target.getByTestId('offline-status-trigger');
const frameElement = () => page.getByTestId('interviewer-8-frame');
const v8 = page.frameLocator('[data-testid="interviewer-8-frame"]');
const interviewMain = () =>
  page.locator('main[data-theme-interview]:not([aria-busy="true"])');
const stageStep = () => page.locator('[data-stage-step]');
const deck = () => page.getByRole('region', { name: 'Protocol deck' });
const startButton = () =>
  page.getByRole('button', { name: 'Start new interview', exact: true });
const dataRow = (caseId) => page.getByRole('row').filter({ hasText: caseId });

// Deck-settle click: the spring-animated deck swallows early clicks — require
// SUSTAINED stability (three identical samples 250 ms apart), as the other
// walkers do.
async function clickSettled(locator) {
  await expect(locator).toBeVisible();
  let stable = 0;
  let last = null;
  for (let i = 0; i < 30 && stable < 3; i += 1) {
    const b = await locator.boundingBox();
    stable = b && last && b.x === last.x && b.y === last.y ? stable + 1 : 0;
    last = b;
    await page.waitForTimeout(250);
  }
  if (stable < 3)
    throw new Error('deck never settled after 30 stability samples');
  await locator.click();
}

// The name of the protocol whose card holds the (only) Start button: the
// active card.
const activeProtocol = () =>
  startButton().evaluate((el) => {
    let node = el;
    for (let i = 0; i < 15 && node; i += 1) {
      node = node.parentElement;
      const heading = node?.querySelector('h1, h2, h3, h4');
      if (heading) return heading.textContent?.trim() ?? null;
    }
    return null;
  });

// Make the named protocol's card the active one through the deck's own
// "Go to card N" dots.
async function activateProtocol(name) {
  const dots = page.getByRole('button', { name: /^Go to card \d+$/ });
  const count = await dots.count();
  for (let n = 1; n <= count; n += 1) {
    await page
      .getByRole('button', { name: `Go to card ${n}`, exact: true })
      .click();
    await page.waitForTimeout(800);
    if ((await startButton().count()) === 0) continue;
    if ((await activeProtocol()) === name) return;
  }
  throw new Error(`no deck card for "${name}" among ${count} cards`);
}

async function expectHome() {
  // Compared as parts, never as a pattern built from the --url argument.
  const home = new URL(url);
  await expect(page).toHaveURL(
    (u) => u.origin === home.origin && u.pathname === '/' && u.search === '',
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('settings-trigger')).toBeVisible({
    timeout: 20_000,
  });
}

async function openDataView() {
  await page
    .getByRole('group', { name: 'Home view' })
    .getByText('Data')
    .click();
  await expect(page).toHaveURL(/\/data/);
}

// Open the new-interview form on the active card and submit a case ID.
async function submitNewInterview(protocol, caseId) {
  await activateProtocol(protocol);
  await clickSettled(startButton());
  await page.getByTestId('new-session-case-id').fill(caseId);
  await page.getByTestId('new-session-submit').click();
}
async function expectInterviewMounted() {
  await expect(page).toHaveURL(new RegExp(`/interview/${UUID}$`), {
    timeout: 20_000,
  });
  return page.url().split('/interview/')[1];
}
async function nextStage() {
  const before = await stageStep().getAttribute('data-stage-step');
  await page.getByTestId('next-button').click();
  await expect
    .poll(() => stageStep().getAttribute('data-stage-step'), {
      timeout: 20_000,
    })
    .not.toBe(before);
}
async function previousStage() {
  const before = await stageStep().getAttribute('data-stage-step');
  await page.getByTestId('previous-button').click();
  await expect
    .poll(() => stageStep().getAttribute('data-stage-step'), {
      timeout: 20_000,
    })
    .not.toBe(before);
}
async function imageWidth(locator) {
  await expect(locator).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => locator.evaluate((el) => (el.complete ? el.naturalWidth : 0)), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  return locator.evaluate((el) => el.naturalWidth);
}

// Keyboard drag (packages/interview/e2e/fixtures/
// name-generator-roster-fixture.ts): focus via evaluate (roving tabindex),
// Ctrl+D lifts, ArrowRight cycles drop targets read from the polite live
// region, Enter drops.
async function dragToTarget(source, targetText) {
  await expect(source).toBeVisible();
  await source.evaluate((el) => {
    if (el instanceof HTMLElement) el.focus();
  });
  await source.press('Control+d');
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('ArrowRight');
    const announcement = await page.evaluate(() => {
      for (const el of document.querySelectorAll(
        'body > div[role="status"][aria-live="polite"]',
      )) {
        const text = el.textContent?.trim() ?? '';
        if (text.includes('Drop target')) return text;
      }
      return '';
    });
    if (announcement.includes(targetText)) {
      await page.keyboard.press('Enter');
      return;
    }
  }
  throw new Error(`no drop target "${targetText}" after 20 steps`);
}

// The Settings "Offline use" row: its explanation and its short status.
async function readOfflineSetting() {
  await page.getByTestId('settings-trigger').click();
  // Settings reopens on the tab last shown; the row is on About.
  await page.getByRole('tab', { name: 'About', exact: true }).click();
  const row = page.getByTestId('offline-setting');
  await expect(row).toBeVisible();
  const text = (await row.innerText()).trim();
  await page.keyboard.press('Escape');
  await expect(row).toBeHidden();
  const lines = text.split('\n').map((l) => l.trim());
  return { text, status: lines.filter(Boolean).at(-1) ?? '' };
}

const isBytes = (v) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);

// The shared database, read raw: list before opening, because a bare open
// of a missing name CREATES an empty database.
function readDatabase() {
  return page.evaluate(async (dbName) => {
    const listed = (await indexedDB.databases()).some((d) => d.name === dbName);
    if (!listed) return { found: false, missingDatabase: dbName };
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const all = (store) =>
      new Promise((res, rej) => {
        const rq = db
          .transaction(store, 'readonly')
          .objectStore(store)
          .getAll();
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    const [protocols, assets, sessions] = [
      await all('protocols'),
      await all('assets'),
      await all('sessions'),
    ];
    db.close();
    return {
      found: true,
      protocols: protocols.map((p) => ({
        name: p.name,
        hash: p.hash,
        schemaVersion: p.schemaVersion,
        documentSchemaVersion: p.protocol?.schemaVersion ?? null,
      })),
      assets: assets.map((a) => ({
        protocolHash: a.protocolHash,
        assetId: a.assetId,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        caseId: s.caseId,
        protocolHash: s.protocolHash,
        currentStep: s.currentStep ?? null,
        finishedAt: s.finishedAt ?? null,
        progress: s.progress ?? null,
        network: s.network ?? null,
      })),
    };
  }, DB_NAME);
}

// Import an archive through the app's file input and wait for its toast,
// then return the stored protocol row and its stored asset ids.
async function importFile(archive, name) {
  // Let the previous import's toast close first, so the toast awaited is
  // this import's own.
  const toasts = page.getByText('Protocol imported');
  await expect(toasts).toHaveCount(0, { timeout: 30_000 });
  await page.getByTestId('protocol-import-input').setInputFiles(archive);
  await expect(toasts.first()).toBeVisible({ timeout: 30_000 });
  await expect(deck().getByRole('heading', { name })).toBeVisible();
  // The deck can show the name before the write commits: wait for the row.
  await expect
    .poll(
      async () =>
        (await readDatabase()).protocols?.some((p) => p.name === name) ?? false,
      { timeout: 15_000 },
    )
    .toBe(true);
  const db = await readDatabase();
  const protocol = db.protocols?.find((p) => p.name === name) ?? null;
  const assets = (db.assets ?? [])
    .filter((a) => protocol && a.protocolHash === protocol.hash)
    .map((a) => a.assetId)
    .toSorted();
  return { db, protocol, assets };
}

// The card of the named protocol, read as text (badges included): the
// widest element around its heading that holds no other card's heading.
const cardText = (name) =>
  deck()
    .getByRole('heading', { name, exact: true })
    .evaluate((heading) => {
      let node = heading;
      while (
        node.parentElement &&
        node.parentElement.querySelectorAll('h1, h2, h3, h4').length === 1
      )
        node = node.parentElement;
      return node.textContent ?? '';
    });

// Interviewer 8's stages (scripts/release-test/interviewer-schema8-walker.mjs):
// Welcome → Privacy (the passphrase) → About you → Name people.
async function conductSchema8Stages() {
  const next = () => v8.getByRole('button', { name: 'Next Step' }).click();
  await next();
  await expect(
    v8.getByRole('heading', {
      name: 'This interview uses enhanced privacy protection',
    }),
  ).toBeVisible({ timeout: 20_000 });
  await v8
    .getByRole('textbox', { name: 'Passphrase', exact: true })
    .fill(SCHEMA8_PASSPHRASE);
  await v8
    .getByRole('textbox', { name: 'Confirm Passphrase' })
    .fill(SCHEMA8_PASSPHRASE);
  await v8.getByRole('button', { name: 'Submit' }).click();
  await expect(
    v8.getByRole('status').filter({ hasText: 'Passphrase set' }),
  ).toBeVisible();
  await next();
  const egoField = v8.getByRole('textbox', { name: 'What is your name?' });
  await expect(egoField).toBeVisible({ timeout: 20_000 });
  await egoField.fill(SCHEMA8_EGO);
  await expect(egoField).toHaveValue(SCHEMA8_EGO);
  await next();
  await expect(
    v8.getByRole('heading', { name: 'Who are the people you know?' }),
  ).toBeVisible({ timeout: 20_000 });
  await v8.getByRole('button', { name: 'Add a person' }).click();
  const nameField = v8.getByRole('textbox', { name: 'Person name' });
  await nameField.fill(SCHEMA8_PERSON);
  await nameField.press('Enter');
  await expect(
    v8.getByRole('listbox', { name: 'Added Nodes' }).getByRole('option', {
      name: SCHEMA8_PERSON,
    }),
  ).toBeVisible();
}
async function exitFromInterviewer8() {
  await v8.getByRole('button', { name: 'Settings' }).click();
  await v8.getByRole('button', { name: 'Exit interview' }).click();
  const dialog = v8.getByRole('dialog', { name: 'Exit this interview?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Exit interview' }).click();
  await expectHome();
}

async function cutNetwork() {
  await context.setOffline(true);
  deliberatelyOffline = true;
  // Positive control: a non-precached same-origin fetch must FAIL (the
  // service worker's navigation fallback covers navigations only).
  return page.evaluate(async () => {
    if (navigator.onLine) return false;
    try {
      await fetch(`/__offline-probe-${Math.random()}__`, { cache: 'no-store' });
      return false;
    } catch {
      return true;
    }
  });
}

// --- the walk -------------------------------------------------------------
try {
  // Phase 1 (online): the status is honest, then ready.
  await page.goto(url);
  await expect(statusChip()).toBeVisible({ timeout: 20_000 });
  const firstStatus = (await statusChip().innerText()).trim();
  await shot('status-first-visit');
  record(
    'status-not-ready-at-first',
    firstStatus !== READY_CHIP,
    `on a first visit, before the download, the status read ${JSON.stringify(firstStatus)} (it must not claim "${READY_CHIP}" yet)`,
  );

  // A browser that cannot install the service worker can never be ready:
  // watch a second, worker-blocked profile while this one downloads.
  {
    const blocked = await newProfile({ serviceWorkers: 'block' });
    const blockedPage = await blocked.newPage();
    listenForErrors(blockedPage, '[worker blocked] ');
    await blockedPage.goto(url);
    await expect(statusChip(blockedPage)).toBeVisible({ timeout: 20_000 });
    const seen = new Set();
    for (let i = 0; i < 10; i += 1) {
      seen.add((await statusChip(blockedPage).innerText()).trim());
      await blockedPage.waitForTimeout(2000);
    }
    await shot('status-worker-blocked', blockedPage);
    record(
      'status-never-ready-without-worker',
      !seen.has(READY_CHIP),
      `with service workers blocked, the status read ${JSON.stringify([...seen])} over 20 s (it must never read "${READY_CHIP}")`,
    );
    await blocked.close();
  }

  const progress = [];
  const readyStarted = Date.now();
  for (;;) {
    const text = (await statusChip().innerText()).trim();
    if (progress.at(-1) !== text) progress.push(text);
    if (text === READY_CHIP) break;
    if (Date.now() - readyStarted > 240_000)
      throw new Error(
        `status never read "${READY_CHIP}" within 240 s: ${JSON.stringify(progress)}`,
      );
    await page.waitForTimeout(1000);
  }
  const percents = progress
    .map((t) => /(\d+)\s?%/.exec(t)?.[1])
    .filter(Boolean)
    .map(Number);
  const monotonic = percents.every((p, i) => i === 0 || p >= percents[i - 1]);
  await statusChip().click();
  const popover = page.getByText(READY_HELP, { exact: true });
  const explained = await popover
    .waitFor({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  await shot('status-ready');
  await page.keyboard.press('Escape');
  const setting = await readOfflineSetting();
  await page.reload();
  const controlled = await page.evaluate(
    () => navigator.serviceWorker.controller !== null,
  );
  record(
    'status-ready',
    monotonic && explained && setting.status === 'Ready' && controlled,
    `status went ${JSON.stringify(progress)} in ${Math.round((Date.now() - readyStarted) / 1000)} s (download percentages never went backwards: ${monotonic}); its explanation read "${READY_HELP}": ${explained}; Settings → Offline use read ${JSON.stringify(setting.status)}; page controlled by the service worker after a reload: ${controlled}`,
  );

  // Phase 2 (offline): every route boots from the precache, and the app
  // changes its own language from the precached catalogs.
  const offlineReal = await cutNetwork();
  record(
    'offline-positive-control',
    offlineReal,
    'uncached fetch fails while offline',
  );
  if (!offlineReal)
    throw new Error('offline flip did not take — walk would be meaningless');

  const routes = [];
  for (const [route, locator] of [
    ['/', () => page.getByTestId('settings-trigger')],
    ['/data', () => page.getByText('No interviews recorded yet.')],
    ['/welcome', () => page.getByRole('button', { name: 'Get started' })],
    [
      '/definitely-not-a-route',
      () => page.getByRole('heading', { name: 'Page not found' }),
    ],
  ]) {
    await page.goto(new URL(route, url).href);
    const booted = await locator()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    routes.push(`${route}=${booted ? 'booted' : 'BLANK'}`);
  }
  await shot('offline-not-found');
  record(
    'offline-boot-routes',
    routes.every((r) => r.endsWith('=booted')),
    `offline navigations: ${routes.join(', ')}`,
  );

  await page.goto(url);
  await expectHome();
  await page.getByTestId('settings-trigger').click();
  await page.getByRole('tab', { name: 'Language', exact: true }).click();
  const picker = page.getByRole('combobox', {
    name: 'App language',
    exact: true,
  });
  await picker.focus();
  await picker.selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.keyboard.press('Escape');
  const germanSettings = await page
    .getByTestId('settings-trigger')
    .getAttribute('aria-label');
  await shot('offline-german');
  await page.getByTestId('settings-trigger').click();
  await page
    .getByRole('tab', {
      name: german('interviewer.settingsDialog.language'),
      exact: true,
    })
    .click();
  const germanPicker = page.getByRole('combobox', {
    name: german('interviewer.language.label'),
    exact: true,
  });
  await germanPicker.focus();
  await germanPicker.selectOption('__automatic');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.keyboard.press('Escape');
  record(
    'offline-app-language',
    germanSettings === german('interviewer.topActionBar.settings'),
    `offline, Settings → Language → Deutsch loaded German from the precache (top bar ${JSON.stringify(germanSettings)}); Automatic returned to English`,
  );

  // Phase 3 (offline): three protocols imported FROM FILES with no network.
  const file = await importFile(archives.file, FILE_PROTOCOL);
  await shot('offline-import-schema9');
  record(
    'offline-import-schema9',
    file.protocol?.schemaVersion === 9 &&
      JSON.stringify(file.assets) === JSON.stringify(['marker', 'roster_data']),
    `"${FILE_PROTOCOL}" imported from a file offline: stored row ${JSON.stringify(file.protocol)}, stored assets ${JSON.stringify(file.assets)} (expected schema 9 with marker and roster_data)`,
  );

  const schema8 = await importFile(archives.schema8, SCHEMA8_PROTOCOL);
  const schema8Card = await cardText(SCHEMA8_PROTOCOL);
  record(
    'offline-import-schema8',
    schema8.protocol?.schemaVersion === 8 &&
      schema8.protocol?.documentSchemaVersion === 8 &&
      /schema 8/i.test(schema8Card) &&
      JSON.stringify(schema8.assets) === JSON.stringify(['marker']),
    `"${SCHEMA8_PROTOCOL}" imported from a file offline and kept on schema 8: stored row ${JSON.stringify(schema8.protocol)}, stored assets ${JSON.stringify(schema8.assets)}, card ${JSON.stringify(schema8Card.slice(0, 80))}`,
  );

  const map = await importFile(archives.map, MAP_PROTOCOL);
  const cards = {
    [FILE_PROTOCOL]: await cardText(FILE_PROTOCOL),
    [SCHEMA8_PROTOCOL]: await cardText(SCHEMA8_PROTOCOL),
    [MAP_PROTOCOL]: await cardText(MAP_PROTOCOL),
  };
  const badged = Object.entries(cards)
    .filter(([, text]) => /requires internet/i.test(text))
    .map(([name]) => name);
  await shot('offline-import-needs-internet');
  record(
    'offline-import-needs-internet',
    map.protocol?.schemaVersion === 9 &&
      JSON.stringify(map.assets) ===
        JSON.stringify(['geo_data', 'mapbox_token']) &&
      JSON.stringify(badged) === JSON.stringify([MAP_PROTOCOL]),
    `"${MAP_PROTOCOL}" imported from a file offline: stored row ${JSON.stringify(map.protocol)}, stored assets ${JSON.stringify(map.assets)}; cards badged "Requires Internet": ${JSON.stringify(badged)} (expected only the map protocol)`,
  );

  // One status for the whole app, whatever it holds: still exactly one
  // chip, still ready, and no card speaks of offline readiness.
  const chips = await statusChip().count();
  const chipText = (await statusChip().innerText()).trim();
  const deckText = await deck().innerText();
  const perCard = /(ready|downloading) for offline/i.test(deckText);
  const settingAfter = await readOfflineSetting();
  await shot('status-app-wide');
  record(
    'status-app-wide',
    chips === 1 &&
      chipText === READY_CHIP &&
      !perCard &&
      settingAfter.status === 'Ready',
    `with schema 9, schema 8 and internet-needing protocols on the device: ${chips} status chip(s) reading ${JSON.stringify(chipText)}; any card showing an offline readiness of its own: ${perCard}; Settings → Offline use ${JSON.stringify(settingAfter.status)}`,
  );

  await page.reload();
  await expectHome();
  const headings = await deck().getByRole('heading').allInnerTexts();
  record(
    'offline-imports-survive-reload',
    [FILE_PROTOCOL, SCHEMA8_PROTOCOL, MAP_PROTOCOL].every((n) =>
      headings.includes(n),
    ) && (await statusChip().innerText()).trim() === READY_CHIP,
    `after an offline reload the deck lists ${JSON.stringify(headings)} and the status still reads "${READY_CHIP}"`,
  );

  // Phase 4 (offline): the schema 9 protocol imported offline, conducted
  // offline from its stored assets.
  await submitNewInterview(FILE_PROTOCOL, FILE_CASE);
  const fileId = await expectInterviewMounted();
  const warned = await page
    .getByRole('dialog', { name: 'You appear to be offline' })
    .count();
  record(
    'file-protocol-start',
    warned === 0,
    `started "${FILE_CASE}" offline with no offline warning (the protocol needs no internet): /interview/${fileId}`,
  );
  const width = await imageWidth(
    page.getByRole('img', { name: 'Release offline marker' }),
  );
  await shot('file-protocol-image');
  record(
    'file-protocol-image',
    width === ASSET_WIDTH,
    `the image from the file decoded at ${width} px wide (expected ${ASSET_WIDTH}) with no network`,
  );

  await nextStage();
  const rosterList = page.getByRole('listbox', {
    name: 'Available Roster Nodes',
  });
  await expect(rosterList.getByRole('option')).toHaveCount(ROSTER.length, {
    timeout: 20_000,
  });
  const listed = (
    await rosterList
      .getByRole('option')
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  ).toSorted();
  await page.getByRole('searchbox', { name: 'Filter' }).fill(ROSTER_PICK);
  await expect(page.getByText(/^1 result$/)).toBeVisible();
  await expect(rosterList.getByRole('option')).toHaveCount(1);
  await dragToTarget(
    rosterList.getByRole('option', { name: ROSTER_PICK }),
    'Added Nodes',
  );
  const added = page
    .getByRole('listbox', { name: 'Added Nodes' })
    .getByRole('option', { name: ROSTER_PICK });
  await expect(added).toBeVisible();
  await shot('file-protocol-roster');
  record(
    'file-protocol-roster',
    JSON.stringify(listed) === JSON.stringify(ROSTER),
    `the roster from the file listed ${JSON.stringify(listed)}; searching "${ROSTER_PICK}" found 1 result through the search worker; ${ROSTER_PICK} added`,
  );

  // The node and the step persist through separate fire-and-forget writes:
  // wait for both before reloading the interview page itself offline.
  await expect
    .poll(
      async () => {
        const s = (await readDatabase()).sessions?.find((x) => x.id === fileId);
        return (
          s?.currentStep === 1 &&
          (s.network?.nodes ?? []).some(
            (n) => n.attributes?.name === ROSTER_PICK,
          )
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  await page.reload();
  await expect(interviewMain()).toBeVisible({ timeout: 20_000 });
  await expect(stageStep()).toHaveAttribute('data-stage-step', '1');
  await expect(added).toBeVisible({ timeout: 20_000 });
  record(
    'file-protocol-reload',
    true,
    `reloading /interview/${fileId} offline reopened the roster stage with ${ROSTER_PICK} still added`,
  );

  await nextStage();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const finishDialog = page.getByRole('dialog');
  await expect(finishDialog).toBeVisible();
  await finishDialog
    .getByRole('button', { name: 'Finish', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Interview Finished' }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
  await expectHome();
  await openDataView();
  const fileRow = dataRow(FILE_CASE);
  await expect(fileRow).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await expect(fileRow).toContainText('100%');
  await shot('file-protocol-finished');
  record(
    'file-protocol-finish',
    true,
    `finished offline; /data lists ${FILE_CASE} at 100%`,
  );

  await fileRow.getByTestId('data-review').click();
  await expect(page).toHaveURL(
    new RegExp(`/interview/${fileId}\\?mode=review$`),
    {
      timeout: 20_000,
    },
  );
  await expect(page.getByText('Read-only review').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(interviewMain()).toBeVisible({ timeout: 20_000 });
  // Review opens where the interview ended; walk back to its first stage.
  for (let i = 0; i < 3; i += 1) {
    if ((await stageStep().getAttribute('data-stage-step')) === '0') break;
    await previousStage();
  }
  const reviewWidth = await imageWidth(
    page.getByRole('img', { name: 'Release offline marker' }),
  );
  await shot('offline-review');
  record(
    'offline-review',
    reviewWidth === ASSET_WIDTH,
    `Review opened the finished interview read-only offline; walking back to its first stage showed the image at ${reviewWidth} px`,
  );

  await page.goto(new URL('/data', url).href);
  await expect(fileRow).toBeVisible({ timeout: 20_000 });
  await fileRow.getByRole('checkbox').check();
  await page.getByTestId('data-export').click();
  await expect(
    page.getByRole('heading', { name: 'Archive ready' }),
  ).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByTestId('data-save-export').click(),
  ]);
  const exportPath = path.join(artifactsDir, 'offline-export.zip');
  await download.saveAs(exportPath);
  const archive = await JSZip.loadAsync(fs.readFileSync(exportPath));
  const entries = {};
  for (const entry of Object.values(archive.files)) {
    if (!entry.dir) entries[entry.name] = await entry.async('string');
  }
  const names = Object.keys(entries);
  const graphml = names.filter((n) => n.endsWith('.graphml'));
  const egoCsv = names.filter((n) => n.endsWith('_ego.csv'));
  const personCsv = names.filter((n) =>
    n.endsWith('_attributeList_Person.csv'),
  );
  await expect(fileRow).not.toContainText('Not exported', { timeout: 15_000 });
  await shot('offline-export');
  record(
    'offline-export',
    graphml.length === 1 &&
      graphml[0].startsWith(`${FILE_CASE}_${fileId}`) &&
      (entries[graphml[0]].match(/<node /g) ?? []).length === 1 &&
      entries[graphml[0]].includes(ROSTER_PICK) &&
      egoCsv.length === 1 &&
      personCsv.length === 1 &&
      entries[personCsv[0]].includes(ROSTER_PICK),
    `exported offline: ${download.suggestedFilename()} holds ${JSON.stringify(names)}; the GraphML and the Person CSV carry ${ROSTER_PICK}; the row is marked exported`,
  );

  // Phase 5 (offline): the schema 8 protocol imported offline, conducted
  // offline in the bundled Interviewer 8.
  await page.goto(url);
  await expectHome();
  await submitNewInterview(SCHEMA8_PROTOCOL, SCHEMA8_CASE);
  const schema8Id = await expectInterviewMounted();
  await expect(frameElement()).toHaveAttribute(
    'src',
    `/v8/interview/${schema8Id}`,
    { timeout: 30_000 },
  );
  await expect(
    v8.getByRole('heading', {
      name: 'Welcome to the Interviewer 8 release check',
    }),
  ).toBeVisible({ timeout: 30_000 });
  const schema8Width = await imageWidth(
    v8.getByRole('img', { name: 'Release check marker' }),
  );
  await shot('file-schema8-start');
  record(
    'file-schema8-start',
    schema8Width === ASSET_WIDTH,
    `offline, /interview/${schema8Id} framed Interviewer 8 at /v8/interview/${schema8Id}, which showed the file's image at ${schema8Width} px wide (expected ${ASSET_WIDTH})`,
  );
  await conductSchema8Stages();
  await shot('file-schema8-stages');
  record(
    'file-schema8-stages',
    true,
    `offline in Interviewer 8: passphrase set, ego "${SCHEMA8_EGO}" entered, "${SCHEMA8_PERSON}" added`,
  );
  await exitFromInterviewer8();
  await openDataView();
  await expect(dataRow(SCHEMA8_CASE)).toBeVisible({ timeout: 15_000 });
  const schema8Session = (await readDatabase()).sessions?.find(
    (s) => s.id === schema8Id,
  );
  const schema8People = (schema8Session?.network?.nodes ?? []).filter(
    (n) => n.type === 'person',
  );
  record(
    'file-schema8-stored',
    schema8Session?.network?.ego?.attributes?.ego_name === SCHEMA8_EGO &&
      schema8People.length === 1 &&
      isBytes(schema8People[0].attributes?.name) &&
      !JSON.stringify(schema8Session.network).includes(SCHEMA8_PERSON),
    `Interviewer 8's exit returned Home; /data lists ${SCHEMA8_CASE}; stored ego=${JSON.stringify(schema8Session?.network?.ego?.attributes?.ego_name ?? null)} people=${schema8People.length} name stored as ciphertext=${isBytes(schema8People[0]?.attributes?.name)}`,
  );

  // Phase 6 (offline): the protocol that needs the internet.
  await page.goto(url);
  await expectHome();
  const sessionsBefore = (await readDatabase()).sessions?.length ?? -1;
  await submitNewInterview(MAP_PROTOCOL, MAP_CANCELLED_CASE);
  const warning = page.getByRole('dialog', {
    name: 'You appear to be offline',
  });
  await expect(warning).toBeVisible();
  await expect(
    warning.getByText(
      'This protocol includes a map stage that needs an internet connection.',
      { exact: false },
    ),
  ).toBeVisible();
  await shot('needs-internet-warning');
  await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(warning).toBeHidden();
  await page.waitForTimeout(1000);
  const sessionsAfterCancel = (await readDatabase()).sessions ?? [];
  record(
    'needs-internet-warning-cancel',
    new URL(page.url()).pathname === '/' &&
      sessionsAfterCancel.length === sessionsBefore &&
      !sessionsAfterCancel.some((s) => s.caseId === MAP_CANCELLED_CASE),
    `offline, starting "${MAP_PROTOCOL}" warned "You appear to be offline" about its map stage; Cancel stayed on ${new URL(page.url()).pathname} with ${sessionsAfterCancel.length} sessions stored (before: ${sessionsBefore})`,
  );

  await page.goto(url);
  await expectHome();
  await submitNewInterview(MAP_PROTOCOL, MAP_CASE);
  await expect(warning).toBeVisible();
  await warning
    .getByRole('button', { name: 'Start anyway', exact: true })
    .click();
  const mapId = await expectInterviewMounted();
  await expect(interviewMain()).toBeVisible({ timeout: 20_000 });
  await nextStage();
  const toggle = page.getByTestId('quick-add-toggle');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true')
    await toggle.click();
  await page.getByTestId('quick-add-input').fill(MAPPED_PERSON);
  await page.getByTestId('quick-add-input').press('Enter');
  await expect(page.getByRole('option', { name: MAPPED_PERSON })).toBeVisible();
  await nextStage();
  const notice = page.getByText(MAP_OFFLINE_NOTICE);
  await expect(notice).toBeVisible({ timeout: 20_000 });
  // The participant must still be told what the stage asks: its prompt is
  // on screen, inside the viewport, once the stage has settled.
  const mapPrompt = page.getByText(`Where does ${MAPPED_PERSON} live?`);
  await page.waitForTimeout(1500);
  await expect(mapPrompt).toBeVisible();
  await expect(mapPrompt).toBeInViewport();
  await shot('needs-internet-map-offline');
  await nextStage();
  await expect(
    page.getByRole('heading', { name: 'Finish Interview' }),
  ).toBeVisible();
  record(
    'needs-internet-start-anyway',
    true,
    `"Start anyway" opened /interview/${mapId}; the welcome and quick-add stages worked offline ("${MAPPED_PERSON}" added); the map stage showed "${MAP_OFFLINE_NOTICE}" with its prompt, and Next went on to the finish stage`,
  );

  // Phase 7 (online again).
  await context.setOffline(false);
  deliberatelyOffline = false;
  await previousStage();
  await expect(notice).toBeHidden({ timeout: 30_000 });
  const mapCanvas = page.locator('canvas.mapboxgl-canvas');
  await expect(mapCanvas).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('© Mapbox').first()).toBeVisible({
    timeout: 30_000,
  });
  // A visible canvas can still be blank: data-map-idle is the stage's own
  // readiness flag (style loaded, map idle, GeoJSON layer rendered).
  const mapReady = await page
    .locator('[data-testid="map-container"][data-map-idle="true"]')
    .waitFor({ timeout: 60_000 })
    .then(
      () => true,
      () => false,
    );
  await shot('needs-internet-reconnected');
  record(
    'needs-internet-reconnect',
    mapReady && (await page.getByTestId('map-error-overlay').count()) === 0,
    mapReady
      ? 'back online, the map stage dropped its offline notice and loaded its map (style, tiles and regions layer ready, no error overlay)'
      : 'back online, the map stage never reported ready (data-map-idle stayed false for 60 s)',
  );

  await page.goto(url);
  await expectHome();
  await submitNewInterview(MAP_PROTOCOL, MAP_ONLINE_CASE);
  const onlineMapId = await expectInterviewMounted();
  const warnedOnline = await warning.count();
  record(
    'needs-internet-online-no-warning',
    warnedOnline === 0,
    `online, "${MAP_PROTOCOL}" started straight into /interview/${onlineMapId} with no offline warning`,
  );

  await page.goto(url);
  await expectHome();
  const finalChip = (await statusChip().innerText()).trim();
  await openDataView();
  const rows = {};
  for (const caseId of [FILE_CASE, SCHEMA8_CASE, MAP_CASE, MAP_ONLINE_CASE])
    rows[caseId] = await dataRow(caseId)
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  await expect(dataRow(FILE_CASE)).toContainText('100%');
  await shot('online-after-offline');
  record(
    'online-after-offline',
    Object.values(rows).every(Boolean) && finalChip === READY_CHIP,
    `back online after a reload: rows ${JSON.stringify(rows)}; ${FILE_CASE} still at 100%; status ${JSON.stringify(finalChip)}`,
  );

  record(
    'console-errors',
    consoleErrors.length === 0,
    consoleErrors.length
      ? `${consoleErrors.length} non-whitelisted console error(s): ${consoleErrors.slice(0, 3).join(' || ').slice(0, 400)}`
      : 'no non-whitelisted console errors across the walk',
  );

  clearTimeout(watchdog);
  await browser.close();
  finish(result.failures.length ? 1 : 0);
} catch (err) {
  clearTimeout(watchdog);
  record('walk', false, err instanceof Error ? err.message : String(err));
  try {
    await page.screenshot({ path: path.join(artifactsDir, 'failure.png') });
  } catch {
    /* page may be gone */
  }
  await browser.close().catch(() => {});
  finish(1);
}
