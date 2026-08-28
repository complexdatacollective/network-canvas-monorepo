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
//     [--protocol packages/protocols/e2e/release-smoke/release-smoke.netcanvas] \
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
const protocolPath = path.resolve(
  repoRoot,
  arg(
    'protocol',
    'packages/protocols/e2e/release-smoke/release-smoke.netcanvas',
  ),
);
const caseId = arg('case-id', 'release-smoke');
const keepOnline = argv.includes('--keep-online');
const timeoutMs = Number(arg('timeout-ms', '300000'));

if (!artifactsDir) {
  console.error('Missing required --artifacts <dir>');
  process.exit(3);
}
if (!fs.existsSync(protocolPath)) {
  console.error(`Protocol file not found: ${protocolPath}`);
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

// --- browser --------------------------------------------------------------
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);

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

// Click a control that may still be animating (the protocol deck): wait for
// its bounding box to hold still across two samples first.
async function clickSettled(locator) {
  await expect(locator).toBeVisible();
  for (let i = 0; i < 20; i += 1) {
    const a = await locator.boundingBox();
    await page.waitForTimeout(250);
    const b = await locator.boundingBox();
    if (a && b && a.x === b.x && a.y === b.y) break;
  }
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
  // first, No after), each answer auto-advancing to the next pair and the
  // last one advancing the stage itself.
  await page.getByTestId('next-button').click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  const dyadStepBefore = await stageStep().getAttribute('data-stage-step');
  for (let pair = 0; pair < 3; pair += 1) {
    await page.getByRole('radio', { name: pair === 0 ? 'Yes' : 'No' }).click();
    await page.waitForTimeout(700); // selection animation + auto-advance
  }
  await expect
    .poll(() => stageStep().getAttribute('data-stage-step'), {
      timeout: 20_000,
    })
    .not.toBe(dyadStepBefore);
  await shot('stage-dyadcensus');
  record('stage-dyadcensus', true, '3 pairs answered, stage auto-advanced');

  // Stage 6 — CategoricalBin: one categorical write via keyboard DnD. The
  // deployed build does not expose bin membership as role=option (verified
  // empirically), so the oracle is the unplaced-drawer count dropping.
  await dragNodeToBin('Alex', 'Work');
  await expect(page.getByText('2 unplaced')).toBeVisible();
  await shot('stage-catbin');
  record('stage-catbin', true, 'Alex categorised as Work (2 unplaced remain)');
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
    await page.goto(url);
    await expect(
      page.getByRole('button', { name: 'Start new interview' }),
    ).toBeVisible({ timeout: 15_000 });
    await openDataView();
    await expectStableRow('data-row-online');
    record('persisted-online', true, 'row present after online reload');
  }

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
