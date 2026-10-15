#!/usr/bin/env node
// Canonical walker for the Interviewer release smoke test's conduct journey.
//
// Conducts the release-smoke fixture protocol
// (packages/protocols/e2e/release-smoke/) against a DEPLOYED Interviewer
// origin in a fresh browser profile: service worker installs online, the
// protocol is imported online, then the entire interview is conducted OFFLINE
// and the persisted session is verified on /data both offline and after
// coming back online. This proves the deployment's precache serves the whole
// engine without network, that every data-model write path (ego, node,
// layout, both edge-creation paths, categorical and ordinal attributes,
// encrypted attributes, a family pedigree) persists, and that the schema 9
// runtime works offline: a participant-chosen language, dynamic values in
// stage text, the bin completion gate and tap-to-place, a stage with nobody
// to show skipped in both directions, a second finish stage reached only by
// skip logic, and the finish stage recorded with the session.
//
// Every interaction is lifted from the repo's proven e2e driving code:
// apps/interviewer/e2e/fixtures/interview-nav.ts (session start, stage
// advance, ego form, quick add, finish) and packages/interview/e2e
// (sociogram pointer drags with the 5px threshold-clearing jiggle, dyad
// census radios, categorical-bin keyboard DnD via Ctrl+D + arrow + Enter,
// select-mode bins, the anonymisation passphrase form, the family pedigree
// new-person panel) and apps/interviewer/e2e/specs/i18n.spec.ts (language
// chooser).
// Change interactions HERE, in step with those fixtures — never let a
// release-test agent rebuild this from scratch.
//
// Usage (from the repo root):
//   node scripts/release-test/interviewer-release-smoke-walker.mjs \
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
const interviewMain = () =>
  page.locator('main[data-theme-interview]:not([aria-busy="true"])');
// The fixture's stage indices (packages/protocols/e2e/release-smoke).
const STEP = {
  language: 0,
  information: 1,
  egoIntroduction: 2,
  egoForm: 3,
  anonymisation: 4,
  quickAdd: 5,
  sociogram: 6,
  dyadIntroduction: 7,
  dyadCensus: 8,
  catBin: 9,
  emptyAlterForm: 10,
  ordinalBin: 11,
  familyPedigree: 12,
  finish: 13,
  finishDeclined: 14,
};
const PEOPLE = ['Alex', 'Blair', 'Casey'];
const PASSPHRASE = 'smoke-pass1';
const EXPECTED_CONTEXT = { Alex: 'work', Blair: 'social', Casey: 'family' };
const EXPECTED_CLOSENESS = { Alex: 3, Blair: 2, Casey: 1 };
const EXPECTED_CLOSENESS_LABEL = {
  Alex: 'Very close',
  Blair: 'Somewhat close',
  Casey: 'Not close',
};
const sortedPair = (pair) =>
  [...pair].toSorted((a, b) => String(a).localeCompare(String(b))).join('+');
// Dynamic values (packages/interview/src/dynamicValues/DynamicText.tsx)
// render each inserted value as a [data-dynamic-value] span: the value in an
// aria-hidden <bdi> plus a screen-reader-only "Dynamic value: …" twin. Read
// the inserted values themselves, and the sentence as a sighted reader sees
// it (screen-reader twins removed).
const insertedValues = (locator) =>
  locator.locator('[data-dynamic-value] bdi').allTextContents();
const sightedText = (locator) =>
  locator.evaluate((el) => {
    const copy = el.cloneNode(true);
    for (const twin of copy.querySelectorAll('[data-dynamic-value] .sr-only'))
      twin.remove();
    return (copy.textContent ?? '').trim();
  });
async function expectStep(step) {
  await expect(stageStep()).toHaveAttribute('data-stage-step', String(step), {
    timeout: 20_000,
  });
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
  await expect(interviewMain()).toBeVisible({ timeout: 15_000 });
  await expect(stageStep()).toHaveAttribute('data-stage-step', /\d+/);
  record('session-started', true, `case ID ${caseId}`);

  // Stage 0 — LanguageChooser (apps/interviewer/e2e/specs/i18n.spec.ts):
  // the protocol declares en-US and es. Choosing español must switch the
  // interview's language at once — the built-in list name, the interview's
  // lang, the interface's own controls AND the protocol's text on the next
  // stage — and choosing English again must switch every one of them back.
  await expectStep(STEP.language);
  await expect(interviewMain()).toHaveAttribute('lang', 'en-US');
  const languages = page.getByRole('listbox', {
    name: 'Choose a language',
    exact: true,
  });
  await expect(languages).toBeVisible();
  await expect(languages.getByRole('option')).toHaveCount(2);
  const spanish = languages.getByRole('option', { name: 'español' });
  const english = languages
    .getByRole('option')
    .filter({ hasNotText: 'español' });
  await expect(english).toHaveAttribute('aria-selected', 'true');
  await spanish.click();
  await expect(interviewMain()).toHaveAttribute('lang', 'es');
  await expect(
    page.getByRole('listbox', { name: 'Elige un idioma', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Configuración', exact: true }),
  ).toBeVisible();
  await shot('stage-language-es');
  await nextStage();
  // The protocol's own text, in the chosen language.
  await expect(
    page.getByRole('heading', { name: 'Prueba de humo' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Release smoke' }),
  ).toHaveCount(0);
  await previousStage();
  await expectStep(STEP.language);
  await page
    .getByRole('listbox', { name: 'Elige un idioma', exact: true })
    .getByRole('option')
    .filter({ hasNotText: 'español' })
    .click();
  await expect(interviewMain()).toHaveAttribute('lang', 'en-US');
  await expect(languages).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Settings', exact: true }),
  ).toBeVisible();
  record(
    'stage-language',
    true,
    'español switched list name, lang, interface controls and protocol text; English switched them back',
  );
  await nextStage();

  // Stage 1 — Information: protocol text back in English, with today's date
  // inserted by a dynamic value ({today} bound to "now").
  await expectStep(STEP.information);
  await expect(
    page.getByRole('heading', { name: 'Release smoke' }),
  ).toBeVisible();
  const todayLine = page.getByText(/^This short interview exercises/).first();
  await expect(todayLine).toBeVisible();
  const todayExpected = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
  }).format(new Date());
  const todayValues = await insertedValues(todayLine);
  const todayText = await sightedText(todayLine);
  const todayRendered =
    JSON.stringify(todayValues) === JSON.stringify([todayExpected]) &&
    todayText.endsWith(`Today is ${todayExpected}.`);
  await shot('stage-information');
  record(
    'stage-information',
    todayRendered,
    `dynamic {today} rendered as ${JSON.stringify(todayText)} (inserted ${JSON.stringify(todayValues)}, expected ${JSON.stringify(todayExpected)})`,
  );
  await nextStage();

  // Stage 2 — Information: the EgoForm's instructions, a stage of their own
  // since schema 9.
  await expectStep(STEP.egoIntroduction);
  await expect(page.getByText('Tell us about')).toBeVisible();
  record('stage-ego-introduction', true);
  await nextStage();

  // Stage 3 — EgoForm. Fill the required name; blur is load-bearing:
  // protocol forms validate on blur, and the next-button only becomes ready
  // once validation has run (interview-nav.ts). Decline consent first: the
  // next stage's skip logic must send the participant straight to the
  // second finish stage, bypassing every stage between; Back must return to
  // the form, and accepting consent restores the full route.
  await expectStep(STEP.egoForm);
  const egoField = page.locator('[data-field-name="ego_name"] input');
  await expect(egoField).toBeVisible();
  await egoField.fill('Smoke Tester');
  await egoField.blur();
  const consentRadio = (name) =>
    page
      .locator('[data-field-name="consent"]')
      .getByRole('radio', { name, exact: true });
  await consentRadio('No, I do not agree to take part.').click();
  await expect(consentRadio('No, I do not agree to take part.')).toBeChecked();
  await nextStage();
  await expectStep(STEP.finishDeclined);
  await expect(
    page.getByRole('heading', { name: 'You Chose Not to Take Part' }),
  ).toBeVisible();
  await shot('stage-consent-declined');
  await previousStage();
  await expectStep(STEP.egoForm);
  await consentRadio('Yes, I agree to take part.').click();
  await expect(consentRadio('Yes, I agree to take part.')).toBeChecked();
  record(
    'skip-to-second-finish',
    true,
    `declined consent jumped ${STEP.egoForm}→${STEP.finishDeclined} ("You Chose Not to Take Part"); Back returned to ${STEP.egoForm}`,
  );
  await shot('stage-egoform');
  record('stage-egoform', true, 'ego_name filled, consent accepted');
  await nextStage();

  // Stage 4 — Anonymisation (packages/interview/e2e/fixtures/
  // anonymisation-fixture.ts): choose a passphrase; every person's name is
  // an encrypted attribute from here on.
  await expectStep(STEP.anonymisation);
  await page.locator('[data-field-name="passphrase"] input').fill(PASSPHRASE);
  await page.locator('[data-field-name="passphrase-2"] input').fill(PASSPHRASE);
  await page.locator('button[type="submit"]', { hasText: 'Continue' }).click();
  await expect(
    page.getByText('Passphrase accepted! Click "Next" to continue.'),
  ).toBeVisible({ timeout: 20_000 });
  record('stage-anonymisation', true, 'passphrase chosen and accepted');
  await nextStage();

  // Stage 5 — NameGeneratorQuickAdd: the prompt inserts the ego's name
  // (dynamic value ego.ego_name), then create three nodes.
  await expectStep(STEP.quickAdd);
  const quickAddPrompt = page.getByText(/^Who are the people you know/).first();
  await expect(quickAddPrompt).toBeVisible();
  const quickAddValues = await insertedValues(quickAddPrompt);
  const quickAddText = await sightedText(quickAddPrompt);
  if (
    JSON.stringify(quickAddValues) !== '["Smoke Tester"]' ||
    quickAddText !== 'Who are the people you know, Smoke Tester?'
  )
    throw new Error(
      `quick-add prompt did not insert the ego name: ${JSON.stringify(quickAddText)} inserted ${JSON.stringify(quickAddValues)}`,
    );
  for (const name of PEOPLE) {
    const toggle = page.getByTestId('quick-add-toggle');
    if ((await toggle.getAttribute('aria-pressed')) !== 'true')
      await toggle.click();
    const input = page.getByTestId('quick-add-input');
    await input.fill(name);
    await input.press('Enter');
    await expect(page.getByRole('option', { name })).toBeVisible();
  }
  await shot('stage-quickadd');
  record(
    'stage-quickadd',
    true,
    'prompt showed "Who are the people you know, Smoke Tester?"; added Alex, Blair, Casey',
  );
  await nextStage();

  // Stage 6 — Sociogram: place all three (layout writes), then click two
  // nodes in turn to create a "Knows" edge on the same prompt.
  await expectStep(STEP.sociogram);
  await dragNodeToCanvasPosition('Alex', { x: 0.3, y: 0.35 });
  await dragNodeToCanvasPosition('Blair', { x: 0.65, y: 0.35 });
  await dragNodeToCanvasPosition('Casey', { x: 0.5, y: 0.65 });
  await page.getByRole('button', { name: /^Alex/ }).click();
  await page.getByRole('button', { name: /^Blair/ }).click();
  await expect(page.locator('line[data-edge-id]')).toHaveCount(1);
  await shot('stage-sociogram');
  record('stage-sociogram', true, '3 placed, 1 Knows edge');
  await nextStage();

  // Stage 7 — Information: the DyadCensus's instructions.
  await expectStep(STEP.dyadIntroduction);
  await expect(
    page.getByText('You will be asked about each pair of people you named.'),
  ).toBeVisible();
  record('stage-dyad-introduction', true);
  await nextStage();

  // Stage 8 — DyadCensus: answer all three pairs (Yes for the first, No
  // after). Each pair's prompt inserts both people's labels (dynamic values
  // dyad.source.$label / dyad.target.$label), which must be exactly the pair
  // on screen. The ~350 ms auto-advance timer races a fixed sleep under
  // load, so wait for the observable PAIR IDENTITY to change after each
  // non-final answer (the DyadCensusFixture pattern).
  await expectStep(STEP.dyadCensus);
  await expect(page.getByRole('radio').first()).toBeVisible();
  const pairLabels = () =>
    page
      .locator('.w-md')
      .getByRole('button')
      .allTextContents()
      .then((t) => t.join('|'))
      .catch(() => '');
  const dyadPrompt = page.getByText(/^Are .+ friends\?/).first();
  // Retain the FIRST pair's identity: it receives the walk's only "Yes",
  // so the persisted friends edge must connect exactly these two people.
  let friendsPair = [];
  const promptMismatches = [];
  for (let pair = 0; pair < 3; pair += 1) {
    const before = await pairLabels();
    const shown = before.split('|');
    if (pair === 0) friendsPair = shown;
    await expect(dyadPrompt).toBeVisible();
    const named = await insertedValues(dyadPrompt);
    const promptText = await sightedText(dyadPrompt);
    if (
      named.length !== 2 ||
      sortedPair(named) !== sortedPair(shown) ||
      promptText !== `Are ${named[0]} and ${named[1]} friends?`
    )
      promptMismatches.push(
        `${JSON.stringify(promptText)} inserted ${JSON.stringify(named)} vs on screen ${before}`,
      );
    await page.getByRole('radio', { name: pair === 0 ? 'Yes' : 'No' }).click();
    if (pair < 2) {
      await expect.poll(pairLabels, { timeout: 15_000 }).not.toBe(before);
    }
  }
  await expect
    .poll(() => stageStep().getAttribute('data-stage-step'), {
      timeout: 20_000,
    })
    .toBe(String(STEP.catBin));
  await shot('stage-dyadcensus');
  record(
    'stage-dyadcensus',
    promptMismatches.length === 0,
    promptMismatches.length
      ? `prompt did not name the pair on screen: ${promptMismatches.join('; ')}`
      : '3 pairs answered, each prompt named its pair, stage auto-advanced',
  );

  // Stage 9 — CategoricalBin with the completion gate: with a person still
  // unplaced, Next must be refused with the notice and the step unchanged;
  // once all three are placed it advances. The deployed build does not
  // expose bin membership as role=option (verified empirically), so the
  // placement oracle is the unplaced-drawer count reaching zero.
  await dragNodeToBin('Alex', 'Work');
  await page.getByTestId('next-button').click();
  await expect(
    page.getByText('You must place every item before you can continue.'),
  ).toBeVisible();
  // Give a wrongly-permitted advance time to land before reading the step.
  await page.waitForTimeout(1000);
  await expectStep(STEP.catBin);
  record(
    'catbin-completion-gate',
    true,
    'Next refused with "You must place every item…" while Blair and Casey were unplaced',
  );
  await dragNodeToBin('Blair', 'Social');
  await dragNodeToBin('Casey', 'Family');
  await expect(page.getByText('0 unplaced')).toBeVisible();
  await shot('stage-catbin');
  record('stage-catbin', true, 'Alex→Work, Blair→Social, Casey→Family placed');

  // Stage 10 — an AlterForm whose filter matches nobody has nothing to ask:
  // navigation must pass it going forward AND going back.
  await nextStage();
  await expectStep(STEP.ordinalBin);
  await previousStage();
  await expectStep(STEP.catBin);
  await nextStage();
  await expectStep(STEP.ordinalBin);
  record(
    'empty-stage-skipped',
    true,
    `step ${STEP.catBin}→${STEP.ordinalBin} forward and ${STEP.ordinalBin}→${STEP.catBin} back, never showing the empty follow-up form (step ${STEP.emptyAlterForm})`,
  );

  // Stage 11 — OrdinalBin in select mode (packages/interview/e2e/matrix/
  // ordinal-bin.scenarios.ts select-mode-tap-to-place): tap a person in the
  // drawer to make them the one being placed, then tap a bin.
  const announcer = page.getByTestId('bin-select-announcer');
  const drawerNode = (name) => page.getByRole('button', { name, exact: true });
  await expect(announcer).toHaveText('Choose where Alex belongs.');
  await drawerNode('Casey').click();
  await expect(drawerNode('Casey')).toHaveAttribute('aria-pressed', 'true');
  await expect(announcer).toHaveText('Choose where Casey belongs.');
  for (const name of ['Casey', 'Alex', 'Blair']) {
    const bin = EXPECTED_CLOSENESS_LABEL[name];
    if ((await drawerNode(name).getAttribute('aria-pressed')) !== 'true')
      await drawerNode(name).click();
    await expect(drawerNode(name)).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: `Place ${name} in ${bin}` }).click();
  }
  await expect(announcer).toHaveText('Nothing left to place.');
  await shot('stage-ordbin');
  record(
    'stage-ordbin',
    true,
    'tap-to-place: Casey selected out of turn, then Alex and Blair; nothing left to place',
  );
  await nextStage();

  // Stage 12 — FamilyPedigree (packages/interview/e2e/matrix/
  // family-pedigree.scenarios.ts): the participant appears as "You"; add a
  // parent through the new-person wizard.
  await expectStep(STEP.familyPedigree);
  const member = (name) =>
    page.getByTestId('pedigree-person').getByLabel(name, { exact: true });
  const panel = page.getByTestId('pedigree-person-panel');
  await expect(member('You')).toBeVisible();
  await member('You').hover();
  await page.getByTestId('pedigree-menu-parent').click();
  await expect(
    panel.getByRole('heading', { name: 'Add your parent' }),
  ).toBeVisible();
  const sexGroup = panel.getByRole('radiogroup', {
    name: /^Sex assigned at birth/,
  });
  await panel.getByRole('textbox', { name: /^Name/ }).fill('Linda');
  await panel
    .getByRole('radiogroup', { name: /^Gender identity/ })
    .getByRole('radio', { name: 'Woman', exact: true })
    .click();
  await sexGroup.getByRole('radio', { name: 'Female', exact: true }).click();
  const carried = panel
    .getByRole('radiogroup', { name: /^Did this parent carry the pregnancy\?/ })
    .getByRole('radio', { name: 'Yes', exact: true });
  const save = panel.getByRole('button', { name: 'Save', exact: true });
  // A new person is described a group of questions at a time: answering sex
  // at birth moves the panel on to the parent's own questions (the matrix
  // describe() helper), which ask whether this parent carried the pregnancy.
  await expect(sexGroup).toBeHidden();
  await expect(carried).toBeVisible();
  await carried.click();
  await expect(carried).toBeChecked();
  for (let step = 0; step < 5 && !(await save.isVisible()); step += 1) {
    await panel.getByRole('button', { name: /^(Continue|Skip)$/ }).click();
  }
  await save.click();
  await expect(panel).toHaveCount(0);
  await expect(member('Linda')).toBeVisible();
  // A biological parent brings a stand-in for the other biological parent
  // (drawn unnamed as "Biological father"), so the family is three people.
  await expect(page.getByTestId('pedigree-person')).toHaveCount(3);
  await expect(member('Biological father')).toBeVisible();
  await shot('stage-family-pedigree');
  record(
    'stage-family-pedigree',
    true,
    'added Linda as a parent through the new-person wizard',
  );
  await nextStage();

  // FinishSession (confirmation mode).
  await expectStep(STEP.finish);
  await expect(
    page.getByRole('heading', { name: 'Finish Interview' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Finish', exact: true }).click();
  // The interview stays on its finish stage, now showing that stage's own
  // finished screen (the declined stage's says "Thank you for your time.").
  await expect(
    page.getByRole('heading', { name: 'Interview Finished' }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Thank you for participating!')).toBeVisible();
  await shot('finish-complete');
  record('finish', true, 'interview completed');
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
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
  // raw (this profile is 'none' mode, so fields are plaintext; only the
  // protocol's encrypted attribute is ciphertext) and assert every write
  // path the walk exercised is present.
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
    const nodes = s.network.nodes ?? [];
    const isBytes = (v) =>
      Array.isArray(v) &&
      v.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
    return {
      found: true,
      sessionCount: sessions.length,
      finishStageId: s.finishStageId ?? null,
      finishOutcome: s.finishOutcome ?? null,
      finishedAt: s.finishedAt ?? null,
      // People, in creation order (the walk added Alex, Blair, Casey).
      people: nodes
        .filter((n) => n.type === 'person')
        .map((n) => {
          const a = n.attributes ?? {};
          const iv = n._secureAttributes?.name?.iv;
          return {
            uid: n._uid,
            nameIsCiphertext: isBytes(a.name) && a.name.length === 48,
            nameIv12: isBytes(iv) && iv.length === 12,
            secureKeys: Object.keys(n._secureAttributes ?? {}),
            layout:
              a.layout &&
              typeof a.layout.x === 'number' &&
              typeof a.layout.y === 'number'
                ? { x: a.layout.x, y: a.layout.y }
                : null,
            context: Array.isArray(a.context) ? a.context : null,
            closeness: a.closeness ?? null,
          };
        }),
      family: nodes
        .filter((n) => n.type === 'family_member')
        .map((n) => ({
          uid: n._uid,
          isEgo: n.attributes?.is_ego === true,
          name: n.attributes?.fm_name ?? null,
          sex: n.attributes?.sexAssignedAtBirth ?? null,
        })),
      edges: (s.network.edges ?? []).map((e) => ({
        type: e.type,
        from: e.from,
        to: e.to,
        kind: e.attributes?.relationshipKind ?? null,
        carrier: e.attributes?.isGestationalCarrier ?? null,
      })),
      egoName: (s.network.ego?.attributes ?? {}).ego_name ?? null,
      consent: (s.network.ego?.attributes ?? {}).consent ?? null,
      // Every stored string, to prove no plaintext person name survived.
      serialized: JSON.stringify(s.network),
    };
  });
  const people = payload.people ?? [];
  const nameOf = Object.fromEntries(
    people.map((p, i) => [p.uid, PEOPLE[i] ?? `?${i}`]),
  );
  const byName = Object.fromEntries(people.map((p, i) => [PEOPLE[i], p]));
  // Values, not counts: each person must carry its EXACT category, ordinal
  // value and its own layout, and the three layouts must be pairwise
  // distinct (three identical coordinates is corruption even though every
  // count matches).
  const contextsExact = Object.entries(EXPECTED_CONTEXT).every(([n, cat]) => {
    const c = byName[n]?.context;
    return Array.isArray(c) && c.length === 1 && c[0] === cat;
  });
  const closenessExact = Object.entries(EXPECTED_CLOSENESS).every(([n, v]) => {
    const c = byName[n]?.closeness;
    return Array.isArray(c) ? c.length === 1 && c[0] === v : c === v;
  });
  const layoutPoints = PEOPLE.map((n) => byName[n]?.layout).filter(Boolean);
  const layoutsDistinct =
    layoutPoints.length === 3 &&
    new Set(layoutPoints.map((p) => `${p.x},${p.y}`)).size === 3;
  // Edge ENDPOINTS and cardinality, not just type presence: exactly one
  // knows edge between Alex and Blair (the sociogram link), and exactly one
  // friends edge between the pair the walk answered Yes for.
  const personEdges = (payload.edges ?? [])
    .filter((e) => e.type === 'knows' || e.type === 'friends')
    .map((e) => ({ type: e.type, ends: [nameOf[e.from], nameOf[e.to]] }));
  const knowsEdges = personEdges.filter((e) => e.type === 'knows');
  const friendsEdges = personEdges.filter((e) => e.type === 'friends');
  const edgesExact =
    personEdges.length === 2 &&
    knowsEdges.length === 1 &&
    sortedPair(knowsEdges[0].ends) === 'Alex+Blair' &&
    friendsEdges.length === 1 &&
    friendsPair.length === 2 &&
    sortedPair(friendsEdges[0].ends) === sortedPair(friendsPair);
  // The family the pedigree drew: the participant, Linda (female, who
  // carried the pregnancy) and the unnamed stand-in for the other
  // biological parent (male, saved under its generated label), each joined
  // to the participant by exactly one biological-parent edge.
  const family = payload.family ?? [];
  const famEgo = family.find((f) => f.isEgo);
  const linda = family.find((f) => f.name === 'Linda');
  const standIn = family.find((f) => f.name === 'Biological father');
  const familyEdges = (payload.edges ?? []).filter(
    (e) => e.type === 'family_edge',
  );
  const parentEdge = (parent) =>
    familyEdges.filter((e) => e.from === parent?.uid && e.to === famEgo?.uid);
  const familyExact =
    family.length === 3 &&
    Boolean(famEgo && linda && standIn) &&
    JSON.stringify(linda.sex) === '["female"]' &&
    JSON.stringify(standIn.sex) === '["male"]' &&
    familyEdges.length === 2 &&
    parentEdge(linda).length === 1 &&
    JSON.stringify(parentEdge(linda)[0].kind) === '["biological"]' &&
    parentEdge(linda)[0].carrier === true &&
    parentEdge(standIn).length === 1 &&
    JSON.stringify(parentEdge(standIn)[0].kind) === '["biological"]' &&
    parentEdge(standIn)[0].carrier !== true;
  const payloadOk =
    payload.found &&
    payload.sessionCount === 1 &&
    people.length === 3 &&
    contextsExact &&
    closenessExact &&
    layoutsDistinct &&
    edgesExact &&
    familyExact &&
    payload.egoName === 'Smoke Tester' &&
    payload.consent === true;
  record(
    'persisted-payload',
    payloadOk,
    `people=${JSON.stringify(byName)} personEdges=${JSON.stringify(personEdges)} expectedFriendsPair=${JSON.stringify(friendsPair)} family=${JSON.stringify(family)} familyEdges=${JSON.stringify(familyEdges)} ego=${JSON.stringify(payload.egoName ?? null)} consent=${JSON.stringify(payload.consent ?? null)} contextsExact=${contextsExact} closenessExact=${closenessExact} layoutsDistinct=${layoutsDistinct} edgesExact=${edgesExact} familyExact=${familyExact}`,
  );
  // Encrypted attributes: every person's name is stored as ciphertext (a
  // short name pads to one 32-byte block plus the 16-byte GCM tag) with only
  // its 12-byte IV beside it, and no person's plaintext name appears
  // anywhere in the stored network.
  const plaintextLeaks = PEOPLE.filter((n) =>
    (payload.serialized ?? '').includes(`"${n}"`),
  );
  const encryptionOk =
    people.length === 3 &&
    people.every(
      (p) =>
        p.nameIsCiphertext &&
        p.nameIv12 &&
        JSON.stringify(p.secureKeys) === '["name"]',
    ) &&
    plaintextLeaks.length === 0;
  record(
    'persisted-encryption',
    encryptionOk,
    `per person {ciphertext48, iv12, secureKeys}: ${JSON.stringify(people.map((p) => [p.nameIsCiphertext, p.nameIv12, p.secureKeys]))}; plaintext names in stored network: ${JSON.stringify(plaintextLeaks)}`,
  );
  // The finish stage the walk ended on, recorded with the session: the
  // normal finish stage and its outcome — not the declined-consent finish
  // stage the walk visited and left.
  const finishOk =
    payload.finishStageId === 'finish' &&
    payload.finishOutcome === 'completed' &&
    typeof payload.finishedAt === 'string';
  record(
    'persisted-finish',
    finishOk,
    `finishStageId=${JSON.stringify(payload.finishStageId ?? null)} finishOutcome=${JSON.stringify(payload.finishOutcome ?? null)} finishedAt=${JSON.stringify(payload.finishedAt ?? null)} (expected "finish"/"completed")`,
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
