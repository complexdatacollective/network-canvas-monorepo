import type { Locator, Page } from '@playwright/test';

import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';

/**
 * The Languages page (`/protocol/localization`), which manages the protocol's
 * languages, and the translation table, a dialog over that page
 * (`/protocol/localization?table=open`), where its texts are translated.
 *
 * Seeded with one English stage holding three texts (its name, its heading and
 * one text block), then the finish stage every protocol ends with, holding
 * three more (its name, heading and text), so there is something to count and
 * translate once a second language joins. The finish stage's text is the
 * researcher's own, not the text Network Canvas supplies, so adding a language
 * translates none of it.
 */
const STAGE_NAME = 'Welcome';

/** Each text's row in the translation table, named as the stage editor names it. */
const STAGE_TEXT_ROWS = [
  'Stage name',
  'Page content › Page heading',
  'Page content › Item 1 › Content',
  'Stage name',
  'Closing screen › Heading',
  'Closing screen › Text',
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
      {
        id: 'finish',
        type: 'FinishSession',
        label: { en: 'End' },
        title: { en: 'All done' },
        content: { en: 'Thanks again.' },
        finishLabel: { en: 'Finish' },
        finishConfirmation: { en: 'Finish this interview?' },
        finishedNotice: { en: 'This interview is finished.' },
        finishFailed: { en: 'The interview could not be finished.' },
        outcome: 'completed',
      },
    ],
  });
}

function finishContent(protocol: CurrentProtocol) {
  const stage = protocol.stages.at(-1);
  return stage?.type === 'FinishSession' ? stage.content : undefined;
}

function welcomeTitle(protocol: CurrentProtocol) {
  const stage = protocol.stages[0];
  return stage?.type === 'Information' ? stage.title : undefined;
}

function welcomeContent(protocol: CurrentProtocol) {
  const stage = protocol.stages[0];
  const item = stage?.type === 'Information' ? stage.items?.[0] : undefined;
  return item?.type === 'text' ? item.content : undefined;
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

/**
 * The rows of the "Protocol languages" list, told apart from the numbered
 * explanation of which translation participants see by their delete button.
 */
function languageRows(page: Page): Locator {
  return page
    .getByRole('region', { name: 'Protocol languages' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /^Remove / }) });
}

/** The button that records a language's text as another language. */
function changeButton(page: Page, language: string): Locator {
  return page.getByRole('button', {
    name: `Change ${language} to a different language`,
    exact: true,
  });
}

/** The delete button at the end of a language's row. */
function removeButton(page: Page, language: string): Locator {
  return page.getByRole('button', { name: `Remove ${language}`, exact: true });
}

function translationTableDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Translation table', exact: true });
}

function translationTable(page: Page): Locator {
  return translationTableDialog(page).getByRole('table', {
    name: /^Every text participants see/,
  });
}

/**
 * The text box holding a text's translation into a language, on the first
 * stage unless another is named. A formatted text's cell has one only while it
 * has focus.
 */
function translationCell(
  page: Page,
  row: string,
  language: string,
  stage = 1,
): Locator {
  return translationTable(page).getByRole('textbox', {
    name: new RegExp(`^Stage ${stage} .*\\b${row} ${language}$`),
  });
}

function textsToShow(page: Page): Locator {
  return page.getByRole('combobox', { name: 'Texts to show', exact: true });
}

test('adds a language, keeps the default language from being removed, translates its missing texts in the translation table, and lists languages alphabetically', async ({
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
  await expect(english).toContainText('6 of 6 texts translated');
  // With nothing to translate into, there is no translation table.
  const openTable = page.getByRole('link', {
    name: 'Open translation table',
    exact: true,
  });
  await expect(openTable).toHaveCount(0);
  // Nor is there a choice of default.
  const defaultLanguage = page.getByRole('combobox', {
    name: 'Default language',
    exact: true,
  });
  await expect(defaultLanguage).toHaveCount(0);

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
  await expect(french).toContainText('0 of 6 texts translated');
  await expect(french.getByText('Default', { exact: true })).toHaveCount(0);
  await expect(
    french.getByText('Missing translations', { exact: true }),
  ).toBeVisible();
  await expect(
    english.getByText('Missing translations', { exact: true }),
  ).toHaveCount(0);
  await expect(openTable).toHaveAttribute(
    'href',
    '/protocol/localization?table=open',
  );
  // With a second language, the list explains which translation participants
  // see.
  await expect(
    page.getByRole('region', { name: 'Protocol languages' }),
  ).toHaveAccessibleDescription(
    /They see each text in the first of the following languages that has a translation of it:/,
  );
  // A language with no translations of its own strands nothing, so it can go.
  await expect(removeButton(page, 'French')).toBeEnabled();
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

  // Make French the default.
  await expect(defaultLanguage).toHaveAccessibleDescription(
    'Participants see text in this language when it has no translation in a language they use.',
  );
  await defaultLanguage.selectOption({ label: 'French' });
  await expect(french.getByText('Default', { exact: true })).toBeVisible();
  await expect(english.getByText('Default', { exact: true })).toHaveCount(0);
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

  // The default language cannot be removed, and its delete button says why.
  // The button stays in the tab order, so the reason reaches keyboard users
  // too, and pressing it does nothing. A row's controls are in the order
  // change, then delete, so Tab from English's delete button reaches French's
  // change button first and its delete button second.
  const defaultReason =
    'To remove the default language, make another language the default first.';
  const removeFrench = removeButton(page, 'French');
  const removeEnglish = removeButton(page, 'English');
  const changeEnglish = changeButton(page, 'English');
  const changeFrench = changeButton(page, 'French');
  await changeEnglish.focus();
  await page.keyboard.press('Tab');
  await expect(removeEnglish).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(changeFrench).toBeFocused();
  await expect(changeFrench).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(removeFrench).toBeFocused();
  await expect(removeFrench).toBeDisabled();
  await expect(removeFrench).toHaveAccessibleDescription(defaultReason);
  await expect(
    page.getByRole('tooltip').filter({ hasText: defaultReason }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Nor can English, though it is no longer the default: its texts exist in
  // no other language yet.
  const strandedReason =
    '6 texts exist only in English. Translate them into another language before removing English.';
  await expect(removeEnglish).toBeDisabled();
  await expect(removeEnglish).toHaveAccessibleDescription(strandedReason);
  await removeEnglish.hover();
  await expect(
    page.getByRole('tooltip').filter({ hasText: strandedReason }),
  ).toBeVisible();
  expect((await readProtocolJson(page)).localization.locales).toEqual([
    'en',
    'fr',
  ]);

  // The translation table can show only the texts one language is missing,
  // under the stage they belong to, and its address says so.
  await openTable.click();
  await expect(page).toHaveURL(/\/protocol\/localization\?table=open$/);
  await expect(translationTableDialog(page)).toBeVisible();
  await expect(
    translationTableDialog(page).getByRole('searchbox', {
      name: 'Search texts and translations',
    }),
  ).toBeFocused();
  await textsToShow(page).selectOption({ label: 'Missing French' });
  await expect(page).toHaveURL(
    /\/protocol\/localization\?table=open&missing=fr$/,
  );
  await expect(page.getByText('Showing 6 of 6 texts')).toBeVisible();
  const table = translationTable(page);
  await expect(table.locator('th[scope="row"]')).toHaveText(STAGE_TEXT_ROWS);
  // A stage is headed by its position, its name in the default language and
  // its interface, and its name links to it.
  await expect(
    table.getByRole('rowheader', { name: 'Stage 1 · Welcome · Information' }),
  ).toBeVisible();
  await expect(
    table.getByRole('link', { name: STAGE_NAME, exact: true }),
  ).toHaveAttribute('href', '/protocol/stage/welcome');
  // An empty cell shows the English text participants see in place of French.
  await expect(
    translationCell(page, 'Page heading', 'French'),
  ).toHaveAccessibleDescription(/^Welcome to the study Not translated yet\./);

  // Enter saves a text of one line and moves to the next row, in plain and
  // formatted text alike. The last row has nowhere to go, so Ctrl+Enter only
  // saves it. Rows translated while the filter is on stay until it changes.
  await translationCell(page, 'Stage name', 'French').click();
  await page.keyboard.type('Bienvenue');
  await page.keyboard.press('Enter');
  await expect(translationCell(page, 'Page heading', 'French')).toBeFocused();
  await page.keyboard.type('Bienvenue dans l’étude');
  await page.keyboard.press('Enter');
  await expect(translationCell(page, 'Content', 'French')).toBeFocused();
  await page.keyboard.type('Merci de votre participation.');
  await page.keyboard.press('Enter');
  await expect(translationCell(page, 'Stage name', 'French', 2)).toBeFocused();
  await page.keyboard.type('Fin');
  await page.keyboard.press('Enter');
  await expect(translationCell(page, 'Heading', 'French', 2)).toBeFocused();
  await page.keyboard.type('Terminé');
  await page.keyboard.press('Enter');
  await expect(translationCell(page, 'Text', 'French', 2)).toBeFocused();
  await page.keyboard.type('Merci encore.');
  await page.keyboard.press('Control+Enter');
  await expect(
    table.getByRole('columnheader', { name: /^French/ }),
  ).toContainText('6 of 6 translated');
  await expect(table.locator('th[scope="row"]')).toHaveText(STAGE_TEXT_ROWS);
  const translated = await readProtocolJson(page, (protocol) =>
    Object.hasOwn(finishContent(protocol) ?? {}, 'fr'),
  );
  expect(translated.stages[0]?.label).toEqual({
    en: STAGE_NAME,
    fr: 'Bienvenue',
  });
  expect(welcomeTitle(translated)).toEqual({
    en: 'Welcome to the study',
    fr: 'Bienvenue dans l’étude',
  });
  expect(welcomeContent(translated)).toEqual({
    en: 'Thank you for taking part.',
    fr: 'Merci de votre participation.',
  });
  await textsToShow(page).selectOption({ label: 'All texts' });
  await textsToShow(page).selectOption({ label: 'Missing French' });
  await expect(
    page.getByText('Every text is translated into French.'),
  ).toBeVisible();

  // Closing goes back to the Languages page, and to the link that opened the
  // table.
  await translationTableDialog(page)
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(translationTableDialog(page)).toBeHidden();
  await expect(page).toHaveURL(/\/protocol\/localization$/);
  await expect(openTable).toBeFocused();
  await expect(french).toContainText('6 of 6 texts translated');
  await expect(
    french.getByText('Missing translations', { exact: true }),
  ).toHaveCount(0);

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
      ...emptyProtocol().stages,
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

async function removeLanguage(page: Page, language: string) {
  await removeButton(page, language).click();
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

  // The Languages page's own list, with its way to the translation table.
  const languages = page.getByRole('region', {
    name: 'Languages',
    exact: true,
  });
  await expect(languages.getByRole('listitem')).toHaveText([
    /^English/,
    /^French/,
    /^Spanish/,
  ]);
  const openTable = languages.getByRole('link', {
    name: 'Open translation table',
    exact: true,
  });
  await expect(openTable).toBeVisible();

  // Removing a language from a stage that has not been touched leaves nothing
  // to save, and nothing to be asked about on the way out.
  await removeLanguage(page, 'Spanish');
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

  // Going to the translation table leaves the stage, so its unsaved changes
  // are confirmed first.
  await openTable.click();
  const discard = page.getByRole('dialog', {
    name: 'Discard unsaved stage changes?',
  });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(discard).toBeHidden();
  await expect(page).toHaveURL(/\/protocol\/stage\/choose-language$/);
  await expect(name).toHaveValue('Pick a language');

  await removeLanguage(page, 'French');
  await expect(stageLanguageRow(page, 'fr')).toHaveCount(0);
  await expect(name).toHaveValue('Pick a language');
  // With one language left, there is nothing to translate into.
  await expect(openTable).toHaveCount(0);
  await page.getByRole('button', { name: 'Finished Editing' }).click();
  await page.waitForURL(/\/protocol$/);

  const saved = await readProtocolJson(
    page,
    (protocol) => protocol.stages[0]?.label.en === 'Pick a language',
  );
  expect(saved.localization).toEqual({ defaultLocale: 'en', locales: ['en'] });
  expect(saved.stages[0]?.label).toEqual({ en: 'Pick a language' });
});

function bilingualProtocol(): CurrentProtocol {
  return CurrentProtocolSchema.parse({
    ...englishProtocol(),
    localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
  });
}

test('opens the translation table on every missing translation from the protocol’s note', async ({
  architectPage: page,
  seed,
}) => {
  await seed(bilingualProtocol());
  await gotoProtocol(page);

  await page
    .getByRole('link', { name: 'Show missing translations', exact: true })
    .click();
  await expect(page).toHaveURL(
    /\/protocol\/localization\?table=open&missing=any$/,
  );
  await expect(textsToShow(page).locator('option:checked')).toHaveText(
    'Missing in any shown language',
  );
  await expect(page.getByText('Showing 6 of 6 texts')).toBeVisible();

  // The filter is kept in the address, and every text has a row without it.
  await textsToShow(page).selectOption({ label: 'All texts' });
  await expect(page).toHaveURL(/\/protocol\/localization\?table=open$/);
  await expect(translationTable(page).locator('th[scope="row"]')).toHaveText(
    STAGE_TEXT_ROWS,
  );

  // Closed, the table leaves the Languages page it was opened over.
  await translationTableDialog(page)
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(translationTableDialog(page)).toBeHidden();
  await expect(page).toHaveURL(/\/protocol\/localization$/);
  await expect(
    page.getByRole('heading', { name: 'Languages', level: 1 }),
  ).toBeFocused();
});
