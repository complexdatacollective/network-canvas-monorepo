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

/** Each text's row in the list: its path in the stage, then its English text. */
const STAGE_TEXT_ROWS = [
  'label Welcome',
  'title Welcome to the study',
  'items › 1 › content Thank you for taking part.',
];

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
  return languageRows(page).filter({
    has: page.getByText(code, { exact: true }),
  });
}

function languageRows(page: Page): Locator {
  return page
    .getByRole('region', { name: 'Protocol languages' })
    .getByRole('listitem');
}

test('adds a language, lists its missing translations, keeps the default language from being removed, translates a listed text, and lists languages alphabetically', async ({
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
  await expect(languageRows(page)).toHaveCount(1);
  await expect(english).toContainText('English');
  await expect(english.getByText('Default', { exact: true })).toBeVisible();
  await expect(english).toContainText('3 of 3 texts translated');
  const missing = page.getByRole('region', { name: 'Missing translations' });
  await expect(missing).toContainText(
    'This protocol has one language. Add a language to start translating.',
  );

  // Add French from the list of languages.
  await page
    .getByRole('button', { name: 'Add languages', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Add languages' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('combobox', { name: 'Languages', exact: true })
    .click();
  const languageList = page.getByRole('listbox');
  await languageList.getByRole('option', { name: /^French \(fr\)/ }).click();
  await page.keyboard.press('Escape');
  await expect(languageList).toBeHidden();
  await expect(dialog).toBeVisible();
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

  // The missing translations, listed under the stage they belong to. French is
  // the only language with gaps, so there is no language to choose between.
  await french
    .getByRole('button', { name: 'Show 3 missing translations' })
    .click();
  await expect(missing).toContainText('3 texts have no French translation.');
  await expect(missing.getByRole('combobox')).toHaveCount(0);
  await expect(
    missing.getByRole('heading', { name: 'Stages', exact: true }),
  ).toBeVisible();
  // A stage is headed by its position and interface, never by its name, which
  // is itself a text to translate.
  const stageGroup = missing.getByRole('heading', {
    name: /^Stage 1\s*Information$/,
  });
  await expect(stageGroup).toBeVisible();
  await expect(
    stageGroup.getByRole('link', { name: 'Information', exact: true }),
  ).toHaveAttribute('href', '/protocol/stage/welcome');
  const missingText = (name: string) =>
    missing.getByRole('button', { name, exact: true });
  for (const row of STAGE_TEXT_ROWS) {
    await expect(missingText(row)).toBeVisible();
  }
  // Each row previews the English text participants see in place of French.
  await expect(
    missingText('title Welcome to the study').locator('[lang="en"]'),
  ).toHaveText('Welcome to the study');

  // Make French the default.
  await french
    .getByRole('button', { name: 'Make default', exact: true })
    .click();
  await expect(french.getByText('Default', { exact: true })).toBeVisible();
  await expect(english.getByText('Default', { exact: true })).toHaveCount(0);
  await expect(
    english.getByRole('button', { name: 'Make default', exact: true }),
  ).toBeVisible();
  // The default keeps its place in the alphabetical list.
  await expect(languageRows(page)).toHaveText([/^English/, /^French/]);
  const frenchDefault = await readProtocolJson(
    page,
    (protocol) => protocol.localization.defaultLocale === 'fr',
  );
  expect(frenchDefault.localization).toEqual({
    defaultLocale: 'fr',
    locales: ['en', 'fr'],
  });
  expect(frenchDefault.stages).toEqual(before.stages);

  // The default language cannot be removed, and its Remove button says why.
  // The button stays focusable, so the reason reaches keyboard users too.
  const removeFrench = french.getByRole('button', {
    name: 'Remove',
    exact: true,
  });
  await expect(removeFrench).toBeDisabled();
  await expect(removeFrench).toHaveAccessibleDescription(
    'To remove the default language, make another language the default first.',
  );
  await removeFrench.focus();
  await expect(removeFrench).toBeFocused();
  // Nor can English, though it is no longer the default: its texts exist in
  // no other language yet.
  const removeEnglish = english.getByRole('button', {
    name: 'Remove',
    exact: true,
  });
  await expect(removeEnglish).toBeDisabled();
  await expect(removeEnglish).toHaveAccessibleDescription(
    '3 texts exist only in English. Translate them into another language before removing English.',
  );
  expect((await readProtocolJson(page)).localization.locales).toEqual([
    'en',
    'fr',
  ]);

  // A listed text opens in a dialog that edits the listed language first, and
  // shows what participants in each language see as it is typed. Saved, the
  // text leaves the list, the language's progress counts it, and focus moves
  // on to the next text.
  await missingText('label Welcome').click();
  const translation = page.getByRole('dialog', {
    name: 'Stage 1 · Information label',
  });
  await expect(translation).toBeVisible();
  await translation
    .getByRole('textbox', { name: 'Text', exact: true })
    .fill('Bienvenue');
  const frenchView = translation
    .getByRole('region', { name: 'What participants see' })
    .getByRole('listitem')
    .filter({ hasText: 'French' });
  await expect(frenchView).toContainText('Editing');
  await expect(frenchView.locator('[lang="fr"]')).toHaveText('Bienvenue');
  await translation.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(translation).toBeHidden();
  await expect(missingText('label Welcome')).toHaveCount(0);
  await expect(missingText('title Welcome to the study')).toBeFocused();
  await expect(missing).toContainText('2 texts have no French translation.');
  await expect(french).toContainText('1 of 3 texts translated');
  const translated = await readProtocolJson(page, (protocol) =>
    Object.hasOwn(protocol.stages[0]?.label ?? {}, 'fr'),
  );
  expect(translated.stages[0]?.label).toEqual({
    en: STAGE_NAME,
    fr: 'Bienvenue',
  });

  // Languages have no order: a language added last is listed by its name.
  await page
    .getByRole('button', { name: 'Add languages', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('combobox', { name: 'Languages', exact: true })
    .click();
  await languageList.getByRole('option', { name: /^Dutch \(nl\)/ }).click();
  await page.keyboard.press('Escape');
  await expect(languageList).toBeHidden();
  await dialog
    .getByRole('button', { name: 'Add languages', exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const withDutch = await readProtocolJson(page, (protocol) =>
    protocol.localization.locales.includes('nl'),
  );
  expect(withDutch.localization).toEqual({
    defaultLocale: 'fr',
    locales: ['en', 'fr', 'nl'],
  });
  await expect(languageRows(page)).toHaveText([
    /^Dutch/,
    /^English/,
    /^French/,
  ]);
});

const CHOOSER_LABEL = {
  en: 'Choose a language',
  fr: 'Choisissez une langue',
  es: 'Elige un idioma',
};

function chooserProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    ...emptyProtocol(),
    localization: { defaultLocale: 'en', locales: ['en', 'fr', 'es'] },
    stages: [
      { id: 'choose-language', type: 'LanguageChooser', label: CHOOSER_LABEL },
    ],
  });
}

/** One row of the language chooser stage's list of the protocol's languages. */
function stageLanguageRow(page: Page, code: string): Locator {
  return page
    .getByRole('region', { name: 'Languages', exact: true })
    .getByRole('listitem')
    .filter({ has: page.getByText(code, { exact: true }) });
}

async function removeLanguage(page: Page, code: string, language: string) {
  await stageLanguageRow(page, code)
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  const confirm = page.getByRole('dialog', { name: `Remove ${language}?` });
  await confirm
    .getByRole('button', { name: 'Remove language', exact: true })
    .click();
  await expect(confirm).toBeHidden();
}

test('changes the protocol’s languages from the language chooser stage, and the open stage follows', async ({
  architectPage: page,
  seed,
}) => {
  await seed(chooserProtocol());
  await gotoProtocol(page);
  await page.goto('/protocol/stage/choose-language');
  const name = page.getByRole('textbox', { name: 'Stage name' });
  await expect(name).toHaveValue(CHOOSER_LABEL.en);

  // The Languages page's own list, without the missing translations it has no
  // room to show here.
  const languages = page.getByRole('region', {
    name: 'Languages',
    exact: true,
  });
  await expect(languages.getByRole('listitem')).toHaveText([
    /^English/,
    /^French/,
    /^Spanish/,
  ]);
  await expect(
    languages.getByRole('button', { name: /missing translation/ }),
  ).toHaveCount(0);

  // Removing a language from a stage that has not been touched leaves nothing
  // to save, and nothing to be asked about on the way out.
  await removeLanguage(page, 'es', 'Spanish');
  const withoutSpanish = await readProtocolJson(
    page,
    (protocol) => !protocol.localization.locales.includes('es'),
  );
  expect(withoutSpanish.localization.locales).toEqual(['en', 'fr']);
  expect(withoutSpanish.stages[0]?.label).toEqual({
    en: CHOOSER_LABEL.en,
    fr: CHOOSER_LABEL.fr,
  });
  await expect(
    page.getByRole('button', { name: 'Finished Editing' }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await page.waitForURL(/\/protocol$/);

  // A stage with unsaved changes keeps them, and saves without the language.
  await page.goto('/protocol/stage/choose-language');
  await expect(name).toHaveValue(CHOOSER_LABEL.en);
  await name.fill('Pick a language');
  await expect(
    page.getByRole('button', { name: 'Finished Editing' }),
  ).toBeVisible();
  await removeLanguage(page, 'fr', 'French');
  await expect(stageLanguageRow(page, 'fr')).toHaveCount(0);
  await expect(name).toHaveValue('Pick a language');
  await page.getByRole('button', { name: 'Finished Editing' }).click();
  await page.waitForURL(/\/protocol$/);

  const saved = await readProtocolJson(
    page,
    (protocol) => protocol.stages[0]?.label.en === 'Pick a language',
  );
  expect(saved.localization).toEqual({ defaultLocale: 'en', locales: ['en'] });
  expect(saved.stages[0]?.label).toEqual({ en: 'Pick a language' });
});
