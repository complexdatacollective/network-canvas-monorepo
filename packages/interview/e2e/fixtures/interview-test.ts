import type {
  BrowserContext,
  BrowserContextOptions,
  Locator,
  Page,
} from '@playwright/test';

import { InterviewFixture } from './interview-fixture.js';
import { installMapboxMocks } from './mapbox-mocks.js';
import { ProtocolFixture } from './protocol-fixture.js';
import { StageFixture } from './stage-fixture.js';
import { test as baseTest, expect } from './test.js';

const VISUAL_STYLES = `
  [data-testid="background-blobs"] { visibility: hidden !important; }
  /* Suppress focus rings so snapshots don't depend on what last held focus.
     Rings here are outlines (incl. the focusable-after ::after pseudo), so
     outline:none covers them on the focused element and on focusable-within
     ancestors. box-shadow:none is scoped to the focused element only — NOT
     :has(:focus-visible) ancestors — because a focused field's ancestor (e.g.
     a slider track) carries a real inset-surface box-shadow that must survive. */
  *:focus-visible,
  *:has(:focus-visible) {
    outline: none !important;
  }
  *:focus-visible {
    box-shadow: none !important;
  }
  .focusable-after::after,
  .focusable-after-within::after {
    outline: none !important;
    box-shadow: none !important;
    content: none !important;
  }
`;

type CaptureInterviewOptions = {
  mask?: Locator[];
  fullPage?: boolean;
};

type InterviewTestFixtures = {
  interview: InterviewFixture;
  stage: StageFixture;
  captureInterview: (
    name: string,
    options?: CaptureInterviewOptions,
  ) => Promise<void>;
};

type InterviewWorkerFixtures = {
  protocol: ProtocolFixture;
  sharedContext: BrowserContext;
  sharedPage: Page;
};

const CONTEXT_OPTION_KEYS = [
  'baseURL',
  'viewport',
  'userAgent',
  'deviceScaleFactor',
  'isMobile',
  'hasTouch',
  'locale',
  'timezoneId',
  'colorScheme',
  'reducedMotion',
  'forcedColors',
  'acceptDownloads',
  'bypassCSP',
  'extraHTTPHeaders',
  'geolocation',
  'httpCredentials',
  'ignoreHTTPSErrors',
  'javaScriptEnabled',
  'offline',
  'permissions',
  'proxy',
  'storageState',
] as const satisfies readonly (keyof BrowserContextOptions)[];

function pickContextOptions(
  projectUse: BrowserContextOptions & {
    contextOptions?: BrowserContextOptions;
  },
): BrowserContextOptions {
  const picked: BrowserContextOptions = {};
  for (const key of CONTEXT_OPTION_KEYS) {
    if (key in projectUse) {
      Object.assign(picked, { [key]: projectUse[key] });
    }
  }
  if (projectUse.contextOptions) {
    Object.assign(picked, projectUse.contextOptions);
  }
  return picked;
}

export const test = baseTest.extend<
  InterviewTestFixtures,
  InterviewWorkerFixtures
>({
  sharedContext: [
    async ({ browser }, use, workerInfo) => {
      const options = pickContextOptions(workerInfo.project.use);
      const context = await browser.newContext(options);
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  sharedPage: [
    async ({ sharedContext }, use) => {
      const page = await sharedContext.newPage();
      // Before anything can mount a map: stages initialise mapbox during
      // navigation, so the routes must exist before the first goto.
      await installMapboxMocks(page);
      // Navigate to the host app so that installTestHooks() runs and
      // window.__test is available before protocol.install() calls page.evaluate().
      await page.goto('/');
      await page.waitForFunction(() => typeof window.__test !== 'undefined', {
        timeout: 30_000,
      });
      // Clear any state left over from a previous test run (persisted in sessionStorage).
      await page.evaluate(() => window.__test.reset());
      await use(page);
    },
    { scope: 'worker' },
  ],

  protocol: [
    async ({ sharedPage }, use) => {
      const assetUrl = process.env.E2E_ASSET_URL ?? 'http://localhost:4200';
      const protocol = new ProtocolFixture(sharedPage, assetUrl);
      await use(protocol);
      await protocol.cleanup();
    },
    { scope: 'worker' },
  ],

  context: async ({ sharedContext }, use) => {
    await use(sharedContext);
  },

  page: async ({ sharedPage }, use) => {
    await use(sharedPage);
  },

  captureInterview: async ({ page }, use) => {
    const isCI = !!process.env.CI;
    let stylesInjected = false;

    await use(async (name: string, options: CaptureInterviewOptions = {}) => {
      if (!isCI) return;
      if (!stylesInjected) {
        await page.addStyleTag({ content: VISUAL_STYLES });
        stylesInjected = true;
      }
      // Wait out motion entrance choreography. Elements animating in sit
      // at their framer `initial` state (inline opacity 0) until the
      // animation scheduler's first frame applies — under load that can
      // lag mount by hundreds of ms. toHaveScreenshot cannot see this:
      // two identical pre-entrance frames count as "stable", which is
      // exactly how CategoricalBin stages captured without their bin
      // circles on firefox.
      //
      // Resolves on the first evaluation when nothing is pending, so the
      // settled-state cost is one round-trip per capture. Only elements
      // covering a significant area count as pending: small overlays
      // (the node bin, action-button badges) and zero-height collapsed
      // containers (the node drawer body) are transparent AT REST by
      // design, and treating them as pending would make every capture on
      // their stage pay the full timeout. The timeout log below surfaces
      // anything that still stalls the wait.
      const MIN_PENDING_AREA = 24_000;
      await page
        .waitForFunction(
          (minArea) =>
            !Array.from(
              document.querySelectorAll<HTMLElement>('main [style*="opacity"]'),
            ).some((el) => {
              if (el.style.opacity !== '0') return false;
              const rect = el.getBoundingClientRect();
              return rect.width * rect.height >= minArea;
            }),
          MIN_PENDING_AREA,
          { timeout: 3000 },
        )
        .catch(async () => {
          const offenders = await page.evaluate(
            (minArea) =>
              Array.from(
                document.querySelectorAll<HTMLElement>(
                  'main [style*="opacity"]',
                ),
              )
                .filter((el) => {
                  if (el.style.opacity !== '0') return false;
                  const rect = el.getBoundingClientRect();
                  return rect.width * rect.height >= minArea;
                })
                .map(
                  (el) =>
                    `${el.tagName}.${el.className.slice(0, 60)} testid=${el.getAttribute('data-testid')}`,
                ),
            MIN_PENDING_AREA,
          );
          console.log(
            '[capture] entrance-settle wait timed out on:',
            offenders.join(' | '),
          );
        });
      await expect.soft(page).toHaveScreenshot(`${name}.png`, {
        fullPage: options.fullPage ?? false,
        mask: options.mask,
      });
    });
  },

  interview: async ({ page, captureInterview }, use) => {
    const interview = new InterviewFixture(page);
    interview.setCaptureFn(captureInterview);
    await use(interview);
  },

  stage: async ({ page }, use) => {
    const stage = new StageFixture(page);
    await use(stage);
  },
});

export { expect };
