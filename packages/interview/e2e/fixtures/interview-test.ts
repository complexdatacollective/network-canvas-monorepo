import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
} from '@playwright/test';

import {
  type CaptureInterviewFn,
  type CaptureInterviewOptions,
  createCaptureInterview,
} from './capture.js';
import { InterviewFixture } from './interview-fixture.js';
import { installMapboxMocks } from './mapbox-mocks.js';
import { ProtocolFixture } from './protocol-fixture.js';
import { StageFixture } from './stage-fixture.js';
import { test as baseTest, expect } from './test.js';
import { neutraliseBackdropFilters } from './webkit-workarounds.js';

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
    async ({ sharedContext, browserName }, use) => {
      const page = await sharedContext.newPage();
      if (browserName === 'webkit') {
        await neutraliseBackdropFilters(page);
      }
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
    const capture: CaptureInterviewFn = createCaptureInterview(page, {
      enabled: !!process.env.CI,
    });
    await use(capture);
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
