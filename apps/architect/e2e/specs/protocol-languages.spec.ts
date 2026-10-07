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
 * one text block), so there is something to count and translate once a second
 * language joins.
 */
const STAGE_NAME = 'Welcome';

/** Each text's row in the translation table, named as the stage editor names it. */
const STAGE_TEXT_ROWS = [
  'Stage name',
  'Page content › Page heading',
  'Page content › Item 1 › Content',
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

function languageRows(page: Page): Locator {
  return page
    .getByRole('region', { name: 'Protocol languages' })
    .getByRole('listitem');
}

/** Opens a language's actions menu, which holds every change to it. */
async function openActions(page: Page, language: string): Promise<Locator> {
  await page
    .getByRole('button', { name: `Actions for ${language}`, exact: true })
    .click();
  const menu = page.getByRole('menu', { name: `Actions for ${language}` });
  await expect(menu).toBeVisible();
  return menu;
}

async function closeActions(page: Page, menu: Locator) {
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
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
 * The text box holding a first-stage text's translation into a language. A
 * formatted text's cell has one only while it has focus.
 */
function translationCell(page: Page, row: string, language: string): Locator {
  return translationTable(page).getByRole('textbox', {
    name: new RegExp(`^Stage 1 .*\\b${row} ${language}$`),
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
  await expect(english).toContainText('3 of 3 texts translated');
  // With nothing to translate into, there is no translation table.
  const openTable = page.getByRole('link', {
    name: 'Open translation table',
    exact: true,
  });
  await expect(openTable).toHaveCount(0);

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
  // A language with no translations of its own strands nothing, so it can go.
  const frenchActions = await openActions(page, 'French');
  await expect(
    frenchActions.getByRole('menuitem', { name: 'Remove', exact: true }),
  ).toBeEnabled();
  await closeActions(page, frenchActions);
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
  await (
    await openActions(page, 'French')
  )
    .getByRole('menuitem', { name: 'Make default', exact: true })
    .click();
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

  // The default language cannot be removed, and its Remove item says why.
  // The item stays reachable with the arrow keys, so the reason reaches
  // keyboard users too, and choosing it does nothing.
  const frenchActionsButton = page.getByRole('button', {
    name: 'Actions for French',
    exact: true,
  });
  await frenchActionsButton.focus();
  await page.keyboard.press('Enter');
  const defaultActions = page.getByRole('menu', {
    name: 'Actions for French',
  });
  await expect(
    defaultActions.getByRole('menuitem', {
      name: 'Relabel translations…',
      exact: true,
    }),
  ).toBeFocused();
  await expect(
    defaultActions.getByRole('menuitem', { name: 'Make default' }),
  ).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  const removeFrench = defaultActions.getByRole('menuitem', {
    name: 'Remove',
    exact: true,
  });
  await expect(removeFrench).toBeFocused();
  await expect(removeFrench).toBeDisabled();
  await expect(removeFrench).toHaveAccessibleDescription(
    'To remove the default language, make another language the default first.',
  );
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await closeActions(page, defaultActions);
  await expect(frenchActionsButton).toBeFocused();
  // Nor can English, though it is no longer the default: its texts exist in
  // no other language yet.
  const englishActions = await openActions(page, 'English');
  await expect(
    englishActions.getByRole('menuitem', { name: 'Make default', exact: true }),
  ).toBeVisible();
  const removeEnglish = englishActions.getByRole('menuitem', {
    name: 'Remove',
    exact: true,
  });
  await expect(removeEnglish).toBeDisabled();
  await expect(removeEnglish).toHaveAccessibleDescription(
    '3 texts exist only in English. Translate them into another language before removing English.',
  );
  await closeActions(page, englishActions);
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
  await expect(page.getByText('Showing 3 of 3 texts')).toBeVisible();
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
  await page.keyboard.press('Control+Enter');
  await expect(
    table.getByRole('columnheader', { name: /^French/ }),
  ).toContainText('3 of 3 translated');
  await expect(table.locator('th[scope="row"]')).toHaveText(STAGE_TEXT_ROWS);
  const translated = await readProtocolJson(page, (protocol) =>
    Object.hasOwn(welcomeContent(protocol) ?? {}, 'fr'),
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
  await expect(french).toContainText('3 of 3 texts translated');
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
  await (
    await openActions(page, language)
  )
    .getByRole('menuitem', { name: 'Remove', exact: true })
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
  await expect(page.getByText('Showing 3 of 3 texts')).toBeVisible();

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
