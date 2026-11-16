import type { Page } from '@playwright/test';

import { auditArabicPage } from '@codaco/e2e-helpers/arabic-page-audit';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';

/**
 * Every page of Architect, shown in Arabic with a protocol that uses every
 * interface, checked by `auditArabicPage`: the page is marked Arabic and laid
 * out right to left, no box runs off the window, and no Latin text is left
 * untranslated or shown without its own direction.
 *
 * The Storybook direction audit checks each component mirrors; this checks
 * the pages as composed, in the translation Architect ships with. The build
 * served here is the production one, where the pseudo-locale `ar-XB` does not
 * exist, so the run is in real Arabic.
 */
test.use({ locale: 'ar' });

/** Latin words Architect shows as they are in every language. */
const UNTRANSLATED = [
  'Network Canvas',
  'Architect',
  'Interviewer',
  'GitHub',
  'Mapbox',
  'API',
  'GeoJSON',
  'Bennett et al',
];

/** The stage editor's name field, as the Arabic catalog names it. */
const STAGE_NAME = 'اسم المرحلة';

const { protocol, assets } = loadAllInterfacesFixture();

/** A stage name in the protocol's one language. */
const defaultLanguageText = (text: string | Record<string, string>) =>
  typeof text === 'string' ? text : (Object.values(text)[0] ?? '');

type PageCase = {
  name: string;
  /** Opens the page and waits until everything it shows has loaded. */
  open: (page: Page) => Promise<void>;
};

const PAGES: PageCase[] = [
  {
    name: 'home',
    open: async (page) => {
      await page.goto('/');
      await expect(page.locator('#boot-loader')).toBeHidden();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  {
    name: 'protocol',
    open: async (page) => {
      await gotoProtocol(page);
      await expect(page.getByTestId('timeline-stage-badge')).toHaveCount(
        protocol.stages.length,
      );
    },
  },
  {
    name: 'codebook',
    open: async (page) => {
      await page.goto('/protocol/codebook');
      for (const type of Object.values(protocol.codebook.node ?? {})) {
        // Each node type's section is headed by a sentence naming it.
        await expect(
          page.getByRole('heading', { level: 3, name: type.name }),
        ).toBeVisible();
      }
    },
  },
  {
    name: 'resource library',
    open: async (page) => {
      await page.goto('/protocol/assets');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      for (const asset of Object.values(protocol.assetManifest ?? {})) {
        await expect(
          page.getByText(asset.name, { exact: true }).first(),
        ).toBeVisible();
      }
    },
  },
  {
    name: 'languages',
    open: async (page) => {
      await page.goto('/protocol/localization');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  },
  {
    name: 'summary',
    open: async (page) => {
      await page.goto('/protocol/summary');
      // The network asset's table renders once its file has been read.
      await expect(page.locator('#asset-roster_data table')).toBeVisible();
    },
  },
  ...protocol.stages.map((stage): PageCase => ({
    name: `${stage.type} stage editor`,
    open: async (page) => {
      await page.goto(`/protocol/stage/${stage.id}`);
      await expect(page.getByRole('textbox', { name: STAGE_NAME })).toHaveValue(
        defaultLanguageText(stage.label),
      );
    },
  })),
];

for (const { name, open } of PAGES) {
  test(`the ${name} page reads right to left in Arabic`, async ({
    architectPage: page,
    seed,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await seed(protocol, { assets });

    await open(page);
    // Boxes are measured in the Arabic typeface, not a fallback.
    await page.evaluate(() => document.fonts.ready);

    expect(
      await page.evaluate(auditArabicPage, { untranslated: UNTRANSLATED }),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
