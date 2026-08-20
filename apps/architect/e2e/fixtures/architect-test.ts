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
//
// NO console gate lives here, and one must not be added. Issue #1391's first
// acceptance criterion — "no React/Base UI state or key warnings in these
// workflows" — cannot be enforced from this suite: it serves the PRODUCTION
// build (see `webServer` in the config, which exists so the service worker and
// the PWA-integrity check are real), and both warnings are development-only
// code that the production build strips. Measured, not assumed: with the
// controlled-Select fix reverted, `interfaces/narrative-pedigree.spec.ts`
// still passed with an empty console, and the duplicate-key message does not
// appear in any emitted chunk. A gate here would be a test that cannot fail.
//
// The criterion is enforced instead where React's development build actually
// runs: `packages/fresco-ui/src/form/fields/Select/Select.test.tsx` (console
// assertions plus the option-value uniqueness those warnings were a symptom
// of) and `apps/architect/src/config/__tests__/variables.test.ts` (no
// value-less, no duplicated option values).
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
