import { test as base, expect, type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { seedProtocol, type SeedAsset } from './seed.js';

type ArchitectFixtures = {
  architectPage: Page;
  seed: (
    protocol: CurrentProtocol,
    opts?: { id?: string; name?: string; assets?: SeedAsset[] },
  ) => Promise<string>;
};

// `architectPage` is the same `page` fixture under another name: service
// workers are already blocked project-wide (`playwright.config.ts`'s
// `serviceWorkers: 'block'`), and boot-loader settling is per-navigation
// (`gotoProtocol` below), not something a single fixture value can capture
// up front.
export const test = base.extend<ArchitectFixtures>({
  architectPage: async ({ page }, use) => {
    await use(page);
  },
  seed: async ({ page }, use) => {
    await use((protocol, opts) => seedProtocol(page, protocol, opts));
  },
});

export { expect };

export async function gotoProtocol(page: Page): Promise<void> {
  await page.goto('/protocol');
  // Wait out the inline #boot-loader fade (main.tsx adds boot-loader--hidden
  // ~400ms after React mounts) before the spec starts interacting.
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}
