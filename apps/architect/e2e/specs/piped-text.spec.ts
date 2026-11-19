import type { Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, test } from '../fixtures/architect-test.js';
import {
  ANSWERS_STAGE_ID,
  EGO_AGE_ID,
  EGO_FIRST_NAME_ID,
  EGO_MOOD_ID,
  EGO_NICKNAME_ID,
  GHOST_TITLE,
  INFO_STAGE_ID,
  pipedTextProtocol,
  protocolNamingUnboundValue,
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
 * message with the stage's `dynamicValues` bindings, never the editor's own
 * document.
 */
const PAGE_HEADING = 'Page heading';

type Stage = CurrentProtocol['stages'][number];

/** Index of each Information stage in `pipedTextProtocol`. */
const INFO_INDEX = 1;
const ANSWERS_INDEX = 2;

function titleIn(stage: Stage | undefined, locale: string): string {
  if (stage?.type !== 'Information') {
    throw new Error(`expected an Information stage, got ${stage?.type}`);
  }
  const text = stage.title[locale];
  if (text === undefined) {
    throw new Error(`no ${locale} title in ${JSON.stringify(stage.title)}`);
  }
  return text;
}

async function openStage(page: Page, stageId: string): Promise<void> {
  await page.goto(`/protocol/stage/${stageId}`);
  await expect(
    page.getByRole('textbox', { name: PAGE_HEADING, exact: true }),
  ).toBeVisible();
}

test.describe('the insert menu', () => {
  test('offers the values the text can show, and nothing it cannot, then stores bindings and an ICU message', async ({
    architectPage: page,
    seed,
  }) => {
    const piped = new PipedText(page);
    await seed(pipedTextProtocol());
    await openStage(page, INFO_STAGE_ID);

    await piped.focusEnd(PAGE_HEADING);
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
      piped.textbox(PAGE_HEADING).getByText('Today’s date'),
    ).toBeVisible();

    // Chosen by click from the toolbar's syringe.
    await page.keyboard.type(' for ');
    await piped.insertValue(PAGE_HEADING, 'first_name Text');
    await expect(
      piped.field(PAGE_HEADING).getByRole('group', {
        name: 'Wording depending on whether first_name is known',
      }),
    ).toBeVisible();

    await new StageEditor(page).save();

    const stage = await readStageJson(page, INFO_INDEX, (saved) =>
      JSON.stringify(saved).includes('missing'),
    );
    expect(stage).toMatchObject({
      dynamicValues: {
        today: { path: 'now' },
        firstName: { path: `ego.${EGO_FIRST_NAME_ID}` },
      },
    });
    const title = titleIn(stage, 'en');
    expect(title).toBe(
      'Welcome to the study on {today} for {firstName, select, missing {} other {{firstName}}}',
    );
    // An ICU message string, not the editor's document.
    expect(title).not.toMatch(/"type"|paragraph|doc/);
    expect(switchesIn(title)).toEqual([
      { argument: 'firstName', type: 'select', keys: ['missing', 'other'] },
    ]);
  });

  test('does not offer a value to a text that cannot show one', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(pipedTextProtocol());
    await openStage(page, INFO_STAGE_ID);

    // The stage's own name is shown to researchers, not participants, so the
    // page's one syringe belongs to the heading.
    await expect(
      page.getByRole('textbox', { name: 'Stage name', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^Inject piped text/ }),
    ).toHaveCount(1);
    await expect(new PipedText(page).valuesButton(PAGE_HEADING)).toHaveCount(1);
  });
});

test.describe('text that names a value it does not bind', () => {
  test('is kept as it is and refused by the stage editor with an error that names it', async ({
    architectPage: page,
    seed,
  }) => {
    const piped = new PipedText(page);
    const editor = new StageEditor(page);
    await seed(protocolNamingUnboundValue());
    await openStage(page, INFO_STAGE_ID);

    // The text shows, the unbound name as a pill carrying the recorded name.
    const heading = piped.textbox(PAGE_HEADING);
    await expect(heading).toHaveText('ghost welcome');
    await expect(heading.getByText('ghost', { exact: true })).toBeVisible();
    await expect(heading).toHaveAttribute('aria-invalid', 'true');
    await expect(
      piped
        .field(PAGE_HEADING)
        .getByText(/"ghost" is not a value this text can show here/),
    ).toBeVisible();
    // The stage's outline already says which section has the problem.
    const section = editor
      .outline()
      .getByRole('button', { name: /^Page content Has a problem/ });
    await expect(section).toBeVisible();

    // Edited, the stage will not save.
    await piped.focusEnd(PAGE_HEADING);
    await page.keyboard.type('!');
    await page.getByRole('button', { name: 'Finished Editing' }).click();
    const summary = page
      .getByRole('alert')
      .filter({ hasText: 'Page content:' });
    await expect(summary).toContainText(
      '"ghost" is not a value this text can show here',
    );
    await expect(page).toHaveURL(/\/protocol\/stage\/info$/);
    await expect(section).toHaveAccessibleName(
      /Has a problem\. "ghost" is not a value this text can show here/,
    );

    await allowErroneousWriteToLand(page);
    const stored = await readProtocolJson(page);
    expect(titleIn(stored.stages[INFO_INDEX], 'en')).toBe(GHOST_TITLE);
  });

  test('shows its name in the translation table and is refused when the cell is left', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolNamingUnboundValue());
    await page.goto('/protocol/localization?table=open');
    const dialog = page.getByRole('dialog', {
      name: 'Translation table',
      exact: true,
    });
    const table = dialog.getByRole('table', {
      name: /^Everything participants see/,
    });
    const cellName = /^Stage 2 .*Page content › Page heading English$/;

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
    await expect(
      table.getByText(/"ghost" is not a value this text can show here/),
    ).toBeVisible();

    // Saving the table does not accept it.
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeVisible();
    await allowErroneousWriteToLand(page);
    const stored = await readProtocolJson(page);
    expect(titleIn(stored.stages[INFO_INDEX], 'en')).toBe(GHOST_TITLE);
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
    await piped.openLogic(PAGE_HEADING);
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

    await piped.focusEnd(PAGE_HEADING);
    await piped.insertLogic(PAGE_HEADING, /^age /);
    await piped.pill(PAGE_HEADING, 'age').click();
    const english = piped.versions(PAGE_HEADING, numberGroup);
    await expect(english).toHaveCount(2);
    await expect(english).toHaveText(['age', 'age']);
    await expectNames(english, [
      'If known, When it is 1',
      'If known, When it is 0, 2, 3, …',
    ]);

    await piped.editIn(PAGE_HEADING, 'Arabic');
    await piped.textbox(PAGE_HEADING).click();
    await piped.insertLogic(PAGE_HEADING, /^age /);
    await piped.pill(PAGE_HEADING, 'age').click();
    const arabic = piped.versions(PAGE_HEADING, numberGroup);
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
    expect(stage).toMatchObject({
      dynamicValues: { age: { path: `ego.${EGO_AGE_ID}` } },
    });
    const pluralKeys = (locale: string) =>
      switchesIn(titleIn(stage, locale))
        .filter(({ type }) => type === 'plural')
        .map(({ argument, keys }) => ({ argument, keys }));
    expect(pluralKeys('en')).toEqual([
      { argument: 'age', keys: ['one', 'other'] },
    ]);
    expect(pluralKeys('ar')).toEqual([
      {
        argument: 'age',
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

    await piped.focusEnd(PAGE_HEADING);
    await piped.insertLogic(PAGE_HEADING, /^mood /);
    await expectNames(piped.versions(PAGE_HEADING, answerGroup), expectedNames);
    // Worded for one answer, so the stored message can be told from a default.
    await piped.versions(PAGE_HEADING, answerGroup).first().click();
    await page.keyboard.type('Glad');

    await piped.editIn(PAGE_HEADING, 'Arabic');
    await piped.textbox(PAGE_HEADING).click();
    await piped.insertLogic(PAGE_HEADING, /^mood /);
    await expectNames(piped.versions(PAGE_HEADING, answerGroup), expectedNames);
    // A text cannot be blank in every version.
    await piped.versions(PAGE_HEADING, answerGroup).first().click();
    await page.keyboard.type('Pleased');

    await new StageEditor(page).save();
    const stage = await readStageJson(page, ANSWERS_INDEX, (saved) =>
      JSON.stringify(saved).includes('"ar"'),
    );
    expect(stage).toMatchObject({
      dynamicValues: {
        mood: {
          path: `ego.${EGO_MOOD_ID}`,
          cases: { happy: 'happy', sad: 'sad', calm: 'calm' },
        },
      },
    });
    const answerSwitch = (locale: string) =>
      switchesIn(titleIn(stage, locale)).find(
        ({ type, keys }) => type === 'select' && keys.includes('happy'),
      );
    for (const locale of ['en', 'ar']) {
      expect(answerSwitch(locale)).toEqual({
        argument: 'mood',
        type: 'select',
        keys: ['missing', 'happy', 'sad', 'calm', 'other'],
      });
    }
    expect(titleIn(stage, 'en')).toContain('happy {Glad}');
    expect(titleIn(stage, 'ar')).toContain('happy {Pleased}');
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
