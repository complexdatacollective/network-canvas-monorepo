#!/usr/bin/env node
// Canonical walker for the Interviewer release smoke test's security-vault
// journey: device-lock enrolment, unlock, idle auto-lock, step-up auth at
// every gated boundary, encryption at rest, PIN rotation with cross-tab
// force-lock, revocation, passphrase enrolment, and the lock-screen reset
// path — against a DEPLOYED Interviewer origin in a fresh browser profile.
//
// Every interaction is lifted from the app's e2e-proven driving code:
// apps/interviewer/e2e/fixtures/vault-fixture.ts (the 6-step wizard,
// segmented-code entry, auto-submitting PIN unlock, step-up confirm),
// apps/interviewer/e2e/specs/auth.spec.ts (lock-screen reset dialog, the
// suppressed recovery button on interview routes), and component sources for
// exact labels (SecurityBehaviorControls, ManageAuthenticator, TopActionBar).
// Change interactions HERE, in step with those fixtures — never let a
// release-test agent rebuild this from scratch.
//
// Usage (from the repo root):
//   node scripts/interviewer-security-vault-walker.mjs \
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

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
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
const timeoutMs = Number(arg('timeout-ms', '600000'));
const PIN = '31415926';
const NEW_PIN = '27182818';
const PASSPHRASE = 'correct-horse-battery-1';

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
  // The relay is blocked in every context: analytics defaults on, and a fresh
  // profile would otherwise emit real events to product analytics.
  await context.route('**://ph-relay.networkcanvas.com/**', (r) => r.abort());
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
} catch (err) {
  record(
    'setup',
    false,
    `browser setup failed: ${err instanceof Error ? err.message : String(err)}`,
  );
  finish(3);
}

// Every non-whitelisted console error is reportable under the gate's shared
// journey contract; collect them for a dedicated final step. Documented
// noise: the meta frame-ancestors CSP notice, Cloudflare's blocked beacon,
// and the ph-relay requests failed by the route abort above.
const consoleErrors = [];
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
];
// Attach to EVERY page in the context (the cross-tab check opens a second
// one) — an error on any page is part of the verdict.
function attachConsoleListener(p) {
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Chromium's generic "Failed to load resource" text omits the URL — it
    // lives in the message location, so match the noise patterns against
    // both (the ph-relay aborts from our own route block land here).
    const text = `${m.text()} ${m.location()?.url ?? ''}`;
    if (!NOISE.some((pat) => pat.test(text))) consoleErrors.push(text.trim());
  });
}
attachConsoleListener(page);
context.on('page', (p) => attachConsoleListener(p));

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
async function shot(name, p = page) {
  shots += 1;
  await p.screenshot({
    path: path.join(
      artifactsDir,
      `${String(shots).padStart(2, '0')}-${name}.png`,
    ),
  });
}

// --- primitives from vault-fixture.ts -------------------------------------
async function typeSegmented(p, fieldName, digits) {
  const inputs = p.getByTestId(`segmented-code-${fieldName}`).locator('input');
  for (let i = 0; i < digits.length; i += 1) {
    await inputs.nth(i).fill(digits[i] ?? '');
  }
}
async function expectLocked(p = page) {
  await expect(p.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
}
async function unlockPin(pin, p = page) {
  await expectLocked(p);
  await typeSegmented(p, 'pin', pin); // auto-submits when complete
}
async function expectUnlocked(p = page) {
  await expect(p.getByRole('heading', { name: 'Welcome back' })).toHaveCount(
    0,
    { timeout: 15_000 },
  );
  await expect(p.getByLabel('Lock app')).toBeVisible();
}
// A rejected code CLEARS the segmented field — wait for that event-driven
// signal rather than a fixed sleep the PBKDF2 verify can outlast on a slow
// machine (which would sample "still pending" as "refused" and then type
// into a busy form).
async function expectPinRejected(p = page) {
  await expect(
    p.getByTestId('segmented-code-pin').locator('input').first(),
  ).toHaveValue('', { timeout: 30_000 });
}

// Deck-settle click: the spring-animated deck swallows early clicks, and a
// single stable sample pair can catch it mid-flight — require SUSTAINED
// stability (three identical samples 250 ms apart), matching the smoke
// walker and the documented deck quirk.
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

async function openSecuritySettings() {
  await page.getByTestId('settings-trigger').click();
  await page.getByRole('tab', { name: 'Security' }).click();
}
async function closeSettings() {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
}
async function setToggle(name, on) {
  const t = page
    .getByRole('checkbox', { name })
    .or(page.getByRole('switch', { name }));
  await expect(t).toBeVisible();
  const state = await t.getAttribute('aria-checked');
  if ((state === 'true') !== on) await t.click();
  await expect(t).toHaveAttribute('aria-checked', String(on));
}

async function installSampleProtocol() {
  // Card activation is EFFECT-VERIFIED with retries: the dot click can be
  // swallowed while the deck's entrance spring is still running (observed
  // when this is the walk's first interaction after initial load).
  const install = page.getByRole('button', {
    name: 'Install sample protocol',
  });
  const dot = page.getByRole('button', { name: 'Go to card 1' });
  // Let the deck's ENTRANCE spring finish before the first interaction —
  // clicks dispatched during it are swallowed (probe-verified: a click 4 s
  // after load activates the card instantly; one at ~2 s does not).
  await expect(
    page
      .getByText('0 protocols')
      .or(page.getByText(/\d+ protocols/))
      .first(),
  ).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForTimeout(2_000);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await install.isVisible().catch(() => false)) break;
    if (await dot.isVisible().catch(() => false)) {
      await clickSettled(dot);
      // Activation's own effect signal: the dot takes aria-current.
      const activated = await expect(dot)
        .toHaveAttribute('aria-current', 'true', { timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (activated) break;
    }
  }
  await clickSettled(install);
  await expect(page.getByText('Protocol imported').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('button', { name: 'Start new interview' }),
  ).toBeVisible({ timeout: 15_000 });
}

async function startInterview(caseId) {
  await clickSettled(page.getByRole('button', { name: 'Start new interview' }));
  await page.getByTestId('new-session-case-id').fill(caseId);
  await page.getByTestId('new-session-submit').click();
}
async function expectStageMounted() {
  await expect(page.locator('main[data-theme-interview]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-stage-step]')).toHaveAttribute(
    'data-stage-step',
    /\d+/,
  );
}
async function exitInterview() {
  await page.getByTestId('settings-button').click();
  // The "Exit interview" menu item IS exit-button (a menuitem, not a
  // button); the confirm dialog then titles "Exit this interview?" with a
  // confirm labelled "Exit interview" (Navigation.tsx).
  await page.getByTestId('exit-button').click();
  const dialog = page.getByRole('dialog', { name: 'Exit this interview?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Exit interview' }).click();
}

// Reproduced app defect (fix task filed): with a vault enrolled and the
// default enter gate on, exiting an in-progress interview leaves a stale
// "Confirm your identity" dialog open over Home — including its destructive
// "Recover by resetting" control — and it blocks the top bar. The gate must
// REPORT this, never absorb it: the step fails when the phantom is present,
// then dismisses it so the walk can continue.
async function checkPhantomStepUp(stepName) {
  await expect(
    page.getByRole('button', { name: 'Start new interview' }),
  ).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const phantom = await page
    .getByRole('heading', { name: 'Confirm your identity' })
    .isVisible()
    .catch(() => false);
  if (phantom) {
    await shot(`${stepName}`);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(
      page.getByRole('heading', { name: 'Confirm your identity' }),
    ).toHaveCount(0);
  }
  record(
    stepName,
    !phantom,
    phantom
      ? 'stale "Confirm your identity" dialog (with destructive "Recover by resetting") left open on Home after the exit; dismissed via Cancel to continue'
      : 'no stale step-up dialog after exit',
  );
}

// --- the walk -------------------------------------------------------------
try {
  await page.goto(url);

  // 0. Seed PLAINTEXT rows before any vault exists: install the protocol and
  // record one session in 'none' mode. Enrolment must then RE-ENCRYPT these
  // pre-existing rows (the re-encryption sweep) — without this seeding, every
  // row the ciphertext oracle inspects was encrypted on first write, and a
  // sweep regression (researcher enables a lock AFTER collecting data)
  // certifies plaintext at rest.
  await installSampleProtocol();
  await startInterview('pre-enrol-probe');
  await expectStageMounted();
  await exitInterview();
  await expect(
    page.getByRole('button', { name: 'Start new interview' }),
  ).toBeVisible({ timeout: 15_000 });
  record(
    'seed-before-enrolment',
    true,
    'protocol + session recorded in none mode before any vault existed',
  );

  // 1. Enrol a PIN via the 6-step wizard; the lock-behaviour step must show
  // "Require unlock when entering an interview" defaulting ON.
  await page.goto(`${url}/welcome`);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByTestId('wizard-next').click(); // 0 intro -> 1 securing-data
  await page.getByTestId('wizard-next').click(); // 1 -> 2 method
  await page.locator('[data-value="pin"]').click();
  await page.getByTestId('wizard-next').click(); // 2 -> 3 configure
  await typeSegmented(page, 'pin', PIN);
  await typeSegmented(page, 'pin-confirm', PIN);
  await page
    .getByRole('checkbox', { name: /I understand there is no recovery/ })
    .check();
  await page.getByTestId('wizard-next').click(); // 3 -> 4 behaviour
  const enterToggle = page
    .getByRole('checkbox', {
      name: 'Require unlock when entering an interview',
    })
    .or(
      page.getByRole('switch', {
        name: 'Require unlock when entering an interview',
      }),
    );
  const enterDefault = await enterToggle.getAttribute('aria-checked');
  await shot('wizard-behaviour');
  await page.getByTestId('wizard-next').click(); // 4 -> 5 analytics
  await page.getByTestId('wizard-next').click(); // 5 -> Finish
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expectUnlocked();
  record(
    'enrol-pin',
    enterDefault === 'true',
    `enrolled; require-unlock-on-enter default=${enterDefault}`,
  );
  await shot('enrolled-home');

  // 2. Relock on reload; a wrong PIN clears and stays locked; the correct
  // PIN auto-submits and unlocks.
  await page.reload();
  await expectLocked();
  await typeSegmented(page, 'pin', '87654321');
  await expectPinRejected();
  await expectLocked();
  const firstSegment = page
    .getByTestId('segmented-code-pin')
    .locator('input')
    .first();
  const cleared = (await firstSegment.inputValue()) === '';
  await shot('wrong-pin-rejected');
  await unlockPin(PIN);
  await expectUnlocked();
  record(
    'relock-and-wrong-pin',
    cleared,
    `wrong PIN rejected (field cleared=${cleared}), correct PIN unlocked`,
  );

  // 3. Manual lock, then REAL idle auto-lock at a 1-minute timeout, then
  // restore and end locked for the next step.
  await page.getByLabel('Lock app').click();
  await expectLocked();
  await unlockPin(PIN);
  await expectUnlocked();
  await openSecuritySettings();
  await page.getByLabel('Auto-lock after').selectOption('1');
  await closeSettings();
  const idleStart = Date.now();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible(
    { timeout: 100_000 },
  );
  const idleSeconds = Math.round((Date.now() - idleStart) / 1000);
  await shot('idle-locked');
  await unlockPin(PIN);
  await expectUnlocked();
  await openSecuritySettings();
  await page.getByLabel('Auto-lock after').selectOption('15');
  await closeSettings();
  await page.getByLabel('Lock app').click();
  await expectLocked();
  record(
    'manual-and-idle-lock',
    idleSeconds >= 55 && idleSeconds <= 85,
    `manual lock ok; idle auto-lock fired after ~${idleSeconds}s at the 1-minute setting (bounds 55-85s: materially late firing is a weaker lock than the setting promises)`,
  );

  // 4. Step-up on interview entry (wrong PIN first, no session), then the
  // export step-up call site, then ciphertext at rest. (The protocol was
  // installed in step 0, before enrolment.)
  await unlockPin(PIN);
  await expectUnlocked();
  // Raw session count, readable regardless of encryption — the wrong-PIN
  // rejection must not have created a session row.
  const rawSessionCount = () =>
    page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open('interviewer');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const n = await new Promise((res, rej) => {
        const tx = db.transaction('sessions', 'readonly');
        const rq = tx.objectStore('sessions').count();
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
      db.close();
      return n;
    });
  const sessionsBeforeGate = await rawSessionCount();
  await startInterview('vault-probe');
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toBeVisible();
  const preStepUpUrl = page.url();
  await typeSegmented(page, 'pin', '87654321');
  await expectPinRejected();
  const sessionsAfterWrongPin = await rawSessionCount();
  const gateHeld =
    (await page
      .getByRole('heading', { name: 'Confirm your identity' })
      .isVisible()) &&
    !page.url().includes('/interview/') &&
    sessionsAfterWrongPin === sessionsBeforeGate;
  await shot('enter-stepup-wrong-pin');
  await typeSegmented(page, 'pin', PIN);
  await expect(page).toHaveURL(/\/interview\//, { timeout: 15_000 });
  await expectStageMounted();
  record(
    'stepup-interview-entry',
    gateHeld,
    `wrong PIN held the gate (url stayed ${preStepUpUrl.includes('/interview/') ? 'INTERVIEW?!' : 'off-interview'}), correct PIN entered`,
  );
  await shot('interview-entered');
  await exitInterview();
  await checkPhantomStepUp('phantom-after-entry-gated-exit');

  await openSecuritySettings();
  await setToggle('Require unlock before exporting data', true);
  await page.getByRole('tab', { name: 'Synthetic data' }).click();
  await page.getByTestId('synthetic-count').fill('1');
  await page.getByTestId('synthetic-generate').click();
  await expect(page.getByText(/Generated 1 synthetic session/)).toBeVisible({
    timeout: 30_000,
  });
  await closeSettings();
  await page
    .getByRole('group', { name: 'Home view' })
    .getByText('Data')
    .click();
  await expect(page).toHaveURL(/\/data/);
  await page.getByRole('checkbox', { name: /Select all interviews/ }).check();
  await page.getByTestId('data-export').click();
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toBeVisible();
  const exportDialogEarly = await page
    .getByText(/Exporting \d+ interview/)
    .isVisible()
    .catch(() => false);
  await typeSegmented(page, 'pin', '87654321');
  await expectPinRejected();
  const exportGateHeld =
    (await page
      .getByRole('heading', { name: 'Confirm your identity' })
      .isVisible()) &&
    !(await page
      .getByText(/Exporting \d+ interview/)
      .isVisible()
      .catch(() => false));
  await shot('export-stepup-wrong-pin');
  await typeSegmented(page, 'pin', PIN);
  await expect(page.getByText(/Exporting \d+ interview/)).toBeVisible({
    timeout: 15_000,
  });
  await shot('export-gate-passed');
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await openSecuritySettings();
  await setToggle('Require unlock before exporting data', false);
  await closeSettings();
  record(
    'stepup-export',
    exportGateHeld && !exportDialogEarly,
    'identity gate preceded the export dialog; wrong PIN held it; correct PIN proceeded',
  );

  // Ciphertext at rest: raw IndexedDB rows must carry {iv, ct} envelopes,
  // never plaintext networks or codebooks.
  const cipher = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('interviewer');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const readAll = (store) =>
      new Promise((res, rej) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
    // A real envelope is base64 with an AES-GCM-shaped IV (12 bytes) and a
    // ciphertext at least as long as the GCM tag, whose DECODED bytes carry
    // none of the seeded plaintext markers — a wrapper with plaintext (or
    // empty strings) stuffed into ct must not certify.
    const MARKERS = ['"nodes"', '"schemaVersion"', '"codebook"', '"stages"'];
    const decodeEnvelope = (v) => {
      if (!v || typeof v.iv !== 'string' || typeof v.ct !== 'string')
        return null;
      try {
        const iv = atob(v.iv);
        const ct = atob(v.ct);
        if (iv.length !== 12 || ct.length < 16) return null;
        return ct;
      } catch {
        return null;
      }
    };
    const isEnvelope = (v) => {
      const ct = decodeEnvelope(v);
      return ct !== null && !MARKERS.some((m) => ct.includes(m));
    };
    // Assets are CSV/SVG/PNG/MOV — none carries the JSON markers, so their
    // ciphertext must also be free of asset-shaped plaintext: media magic
    // numbers, an SVG tag, or text-like content (real AES-GCM output is
    // ~37% printable by chance; seeded CSV/SVG is ~100%).
    const isAssetEnvelope = (v) => {
      const ct = decodeEnvelope(v);
      if (ct === null) return false;
      if (ct.includes('PNG') || ct.includes('ftyp') || ct.includes('<svg'))
        return false;
      const head = ct.slice(0, 200);
      let printable = 0;
      for (let i = 0; i < head.length; i += 1) {
        const c = head.charCodeAt(i);
        if ((c >= 32 && c <= 126) || c === 9 || c === 10 || c === 13)
          printable += 1;
      }
      return printable / head.length < 0.9;
    };
    const sessions = await readAll('sessions');
    const protocols = await readAll('protocols');
    const assets = await readAll('assets');
    db.close();
    // Encrypted rows carry an _enc envelope map and DROP the plaintext keys
    // entirely (recordCrypto.ts encryptSession/encryptProtocol/encryptAsset).
    return {
      sessionCount: sessions.length,
      protocolCount: protocols.length,
      assetCount: assets.length,
      sessionsEncrypted: sessions.every(
        (s) =>
          !('network' in s) &&
          !('stageMetadata' in s) &&
          isEnvelope(s._enc?.network) &&
          (s._enc?.stageMetadata === undefined ||
            isEnvelope(s._enc.stageMetadata)),
      ),
      // stageMetadata is a SEPARATE sensitive field (encryptSession) — at
      // least one seeded session (the synthetic one exercises DyadCensus)
      // must carry its envelope, or a metadata-only regression hides.
      stageMetadataEnvelopes: sessions.filter((s) =>
        isEnvelope(s._enc?.stageMetadata),
      ).length,
      protocolsEncrypted: protocols.every(
        (p) =>
          !('protocol' in p) &&
          !('codebook' in p) &&
          isEnvelope(p._enc?.protocol) &&
          isEnvelope(p._enc?.codebook),
      ),
      assetsEncrypted: assets.every(
        (a) => !('data' in a) && isAssetEnvelope(a._enc?.data),
      ),
      leaks: JSON.stringify({ sessions, protocols }).includes('"nodes"'),
    };
  });
  record(
    'ciphertext-at-rest',
    // Exactly 3 sessions here: pre-enrol-probe (written PLAINTEXT before
    // the vault existed — its envelope proves the re-encryption sweep),
    // vault-probe, and the synthetic session.
    cipher.sessionCount === 3 &&
      cipher.protocolCount > 0 &&
      cipher.assetCount > 0 &&
      cipher.sessionsEncrypted &&
      cipher.stageMetadataEnvelopes > 0 &&
      cipher.protocolsEncrypted &&
      cipher.assetsEncrypted &&
      !cipher.leaks,
    `sessions=${cipher.sessionCount} (incl. the pre-enrolment row, so the re-encryption sweep is proven) protocols=${cipher.protocolCount} assets=${cipher.assetCount} sessionsEncrypted=${cipher.sessionsEncrypted} stageMetadataEnvelopes=${cipher.stageMetadataEnvelopes} protocolsEncrypted=${cipher.protocolsEncrypted} assetsEncrypted=${cipher.assetsEncrypted} plaintextLeak=${cipher.leaks}`,
  );

  // 5. Lock-screen guard on interview routes: re-enter the interview, reload,
  // the lock screen must NOT offer "Recover by resetting"; unlock resumes.
  await page
    .getByRole('row', { name: /vault-probe/ })
    .getByTestId('data-resume')
    .click();
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toBeVisible();
  await typeSegmented(page, 'pin', PIN);
  await expect(page).toHaveURL(/\/interview\//, { timeout: 15_000 });
  await expectStageMounted();
  await page.reload();
  await expectLocked();
  const recoverSuppressed =
    (await page
      .getByRole('button', { name: 'Recover by resetting' })
      .count()) === 0;
  await shot('interview-route-lock');
  await unlockPin(PIN);
  await expectStageMounted();
  record(
    'interview-route-lock-guard',
    recoverSuppressed,
    `recovery button suppressed on interview route=${recoverSuppressed}; interview intact after unlock`,
  );

  // 6. Exit step-up, then PIN rotation with a live second tab that must
  // force-lock, old PIN rejected, data surviving the rotation.
  await exitInterview();
  await checkPhantomStepUp('phantom-after-resume-exit');
  await openSecuritySettings();
  await setToggle('Require unlock when exiting an interview', true);
  await closeSettings();
  await startInterview('exit-probe');
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toBeVisible();
  await typeSegmented(page, 'pin', PIN);
  await expectStageMounted();
  await exitInterview();
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toBeVisible();
  await typeSegmented(page, 'pin', '87654321');
  await expectPinRejected();
  const exitGateHeld = page.url().includes('/interview/');
  await typeSegmented(page, 'pin', PIN);
  await checkPhantomStepUp('phantom-after-exit-gated-exit');
  await openSecuritySettings();
  await setToggle('Require unlock when exiting an interview', false);
  await closeSettings();

  const page2 = await context.newPage();
  await page2.goto(url);
  await unlockPin(PIN, page2);
  await expect(page2.getByLabel('Lock app')).toBeVisible({ timeout: 15_000 });

  await openSecuritySettings();
  await page.getByRole('button', { name: 'Change PIN' }).click();
  // The trigger row unmounts once the form opens; the submit is labelled
  // "Save new PIN" (verified empirically).
  await page.getByLabel('Current PIN').fill('87654321');
  await typeSegmented(page, 'nextPin', NEW_PIN);
  await typeSegmented(page, 'nextPinConfirm', NEW_PIN);
  await page.getByRole('button', { name: 'Save new PIN' }).click();
  // The wrong-current PBKDF2 can outlast any fixed sleep under load: wait
  // for the submit to leave its busy "Saving…" state and be enabled again —
  // the form still being open at that point IS the refusal.
  await expect(page.getByRole('button', { name: 'Save new PIN' })).toBeEnabled({
    timeout: 30_000,
  });
  const wrongCurrentRefused = await page
    .getByRole('button', { name: 'Save new PIN' })
    .isVisible()
    .catch(() => false);
  await shot('rotate-wrong-current');
  await page.getByLabel('Current PIN').fill(PIN);
  await page.getByRole('button', { name: 'Save new PIN' }).click();
  // Rotation success closes the form (PBKDF2 x2 + rewrap first).
  await expect(page.getByRole('button', { name: 'Change PIN' })).toBeVisible({
    timeout: 20_000,
  });
  await closeSettings();

  await expect(
    page2.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible({ timeout: 15_000 });
  await shot('second-tab-forced-lock', page2);
  await page2.close();

  await page.getByLabel('Lock app').click();
  await expectLocked();
  await typeSegmented(page, 'pin', PIN);
  await expectPinRejected();
  const oldPinRejected = await page
    .getByRole('heading', { name: 'Welcome back' })
    .isVisible();
  await unlockPin(NEW_PIN);
  await expectUnlocked();
  // The EXACT seeded counts, not a pattern "0 interviews" would satisfy:
  // pre-enrol-probe + vault-probe + the synthetic session + exit-probe = 4
  // sessions. Poll —
  // the status row fades in after unlock, and an instant read races it.
  let dataSurvived = true;
  try {
    // The status-row link's accessible name carries both exact counts in one
    // element ("1 protocols 3 interviews") — bare getByText would strict-mode
    // collide with the deck card's own "3 interviews" link.
    await expect(
      page.getByRole('link', { name: '1 protocols 4 interviews' }),
    ).toBeVisible({ timeout: 15_000 });
  } catch {
    dataSurvived = false;
    const dialogs = await page
      .getByRole('dialog')
      .count()
      .catch(() => -1);
    const aria = await page
      .locator('body')
      .ariaSnapshot()
      .catch(() => '(aria snapshot failed)');
    fs.writeFileSync(
      path.join(artifactsDir, 'rotation-debug.txt'),
      `url=${page.url()}\ndialogs=${dialogs}\n${aria}`,
    );
  }
  await shot('after-rotation');
  record(
    'rotate-pin',
    exitGateHeld && wrongCurrentRefused && oldPinRejected && dataSurvived,
    `exit gate held=${exitGateHeld}; wrong current refused=${wrongCurrentRefused}; second tab force-locked; old PIN rejected=${oldPinRejected}; data survived=${dataSurvived} (1 protocols / 4 interviews exact)`,
  );

  // The rotated vault must still DECRYPT the pre-rotation payload — counts
  // are plaintext index fields and prove nothing. Reopen the vault-probe
  // session (entry step-up now takes the NEW PIN) and require its stage to
  // mount, which forces a read through the rewrapped DEK.
  await page
    .getByRole('group', { name: 'Home view' })
    .getByText('Data')
    .click();
  await page
    .getByRole('row', { name: /vault-probe/ })
    .getByTestId('data-resume')
    .click();
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toBeVisible();
  await typeSegmented(page, 'pin', NEW_PIN);
  await expectStageMounted();
  record(
    'rotate-decrypt-proof',
    true,
    'vault-probe remounted under the rotated vault',
  );
  await shot('rotate-decrypt-proof');
  await exitInterview();
  await checkPhantomStepUp('phantom-after-rotation-probe-exit');

  // 7. Encryption chip.
  const chip = page.getByTestId('encryption-status-trigger');
  await expect(chip).toBeVisible();
  const chipText = (await chip.textContent()) ?? '';
  record(
    'encryption-chip',
    /encrypted/i.test(chipText) && !/not encrypted/i.test(chipText),
    `chip reads "${chipText.trim()}"`,
  );
  await shot('encryption-chip');

  // 8. Revoke wipes everything and leaves an unlocked clean slate.
  await openSecuritySettings();
  await page.getByRole('button', { name: 'Revoke' }).click();
  const revokeDialog = page.getByRole('dialog', {
    name: 'Revoke device lock and wipe data?',
  });
  await expect(revokeDialog).toBeVisible();
  await revokeDialog
    .getByRole('button', { name: 'Destroy device data' })
    .click();
  // Wait for the async revoke to COMPLETE before reloading — a fixed sleep
  // can tear down the deletion mid-flight and manufacture a partial wipe.
  // Completion signal (verified empirically): the Settings dialog stays open
  // and its Security tab flips to the unconfigured state.
  await expect(revokeDialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText('No device lock is configured')).toBeVisible({
    timeout: 30_000,
  });
  await closeSettings();
  await page.reload();
  await expect(page.getByText('0 protocols')).toBeVisible({ timeout: 15_000 });
  const noLockAfterRevoke =
    (await page.getByRole('heading', { name: 'Welcome back' }).count()) === 0;
  // The visible 0/0 counters read from indexes — the wipe's promise is the
  // RAW stores (assets included: the sample protocol definitely created
  // asset rows). Inspect every data store directly.
  const rawStoreCounts = () =>
    page.evaluate(async () => {
      const db = await new Promise((res, rej) => {
        const req = indexedDB.open('interviewer');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      const count = (store) =>
        new Promise((res, rej) => {
          const tx = db.transaction(store, 'readonly');
          const rq = tx.objectStore(store).count();
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => rej(rq.error);
        });
      const out = {
        protocols: await count('protocols'),
        sessions: await count('sessions'),
        assets: await count('assets'),
      };
      db.close();
      return out;
    });
  const afterRevoke = await rawStoreCounts();
  const wiped =
    (await page
      .getByText('0 interviews')
      .isVisible()
      .catch(() => false)) &&
    noLockAfterRevoke &&
    afterRevoke.protocols === 0 &&
    afterRevoke.sessions === 0 &&
    afterRevoke.assets === 0;
  await shot('after-revoke');
  record(
    'revoke-wipe',
    wiped,
    `0/0 counters, no lock, raw stores protocols=${afterRevoke.protocols} sessions=${afterRevoke.sessions} assets=${afterRevoke.assets}`,
  );

  // 9. Passphrase enrolment: a weak passphrase must refuse to advance; the
  // real one enrols; wrong passphrase rejected at unlock.
  await page.goto(`${url}/welcome`);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-next').click();
  await page.locator('[data-value="passphrase"]').click();
  await page.getByTestId('wizard-next').click();
  // Weak refusal is LIVE: the strength meter marks "Weak" and the Continue
  // button disables while a weak value is present (verified empirically) —
  // the oracle is the disabled button, not a rejected click.
  const enterField = page.getByLabel('Enter passphrase', { exact: true });
  const confirmField = page.getByLabel('Confirm passphrase', { exact: true });
  await enterField.fill('short');
  await confirmField.fill('short');
  await page
    .getByRole('checkbox', { name: /I understand there is no recovery/ })
    .check();
  await expect(page.getByTestId('wizard-next')).toBeDisabled();
  const weakRefused = await page.getByText('Weak').isVisible();
  await shot('weak-passphrase-refused');
  await enterField.fill(PASSPHRASE);
  await enterField.blur();
  await confirmField.fill(PASSPHRASE);
  await confirmField.blur();
  await expect(page.getByTestId('wizard-next')).toBeEnabled({
    timeout: 10_000,
  });
  await page.getByTestId('wizard-next').click(); // 3 -> 4 behaviour
  await page.getByTestId('wizard-next').click(); // 4 -> 5 analytics
  await page.getByTestId('wizard-next').click(); // 5 -> Finish
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.reload();
  await expectLocked();
  await page.getByTestId('passphrase-input').fill('definitely-wrong-1234');
  await page.getByTestId('unlock-submit').click();
  // The submit disables while the PBKDF2 verify runs — wait for it to come
  // back rather than sampling a fixed sleep the verify can outlast.
  await expect(page.getByTestId('unlock-submit')).toBeEnabled({
    timeout: 30_000,
  });
  const wrongUnlockRejected = await page
    .getByRole('heading', { name: 'Welcome back' })
    .isVisible();
  await page.getByTestId('passphrase-input').fill(PASSPHRASE);
  await page.getByTestId('unlock-submit').click();
  await expectUnlocked();
  record(
    'passphrase-enrol',
    weakRefused && wrongUnlockRejected,
    `weak refused=${weakRefused}; wrong rejected=${wrongUnlockRejected}; correct unlocked`,
  );
  await shot('passphrase-unlocked');

  // 10. Lock-screen reset path, seeded with BOTH data types so the "0/0"
  // oracle cannot pass vacuously.
  await installSampleProtocol();
  await startInterview('reset-seed');
  // The entry step-up (enter gate defaults ON) races the interview mount —
  // wait for whichever appears, never poll a single instant.
  const stepUpHeading = page.getByRole('heading', {
    name: 'Confirm your identity',
  });
  await expect(
    stepUpHeading.or(page.locator('main[data-theme-interview]')).first(),
  ).toBeVisible({ timeout: 15_000 });
  if (await stepUpHeading.isVisible()) {
    await page.getByTestId('passphrase-input').fill(PASSPHRASE);
    await page.getByTestId('unlock-submit').click();
  }
  await expectStageMounted();
  await exitInterview();
  await checkPhantomStepUp('phantom-after-passphrase-exit');
  await page.getByLabel('Lock app').click();
  await expectLocked();
  await page.getByRole('button', { name: 'Recover by resetting' }).click();
  const resetDialog = page.getByRole('dialog', { name: 'Reset all app data?' });
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole('button', { name: 'Permanently delete' }).click();
  // Same completion wait as revoke: the reset's deletion must finish before
  // the reload, or the reload can interrupt it mid-wipe.
  await expect(resetDialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText('0 protocols')).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText('0 protocols')).toBeVisible({ timeout: 15_000 });
  const afterReset = await rawStoreCounts();
  const resetClean =
    (await page
      .getByText('0 interviews')
      .isVisible()
      .catch(() => false)) &&
    (await page.getByRole('heading', { name: 'Welcome back' }).count()) === 0 &&
    afterReset.protocols === 0 &&
    afterReset.sessions === 0 &&
    afterReset.assets === 0;
  await shot('after-reset');
  record(
    'reset-path',
    resetClean,
    `0/0 counters, lock cleared, raw stores protocols=${afterReset.protocols} sessions=${afterReset.sessions} assets=${afterReset.assets}`,
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
