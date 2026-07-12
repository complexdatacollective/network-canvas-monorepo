import { test as base, expect, type Page } from '@playwright/test';

import { type CaptureFn, makeCapture } from '../helpers/visual.js';

// Base fixtures shared by every spec. Each test gets a fresh context (Playwright
// default), so IndexedDB (`interviewer`) and localStorage are isolated — no
// manual teardown. Later tasks extend this with protocol/seed/download/vault/
// interview fixtures.
type BaseFixtures = {
  capture: CaptureFn;
};

export const test = base.extend<BaseFixtures>({
  capture: async ({ page }: { page: Page }, use) => {
    await use(makeCapture(page));
  },
});

export { expect };
