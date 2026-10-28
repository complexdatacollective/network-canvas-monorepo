#!/usr/bin/env node
// Canonical walker for the Interviewer release smoke test's
// schema8-interviewer8 journey: a schema 8 protocol conducted in the REAL
// Interviewer 8 that the deployment bundles at /v8/, against a DEPLOYED
// Interviewer origin in a fresh browser profile.
//
// Interviewer keeps schema 8 protocols on schema 8 and never upgrades them:
// Interviewer 9 imports, lists, exports and deletes their rows in the one
// shared database, and its /interview/<id> route hosts Interviewer 8's
// /v8/interview/<id> in a same-origin frame for every start, resume and
// review. The app's e2e suite (apps/interviewer/e2e/specs/
// legacy-interviewer.spec.ts) proves that contract against a stub page; only
// a deployment carries the bundled Interviewer 8 itself, so this walk is
// where the real one is exercised: import, start, its stages (an image asset
// read from the shared database, the passphrase that encrypts names, an ego
// answer, a quick-added person), exit and resume with the passphrase asked
// again, finish, the row on /data, the stored payload, review and export —
// then, with the network cut, a second interview started, conducted,
// reloaded and exited entirely offline.
//
// The fixture is packages/protocols/e2e/release-smoke-schema8; its archive
// is built from the reviewable protocol.json and its asset at run time.
// Interactions are lifted from the hand test of 2026-10-28 against the
// bundled Interviewer 8.5.0 and from apps/interviewer/e2e/fixtures/
// interview-nav.ts. Change interactions HERE — never let a release-test
// agent rebuild this from scratch.
//
// Usage (from the repo root):
//   node scripts/release-test/interviewer-schema8-walker.mjs \
//     --url https://interviewer.networkcanvas.dev \
//     --artifacts /path/to/artifacts [--timeout-ms 480000]
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

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}
const url = arg('url', 'https://interviewer.networkcanvas.dev');
const artifactsDir = arg('artifacts', null);
const timeoutMs = Number(arg('timeout-ms', '480000'));

const FIXTURE_DIR = path.join(
  repoRoot,
  'packages/protocols/e2e/release-smoke-schema8',
);
const PROTOCOL_NAME = 'Interviewer 8 Release Check';
const ONLINE_CASE = 'schema8-online';
const OFFLINE_CASE = 'schema8-offline';
const PASSPHRASE = 'relcheck1';
const EGO_NAME = 'Release Ego';
const ONLINE_PERSON = 'Ada Release';
const OFFLINE_PERSON = 'Offline Node';
// The fixture's image asset is 160 px wide: a decoded image of exactly that
// width is the asset's own bytes, read back out of the shared database.
const ASSET_WIDTH = 160;
// Interviewer 8 reaches its own finish screen after the fixture's four
// stages, so a finished interview stands at step 5 of 5.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

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

// The archive is BUILT from the reviewable fixture at run time — a committed
// binary could silently drift from the JSON reviewers inspect.
let protocolPath;
try {
  const JSZip = require('jszip');
  const zip = new JSZip();
  const protocolJson = fs.readFileSync(
    path.join(FIXTURE_DIR, 'protocol.json'),
    'utf8',
  );
  zip.file('protocol.json', protocolJson);
  for (const asset of Object.values(JSON.parse(protocolJson).assetManifest)) {
    zip.file(
      `assets/${asset.source}`,
      fs.readFileSync(path.join(FIXTURE_DIR, 'assets', asset.source)),
    );
  }
  protocolPath = path.join(artifactsDir, 'release-smoke-schema8.netcanvas');
  fs.writeFileSync(
    protocolPath,
    await zip.generateAsync({ type: 'nodebuffer' }),
  );
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
  // Interviewer 9's shell and Interviewer 8's both carry the meta
  // frame-ancestors notice, so the frame repeats it on every load.
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
  // the app catches its own update() rejection, so Chromium's log line is
  // the condition under test, not an app error.
  /An unknown error occurred when fetching the script/i,
];

let browser;
let context;
let page;
try {
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  // The relay is blocked in every context: analytics defaults on, and a fresh
  // profile would otherwise emit real events to product analytics.
  await context.route('**://ph-relay.networkcanvas.com/**', (r) => r.abort());
  // Force the plain-download rung the way the e2e suite does: Chromium
  // prefers the native Save-As picker, which never emits Playwright's
  // download event (apps/interviewer/e2e/fixtures/download-fixture.ts).
  await context.addInitScript(() => {
    delete window.showSaveFilePicker;
    delete navigator.canShare;
    delete navigator.share;
  });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  // Console messages from the Interviewer 8 frame reach the page's listener
  // too, so one listener covers both apps.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Chromium's generic "Failed to load resource" text omits the URL — it
    // lives in the message location, so match against both.
    const text = `${m.text()} ${m.location()?.url ?? ''}`;
    if (NOISE.some((p) => p.test(text))) return;
    if (deliberatelyOffline && OFFLINE_NOISE.some((p) => p.test(text))) return;
    consoleErrors.push(text.trim());
  });
  page.on('pageerror', (err) =>
    consoleErrors.push(`pageerror: ${err.message}`),
  );
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
async function shot(name) {
  shots += 1;
  await page.screenshot({
    path: path.join(
      artifactsDir,
      `${String(shots).padStart(2, '0')}-${name}.png`,
    ),
  });
}

// Interviewer 8, inside Interviewer 9's same-origin frame.
const frameElement = () => page.getByTestId('interviewer-8-frame');
const v8 = page.frameLocator('[data-testid="interviewer-8-frame"]');

// Deck-settle click: the spring-animated deck swallows early clicks, and a
// single stable sample pair can catch it mid-flight — require SUSTAINED
// stability (three identical samples 250 ms apart), matching the other
// walkers and the documented deck quirk.
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

async function expectHome() {
  // Compared as parts, never as a pattern built from the --url argument.
  const home = new URL(url);
  await expect(page).toHaveURL(
    (u) => u.origin === home.origin && u.pathname === '/' && u.search === '',
    { timeout: 20_000 },
  );
  await expect(
    page.getByRole('button', { name: 'Start new interview' }),
  ).toBeVisible({ timeout: 20_000 });
}

async function openDataView() {
  await page
    .getByRole('group', { name: 'Home view' })
    .getByText('Data')
    .click();
  await expect(page).toHaveURL(/\/data/);
}
const dataRow = (caseId) => page.getByRole('row').filter({ hasText: caseId });

// Start an interview on the fixture and require Interviewer 8 hosted for it:
// /interview/<id> framing /v8/interview/<the same id>, showing the
// fixture's first stage. Returns the session id.
async function startInterview(caseId) {
  await clickSettled(page.getByRole('button', { name: 'Start new interview' }));
  await page.getByTestId('new-session-case-id').fill(caseId);
  await page.getByTestId('new-session-submit').click();
  await expect(page).toHaveURL(new RegExp(`/interview/${UUID}$`), {
    timeout: 20_000,
  });
  const sessionId = page.url().split('/interview/')[1];
  await expect(frameElement()).toHaveAttribute(
    'src',
    `/v8/interview/${sessionId}`,
    { timeout: 30_000 },
  );
  await expect(
    v8.getByRole('heading', {
      name: 'Welcome to the Interviewer 8 release check',
    }),
  ).toBeVisible({ timeout: 30_000 });
  return sessionId;
}

// The fixture's image, decoded inside Interviewer 8 from the asset row
// Interviewer 9 wrote at import.
async function assetWidth() {
  const img = v8.getByRole('img', { name: 'Release check marker' });
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el) => (el.complete ? el.naturalWidth : 0)), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  return img.evaluate((el) => el.naturalWidth);
}

async function nextStage() {
  await v8.getByRole('button', { name: 'Next Step' }).click();
}

// Welcome → Privacy (set the passphrase) → About you → Name people, adding
// one person. Records a step per stage under the given prefix.
async function conductStages(prefix, person) {
  await nextStage();
  await expect(
    v8.getByRole('heading', {
      name: 'This interview uses enhanced privacy protection',
    }),
  ).toBeVisible({ timeout: 20_000 });
  await v8
    .getByRole('textbox', { name: 'Passphrase', exact: true })
    .fill(PASSPHRASE);
  await v8
    .getByRole('textbox', { name: 'Confirm Passphrase' })
    .fill(PASSPHRASE);
  await v8.getByRole('button', { name: 'Submit' }).click();
  await expect(
    v8.getByRole('status').filter({ hasText: 'Passphrase set' }),
  ).toBeVisible();
  record(`${prefix}passphrase`, true, 'passphrase set on the Privacy stage');

  await nextStage();
  const egoField = v8.getByRole('textbox', { name: 'What is your name?' });
  await expect(egoField).toBeVisible({ timeout: 20_000 });
  await egoField.fill(EGO_NAME);
  await expect(egoField).toHaveValue(EGO_NAME);
  record(`${prefix}egoform`, true, `ego name "${EGO_NAME}" entered`);

  await nextStage();
  await expect(
    v8.getByRole('heading', { name: 'Who are the people you know?' }),
  ).toBeVisible({ timeout: 20_000 });
  await v8.getByRole('button', { name: 'Add a person' }).click();
  const nameField = v8.getByRole('textbox', { name: 'Person name' });
  await nameField.fill(person);
  await nameField.press('Enter');
  await expect(
    v8.getByRole('listbox', { name: 'Added Nodes' }).getByRole('option', {
      name: person,
    }),
  ).toBeVisible();
  record(`${prefix}quickadd`, true, `"${person}" added and listed`);
}

// Interviewer 8's own exit: its Settings dialog → "Exit interview" → the
// confirm dialog's "Exit interview". Interviewer 8 then tells Interviewer 9
// it has closed, and Interviewer 9 goes home.
async function exitFromInterviewer8() {
  await v8.getByRole('button', { name: 'Settings' }).click();
  await v8.getByRole('button', { name: 'Exit interview' }).click();
  const dialog = v8.getByRole('dialog', { name: 'Exit this interview?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Exit interview' }).click();
  await expectHome();
}

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
    const [protocols, sessions] = [
      await all('protocols'),
      await all('sessions'),
    ];
    db.close();
    return {
      found: true,
      protocols: protocols.map((p) => ({
        name: p.name,
        schemaVersion: p.schemaVersion,
        documentSchemaVersion: p.protocol?.schemaVersion ?? null,
      })),
      sessions: sessions.map((s) => ({
        id: s.id,
        caseId: s.caseId,
        finishedAt: s.finishedAt ?? null,
        progress: s.progress ?? null,
        network: s.network ?? null,
      })),
    };
  }, DB_NAME);
}

const isBytes = (v) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);

// --- the walk -------------------------------------------------------------
try {
  // Phase 1 (online): service worker, import, app-wide offline readiness.
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const controlled = await page.evaluate(
    () => navigator.serviceWorker.controller !== null,
  );
  record('sw-controlled', controlled, 'page controlled after one reload');

  await page.getByTestId('protocol-import-input').setInputFiles(protocolPath);
  await expect(page.getByText('Protocol imported').first()).toBeVisible({
    timeout: 30_000,
  });
  const card = page.getByRole('region', { name: 'Protocol deck' });
  await expect(
    card.getByRole('heading', { name: PROTOCOL_NAME }),
  ).toBeVisible();
  const schemaChip = (
    await page.getByTestId('deck-card-schema').allInnerTexts()
  ).join(' | ');
  const stored = await readDatabase();
  const storedProtocol = stored.protocols?.find(
    (p) => p.name === PROTOCOL_NAME,
  );
  record(
    'protocol-imported',
    /schema 8/i.test(schemaChip) &&
      storedProtocol?.schemaVersion === 8 &&
      storedProtocol?.documentSchemaVersion === 8,
    `card schema chip ${JSON.stringify(schemaChip)}; stored row ${JSON.stringify(storedProtocol ?? null)} (expected schema 8, never upgraded)`,
  );
  await shot('protocol-imported');

  // Offline readiness is ONE app-wide status, ready only once Interviewer 9's
  // own precache AND the bundled Interviewer 8 are saved — the offline phase
  // below depends on both.
  const readyStarted = Date.now();
  await expect(
    page.getByRole('button', { name: /^Ready (for )?offline/ }),
  ).toBeVisible({ timeout: 240_000 });
  record(
    'offline-ready',
    true,
    `status read "Ready for offline" after ${Math.round((Date.now() - readyStarted) / 1000)} s`,
  );
  await shot('offline-ready');

  // Phase 2 (online): conduct an interview in Interviewer 8.
  const onlineId = await startInterview(ONLINE_CASE);
  record(
    'start-hosts-interviewer8',
    true,
    `/interview/${onlineId} frames /v8/interview/${onlineId}; Interviewer 8 shows the Welcome stage`,
  );
  await shot('interviewer8-welcome');
  const width = await assetWidth();
  record(
    'asset-renders',
    width === ASSET_WIDTH,
    `image asset decoded at ${width} px wide (expected ${ASSET_WIDTH})`,
  );
  await conductStages('stage-', ONLINE_PERSON);
  await shot('interviewer8-quickadd');

  // Exit mid-interview, then resume from Home: the same session reopens at
  // the stage it was left on, its encrypted name locked until the
  // passphrase is given again — a wrong one is refused, the right one
  // decrypts the stored name.
  await exitFromInterviewer8();
  await expect(
    page.getByRole('button', { name: /^Resume last interview/ }),
  ).toBeVisible();
  record('exit-mid-interview', true, "Interviewer 8's exit returned Home");
  await shot('exited-home');

  await page.getByRole('button', { name: /^Resume last interview/ }).click();
  await expect(page).toHaveURL(new RegExp(`/interview/${onlineId}$`), {
    timeout: 20_000,
  });
  await expect(frameElement()).toHaveAttribute(
    'src',
    `/v8/interview/${onlineId}`,
    { timeout: 30_000 },
  );
  const nodes = v8.getByRole('listbox', { name: 'Added Nodes' });
  await expect(
    v8.getByRole('heading', { name: 'Who are the people you know?' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(nodes.getByRole('option')).toHaveCount(1);
  await expect(nodes.getByRole('option', { name: '🔒' })).toBeVisible();
  record(
    'resume-locked',
    true,
    'resumed the same session on Name people with its one person locked',
  );
  await shot('resumed-locked');

  await v8.getByRole('button', { name: 'Enter your Passphrase' }).click();
  const passDialog = v8.getByRole('dialog', { name: 'Enter your Passphrase' });
  await passDialog
    .getByRole('textbox', { name: 'Passphrase' })
    .fill('wrongpass');
  await passDialog.getByRole('button', { name: 'Submit passphrase' }).click();
  await expect(
    passDialog.getByText('This passphrase does not match'),
  ).toBeVisible();
  await expect(nodes.getByRole('option', { name: ONLINE_PERSON })).toHaveCount(
    0,
  );
  record('wrong-passphrase-refused', true, 'a wrong passphrase was refused');
  await shot('wrong-passphrase');
  await passDialog
    .getByRole('textbox', { name: 'Passphrase' })
    .fill(PASSPHRASE);
  await passDialog.getByRole('button', { name: 'Submit passphrase' }).click();
  await expect(
    nodes.getByRole('option', { name: ONLINE_PERSON }),
  ).toBeVisible();
  record(
    'passphrase-unlocks',
    true,
    `the walk's passphrase decrypted the stored name "${ONLINE_PERSON}"`,
  );

  // Finish: Interviewer 8's finish screen and confirm, then its "Interview
  // complete" screen, whose Exit returns Home.
  await nextStage();
  await v8.getByRole('button', { name: 'Finish', exact: true }).click();
  await v8
    .getByRole('dialog', {
      name: 'Are you sure you want to finish the interview?',
    })
    .getByRole('button', { name: 'Finish Interview' })
    .click();
  await expect(
    v8.getByRole('heading', { name: 'Interview complete' }),
  ).toBeVisible({ timeout: 20_000 });
  await shot('finish-complete');
  await v8.getByRole('button', { name: 'Exit', exact: true }).click();
  await expectHome();
  record('finish', true, 'finished and exited Home');

  await openDataView();
  const onlineRow = dataRow(ONLINE_CASE);
  await expect(onlineRow).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await expect(onlineRow).toContainText('100%');
  await expect(onlineRow).toContainText(PROTOCOL_NAME);
  await expect(onlineRow.getByRole('button', { name: 'Review' })).toBeVisible();
  record('data-row', true, `${ONLINE_CASE} listed at 100% with Review`);
  await shot('data-row');

  // The PAYLOAD, not just the row: the finished session as Interviewer 8
  // wrote it into the shared database. Its one person's name is stored only
  // as ciphertext beside Interviewer 8's IV and salt; that the walk's
  // passphrase decrypts it was proven in the app above.
  const db = await readDatabase();
  const session = db.sessions?.find((s) => s.id === onlineId);
  const people = (session?.network?.nodes ?? []).filter(
    (n) => n.type === 'person',
  );
  const person = people[0];
  const secure = person?._secureAttributes?.name;
  const serialized = JSON.stringify(session?.network ?? null);
  const payloadOk =
    db.found &&
    typeof session?.finishedAt === 'string' &&
    session.progress === 100 &&
    session.network?.ego?.attributes?.ego_name === EGO_NAME &&
    people.length === 1 &&
    isBytes(person.attributes?.name) &&
    isBytes(secure?.iv) &&
    secure.iv.length === 12 &&
    isBytes(secure?.salt) &&
    !serialized.includes(ONLINE_PERSON);
  record(
    'persisted-payload',
    payloadOk,
    `${db.missingDatabase ? `IndexedDB ${db.missingDatabase} does not exist; ` : ''}finishedAt=${JSON.stringify(session?.finishedAt ?? null)} progress=${JSON.stringify(session?.progress ?? null)} ego=${JSON.stringify(session?.network?.ego?.attributes?.ego_name ?? null)} people=${people.length} nameCiphertextBytes=${isBytes(person?.attributes?.name) ? person.attributes.name.length : 'none'} iv=${secure?.iv?.length ?? 'none'} salt=${secure?.salt?.length ?? 'none'} plaintextNameStored=${serialized.includes(ONLINE_PERSON)}`,
  );

  // Review: /interview/<id>?mode=review frames Interviewer 8 in review mode,
  // which says changes will not be saved.
  await onlineRow.getByRole('button', { name: 'Review' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/interview/${onlineId}\\?mode=review$`),
    { timeout: 20_000 },
  );
  await expect(frameElement()).toHaveAttribute(
    'src',
    `/v8/interview/${onlineId}?mode=review`,
    { timeout: 30_000 },
  );
  await expect(
    v8.getByRole('heading', { name: 'Read-only review' }),
  ).toBeVisible({ timeout: 30_000 });
  record(
    'review',
    true,
    'Interviewer 8 opened the finished interview read-only',
  );
  await shot('review');

  // Export the finished interview from /data (unconverted, schema 8 data).
  await page.goto(`${url}/data`);
  await expect(onlineRow).toBeVisible({ timeout: 20_000 });
  await onlineRow.getByRole('checkbox').check();
  await page.getByTestId('data-export').click();
  await expect(
    page.getByRole('heading', { name: 'Archive ready' }),
  ).toBeVisible({ timeout: 60_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByTestId('data-save-export').click(),
  ]);
  const archivePath = path.join(artifactsDir, 'schema8-export.zip');
  await download.saveAs(archivePath);
  const JSZip = require('jszip');
  const archive = await JSZip.loadAsync(fs.readFileSync(archivePath));
  const entries = {};
  for (const entry of Object.values(archive.files)) {
    if (!entry.dir) entries[entry.name] = await entry.async('string');
  }
  const names = Object.keys(entries);
  const graphml = names.filter((n) => n.endsWith('.graphml'));
  const egoCsv = names.filter((n) => n.endsWith('_ego.csv'));
  // Node partitions are named after the codebook type's name ("Person").
  const personCsv = names.filter((n) =>
    n.endsWith('_attributeList_Person.csv'),
  );
  const personRows = personCsv[0]
    ? entries[personCsv[0]].trim().split('\n').slice(1)
    : [];
  const graphmlNodes = graphml[0]
    ? (entries[graphml[0]].match(/<node /g) ?? []).length
    : 0;
  // Interviewer 8 exports an encrypted attribute as the word ENCRYPTED, so
  // the person's name must appear nowhere in the archive.
  const nameLeaked = Object.values(entries).some((text) =>
    text.includes(ONLINE_PERSON),
  );
  const exportOk =
    graphml.length === 1 &&
    graphml[0].startsWith(`${ONLINE_CASE}_${onlineId}`) &&
    graphmlNodes === 1 &&
    egoCsv.length === 1 &&
    entries[egoCsv[0]].includes(EGO_NAME) &&
    personCsv.length === 1 &&
    personRows.length === 1 &&
    personRows[0].endsWith(',ENCRYPTED') &&
    !nameLeaked;
  await expect(onlineRow).not.toContainText('Not exported', {
    timeout: 15_000,
  });
  record(
    'export',
    exportOk,
    `${download.suggestedFilename()}: ${JSON.stringify(names)}; graphml nodes=${graphmlNodes}; ego CSV has ego name=${egoCsv[0] ? entries[egoCsv[0]].includes(EGO_NAME) : false}; person CSV rows=${JSON.stringify(personRows)}; plaintext name in archive=${nameLeaked}; row now marked exported`,
  );
  await shot('exported');

  // Phase 3 (offline): a second interview started, conducted, reloaded and
  // exited with the network cut, from the precache alone. A positive
  // control proves the flip is real: a non-precached same-origin fetch
  // must FAIL.
  await context.setOffline(true);
  deliberatelyOffline = true;
  const offlineReal = await page.evaluate(async () => {
    if (navigator.onLine) return false;
    try {
      await fetch(`/__offline-probe-${Math.random()}__`, { cache: 'no-store' });
      return false;
    } catch {
      return true;
    }
  });
  record(
    'offline-positive-control',
    offlineReal,
    'uncached fetch fails while offline',
  );
  if (!offlineReal)
    throw new Error('offline flip did not take — walk would be meaningless');

  await page.goto(url);
  await expectHome();
  record('offline-boot', true, 'Home booted from the precache while offline');
  await shot('offline-boot');

  const offlineId = await startInterview(OFFLINE_CASE);
  const offlineWidth = await assetWidth();
  record(
    'offline-start',
    offlineWidth === ASSET_WIDTH,
    `offline: /interview/${offlineId} framed Interviewer 8 from the precache; image asset ${offlineWidth} px wide (expected ${ASSET_WIDTH})`,
  );
  await shot('offline-interviewer8');
  await conductStages('offline-', OFFLINE_PERSON);

  // Reload the hosted interview itself, still offline: both apps' shells
  // come out of the precache and the session reopens where it was, its
  // person kept (locked again, since the passphrase lives only in memory).
  // Interviewer 8's session writes are fire-and-forget, so wait for the
  // person to be stored first — a reload that outruns the write would
  // simply re-read the session without it (seen once in four runs).
  await expect
    .poll(
      async () => {
        const { sessions } = await readDatabase();
        const s = sessions?.find((row) => row.id === offlineId);
        return (s?.network?.nodes ?? []).filter((n) => n.type === 'person')
          .length;
      },
      { timeout: 15_000 },
    )
    .toBe(1);
  await page.reload();
  await expect(frameElement()).toHaveAttribute(
    'src',
    `/v8/interview/${offlineId}`,
    { timeout: 30_000 },
  );
  await expect(
    v8.getByRole('heading', { name: 'Who are the people you know?' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(nodes.getByRole('option')).toHaveCount(1);
  await expect(nodes.getByRole('option', { name: '🔒' })).toBeVisible();
  await shot('offline-reload');
  // What was stored offline must still be readable: the walk's passphrase
  // decrypts the person's name, as on the online resume.
  await v8.getByRole('button', { name: 'Enter your Passphrase' }).click();
  await passDialog
    .getByRole('textbox', { name: 'Passphrase' })
    .fill(PASSPHRASE);
  await passDialog.getByRole('button', { name: 'Submit passphrase' }).click();
  await expect(
    nodes.getByRole('option', { name: OFFLINE_PERSON }),
  ).toBeVisible();
  record(
    'offline-reload',
    true,
    `offline reload reopened Name people with its one person kept, and the walk's passphrase decrypted the name "${OFFLINE_PERSON}"`,
  );

  await exitFromInterviewer8();
  record('offline-exit', true, "Interviewer 8's exit returned Home offline");

  await openDataView();
  const offlineRow = dataRow(OFFLINE_CASE);
  await expect(offlineRow).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await expect(offlineRow).not.toContainText('100%');
  await expect(
    offlineRow.getByRole('button', { name: 'Resume' }),
  ).toBeVisible();
  const offlineDb = await readDatabase();
  const offlineSession = offlineDb.sessions?.find((s) => s.id === offlineId);
  const offlinePeople = (offlineSession?.network?.nodes ?? []).filter(
    (n) => n.type === 'person',
  );
  const offlineSecure = offlinePeople[0]?._secureAttributes?.name;
  const offlinePlaintext = JSON.stringify(
    offlineSession?.network ?? null,
  ).includes(OFFLINE_PERSON);
  record(
    'offline-data-row',
    offlineSession?.finishedAt === null &&
      offlineSession?.network?.ego?.attributes?.ego_name === EGO_NAME &&
      offlinePeople.length === 1 &&
      isBytes(offlinePeople[0].attributes?.name) &&
      isBytes(offlineSecure?.iv) &&
      offlineSecure.iv.length === 12 &&
      isBytes(offlineSecure?.salt) &&
      !offlinePlaintext,
    `${OFFLINE_CASE} listed in progress with Resume while offline; stored ego=${JSON.stringify(offlineSession?.network?.ego?.attributes?.ego_name ?? null)} people=${offlinePeople.length} iv=${offlineSecure?.iv?.length ?? 'none'} salt=${offlineSecure?.salt?.length ?? 'none'} plaintextNameStored=${offlinePlaintext} finishedAt=${JSON.stringify(offlineSession?.finishedAt ?? null)}`,
  );
  await shot('offline-data-row');

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
