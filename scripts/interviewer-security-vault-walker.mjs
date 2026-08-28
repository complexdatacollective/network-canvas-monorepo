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

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
// The relay is blocked in every context: analytics defaults on, and a fresh
// profile would otherwise emit real events to product analytics.
await context.route('**://ph-relay.networkcanvas.com/**', (r) => r.abort());
const page = await context.newPage();
page.setDefaultTimeout(15_000);

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

// Deck-settle click (the spring-animated deck swallows early clicks).
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
  const dot = page.getByRole('button', { name: 'Go to card 1' });
  if (await dot.isVisible().catch(() => false)) await dot.click();
  await clickSettled(
    page.getByRole('button', { name: 'Install sample protocol' }),
  );
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
  await page.waitForTimeout(1500);
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
    idleSeconds >= 55,
    `manual lock ok; idle auto-lock fired after ~${idleSeconds}s at the 1-minute setting`,
  );

  // 4. Step-up on interview entry (wrong PIN first, no session), then the
  // export step-up call site, then ciphertext at rest.
  await unlockPin(PIN);
  await expectUnlocked();
  await installSampleProtocol();
  await startInterview('vault-probe');
  await expect(
    page.getByRole('heading', { name: 'Confirm your identity' }),
  ).toBeVisible();
  const preStepUpUrl = page.url();
  await typeSegmented(page, 'pin', '87654321');
  await page.waitForTimeout(1500);
  const gateHeld =
    (await page
      .getByRole('heading', { name: 'Confirm your identity' })
      .isVisible()) && !page.url().includes('/interview/');
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
  await page.waitForTimeout(1500);
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
    const isEnvelope = (v) =>
      Boolean(v) && typeof v.iv === 'string' && typeof v.ct === 'string';
    const sessions = await readAll('sessions');
    const protocols = await readAll('protocols');
    db.close();
    // Encrypted rows carry an _enc envelope map and DROP the plaintext keys
    // entirely (recordCrypto.ts encryptSession/encryptProtocol).
    return {
      sessionCount: sessions.length,
      protocolCount: protocols.length,
      sessionsEncrypted: sessions.every(
        (s) => !('network' in s) && isEnvelope(s._enc?.network),
      ),
      protocolsEncrypted: protocols.every(
        (p) =>
          !('protocol' in p) &&
          !('codebook' in p) &&
          isEnvelope(p._enc?.protocol) &&
          isEnvelope(p._enc?.codebook),
      ),
      leaks: JSON.stringify({ sessions, protocols }).includes('"nodes"'),
    };
  });
  record(
    'ciphertext-at-rest',
    cipher.sessionCount > 0 &&
      cipher.protocolCount > 0 &&
      cipher.sessionsEncrypted &&
      cipher.protocolsEncrypted &&
      !cipher.leaks,
    `sessions=${cipher.sessionCount} protocols=${cipher.protocolCount} sessionsEncrypted=${cipher.sessionsEncrypted} protocolsEncrypted=${cipher.protocolsEncrypted} plaintextLeak=${cipher.leaks}`,
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
  await page.waitForTimeout(1500);
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
  await page.waitForTimeout(2500); // PBKDF2 on the wrong current PIN
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
  await page.waitForTimeout(1500);
  const oldPinRejected = await page
    .getByRole('heading', { name: 'Welcome back' })
    .isVisible();
  await unlockPin(NEW_PIN);
  await expectUnlocked();
  const dataSurvived =
    (await page
      .getByText('1 protocols')
      .isVisible()
      .catch(() => false)) &&
    (await page
      .getByText(/[0-9]+ interviews/)
      .isVisible()
      .catch(() => false));
  await shot('after-rotation');
  record(
    'rotate-pin',
    exitGateHeld && wrongCurrentRefused && oldPinRejected && dataSurvived,
    `exit gate held=${exitGateHeld}; wrong current refused=${wrongCurrentRefused}; second tab force-locked; old PIN rejected=${oldPinRejected}; data survived=${dataSurvived}`,
  );

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
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(page.getByText('0 protocols')).toBeVisible({ timeout: 15_000 });
  const noLockAfterRevoke =
    (await page.getByRole('heading', { name: 'Welcome back' }).count()) === 0;
  const wiped =
    (await page
      .getByText('0 interviews')
      .isVisible()
      .catch(() => false)) && noLockAfterRevoke;
  await shot('after-revoke');
  record(
    'revoke-wipe',
    wiped,
    `0 protocols / 0 interviews, no lock, immediately usable=${wiped}`,
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
  await page.waitForTimeout(1500);
  const wrongPassphraseRejected = await page
    .getByRole('heading', { name: 'Welcome back' })
    .isVisible();
  await page.getByTestId('passphrase-input').fill(PASSPHRASE);
  await page.getByTestId('unlock-submit').click();
  await expectUnlocked();
  record(
    'passphrase-enrol',
    weakRefused && wrongPassphraseRejected,
    `weak refused=${weakRefused}; wrong rejected=${wrongPassphraseRejected}; correct unlocked`,
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
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(page.getByText('0 protocols')).toBeVisible({ timeout: 15_000 });
  const resetClean =
    (await page
      .getByText('0 interviews')
      .isVisible()
      .catch(() => false)) &&
    (await page.getByRole('heading', { name: 'Welcome back' }).count()) === 0;
  await shot('after-reset');
  record(
    'reset-path',
    resetClean,
    `protocol AND seeded interview destroyed (0/0), lock cleared=${resetClean}`,
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
