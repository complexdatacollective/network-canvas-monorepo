import { test as base, expect, type Page } from '@playwright/test';

import { type CaptureFn, makeCapture } from '../helpers/visual.js';
import { DownloadFixture } from './download-fixture.js';
import { InterviewNav } from './interview-nav.js';
import { ProtocolFixture } from './protocol-fixture.js';
import { SeedFixture } from './seed-fixture.js';
import { VaultFixture } from './vault-fixture.js';

type BaseFixtures = {
  capture: CaptureFn;
  protocol: ProtocolFixture;
  seed: SeedFixture;
  download: DownloadFixture;
  interviewNav: InterviewNav;
  vault: VaultFixture;
};

export const test = base.extend<BaseFixtures>({
  capture: async ({ page }: { page: Page }, use) => {
    await use(makeCapture(page));
  },
  protocol: async ({ page }, use) => {
    await use(new ProtocolFixture(page));
  },
  seed: async ({ page }, use) => {
    await use(new SeedFixture(page));
  },
  download: async ({ page }, use) => {
    const fixture = new DownloadFixture(page);
    await fixture.installStubs();
    await use(fixture);
  },
  interviewNav: async ({ page }, use) => {
    await use(new InterviewNav(page));
  },
  vault: async ({ page }, use) => {
    await use(new VaultFixture(page));
  },
});

export { expect };
