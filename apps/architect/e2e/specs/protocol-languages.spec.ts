import type { Locator, Page } from '@playwright/test';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';

/**
 * The Languages page (`/protocol/localization`): the protocol's declared
 * languages, and the texts not yet translated into each of them.
 *
 * Seeded with one English stage holding three texts (its name, its heading and
 * one text block), so the page has something to count and list once a second
 * language joins.
 */
const STAGE_NAME = 'Welcome';

const STAGE_TEXT_PATHS = ['label', 'title', 'items[0].content'];

function englishProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    ...emptyProtocol(),
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: { en: STAGE_NAME },
        title: { en: 'Welcome to the study' },
        items: [
          {
            id: 'welcome-text',
            type: 'text',
            content: { en: 'Thank you for taking part.' },
          },
        ],
      },
    ],
  });
}

/**
 * One row of the "Protocol languages" list, found by the badge that shows its
 * language code rather than by its name, which other rows can mention (a row
 * whose texts exist only in its own language names it in its removal note).
 */
function languageRow(page: Page, code: string): Locator {
  return page
    .getByRole('region', { name: 'Protocol languages' })
    .getByRole('listitem')
    .filter({ has: page.getByText(code, { exact: true }) });
}

test('adds a language, lists its missing translations, and keeps the default language from being removed', async ({
  architectPage: page,
  seed,
}) => {
  await seed(englishProtocol());
  await gotoProtocol(page);
  const before = await readProtocolJson(page);

  await page.getByRole('link', { name: /^Languages\b/ }).click();
  await expect(page).toHaveURL(/\/protocol\/localization$/);
  await expect(
    page.getByRole('heading', { name: 'Languages', exact: true }),
  ).toBeVisible();

  // One language: it is the default, every text is in it, and there is
  // nothing to translate into yet.
  const english = languageRow(page, 'en');
  await expect(
    page
      .getByRole('region', { name: 'Protocol languages' })
      .getByRole('listitem'),
  ).toHaveCount(1);
  await expect(english).toContainText('English');
  await expect(english.getByText('Default', { exact: true })).toBeVisible();
  await expect(english).toContainText('3 of 3 texts translated');
  const missing = page.getByRole('region', { name: 'Missing translations' });
  await expect(missing).toContainText(
    'This protocol has one language. Add a language to start translating.',
  );

  // Add French by its language code.
  await page
    .getByRole('button', { name: 'Add languages', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Add languages' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Other language code' }).fill('fr');
  await dialog
    .getByRole('button', { name: 'Add languages', exact: true })
    .click();
  await expect(dialog).toBeHidden();

  const french = languageRow(page, 'fr');
  await expect(french).toContainText('French');
  await expect(french).toContainText('0 of 3 texts translated');
  await expect(french.getByText('Default', { exact: true })).toHaveCount(0);
  // A language with no translations of its own strands nothing, so it can go.
  await expect(
    french.getByRole('button', { name: 'Remove', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('link', { name: /^Languages\b/ }),
  ).toHaveAccessibleName(/has missing translations/);

  // Adding a language translates nothing: the protocol gains the language and
  // every text keeps its one English translation.
  const added = await readProtocolJson(page, (protocol) =>
    protocol.localization.locales.includes('fr'),
  );
  expect(added.localization).toEqual({
    defaultLocale: 'en',
    locales: ['en', 'fr'],
  });
  expect(added.stages).toEqual(before.stages);

  // The missing translations, listed under the stage they belong to.
  await french
    .getByRole('button', { name: 'Show 3 missing translations' })
    .click();
  await expect(
    missing.getByRole('combobox', { name: 'Show missing translations for' }),
  ).toHaveValue('fr');
  // Each group is headed by the kind of place and its name.
  const stageGroup = missing.getByRole('heading', {
    name: `Stage ${STAGE_NAME}`,
    exact: true,
  });
  await expect(stageGroup).toBeVisible();
  await expect(
    stageGroup.getByRole('link', { name: STAGE_NAME, exact: true }),
  ).toHaveAttribute('href', '/protocol/stage/welcome');
  for (const path of STAGE_TEXT_PATHS) {
    // The field's own row, not the stage group around it, which holds every
    // field path too.
    const row = missing
      .getByRole('listitem')
      .filter({ has: page.getByText(path, { exact: true }) })
      .filter({ hasNot: page.getByRole('heading') });
    await expect(row).toContainText('French: shows English');
  }

  // Make French the default.
  await french
    .getByRole('button', { name: 'Make default', exact: true })
    .click();
  await expect(french.getByText('Default', { exact: true })).toBeVisible();
  await expect(english.getByText('Default', { exact: true })).toHaveCount(0);
  await expect(
    english.getByRole('button', { name: 'Make default', exact: true }),
  ).toBeVisible();
  const frenchDefault = await readProtocolJson(
    page,
    (protocol) => protocol.localization.defaultLocale === 'fr',
  );
  // The default changes; the order participants' fallbacks follow does not.
  expect(frenchDefault.localization).toEqual({
    defaultLocale: 'fr',
    locales: ['en', 'fr'],
  });
  expect(frenchDefault.stages).toEqual(before.stages);

  // The default language cannot be removed, and the row says why.
  await expect(
    french.getByRole('button', { name: 'Remove', exact: true }),
  ).toBeDisabled();
  await expect(french).toContainText(
    'To remove the default language, make another language the default first.',
  );
  // Nor can English, though it is no longer the default: its texts exist in
  // no other language yet.
  await expect(
    english.getByRole('button', { name: 'Remove', exact: true }),
  ).toBeDisabled();
  await expect(english).toContainText(
    '3 texts exist only in English. Translate them into another language before removing English.',
  );
  expect((await readProtocolJson(page)).localization.locales).toEqual([
    'en',
    'fr',
  ]);
});
