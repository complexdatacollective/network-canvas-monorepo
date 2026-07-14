import { expect } from '@playwright/test';

import { createCaptureInterview } from './capture.js';
import { InterviewFixture } from './interview-fixture.js';
import { installMapboxMocks } from './mapbox-mocks.js';
import { ProtocolFixture } from './protocol-fixture.js';
import { StageFixture } from './stage-fixture.js';
import { test as baseTest } from './test.js';

type MatrixFixtures = {
  interview: InterviewFixture;
  stage: StageFixture;
  protocol: ProtocolFixture;
  snapshotSlug: string;
  ariaSnapshot: (label: 'initial' | 'final') => Promise<void>;
};

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
    // Playwright's Linux WebKit renders `backdrop-filter` in software, and
    // recomputes each blur on EVERY rendering update that invalidates it: the
    // ModalBackdrop's full-viewport blur while any dialog is open, and
    // floating frosted panels (e.g. the pedigree checklist) whenever the
    // canvas behind them animates (measured 150ms-2.2s per frame under CI
    // load). Playwright's actionability checks poll element stability once
    // per rAF frame and click dispatch waits on the same rendering pipeline,
    // so each affected click stretches to seconds and dialog-heavy scenarios
    // (e.g. the FamilyPedigree wizard) blow their test budget. Real WebKit
    // GPU-accelerates backdrop-filter, so this is a test environment
    // pathology — neutralise backdrop blurs on webkit only. Pixel effect:
    // webkit baselines show sharp (not blurred) content behind translucent
    // veils and panels; the tint itself remains.
    if (browserName === 'webkit') {
      await page.addInitScript(() => {
        const inject = () => {
          const style = document.createElement('style');
          style.textContent =
            '* { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
          document.head.appendChild(style);
        };
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', inject);
        } else {
          inject();
        }
      });
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
      await expect(
        page.locator('main[data-theme-interview]'),
      ).toMatchAriaSnapshot({ name: `${snapshotSlug}-${label}.aria.yml` });
    });
  },
});

export { expect };
