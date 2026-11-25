import type { Page } from '@playwright/test';

import {
  type CurrentProtocol,
  dynamicValueNameFor,
  optionCaseKey,
} from '@codaco/protocol-validation';

import { expect, test } from '../fixtures/architect-test.js';
import {
  ANSWERS_STAGE_ID,
  EGO_AGE_ID,
  EGO_FIRST_NAME_ID,
  EGO_MOOD_ID,
  EGO_NICKNAME_ID,
  GHOST_TITLE,
  INFO_STAGE_ID,
  MOOD_OPTION_IDS,
  pipedTextProtocol,
  protocolNamingUnknownValue,
  protocolWithNickname,
} from '../fixtures/piped-text-protocol.js';
import { switchesIn } from '../helpers/message-switches.js';
import { readProtocolJson, readStageJson } from '../helpers/read-store.js';
import { allowErroneousWriteToLand } from '../helpers/refusal.js';
import { PipedText } from '../pageobjects/piped-text.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

/**
 * Authoring piped text ("dynamic values") in Architect: the menus that insert
 * a value or wording that depends on one, what a text may refer to, what the
 * editor refuses, and what the protocol stores. Stored text is always an ICU
 * message that names each value directly (`ego_<attribute id>`, `now`),
 * never the editor's own document, and nothing else on the stage records it.
 */
const PAGE_TEXT = 'Rich Text';

/** The name stored text uses for one of the participant's attributes. */
const egoName = (variableId: string) =>
  dynamicValueNameFor({ kind: 'attribute', role: 'ego', variableId });
const FIRST_NAME = egoName(EGO_FIRST_NAME_ID);
const AGE = egoName(EGO_AGE_ID);
const MOOD = egoName(EGO_MOOD_ID);

/** What the stage editor and the translation table say about `{ghost}`. */
const GHOST_PROBLEM =
  /This text cannot use "ghost": it does not refer to an attribute, a node’s label, a condition or today’s date\./;

type Stage = CurrentProtocol['stages'][number];

/** Index of each Information stage in `pipedTextProtocol`. */
const INFO_INDEX = 1;
const ANSWERS_INDEX = 2;

function contentIn(stage: Stage | undefined, locale: string): string {
  if (stage?.type !== 'Information') {
    throw new Error(`expected an Information stage, got ${stage?.type}`);
  }
  const text = stage.content[locale];
  if (text === undefined) {
    throw new Error(`no ${locale} content in ${JSON.stringify(stage.content)}`);
  }
  return text;
}

async function openStage(page: Page, stageId: string): Promise<void> {
  await page.goto(`/protocol/stage/${stageId}`);
  await expect(
    page.getByRole('textbox', { name: PAGE_TEXT, exact: true }),
  ).toBeVisible();
}

test.describe('the insert menu', () => {
  test('offers the values the text can show, and nothing it cannot, then stores an ICU message naming them', async ({
    architectPage: page,
    seed,
  }) => {
    const piped = new PipedText(page);
    await seed(pipedTextProtocol());
    await openStage(page, INFO_STAGE_ID);

    await piped.focusEnd(PAGE_TEXT);
    await page.keyboard.type(' on ');

    // Typing the trigger opens the menu at the caret; it lists the participant's
    // attributes and the interview's own values, and no attribute of a node
    // type, which an Information stage has no node to show.
    await page.keyboard.type('{');
    const menu = piped.menu();
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole('group', { name: 'Ego Attributes' }),
    ).toBeVisible();
    await expect(
      menu.getByRole('group', { name: 'Interview Attributes' }),
    ).toBeVisible();
    for (const offered of [
      'first_name Text',
      'age Number',
      'mood Categorical',
      'Today’s date Date',
    ]) {
      await expect(menu.getByRole('option', { name: offered })).toBeVisible();
    }
    await expect(piped.menuOptions()).toHaveCount(4);
    await expect(menu.getByRole('option', { name: /nickname/ })).toHaveCount(0);
    await expect(
      menu.getByRole('group', { name: /Node Attributes/ }),
    ).toHaveCount(0);

    // Narrowed by typing, chosen with Enter.
    await piped.search('today');
    await expect(piped.menuOptions()).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(
      piped.textbox(PAGE_TEXT).getByText('Today’s date'),
    ).toBeVisible();

    // Chosen by click from the toolbar's syringe.
    await page.keyboard.type(' for ');
    await piped.insertValue(PAGE_TEXT, 'first_name Text');
    await expect(
      piped.field(PAGE_TEXT).getByRole('group', {
        name: 'Wording depending on whether first_name is known',
      }),
    ).toBeVisible();

    await new StageEditor(page).save();

    const stage = await readStageJson(page, INFO_INDEX, (saved) =>
      JSON.stringify(saved).includes('missing'),
    );
    const content = contentIn(stage, 'en');
    expect(content).toBe(
      `Welcome to the study on {now} for {${FIRST_NAME}, select, missing {} other {{${FIRST_NAME}}}}`,
    );
    // An ICU message string, not the editor's document.
    expect(content).not.toMatch(/"type"|paragraph|doc/);
    expect(switchesIn(content)).toEqual([
      { argument: FIRST_NAME, type: 'select', keys: ['missing', 'other'] },
    ]);
  });

  test('does not offer a value to a text that cannot show one', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(pipedTextProtocol());
    await openStage(page, INFO_STAGE_ID);

    // The stage's own name is shown to researchers, not participants, so the
    // page's one syringe belongs to its text.
    await expect(
      page.getByRole('textbox', { name: 'Stage name', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Inject piped text/ }),
    ).toHaveCount(1);
    await expect(new PipedText(page).valuesButton(PAGE_TEXT)).toHaveCount(1);
  });
});

test.describe('text that names a value that does not exist', () => {
  test('is kept as it is and refused by the stage editor with an error that names it', async ({
    architectPage: page,
    seed,
  }) => {
    const piped = new PipedText(page);
    const editor = new StageEditor(page);
    await seed(protocolNamingUnknownValue());
    await openStage(page, INFO_STAGE_ID);

    // The text shows, the unknown name as a pill carrying the recorded name.
    const text = piped.textbox(PAGE_TEXT);
    await expect(text).toHaveText('ghost welcome');
    await expect(text.getByText('ghost', { exact: true })).toBeVisible();
    await expect(text).toHaveAttribute('aria-invalid', 'true');
    await expect(piped.field(PAGE_TEXT).getByText(GHOST_PROBLEM)).toBeVisible();
    // The stage's outline already says which section has the problem.
    const section = editor
      .outline()
      .getByRole('button', { name: /^Content Has a problem/ });
    await expect(section).toBeVisible();

    // Edited, the stage will not save.
    await piped.focusEnd(PAGE_TEXT);
    await page.keyboard.type('!');
    await page.getByRole('button', { name: 'Finished Editing' }).click();
    const summary = page.getByRole('alert').filter({ hasText: 'Content:' });
    await expect(summary).toContainText(GHOST_PROBLEM);
    await expect(page).toHaveURL(
      new RegExp(`/protocol/stage/${INFO_STAGE_ID}$`),
    );
    await expect(section).toHaveAccessibleName(
      new RegExp(`Has a problem\\. ${GHOST_PROBLEM.source}`),
    );

    await allowErroneousWriteToLand(page);
    const stored = await readProtocolJson(page);
    expect(contentIn(stored.stages[INFO_INDEX], 'en')).toBe(GHOST_TITLE);
  });

  test('shows its name in the translation table and is refused when the cell is left', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolNamingUnknownValue());
    await page.goto('/protocol/localization?table=open');
    const dialog = page.getByRole('dialog', {
      name: 'Translation table',
      exact: true,
    });
    const table = dialog.getByRole('table', {
      name: /^Everything participants see/,
    });
    const cellName = /^Stage 2 .*\bContent English$/;

    // Read: the cell shows the name the text recorded.
    const cell = table.getByRole('button', { name: cellName });
    await expect(cell.locator('xpath=ancestor::td')).toContainText(
      'ghost welcome',
    );
    await expect(cell).toHaveAttribute('aria-invalid', 'false');

    // Edited, then left for another cell: refused at the cell, with the error.
    await cell.click();
    const box = table.getByRole('textbox', { name: cellName });
    await expect(box).toBeFocused();
    await expect(box).toHaveText('ghost welcome');
    await page.keyboard.press('End');
    await page.keyboard.type(' there');
    await table
      .getByRole('textbox', { name: /^Stage 2 .*Stage name English$/ })
      .click();
    await expect(table.getByRole('button', { name: cellName })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(table.getByText(GHOST_PROBLEM)).toBeVisible();

    // Saving the table does not accept it.
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeVisible();
    await allowErroneousWriteToLand(page);
    const stored = await readProtocolJson(page);
    expect(contentIn(stored.stages[INFO_INDEX], 'en')).toBe(GHOST_TITLE);
  });
});

test.describe('deleting an attribute that stage text shows', () => {
  test('is refused while a stage shows it, and the usage names the stage', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithNickname({ shown: true }));
    await page.goto('/protocol/codebook');
    const row = page.getByRole('row', {
      name: /Edit attribute name: ego_nickname/,
    });

    await expect(row.getByRole('link', { name: 'Welcome' })).toHaveAttribute(
      'href',
      `/protocol/stage/${INFO_STAGE_ID}`,
    );
    const remove = row.getByRole('button', {
      name: 'In use — cannot be deleted',
    });
    await expect(remove).toBeDisabled();
    // Only its use in the stage's text holds it: no form collects it.
    await expect(row.getByRole('link')).toHaveCount(1);

    // The same codebook offers the delete where nothing uses the attribute.
    await expect(
      page
        .getByRole('row', { name: /Edit attribute name: nickname/ })
        .getByRole('button', { name: 'Delete attribute' }),
    ).toBeEnabled();

    const stored = await readProtocolJson(page);
    expect(stored.codebook.ego?.variables).toHaveProperty(EGO_NICKNAME_ID);
  });

  test('is allowed once no stage shows it', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithNickname({ shown: false }));
    await page.goto('/protocol/codebook');
    const row = page.getByRole('row', {
      name: /Edit attribute name: ego_nickname/,
    });

    await expect(row.getByRole('link')).toHaveCount(0);
    await row.getByRole('button', { name: 'Delete attribute' }).click();
    await page
      .getByRole('dialog', { name: 'Delete attribute', exact: true })
      .getByRole('button', { name: 'Delete attribute', exact: true })
      .click();
    await expect(row).toHaveCount(0);
    const stored = await readProtocolJson(
      page,
      (protocol) =>
        protocol.codebook.ego?.variables?.[EGO_NICKNAME_ID] === undefined,
    );
    expect(stored.codebook.ego?.variables).not.toHaveProperty(EGO_NICKNAME_ID);
  });
});

test.describe('wording that depends on a value, in two languages', () => {
  const ENGLISH_AND_ARABIC = {
    defaultLocale: 'en',
    locales: ['en', 'ar'],
  };

  test('offers each language its own plural categories and stores a plural for each', async ({
    architectPage: page,
    seed,
  }) => {
    const piped = new PipedText(page);
    await seed(pipedTextProtocol(ENGLISH_AND_ARABIC));
    await openStage(page, INFO_STAGE_ID);

    const numberGroup = /^Wording that fits the number/;
    await piped.openLogic(PAGE_TEXT);
    await expect(
      piped
        .menu()
        .getByRole('option', { name: 'age Wording that fits the number' }),
    ).toBeVisible();
    // Only a number can choose its wording by number.
    await expect(
      piped.menu().getByRole('option', {
        name: /^(first_name|mood) Wording that fits the number/,
      }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');

    await piped.focusEnd(PAGE_TEXT);
    await piped.insertLogic(PAGE_TEXT, /^age /);
    await piped.pill(PAGE_TEXT, 'age').click();
    const english = piped.versions(PAGE_TEXT, numberGroup);
    await expect(english).toHaveCount(2);
    await expect(english).toHaveText(['age', 'age']);
    await expectNames(english, [
      'If known, When it is 1',
      'If known, When it is 0, 2, 3, …',
    ]);

    await piped.editIn(PAGE_TEXT, 'Arabic');
    await piped.textbox(PAGE_TEXT).click();
    await piped.insertLogic(PAGE_TEXT, /^age /);
    await piped.pill(PAGE_TEXT, 'age').click();
    const arabic = piped.versions(PAGE_TEXT, numberGroup);
    await expect(arabic).toHaveCount(6);
    await expectNames(arabic, [
      'If known, When it is 0',
      'If known, When it is 1',
      'If known, When it is 2',
      'If known, When it is 3, 4, 5, …',
      'If known, When it is 11, 12, 13, …',
      'If known, When it is 100, 101, 102, …',
    ]);

    await new StageEditor(page).save();
    const stage = await readStageJson(page, INFO_INDEX, (saved) =>
      JSON.stringify(saved).includes('"ar"'),
    );
    const pluralKeys = (locale: string) =>
      switchesIn(contentIn(stage, locale))
        .filter(({ type }) => type === 'plural')
        .map(({ argument, keys }) => ({ argument, keys }));
    expect(pluralKeys('en')).toEqual([
      { argument: AGE, keys: ['one', 'other'] },
    ]);
    expect(pluralKeys('ar')).toEqual([
      {
        argument: AGE,
        keys: ['zero', 'one', 'two', 'few', 'many', 'other'],
      },
    ]);
  });

  test('offers each answer of a categorical attribute and other, in each language', async ({
    architectPage: page,
    seed,
  }) => {
    const piped = new PipedText(page);
    await seed(pipedTextProtocol(ENGLISH_AND_ARABIC));
    await openStage(page, ANSWERS_STAGE_ID);

    const answerGroup = /^Wording for each answer to mood/;
    const expectedNames = [
      'Happy',
      'Sad',
      'Calm',
      'Any other answer',
      'If not known',
    ];

    await piped.focusEnd(PAGE_TEXT);
    await piped.insertLogic(PAGE_TEXT, /^mood /);
    await expectNames(piped.versions(PAGE_TEXT, answerGroup), expectedNames);
    // Worded for one answer, so the stored message can be told from a default.
    await piped.versions(PAGE_TEXT, answerGroup).first().click();
    await page.keyboard.type('Glad');

    await piped.editIn(PAGE_TEXT, 'Arabic');
    await piped.textbox(PAGE_TEXT).click();
    await piped.insertLogic(PAGE_TEXT, /^mood /);
    await expectNames(piped.versions(PAGE_TEXT, answerGroup), expectedNames);
    // A text cannot be blank in every version.
    await piped.versions(PAGE_TEXT, answerGroup).first().click();
    await page.keyboard.type('Pleased');

    await new StageEditor(page).save();
    const stage = await readStageJson(page, ANSWERS_INDEX, (saved) =>
      JSON.stringify(saved).includes('"ar"'),
    );
    // Each answer is chosen by its option's id, written as a name.
    const happy = optionCaseKey(MOOD_OPTION_IDS.happy);
    const answerSwitch = (locale: string) =>
      switchesIn(contentIn(stage, locale)).find(
        ({ type, keys }) => type === 'select' && keys.includes(happy),
      );
    for (const locale of ['en', 'ar']) {
      expect(answerSwitch(locale)).toEqual({
        argument: MOOD,
        type: 'select',
        keys: [
          'missing',
          happy,
          optionCaseKey(MOOD_OPTION_IDS.sad),
          optionCaseKey(MOOD_OPTION_IDS.calm),
          'other',
        ],
      });
    }
    expect(contentIn(stage, 'en')).toContain(`${happy} {Glad}`);
    expect(contentIn(stage, 'ar')).toContain(`${happy} {Pleased}`);
  });
});

async function expectNames(
  boxes: ReturnType<PipedText['versions']>,
  names: string[],
): Promise<void> {
  expect(names.length).toBeGreaterThan(0);
  await expect(boxes).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(boxes.nth(index)).toHaveAccessibleName(name);
  }
}
