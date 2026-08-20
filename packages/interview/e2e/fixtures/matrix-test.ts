import { expect } from '@playwright/test';

import { expectNoUnnamedControls } from '../helpers/accessible-name-audit.js';
import { createCaptureInterview } from './capture.js';
import { InterviewFixture } from './interview-fixture.js';
import { installMapboxMocks } from './mapbox-mocks.js';
import { ProtocolFixture } from './protocol-fixture.js';
import { StageFixture } from './stage-fixture.js';
import { test as baseTest } from './test.js';
import { neutraliseBackdropFilters } from './webkit-workarounds.js';

type MatrixFixtures = {
  interview: InterviewFixture;
  stage: StageFixture;
  protocol: ProtocolFixture;
  snapshotSlug: string;
  ariaSnapshot: (label: 'initial' | 'final') => Promise<void>;
};

/**
 * Base UI wraps every focus-trapping surface (popover, dialog, menu) in
 * sentinel spans of the form
 *
 *   <span tabindex="0" role="button" data-base-ui-focus-guard
 *         style="clip-path:inset(50%);width:1px;height:1px;position:fixed">
 *
 * It gives them `role="button"` rather than `aria-hidden` on purpose —
 * `aria-hidden` on a focusable element is itself an accessibility violation.
 * WebKit's accessibility tree exposes them; Chromium's does not.
 *
 * A baseline that captures them is pinning a **dependency's internals**: the
 * nodes appear and disappear with Base UI's version and with which engine ran,
 * and — far worse — a genuinely unnamed Network Canvas control becomes
 * indistinguishable from a guard in the diff. So they are hidden for the
 * duration of the capture.
 *
 * `display:none` is the narrowest mutation that removes a node from the
 * accessibility tree. It leaves the `tabindex`, `role` and `data-` attributes
 * Base UI reads back untouched, adds no layout (the guards are 1x1 and
 * `position:fixed`), and the style tag is removed the moment the assertion
 * settles, so tab order for the rest of the scenario is unchanged.
 */
const HIDE_FOCUS_GUARDS_CSS =
  '[data-base-ui-focus-guard] { display: none !important; }';

function slugify(parts: string[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/\.spec\.ts/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Matrix tests get a fresh page per test (Playwright's built-in fixtures —
 * deliberately NOT the worker-shared page interview-test.ts uses) so
 * fullyParallel workers cannot clobber each other's sessionStorage state.
 * The snapshot prefix is derived from the test title path, so pixel and aria
 * snapshot names can never collide across files.
 */
export const matrixTest = baseTest.extend<MatrixFixtures>({
  page: async ({ page, browserName }, use) => {
    if (browserName === 'webkit') {
      await neutraliseBackdropFilters(page);
    }
    // Before anything can mount a map: stages initialise mapbox during
    // navigation, so the routes must exist before the first goto.
    await installMapboxMocks(page);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__test !== 'undefined', {
      timeout: 30_000,
    });
    await page.evaluate(() => window.__test.reset());
    await use(page);
  },

  snapshotSlug: async ({ page: _page }, use, testInfo) => {
    await use(slugify(testInfo.titlePath));
  },

  protocol: async ({ page }, use) => {
    const assetUrl = process.env.E2E_ASSET_URL ?? 'http://localhost:4200';
    const protocol = new ProtocolFixture(page, assetUrl);
    await use(protocol);
    await protocol.cleanup();
  },

  interview: async ({ page, snapshotSlug }, use) => {
    const interview = new InterviewFixture(page);
    interview.snapshotPrefix = snapshotSlug;
    interview.setCaptureFn(
      createCaptureInterview(page, { enabled: !!process.env.CI }),
    );
    await use(interview);
  },

  stage: async ({ page }, use) => {
    await use(new StageFixture(page));
  },

  ariaSnapshot: async ({ page, snapshotSlug }, use) => {
    await use(async (label) => {
      const main = page.locator('main[data-theme-interview]');
      const key = `${snapshotSlug}-${label}`;
      const hiddenGuards = await page.addStyleTag({
        content: HIDE_FOCUS_GUARDS_CSS,
      });
      try {
        // Audited BEFORE the baseline comparison on purpose: the baseline only
        // records the tree, so `--update-snapshots` would otherwise absorb a
        // control that lost its accessible name into the expected state. Here
        // the run fails and no baseline is written.
        await expectNoUnnamedControls(main, key);
        await expect(main).toMatchAriaSnapshot({ name: `${key}.aria.yml` });
      } finally {
        await hiddenGuards.evaluate((element) =>
          element.parentNode?.removeChild(element),
        );
      }
    });
  },
});

export { expect };
