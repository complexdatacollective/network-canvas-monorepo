#!/usr/bin/env node
// Canonical walker for the Interviewer release smoke test's conduct journey.
//
// Conducts the release-smoke fixture protocol
// (packages/protocols/e2e/release-smoke/) against a DEPLOYED Interviewer
// origin in a fresh browser profile: service worker installs online, the
// protocol is imported online, then the entire interview is conducted OFFLINE
// and the persisted session is verified on /data both offline and after
// coming back online. This proves the deployment's precache serves the whole
// engine without network and that every data-model write path (ego, node,
// layout, both edge-creation paths, categorical attribute) persists.
//
// Every interaction is lifted from the repo's proven e2e driving code:
// apps/interviewer/e2e/fixtures/interview-nav.ts (session start, stage
// advance, ego form, quick add, finish) and packages/interview/e2e
// (sociogram pointer drags with the 5px threshold-clearing jiggle, dyad
// census radios, categorical-bin keyboard DnD via Ctrl+D + arrow + Enter).
// Change interactions HERE, in step with those fixtures — never let a
// release-test agent rebuild this from scratch.
//
// Usage (from the repo root):
//   node scripts/interviewer-release-smoke-walker.mjs \
//     --url https://interviewer.networkcanvas.dev \
//     --artifacts /path/to/artifacts \
//     [--protocol packages/protocols/e2e/release-smoke/protocol.json] \
//     [--case-id release-smoke] [--keep-online] [--timeout-ms 300000]
//
// Exit codes: 0 = all checks passed; 1 = one or more checks failed (see
// result.json); 2 = watchdog timeout (a hang, not a verdict); 3 = harness
// setup error. Always writes <artifacts>/result.json and per-stage
// screenshots; the final stdout line is the result JSON.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const require = createRequire(
  path.join(repoRoot, 'apps/interviewer/package.json'),
);
const { chromium, expect: baseExpect } = require('@playwright/test');
// .configure returns a new instance — assigning it is what applies the timeout.
const expect = baseExpect.configure({ timeout: 15_000 });

// --- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}
const url = arg('url', 'https://interviewer.networkcanvas.dev');
const artifactsDir = arg('artifacts', null);
const protocolSource = path.resolve(
  repoRoot,
  arg('protocol', 'packages/protocols/e2e/release-smoke/protocol.json'),
);
const caseId = arg('case-id', 'release-smoke');
const keepOnline = argv.includes('--keep-online');
const timeoutMs = Number(arg('timeout-ms', '300000'));

if (!artifactsDir) {
  // Without an artifacts dir there is nowhere to write result.json — the
  // one setup failure that cannot honour the structured contract.
  console.error('Missing required --artifacts <dir>');
  process.exit(3);
}
fs.mkdirSync(artifactsDir, { recursive: true });

// --- result recording -----------------------------------------------------
const result = {
  ok: false,
  url,
  offline: !keepOnline,
  caseId,
  steps: [],
  failures: [],
};
const consoleErrors = [];
// Network-failure console lines are exempt ONLY while the walk has
// deliberately cut the network — the same class while online is reportable.
let deliberatelyOffline = false;
function setupFailure(note) {
  record('setup', false, note);
  finish(3);
}

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

// The archive is BUILT from the reviewable protocol.json at run time — a
// committed binary could silently drift from the JSON reviewers inspect. A
// prebuilt .netcanvas path is still accepted for ad-hoc runs. Failures here
// are structured setup errors (result.json + exit 3), per the contract.
let protocolPath = protocolSource;
if (!fs.existsSync(protocolSource)) {
  setupFailure(`protocol source not found: ${protocolSource}`);
}
if (protocolSource.endsWith('.json')) {
  try {
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file('protocol.json', fs.readFileSync(protocolSource, 'utf8'));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    protocolPath = path.join(artifactsDir, 'release-smoke.netcanvas');
    fs.writeFileSync(protocolPath, buffer);
  } catch (err) {
    setupFailure(
      `archive build failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// --- browser --------------------------------------------------------------
// Setup failures (missing/corrupt Chromium) must honour the documented
// contract — exit 3 with a result.json — not escape as a bare rejection.
let browser;
let context;
let page;
try {
  browser = await chromium.launch();
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  // REQUIRED in every context that loads the app: analytics defaults on, and
  // a fresh profile would register a synthetic installation and emit real
  // protocol/interview events to product analytics. Block before any page.
  await context.route('**://ph-relay.networkcanvas.com/**', (r) => r.abort());
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  // Every non-whitelisted console error is reportable under the gate's
  // shared journey contract (same listener as the vault walker; noise
  // patterns match the message location URL too, since Chromium's generic
  // "Failed to load resource" text omits it).
  const NOISE = [
    /frame-ancestors.*ignored when delivered via a <meta> element/i,
    // Cloudflare's injected beacon produces exactly two CSP signatures: the
    // refused INLINE bootstrap (the app ships no inline scripts of its own)
    // and the blocked cloudflareinsights.com load. Any OTHER CSP violation —
    // e.g. a URL-bearing refusal of a lazy app script under a bad policy —
    // must surface.
    /Refused to execute inline script.*Content Security Policy/i,
    /cloudflareinsights/i,
    /ph-relay\.networkcanvas\.com/i,
    /__offline-probe-/,
  ];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = `${m.text()} ${m.location()?.url ?? ''}`;
    if (NOISE.some((p) => p.test(text))) return;
    // While the walk has deliberately cut the network, resource-load
    // failures are the condition under test, not findings; the same class
    // while ONLINE is reportable. App-level errors still surface offline —
    // they are never "Failed to load resource" lines.
    if (
      deliberatelyOffline &&
      /Failed to load resource: net::ERR_(INTERNET_DISCONNECTED|FAILED)/.test(
        text,
      )
    )
      return;
    consoleErrors.push(text.trim());
  });
} catch (err) {
  record(
    'setup',
    false,
    `browser setup failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  finish(3);
}

// A hang must fail loudly, never stall the release gate: hard watchdog.
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
    fullPage: false,
  });
}

const stageStep = () => page.locator('[data-stage-step]');
async function nextStage() {
  const before = await stageStep().getAttribute('data-stage-step');
  await page.getByTestId('next-button').click();
  await expect
    .poll(() => stageStep().getAttribute('data-stage-step'), {
      timeout: 20_000,
    })
    .not.toBe(before);
}

// Click a control that may still be animating (the protocol deck's spring
// can pause at identical coordinates mid-flight): require SUSTAINED
// stability — three identical samples 250 ms apart — before clicking, per
// the repo's documented deck-settle quirk.
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
  // Never click into a still-moving deck: exhausting the window without
  // sustained stability is a loud failure, not a fall-through to the exact
  // swallowed-click behaviour this helper prevents.
  if (stable < 3)
    throw new Error('deck never settled after 30 stability samples');
  await locator.click();
}

// Sociogram drag (packages/interview/e2e/matrix/sociogram.scenarios.ts):
// pointer-capture drag, NOT native DnD — raw mouse with an 8px jiggle to
// clear the 5px DRAG_THRESHOLD so the pointerup is not treated as a click.
async function dragNodeToCanvasPosition(label, target) {
  const node = page.getByRole('button', { name: new RegExp(`^${label}`) });
  const canvas = page.locator('[data-zone-id="sociogram-canvas"]');
  const nodeBox = await node.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!nodeBox || !canvasBox)
    throw new Error(`cannot measure "${label}" or canvas`);
  const startX = nodeBox.x + nodeBox.width / 2;
  const startY = nodeBox.y + nodeBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 8, startY + 8);
  await page.mouse.move(
    canvasBox.x + canvasBox.width * target.x,
    canvasBox.y + canvasBox.height * target.y,
    { steps: 10 },
  );
  await page.mouse.up();
}

// Categorical-bin keyboard DnD (packages/interview/e2e/fixtures/
// stage-fixture.ts): focus via evaluate (roving tabindex), Ctrl+D lifts,
// ArrowRight cycles drop targets read from the polite live region, Enter drops.
async function dragNodeToBin(nodeLabel, binLabel) {
  const node = page.getByRole('button', { name: nodeLabel }).first();
  await expect(node).toBeVisible();
  await node.evaluate((el) => {
    if (el instanceof HTMLElement) el.focus();
  });
  await node.press('Control+d');
  let found = false;
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('ArrowRight');
    const announcement = await page.evaluate(() => {
      const els = document.querySelectorAll(
        'body > div[role="status"][aria-live="polite"]',
      );
      for (const el of els) {
        const text = el.textContent?.trim() ?? '';
        if (text.includes('Drop target')) return text;
      }
      return '';
    });
    if (announcement.includes(binLabel)) {
      found = true;
      break;
    }
  }
  if (!found) throw new Error(`no DnD target "${binLabel}" after 20 steps`);
  await page.keyboard.press('Enter');
}

// --- the walk -------------------------------------------------------------
try {
  // Phase 1 (online): service worker install + precache, protocol import.
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const controlled = await page.evaluate(
    () => navigator.serviceWorker.controller !== null,
  );
  record('sw-controlled', controlled, 'page controlled after one reload');
  await shot('sw-ready');

  await page
    .locator('[data-testid="protocol-import-input"]')
    .setInputFiles(protocolPath);
  await expect(page.getByText('Protocol imported').first()).toBeVisible({
    timeout: 30_000,
  });
  record('protocol-imported', true, path.basename(protocolPath));
  await shot('protocol-imported');

  // Phase 2: go offline, with a positive control proving offline is real —
  // a non-precached same-origin fetch must FAIL (workbox's navigation
  // fallback covers navigations only, so this falls through to the network).
  if (!keepOnline) {
    await context.setOffline(true);
    deliberatelyOffline = true;
    const offlineReal = await page.evaluate(async () => {
      if (navigator.onLine) return false;
      try {
        await fetch(`/__offline-probe-${Math.random()}__`, {
          cache: 'no-store',
        });
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
    await shot('offline-control');
    // A memory-resident SPA proves nothing about the precache: RELOAD while
    // offline so the shell and engine must come out of the service worker's
    // cache, and require the app to boot back to a usable Home.
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Start new interview' }),
    ).toBeVisible({ timeout: 20_000 });
    record(
      'offline-boot',
      true,
      'app reloaded from the precache while offline',
    );
    await shot('offline-boot');
    // Deferred runtime assets: the walk's stages never request the emitted
    // worker chunks (auto-layout, export, mapbox workers), so their offline
    // retrievability needs its own oracle — every worker asset the precache
    // declares must actually be served while offline. GeospatialSearch's
    // lazy chunk is NOT precached on the live deployment; Geospatial is
    // documented online-only (map tiles are NetworkOnly and the app warns
    // before an offline start), so that is recorded as an observation.
    const deferred = await page.evaluate(async () => {
      const names = await caches.keys();
      const pre = names.find((n) => n.includes('precache'));
      if (!pre) return { found: false };
      const cache = await caches.open(pre);
      const urls = (await cache.keys()).map((r) => r.url);
      const workers = urls.filter((u) => /worker[-.][^/]*\.js/i.test(u));
      const results = [];
      for (const u of workers) {
        try {
          const resp = await fetch(u);
          results.push({ url: u.split('/').pop(), ok: resp.ok });
        } catch {
          results.push({ url: u.split('/').pop(), ok: false });
        }
      }
      return {
        found: true,
        total: urls.length,
        workers: results,
        autoLayoutPresent: urls.some((u) => /autoLayout\.worker-/.test(u)),
        geospatialSearchPrecached: urls.some((u) =>
          /geospatialsearch/i.test(u),
        ),
      };
    });
    // Named identities, not just "whatever was found": an omitted worker
    // vanishes from the discovered list, so every() alone cannot see it.
    // Offline-load-bearing set (all present on the live deployment):
    // auto-layout (sociogram canvas), the fresco-ui search worker (stage
    // navigation / roster filtering), and the export worker.
    const EXPECTED_WORKERS = [
      /autoLayout\.worker-/,
      /search\.worker-/,
      /exportWorker-/,
    ];
    const workerNames = (deferred.workers ?? []).map((w) => w.url);
    const expectedPresent = EXPECTED_WORKERS.every((p) =>
      workerNames.some((n) => p.test(n)),
    );
    const deferredOk =
      deferred.found &&
      expectedPresent &&
      deferred.workers.length > 0 &&
      deferred.workers.every((w) => w.ok);
    record(
      'deferred-chunks-offline',
      deferredOk,
      `precache=${deferred.total ?? 0} entries; worker assets ${JSON.stringify(deferred.workers ?? [])}; expected workers (autoLayout/search/export) present=${expectedPresent}; GeospatialSearch precached=${deferred.geospatialSearchPrecached ?? false} (observation — Geospatial is documented online-only)`,
    );
  }

  // Phase 3: conduct the whole interview (offline unless --keep-online).
  await clickSettled(page.getByRole('button', { name: 'Start new interview' }));
  await page.getByTestId('new-session-case-id').fill(caseId);
  await page.getByTestId('new-session-submit').click();
  await expect(page).toHaveURL(/\/interview\//, { timeout: 15_000 });
  await expect(page.locator('main[data-theme-interview]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(stageStep()).toHaveAttribute('data-stage-step', /\d+/);
  record('session-started', true, `case ID ${caseId}`);

  // Stage 1 — Information: static content renders.
  await expect(
    page.getByRole('heading', { name: 'Release smoke' }),
  ).toBeVisible();
  await shot('stage-information');
  record('stage-information', true);
  await nextStage();

  // Stage 2 — EgoForm: intro panel and form render on one screen (no
  // dismissal step). Fill the required ego field; blur is load-bearing:
  // protocol forms validate on blur, and the next-button only becomes ready
  // once validation has run (interview-nav.ts).
  const egoField = page.locator('[data-field-name="ego_name"] input');
  await expect(egoField).toBeVisible();
  await egoField.fill('Smoke Tester');
  await egoField.blur();
  await shot('stage-egoform');
  record('stage-egoform', true, 'ego_name filled');
  await nextStage();

  // Stage 3 — NameGeneratorQuickAdd: create three nodes.
  for (const name of ['Alex', 'Blair', 'Casey']) {
    const toggle = page.getByTestId('quick-add-toggle');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true')
      await toggle.click();
    const input = page.getByTestId('quick-add-input');
    await input.fill(name);
    await input.press('Enter');
    await expect(page.getByRole('option', { name })).toBeVisible();
  }
  await shot('stage-quickadd');
  record('stage-quickadd', true, 'added Alex, Blair, Casey');
  await nextStage();

  // Stage 4 — Sociogram: place all three (layout writes), then click two
  // nodes in turn to create a "Knows" edge on the same prompt.
  await dragNodeToCanvasPosition('Alex', { x: 0.3, y: 0.35 });
  await dragNodeToCanvasPosition('Blair', { x: 0.65, y: 0.35 });
  await dragNodeToCanvasPosition('Casey', { x: 0.5, y: 0.65 });
  await page.getByRole('button', { name: /^Alex/ }).click();
  await page.getByRole('button', { name: /^Blair/ }).click();
  await expect(page.locator('line[data-edge-id]')).toHaveCount(1);
  await shot('stage-sociogram');
  record('stage-sociogram', true, '3 placed, 1 Knows edge');
  await nextStage();

  // Stage 5 — DyadCensus: dismiss intro, answer all three pairs (Yes for the
  // first, No after). The ~350 ms auto-advance timer races a fixed sleep
  // under load, so wait for the observable PAIR IDENTITY to change after
  // each non-final answer (the DyadCensusFixture pattern) — the final answer
  // advances the stage itself.
  await page.getByTestId('next-button').click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  const dyadStepBefore = await stageStep().getAttribute('data-stage-step');
  const pairLabels = () =>
    page
      .locator('.w-md')
      .getByRole('button')
      .allTextContents()
      .then((t) => t.join('|'))
      .catch(() => '');
  // Retain the FIRST pair's identity: it receives the walk's only "Yes",
  // so the persisted friends edge must connect exactly these two people.
  let friendsPair = [];
  for (let pair = 0; pair < 3; pair += 1) {
    const before = await pairLabels();
    if (pair === 0) friendsPair = before.split('|');
    await page.getByRole('radio', { name: pair === 0 ? 'Yes' : 'No' }).click();
    if (pair < 2) {
      await expect.poll(pairLabels, { timeout: 15_000 }).not.toBe(before);
    }
  }
  await expect
    .poll(() => stageStep().getAttribute('data-stage-step'), {
      timeout: 20_000,
    })
    .not.toBe(dyadStepBefore);
  await shot('stage-dyadcensus');
  record('stage-dyadcensus', true, '3 pairs answered, stage auto-advanced');

  // Stage 6 — CategoricalBin: categorise ALL three nodes (three categorical
  // writes across distinct bins). The deployed build does not expose bin
  // membership as role=option (verified empirically), so the oracle is the
  // unplaced-drawer count reaching zero.
  await dragNodeToBin('Alex', 'Work');
  await dragNodeToBin('Blair', 'Social');
  await dragNodeToBin('Casey', 'Family');
  await expect(page.getByText('0 unplaced')).toBeVisible();
  await shot('stage-catbin');
  record('stage-catbin', true, 'Alex→Work, Blair→Social, Casey→Family placed');
  await nextStage();

  // FinishSession.
  await expect(
    page.getByRole('heading', { name: 'Finish Interview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Finish Interview' }).click();
  await expect(page.getByTestId('interview-complete')).toBeVisible({
    timeout: 15_000,
  });
  await shot('finish-complete');
  record('finish', true, 'interview completed');
  await page.getByRole('button', { name: 'Exit' }).click();
  // Let the exit flow finish its own navigation before navigating ourselves —
  // a goto raced against it gets yanked back to Home (seen empirically).
  await expect(
    page.getByRole('button', { name: 'Start new interview' }),
  ).toBeVisible({ timeout: 15_000 });

  // Reach /data the way a user does: the Data segment of the view switcher.
  async function openDataView() {
    await page
      .getByRole('group', { name: 'Home view' })
      .getByText('Data')
      .click();
    await expect(page).toHaveURL(/\/data/);
  }
  // The row must be STABLE, not a flash: assert, let the view settle past
  // its enter animation and any refetch, and assert again before the
  // evidence screenshot — a screenshot of an empty table is not evidence.
  async function expectStableRow(label) {
    const row = page.getByRole('row').filter({ hasText: caseId });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(row).toBeVisible();
    await expect(row).toContainText('100%');
    await shot(label);
  }

  // Phase 4: persistence — the completed session is listed on /data at
  // 100%, still offline.
  await openDataView();
  await expectStableRow(keepOnline ? 'data-row' : 'data-row-offline');
  record('persisted-offline', true, `${caseId} listed at 100%`);

  // Phase 5: back online, boot fresh from Home — the row survives a reload.
  if (!keepOnline) {
    await context.setOffline(false);
    deliberatelyOffline = false;
    await page.goto(url);
    await expect(
      page.getByRole('button', { name: 'Start new interview' }),
    ).toBeVisible({ timeout: 15_000 });
    await openDataView();
    await expectStableRow('data-row-online');
    record('persisted-online', true, 'row present after online reload');
  }

  // Phase 6: the PAYLOAD survived, not just the row — a session whose
  // network write was dropped still lists at 100%. Read the stored session
  // raw (this profile is 'none' mode, so fields are plaintext) and assert
  // every write path the walk exercised is present.
  const payload = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('interviewer');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const sessions = await new Promise((res, rej) => {
      const tx = db.transaction('sessions', 'readonly');
      const rq = tx.objectStore('sessions').getAll();
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    db.close();
    const s = sessions[0];
    if (!s?.network) return { found: false };
    const edges = s.network.edges ?? [];
    const byName = {};
    const idToName = {};
    for (const n of s.network.nodes ?? []) {
      const a = n.attributes ?? {};
      idToName[n._uid] = a.name;
      byName[a.name] = {
        layout:
          a.layout &&
          typeof a.layout.x === 'number' &&
          typeof a.layout.y === 'number'
            ? { x: a.layout.x, y: a.layout.y }
            : null,
        context: Array.isArray(a.context) ? a.context : null,
      };
    }
    return {
      found: true,
      sessionCount: sessions.length,
      byName,
      // Endpoint identity, not just type presence: map each edge's node ids
      // (entityPrimaryKeyProperty '_uid') back to names.
      edgeList: edges.map((e) => ({
        type: e.type,
        ends: [idToName[e.from], idToName[e.to]].toSorted((a, b) =>
          String(a).localeCompare(String(b)),
        ),
      })),
      egoName: (s.network.ego?.attributes ?? {}).ego_name ?? null,
      nodeCount: (s.network.nodes ?? []).length,
    };
  });
  // Values, not counts: each node must carry its EXACT category and its own
  // layout, and the three layouts must be pairwise distinct (the walk placed
  // them at distinct spots — three identical coordinates is corruption even
  // though every count matches).
  const EXPECTED_CONTEXT = { Alex: 'work', Blair: 'social', Casey: 'family' };
  const byName = payload.byName ?? {};
  const contextsExact = Object.entries(EXPECTED_CONTEXT).every(([n, cat]) => {
    const c = byName[n]?.context;
    return Array.isArray(c) && c.length === 1 && c[0] === cat;
  });
  const layoutPoints = Object.keys(EXPECTED_CONTEXT)
    .map((n) => byName[n]?.layout)
    .filter(Boolean);
  const layoutsDistinct =
    layoutPoints.length === 3 &&
    new Set(layoutPoints.map((p) => `${p.x},${p.y}`)).size === 3;
  // Edge ENDPOINTS and cardinality, not just type presence: exactly one
  // knows edge between Alex and Blair (the sociogram link), and exactly one
  // friends edge between the pair the walk answered Yes for — a right-typed
  // edge on the wrong dyad, or a duplicate, is corrupted relationship data.
  const edgeList = payload.edgeList ?? [];
  const sortedPair = (pair) =>
    [...pair].toSorted((a, b) => String(a).localeCompare(String(b))).join('+');
  const knowsEdges = edgeList.filter((e) => e.type === 'knows');
  const friendsEdges = edgeList.filter((e) => e.type === 'friends');
  const edgesExact =
    edgeList.length === 2 &&
    knowsEdges.length === 1 &&
    sortedPair(knowsEdges[0].ends) === 'Alex+Blair' &&
    friendsEdges.length === 1 &&
    friendsPair.length === 2 &&
    sortedPair(friendsEdges[0].ends) === sortedPair(friendsPair);
  const payloadOk =
    payload.found &&
    payload.sessionCount === 1 &&
    payload.nodeCount === 3 &&
    contextsExact &&
    layoutsDistinct &&
    edgesExact &&
    payload.egoName === 'Smoke Tester';
  record(
    'persisted-payload',
    payloadOk,
    `stored network: ${JSON.stringify(byName)} edges=${JSON.stringify(edgeList)} expectedFriendsPair=${JSON.stringify(friendsPair)} ego=${JSON.stringify(payload.egoName ?? null)} contextsExact=${contextsExact} layoutsDistinct=${layoutsDistinct} edgesExact=${edgesExact} nodeCount=${payload.nodeCount ?? 0}`,
  );

  // Cross-cutting: every non-whitelisted console error collected across the
  // whole walk is reportable under the gate's shared journey contract.
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
