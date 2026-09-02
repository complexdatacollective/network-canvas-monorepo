import { test as base, expect, type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import {
  abortUnmockedMapboxRequests,
  installMapboxMocks,
} from './mapbox-mocks.js';
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
  // Mapbox is mocked for EVERY spec, not only the ones that know they open a
  // map. The all-interfaces fixture carries the shared Mapbox testing token,
  // and a real `mapboxgl.Map` bills that token the moment it mounts — an
  // August 2026 bill is what prompted this. So the interceptors go on the page
  // before its first navigation (MapView creates the map during render), and
  // the context-level guard turns any Mapbox request the mocks do not answer
  // into an aborted request AND a failed test, here in teardown. A spec that
  // builds its own context (`00-sample-protocol.spec.ts`) has to re-apply both
  // itself. What is answered, and why, is documented in `mapbox-mocks.ts`.
  context: async ({ context }, use) => {
    const escaped = await abortUnmockedMapboxRequests(context);
    await use(context);
    expect(
      escaped,
      'Mapbox request(s) no mock in mapbox-mocks.ts answered (aborted, so nothing was billed). Add a route for each, or stop the test from mounting a live map.',
    ).toEqual([]);
  },
  page: async ({ page }, use) => {
    await installMapboxMocks(page);
    await use(page);
  },
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
