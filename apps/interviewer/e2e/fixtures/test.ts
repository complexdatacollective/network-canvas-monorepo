import { test as base, expect, type Page } from '@playwright/test';

import { type CaptureFn, makeCapture } from '../helpers/visual.js';
import { ProtocolFixture } from './protocol-fixture.js';

type BaseFixtures = {
  capture: CaptureFn;
  protocol: ProtocolFixture;
};

export const test = base.extend<BaseFixtures>({
  capture: async ({ page }: { page: Page }, use) => {
    await use(makeCapture(page));
  },
  protocol: async ({ page }, use) => {
    await use(new ProtocolFixture(page));
  },
});

export { expect };
