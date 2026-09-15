#!/usr/bin/env node
// A deployment that requires two-factor authentication of every password
// account (`REQUIRE_TWO_FACTOR`).
//
// Nothing in the release test set that variable, so the whole feature reached
// the release unexercised: whether enrolment is actually forced, whether a
// signed-in request is refused until it is done, whether the requirement can
// be switched off from the dashboard by the administrator it is meant to bind,
// and whether the User Management card says it is in force.
//
// It is an environment variable rather than a setting precisely because every
// Fresco account is an equal administrator, so "cannot be turned off from the
// UI" is the substance of the feature rather than a detail of it.
//
// Usage: node two-factor-lane.mjs [--lane twofactor]
import { createRequire } from 'node:module';
import { join } from 'node:path';

import {
  attempt,
  check,
  completeSetup,
  launch,
  newPage,
  recordDiagnosticsTo,
  report,
  signIn,
  ADMIN_PASSWORD,
  ADMIN_USER,
} from './fresco-driver.mjs';
import { lane } from './lanes.mjs';

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const laneName = argument('lane', 'twofactor');
const config = lane(laneName);
const outDir = argument(
  'out',
  join(import.meta.dirname, '..', 'artifacts', laneName),
);

// The app's own TOTP library, so the code this lane types is computed the same
// way the code it is checked against is — a hand-rolled implementation that
// disagreed about the period or the digits would fail enrolment and be read as
// the app refusing a valid code.
const require = createRequire(
  join(import.meta.dirname, '..', '..', 'package.json'),
);
const { Secret, TOTP } = require('otpauth');

const TWO_FACTOR_PATH = '/signin/two-factor-setup';

const checks = [];
const result = { ok: false, checks, lane: laneName };
let browser;

try {
  const launched = await launch({ lane: laneName });
  browser = launched.browser;
  const page = await newPage(launched.context);
  recordDiagnosticsTo(page, outDir);

  // The first administrator is created part-way through the setup wizard and
  // finishes it under that session, so the requirement takes effect on the way
  // out of the wizard rather than inside it.
  checks.push(
    await attempt('two-factor-forced-after-setup', async () => {
      await completeSetup(page, { lane: laneName, expectDashboard: false });
      await page.goto(`${config.baseUrl}/dashboard`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(2000);
      return {
        pass: page.url().includes(TWO_FACTOR_PATH),
        detail: `after the wizard, asking for the dashboard lands on ${page.url()}`,
      };
    }),
  );

  // A gated session is not a researcher anywhere, not only in the pages it can
  // see: an API route behind the same guard refuses it.
  checks.push(
    await attempt('two-factor-blocks-signed-in-requests', async () => {
      const response = await page.request.post(
        `${config.baseUrl}/api/storage/presign`,
        { data: { files: [{ name: 'gate-probe.txt', size: 12 }] } },
      );
      return {
        pass: response.status() === 401,
        detail: `a session-authenticated request to /api/storage/presign answered ${response.status()} while enrolment was pending (401 expected)`,
      };
    }),
  );

  // And it survives a fresh sign-in, which is the path every other account
  // takes: the wizard is only the first administrator's way in.
  checks.push(
    await attempt('two-factor-forced-after-sign-in', async () => {
      await page
        .getByRole('button', { name: /Sign out/i })
        .click()
        .catch(() => {});
      await page.context().clearCookies();
      await signIn(page, {
        lane: laneName,
        username: ADMIN_USER,
        password: ADMIN_PASSWORD,
      });
      await page.waitForTimeout(4000);
      return {
        pass: page.url().includes(TWO_FACTOR_PATH),
        detail: `signing in again lands on ${page.url()}`,
      };
    }),
  );

  // Enrol, with a code computed from the secret the page shows.
  let secret = null;
  checks.push(
    await attempt('two-factor-enrolment-admits-the-account', async () => {
      await page.goto(`${config.baseUrl}${TWO_FACTOR_PATH}`, {
        waitUntil: 'domcontentloaded',
      });
      // The page offers the setup rather than starting it, so that a
      // researcher reads why it is being asked before a secret exists.
      await page
        .getByRole('button', { name: /Set up two-factor authentication/i })
        .first()
        .click();
      const field = page.locator('input[name="secret"]');
      await field.waitFor({ state: 'visible', timeout: 60_000 });
      secret = await field.inputValue();
      if (!secret) return { pass: false, detail: 'no secret was offered' };
      const totp = new TOTP({ secret: Secret.fromBase32(secret) });
      // The secret is shown first, on its own step; the code is asked for on
      // the next one. Taken as "the first field this step will let me type
      // in", because the secret's own field is a textbox too — and a readonly
      // one, so filling it times out rather than saying what went wrong.
      await page
        .getByRole('button', { name: /^Continue$/ })
        .first()
        .click();
      // The code is asked for one digit at a time, in six fields — a single
      // fill puts the whole code in the first of them and leaves Verify
      // disabled. Generated as late as possible: a code minted before the step
      // change can expire while the dialog animates.
      const first = page.getByRole('textbox', { name: 'Digit 1 of 6' });
      await first.waitFor({ state: 'visible', timeout: 30_000 });
      const digits = totp.generate().split('');
      for (const [index, digit] of digits.entries())
        await page
          .getByRole('textbox', { name: `Digit ${index + 1} of 6` })
          .fill(digit);
      await page.getByRole('button', { name: /^Verify$/ }).click();
      // Enrolment ends on the recovery codes, then the dashboard; whichever
      // screen it stops on, the gate is what this asks about.
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(1500);
        if (!page.url().includes(TWO_FACTOR_PATH)) break;
        await page
          .getByRole('button', { name: /Continue|Done|Finish|Go to/ })
          .first()
          .click({ force: true })
          .catch(() => {});
      }
      await page.goto(`${config.baseUrl}/dashboard`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(2000);
      return {
        pass: /\/dashboard/.test(page.url()),
        detail: `after enrolling, the dashboard is ${/\/dashboard/.test(page.url()) ? 'served' : `still refused (${page.url()})`}`,
      };
    }),
  );

  // The same request that was refused must now be admitted, or "the gate
  // lifted" is only a claim about a redirect.
  checks.push(
    await attempt('two-factor-admits-requests-once-enrolled', async () => {
      const response = await page.request.post(
        `${config.baseUrl}/api/storage/presign`,
        { data: { files: [{ name: 'gate-probe.txt', size: 12 }] } },
      );
      return {
        pass: response.status() !== 401,
        detail: `the same request answered ${response.status()} once enrolment was complete`,
      };
    }),
  );

  // The requirement is reported, and cannot be lifted from the dashboard by
  // the administrator it binds.
  checks.push(
    await attempt('two-factor-requirement-reported-and-read-only', async () => {
      await page.goto(`${config.baseUrl}/dashboard/settings`, {
        waitUntil: 'networkidle',
      });
      const requirement = page.getByRole('switch', {
        name: /two-factor authentication is required/i,
      });
      await requirement.waitFor({ state: 'visible', timeout: 30_000 });
      const checked = await requirement.getAttribute('aria-checked');
      const disabled =
        (await requirement.getAttribute('disabled')) !== null ||
        (await requirement.getAttribute('aria-disabled')) === 'true' ||
        (await requirement.isDisabled().catch(() => false));
      return {
        pass: checked === 'true' && disabled,
        detail: `the User Management card reports the requirement as ${checked === 'true' ? 'in force' : `"${checked}"`} and ${disabled ? 'read-only' : 'OPERABLE — an administrator could switch it off'}`,
      };
    }),
  );

  // And the account's own two-factor switch refuses to turn it off.
  checks.push(
    await attempt('two-factor-cannot-be-turned-off', async () => {
      const toggle = page.getByRole('switch', {
        name: /Toggle two-factor authentication/i,
      });
      await toggle.waitFor({ state: 'visible', timeout: 30_000 });
      const before = await toggle.getAttribute('aria-checked');
      await toggle.click({ force: true }).catch(() => {});
      await page.waitForTimeout(3000);
      // Either the control refuses outright, or the attempt is refused with a
      // message; what must never happen is the account ending up without two
      // factors on an installation that requires them.
      const after = await toggle.getAttribute('aria-checked');
      const stillEnrolled = after === 'true';
      const said = await page
        .locator('[data-testid=toast-viewport]')
        .textContent()
        .catch(() => '');
      await page.goto(`${config.baseUrl}/dashboard`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(1500);
      return {
        pass: stillEnrolled && before === 'true',
        detail: stillEnrolled
          ? `the switch stayed on after an attempt to turn it off${said ? ` (${said.trim().slice(0, 120)})` : ''}`
          : `two-factor authentication was turned OFF on an installation that requires it${said ? ` (${said.trim().slice(0, 120)})` : ''}`,
      };
    }),
  );

  result.ok = true;
} catch (error) {
  result.error = error.message;
  checks.push(check('two-factor-lane-completed', false, error.message));
} finally {
  await browser?.close().catch(() => {});
}

report(result);
