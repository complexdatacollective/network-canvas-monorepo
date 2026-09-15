// Shared Playwright driving for the release test's script-driven lanes.
//
// The upgrade and fresh lanes are driven by agents through the in-app browser,
// because what they check is open-ended ("does the dashboard still hold the
// seeded data"). The lanes added here check things whose answer is a fixed
// fact — which payload was sent, which page was served, whether a request was
// refused — and those belong in a script: an assertion in code is the same
// assertion on every run, it can be made to fail on purpose in CI, and it does
// not spend a model's attention re-deriving how to click a wizard.
//
// Everything here is the driving, not the judging. Each lane script builds a
// list of `{ id, status, detail }` checks and the workflow binds that list to
// an expected set of ids, so a lane that silently stops running a check fails
// the run rather than passing a shorter list.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lane } from './lanes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..', '..', '..', '..');

// Resolved through the repository root's own dependency, the way the other
// release-test walkers do: the harness deliberately has no package of its own.
const require = createRequire(join(repoRoot, 'package.json'));
/** @type {import('playwright')} */
const playwright = require('playwright');

/**
 * A plain desktop-Chrome user agent.
 *
 * Only the absence of "HeadlessChrome" matters: posthog-js matches that
 * substring and silently declines to capture, which would leave this lane with
 * initialisation traffic and no events to examine.
 */
const HEADFUL_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export const ADMIN_USER = 'releasetest';
export const ADMIN_PASSWORD = 'Fresco-Release-Test-1!';

/**
 * A browser for one lane.
 *
 * `relayTo` points the PostHog relay's hostname at a port on this machine
 * through Chromium's host resolver, so an enabled deployment's browser traffic
 * reaches the lane's sink instead of the real relay. Everything else keeps
 * resolving normally — `EXCLUDE localhost` before the catch-all is what stops
 * the rule from capturing the app itself — and the catch-all then makes every
 * OTHER name fail to resolve, so a run cannot reach the internet even if a
 * page asks it to.
 *
 * `navigator.webdriver` is masked because posthog-js drops `capture()` for
 * anything it takes for a bot, silently: a lane that skipped this would record
 * an init request, no events, and every "nothing sensitive was sent" assertion
 * would pass without a single event having been examined.
 */
export async function launch({
  relayTo = null,
  locale = 'en-US',
  lane: laneName = null,
} = {}) {
  // A browser pointed at a lane with analytics ENABLED and no mapping would
  // send that lane's events to the real relay. Refused rather than warned:
  // the run would both pollute a production project and observe nothing.
  if (laneName && lane(laneName).analytics && !relayTo)
    throw new Error(
      `lane "${laneName}" runs with analytics enabled — launch it with relayTo, or its events go to the real relay instead of the lane's sink`,
    );
  const args = ['--disable-blink-features=AutomationControlled'];
  if (relayTo)
    args.push(
      `--host-resolver-rules=MAP ${relayTo.host} 127.0.0.1:${relayTo.port},EXCLUDE localhost,MAP * ~NOTFOUND`,
    );
  const browser = await playwright.chromium.launch({ args });
  const context = await browser.newContext({
    // Wider than the `laptop` breakpoint (1280px) with room to spare. At
    // exactly 1280 a vertical scrollbar takes the layout viewport below it and
    // the interview's small-screen overlay covers the stage — which looks
    // exactly like an interview that failed to render, intermittently,
    // depending on whether the page happened to scroll.
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: Boolean(relayTo),
    locale,
    // posthog-js refuses to capture for a user agent it reads as a bot, and
    // Chromium's headless UA says "HeadlessChrome". Masking navigator.webdriver
    // alone is not enough: the two filters are separate, and either one leaves
    // a lane with init traffic, no events, and a privacy sweep of nothing.
    userAgent: HEADFUL_USER_AGENT,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // The other half of the same filter, and the one that actually bites:
    // Chromium reports "HeadlessChrome" in navigator.userAgentData.brands
    // whatever the user-agent string says, and posthog-js reads the brands.
    // Left alone, this lane records an initialisation and not one event, and
    // every "nothing sensitive was sent" assertion passes over an empty file.
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => ({
        brands: [
          { brand: 'Chromium', version: '140' },
          { brand: 'Google Chrome', version: '140' },
          { brand: 'Not=A?Brand', version: '24' },
        ],
        mobile: false,
        platform: 'macOS',
        getHighEntropyValues: () => Promise.resolve({ platform: 'macOS' }),
      }),
    });
  });
  return { browser, context };
}

/**
 * Fills a field and proves the value stuck.
 *
 * Every form here is server-rendered and then hydrated, and a fill that lands
 * before hydration is discarded silently — the page looks filled for a moment
 * and submits empty. A plain `fill` therefore produces a "username cannot be
 * empty" failure attributed to the app rather than to the driver, so the value
 * is read back until the field holds it.
 */
export async function fillStable(page, entries, { timeoutMs = 20_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (const [locator, value] of entries) {
      await locator.waitFor({ state: 'visible' });
      await locator.fill(value);
    }
    // Read every field back AFTER the last one is filled, not each in turn: a
    // Suspense boundary streaming in remounts fields that were already filled,
    // so a field verified on its own can be empty by the time the form is
    // submitted — which is what "Username cannot be empty" on a filled form
    // turned out to be.
    const values = [];
    for (const [locator] of entries) values.push(await locator.inputValue());
    if (values.every((value, index) => value === entries[index][1])) return;
    if (Date.now() > deadline)
      throw new Error(
        `form did not hold its values after ${timeoutMs}ms: ${values.join(' | ')}`,
      );
    await page.waitForTimeout(250);
  }
}

/** A page with a generous default timeout, since first paint runs migrations. */
export async function newPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return page;
}

const sampleProtocol = join(
  repoRoot,
  'packages/protocols/documentation/protocols/Sample Protocol v4.netcanvas',
);

/**
 * The setup wizard, end to end, leaving the browser on the dashboard.
 *
 * Storage is configured through the wizard rather than by environment
 * variables, exactly as a bundled-MinIO deployment does, so this exercises the
 * path a self-hoster actually takes.
 */
export async function completeSetup(
  page,
  {
    lane: laneName,
    username = ADMIN_USER,
    password = ADMIN_PASSWORD,
    protocolPath = sampleProtocol,
    expectDashboard = true,
  },
) {
  const config = lane(laneName);
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/setup/);

  // Each step is driven and then PROVED to have advanced, because every
  // failure mode here is silent: a field filled before hydration is discarded,
  // and a submit that does nothing leaves a page that looks exactly like the
  // one that was about to work. The step is read from the wizard's own URL.
  const step = () => Number(/step=(\d+)/.exec(page.url())?.[1] ?? 1);
  const advance = async (from, act) => {
    for (let tries = 0; tries < 3; tries += 1) {
      await act();
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(500);
        if (step() > from || /\/dashboard/.test(page.url())) return;
      }
    }
    throw new Error(
      `the setup wizard would not advance past step ${from} (${page.url()})`,
    );
  };

  // Account. The authentication method is a listbox, and Passkey is the
  // default — a lane that did not choose Password would be driving a flow
  // that needs an authenticator.
  await advance(1, async () => {
    await page.getByRole('option', { name: /^Password/ }).click();
    await fillStable(page, [
      [page.getByRole('textbox', { name: 'Username' }), username],
      [page.getByRole('textbox', { name: 'Password', exact: true }), password],
    ]);
    // The confirmation field only exists once a password has been typed.
    await fillStable(page, [
      [page.getByRole('textbox', { name: 'Username' }), username],
      [page.getByRole('textbox', { name: 'Password', exact: true }), password],
      [page.getByRole('textbox', { name: 'Confirm password' }), password],
    ]);
    await page.getByRole('button', { name: 'Create account' }).click();
  });

  // Storage: the bundled-MinIO configuration this lane's compose file serves.
  await advance(2, async () => {
    await page.getByRole('option', { name: /S3/ }).click();
    await fillStable(
      page,
      [
        ['s3Endpoint', 'http://minio:9000'],
        ['s3PublicUrl', `http://localhost:${config.minioPort}`],
        ['s3Bucket', 'fresco-test'],
        ['s3Region', 'us-east-1'],
        ['s3AccessKeyId', 'minioadmin'],
        ['s3SecretAccessKey', 'minioadmin'],
      ].map(([name, value]) => [page.locator(`input[name="${name}"]`), value]),
    );
    await page
      .getByRole('button', { name: /Save|Submit|Continue|Next/ })
      .first()
      .click();
  });

  // Protocol. The import streams the file through storage, and the wizard's
  // Continue is enabled throughout — so moving on immediately would abandon an
  // upload in flight. Waited for by the toast the import raises, with a cap:
  // this is the wizard's plumbing, and every lane that cares about the
  // protocol being there asserts that separately.
  await advance(3, async () => {
    await uploadProtocol(page, protocolPath);
    await waitForImportToast(page, basename(protocolPath));
    await page
      .getByRole('button', { name: /Continue|Next|Finish/ })
      .first()
      .click({ force: true });
  });

  // The last screen's button is what marks the installation configured, so it
  // is always clicked — `expectDashboard` decides only whether landing there
  // is asserted. (A lane whose deployment holds the account at a gate on the
  // way out still has to have FINISHED the wizard, or every later page would
  // be redirected back into it and the gate would never be what was tested.)
  // It celebrates with an animation over that button, so the click is forced.
  await page
    .getByRole('button', { name: /Go to|Dashboard|Finish/ })
    .first()
    .click({ force: true })
    .catch(() => {});
  await page.waitForTimeout(2000);

  if (!expectDashboard) return;

  if (!/\/dashboard/.test(page.url()))
    await page.goto(`${config.baseUrl}/dashboard`, {
      waitUntil: 'domcontentloaded',
    });
  await page.waitForTimeout(2000);
  if (!/\/dashboard/.test(page.url()))
    throw new Error(
      `the setup wizard did not finish: the dashboard redirected to ${page.url()}`,
    );
}

/**
 * Waits for an import to report itself, either way.
 *
 * Returns what it saw rather than throwing: the toast names a failure as
 * readily as a success, and it is the caller's checks — not this helper — that
 * decide what the import was supposed to do.
 */
export async function waitForImportToast(
  page,
  name,
  { timeoutMs = 120_000 } = {},
) {
  const stem = name.replace(/\.netcanvas$/i, '');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await page
      .locator('[data-testid=toast-viewport]')
      .textContent()
      .catch(() => '');
    if ((text ?? '').includes(stem) && !/\d+%/.test(text ?? '')) return text;
    await page.waitForTimeout(1000);
  }
  return null;
}

/**
 * Uploads a .netcanvas through the page's own file input.
 *
 * Playwright can operate the real input, so this lane does not need the
 * MinIO-staging dance AGENT_NOTES describes for the in-app browser — which
 * matters beyond convenience: the damaged-archive fixtures have to reach the
 * import the way a researcher's file does.
 */
export async function uploadProtocol(
  page,
  protocolPath,
  { timeoutMs = 60_000 } = {},
) {
  const input = page.locator('input[type=file]').first();
  const opener = page.getByRole('button', { name: /Import protocol/i }).first();
  // The dashboard keeps the dropzone behind a button; the setup wizard's step
  // shows it outright. Which of the two is there is not known until the page
  // has hydrated, and a freshly booted container takes its time over the first
  // render of a route — so both are waited for together rather than one being
  // assumed and the other timing out.
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if ((await input.count()) > 0) break;
    if (await opener.isVisible().catch(() => false)) {
      await opener.click();
      await input.waitFor({ state: 'attached', timeout: 15_000 });
      break;
    }
    if (Date.now() > deadline)
      throw new Error(
        'neither a file input nor an import control appeared within ' +
          `${timeoutMs}ms on ${page.url()}`,
      );
    await page.waitForTimeout(500);
  }
  await input.setInputFiles(protocolPath);
}

/** Signs in with a password, leaving the browser wherever the app sends it. */
export async function signIn(
  page,
  { lane: laneName, username = ADMIN_USER, password = ADMIN_PASSWORD },
) {
  const config = lane(laneName);
  await page.goto(`${config.baseUrl}/signin`, {
    waitUntil: 'domcontentloaded',
  });
  // A session from earlier in the same context is sent straight on; there is
  // no form to fill, and waiting for one would be a timeout where the caller
  // asked only to be signed in.
  await page.waitForTimeout(1000);
  if (/\/dashboard/.test(page.url())) return;
  await fillStable(page, [
    [page.getByRole('textbox', { name: 'Username' }), username],
    [page.getByRole('textbox', { name: 'Password', exact: true }), password],
  ]);
  // Exact: the passkey button's name also contains "Sign in".
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** A check in the shape every lane script reports and the workflow binds to. */
export const check = (id, pass, detail) => ({
  id,
  status: pass ? 'pass' : 'fail',
  detail: String(detail ?? ''),
});

/**
 * Where a failing check leaves its evidence, if a lane has asked for it.
 *
 * A failed check in a browser-driven lane is nearly useless without the page
 * it failed on: "the heading was not there" and "the app had replaced the page
 * with its error screen" read identically in a one-line detail.
 */
let diagnostics = null;
export function recordDiagnosticsTo(page, outDir) {
  diagnostics = { page, outDir };
}

/**
 * Runs a check that may throw, recording the throw as a failure.
 *
 * Deliberately not a catch that returns a neutral value: a check whose
 * observation blew up is a failed check, never a skipped or passing one.
 */
export async function attempt(id, fn) {
  let result;
  try {
    const { pass, detail } = await fn();
    result = check(id, pass, detail);
  } catch (error) {
    result = check(id, false, `threw while observing: ${error.message}`);
  }
  if (result.status === 'fail' && diagnostics) {
    const { page, outDir } = diagnostics;
    await page
      .screenshot({ path: join(outDir, `${id}.png`), fullPage: false })
      .catch(() => {});
    const snapshot = await page
      .locator('body')
      .ariaSnapshot()
      .catch((error) => `no accessible snapshot: ${error.message}`);
    writeFileSync(
      join(outDir, `${id}.txt`),
      `url: ${page.url()}\n\n${snapshot}\n`,
    );
  }
  return result;
}

/**
 * The lane script contract: one JSON line on stdout and nothing else, so the
 * agent that runs it has nothing to interpret.
 *
 * `ok` says the script completed, not that the checks passed — the workflow
 * decides that from the checks themselves, and a script that reported ok:false
 * because a check failed would hide a candidate failure behind a harness one.
 */
export function report({ ok, checks = [], ...rest }) {
  process.stdout.write(`${JSON.stringify({ ok, checks, ...rest })}\n`);
}
