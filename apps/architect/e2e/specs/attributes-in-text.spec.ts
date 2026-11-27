import type { Locator, Page } from '@playwright/test';

import {
  type CurrentProtocol,
  dynamicValueNameFor,
  optionCaseKey,
} from '@codaco/protocol-validation';

import { expect, test } from '../fixtures/architect-test.js';
import {
  EGO_AGE_ID,
  EGO_FIRST_NAME_ID,
  EGO_MOOD_ID,
  EGO_NICKNAME_ID,
  GHOST_TITLE,
  INFO_STAGE_ID,
  MOOD_OPTION_IDS,
  MOOD_WORDING_ID,
  pipedTextProtocol,
  protocolNamingUnknownValue,
  protocolWithDynamicAttribute,
  protocolWithNickname,
} from '../fixtures/piped-text-protocol.js';
import { switchesIn } from '../helpers/message-switches.js';
import { readProtocolJson, readStageJson } from '../helpers/read-store.js';
import { allowErroneousWriteToLand } from '../helpers/refusal.js';
import { StageEditor } from '../pageobjects/stage-editor.js';
import { TextAttributes } from '../pageobjects/text-attributes.js';

/**
 * Attributes in the text that participants read, authored in Architect:
 * the menu that inserts an attribute, the dynamic attributes created from
 * it, what a text may refer to, what the editor refuses, and what the
 * protocol stores. Stored text is always an ICU message that names each
 * value directly (`ego_<attribute id>`, `now`, `dynamic_<id>`) and chooses
 * nothing itself: the wording that changes is a dynamic attribute of the
 * stage, which the text names.
 */
const PAGE_TEXT = 'Rich Text';

/** The name stored text uses for one of the participant's attributes. */
const egoName = (variableId: string) =>
  dynamicValueNameFor({ kind: 'attribute', role: 'ego', variableId });
const FIRST_NAME = egoName(EGO_FIRST_NAME_ID);
const AGE = egoName(EGO_AGE_ID);
const MOOD = egoName(EGO_MOOD_ID);

/** The name stored text uses for a dynamic attribute. */
const dynamicName = (id: string) =>
  dynamicValueNameFor({ kind: 'dynamicAttribute', id });

/** What the stage editor and the translation table say about `{ghost}`. */
const GHOST_PROBLEM =
  /This wording cannot use "ghost": it does not refer to an attribute, a node’s label, a condition or today’s date\./;

type Stage = CurrentProtocol['stages'][number];

/** Index of the first Information stage in `pipedTextProtocol`. */
const INFO_INDEX = 1;

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

/** The stage's dynamic attributes, by id, as the protocol stores them. */
function dynamicAttributesOf(stage: Stage | undefined) {
  if (stage?.type !== 'Information') {
    throw new Error(`expected an Information stage, got ${stage?.type}`);
  }
  return stage.dynamicAttributes ?? {};
}

async function openStage(page: Page, stageId: string): Promise<void> {
  await page.goto(`/protocol/stage/${stageId}`);
  await expect(
    page.getByRole('textbox', { name: PAGE_TEXT, exact: true }),
  ).toBeVisible();
}

/** Writes each version of a dynamic attribute, by the name of its box. */
async function writeVersions(
  within: Locator,
  versions: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [name, wording] of Object.entries(versions)) {
    await within.getByRole('textbox', { name, exact: true }).fill(wording);
  }
}

test.describe('the Attribute menu', () => {
  test('offers the values the text can show, and nothing it cannot, then stores an ICU message naming them', async ({
    architectPage: page,
    seed,
  }) => {
    const attributes = new TextAttributes(page);
    await seed(pipedTextProtocol());
    await openStage(page, INFO_STAGE_ID);

    await attributes.focusEnd(PAGE_TEXT);
    // A keyboard user's pointer is not over the menu, which would move its
    // highlight.
    await page.mouse.move(0, 0);
    await page.keyboard.type(' on ');

    // Typing the trigger opens the menu at the caret. It lists the
    // participant's attributes, the stage's dynamic attributes and the
    // interview's own values, and no attribute of a node type, which an
    // Information stage has no node to show.
    await page.keyboard.type('{');
    await expect(attributes.menu()).toBeVisible();
    await expectNames(
      attributes.menuGroup('Ego attributes').getByRole('option'),
      ['age', 'first_name', 'mood'],
    );
    await expectNames(
      attributes.menuGroup('Dynamic attributes').getByRole('option'),
      ['Create dynamic attribute'],
    );
    await expectNames(
      attributes.menuGroup('Interview attributes').getByRole('option'),
      ['Today’s date'],
    );
    await expect(attributes.menuOptions()).toHaveCount(5);
    await expect(
      attributes.menu().getByRole('option', { name: /nickname/ }),
    ).toHaveCount(0);
    await expect(
      attributes.menu().getByRole('group', { name: /Node attributes/ }),
    ).toHaveCount(0);

    // Narrowed by typing, chosen with Enter.
    await attributes.search('today');
    await expectNames(attributes.menuOptions(), ['Today’s date']);
    await page.keyboard.press('Enter');
    await expect(attributes.menu()).toBeHidden();
    await attributes.expectPills(PAGE_TEXT, ['Today’s date']);

    // Chosen by click from the toolbar.
    await page.keyboard.type(' for ');
    await attributes.insert(PAGE_TEXT, 'first_name');
    await attributes.expectPills(PAGE_TEXT, ['Today’s date', 'first_name']);

    await new StageEditor(page).save();

    const stage = await readStageJson(page, INFO_INDEX, (saved) =>
      JSON.stringify(saved).includes(FIRST_NAME),
    );
    const content = contentIn(stage, 'en');
    // A value with no answer shows nothing: the text chooses nothing itself.
    expect(content).toBe(`Welcome to the study on {now} for {${FIRST_NAME}}`);
    expect(switchesIn(content)).toEqual([]);
    expect(dynamicAttributesOf(stage)).toEqual({});
  });

  test('is on the toolbar of each text that can show a value, and no other', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(pipedTextProtocol());
    await openStage(page, INFO_STAGE_ID);

    // The stage's own name is shown to researchers, not participants, so the
    // page's one Attribute button belongs to its text.
    await expect(
      page.getByRole('textbox', { name: 'Stage name', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Attribute', exact: true }),
    ).toHaveCount(1);
    await expect(
      new TextAttributes(page).attributeButton(PAGE_TEXT),
    ).toHaveCount(1);
  });
});

test.describe('a dynamic attribute', () => {
  test('is created from the Attribute menu, stored on the stage, and named by the text', async ({
    architectPage: page,
    seed,
  }) => {
    const attributes = new TextAttributes(page);
    await seed(pipedTextProtocol());
    await openStage(page, INFO_STAGE_ID);

    await attributes.focusEnd(PAGE_TEXT);
    await page.keyboard.type(', ');
    await attributes.createDynamicAttribute(PAGE_TEXT, async (dialog) => {
      await attributes.chooseLogic(dialog, 'Different wording for each answer');
      await expect(
        dialog.getByRole('combobox', { name: /^Attribute/ }),
      ).toHaveText('mood');
      // A version for each answer, one for no answer and one for any other.
      await expectNames(
        dialog
          .getByRole('region', { name: 'Wording for each answer' })
          .getByRole('textbox'),
        ['If not known', 'Happy', 'Sad', 'Calm', 'Any other answer'],
      );
      await writeVersions(dialog, {
        'If not known': 'friend',
        'Happy': 'happy friend',
        'Sad': 'sad friend',
        'Calm': 'calm friend',
        'Any other answer': 'friend',
      });
    });

    // The pill shows the versions, each once, in the order of the answers.
    await attributes.expectPills(PAGE_TEXT, [
      'friend / happy friend / sad fr…',
    ]);

    await new StageEditor(page).save();
    const stage = await readStageJson(page, INFO_INDEX, (saved) =>
      JSON.stringify(saved).includes('dynamicAttributes'),
    );
    const stored = Object.entries(dynamicAttributesOf(stage));
    expect(stored).toHaveLength(1);
    const [[id, attribute] = []] = stored;
    expect(attribute).toEqual({
      logic: 'answers',
      value: MOOD,
      missing: { en: 'friend' },
      answers: [
        {
          answer: optionCaseKey(MOOD_OPTION_IDS.happy),
          wording: { en: 'happy friend' },
        },
        {
          answer: optionCaseKey(MOOD_OPTION_IDS.sad),
          wording: { en: 'sad friend' },
        },
        {
          answer: optionCaseKey(MOOD_OPTION_IDS.calm),
          wording: { en: 'calm friend' },
        },
      ],
      other: { en: 'friend' },
    });
    expect(contentIn(stage, 'en')).toBe(
      `Welcome to the study, {${dynamicName(id ?? '')}}`,
    );
  });

  test('is worded in each language that shows it, and removed from one language’s text only', async ({
    architectPage: page,
    seed,
  }) => {
    const attributes = new TextAttributes(page);
    const editor = new StageEditor(page);
    await seed(protocolWithDynamicAttribute());
    await openStage(page, INFO_STAGE_ID);
    const name = dynamicName(MOOD_WORDING_ID);

    await attributes.expectPills(PAGE_TEXT, ['well / happy / sad / calm']);

    // In Spanish, the stage's dynamic attribute is offered by its versions.
    await attributes.editIn(PAGE_TEXT, 'Spanish');
    await attributes.focusEnd(PAGE_TEXT);
    await page.keyboard.type(' Pareces ');
    await attributes.insertByKeyboard('happy');
    await attributes.expectPills(PAGE_TEXT, ['well / happy / sad / calm']);
    const pill = attributes.pills(PAGE_TEXT);

    // Its popover asks for the Spanish wording, with the English beside it.
    await pill.click();
    const popover = attributes.popover();
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('English: happy');
    await writeVersions(popover, {
      'If not known': 'bien',
      'Happy': 'feliz',
      'Sad': 'triste',
      'Calm': 'tranquilo',
      'Any other answer': 'bien',
    });
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    await editor.save();
    const worded = await readStageJson(page, INFO_INDEX, (saved) =>
      JSON.stringify(saved).includes('feliz'),
    );
    expect(contentIn(worded, 'es')).toBe(`Hola. Pareces {${name}}`);
    expect(contentIn(worded, 'en')).toBe(`You seem {${name}} today.`);
    const attribute = dynamicAttributesOf(worded)[MOOD_WORDING_ID];
    expect(attribute).toMatchObject({
      logic: 'answers',
      value: MOOD,
      missing: { en: 'well', es: 'bien' },
      other: { en: 'well', es: 'bien' },
    });
    expect(
      attribute?.logic === 'answers'
        ? attribute.answers.map(({ wording }) => wording)
        : [],
    ).toEqual([
      { en: 'happy', es: 'feliz' },
      { en: 'sad', es: 'triste' },
      { en: 'calm', es: 'tranquilo' },
    ]);

    // Removed from the Spanish text, it stays in the English text.
    await openStage(page, INFO_STAGE_ID);
    await attributes.editIn(PAGE_TEXT, 'Spanish');
    await attributes.pills(PAGE_TEXT).click();
    await attributes
      .popover()
      .getByRole('button', { name: 'Remove from this wording' })
      .click();
    await expect(attributes.pills(PAGE_TEXT)).toHaveCount(0);

    await editor.save();
    const removed = await readStageJson(
      page,
      INFO_INDEX,
      (saved) => !contentIn(saved, 'es').includes(name),
    );
    expect(contentIn(removed, 'es')).not.toContain(name);
    expect(contentIn(removed, 'en')).toBe(`You seem {${name}} today.`);
    expect(dynamicAttributesOf(removed)).toHaveProperty(MOOD_WORDING_ID);
  });

  test('worded for a number offers each language its own plural categories', async ({
    architectPage: page,
    seed,
  }) => {
    const attributes = new TextAttributes(page);
    await seed(
      pipedTextProtocol({ defaultLocale: 'en', locales: ['en', 'ar'] }),
    );
    await openStage(page, INFO_STAGE_ID);
    const numberLogic = 'Wording for singular or plural numbers';

    await attributes.focusEnd(PAGE_TEXT);
    await page.keyboard.type(' with ');
    await attributes.createDynamicAttribute(PAGE_TEXT, async (dialog) => {
      await attributes.chooseLogic(dialog, numberLogic);
      // Only a number can choose its wording by number.
      await expect(
        dialog.getByRole('combobox', { name: /^Attribute/ }),
      ).toHaveText('age');
      await expectNames(versionsFor(dialog), [
        'When it is 1',
        'When it is 0, 2, 3, …',
      ]);
      await dialog
        .getByRole('textbox', { name: 'If not known', exact: true })
        .fill('some years');
      await typeVersions(page, versionsFor(dialog), [
        'one year',
        'several years',
      ]);
    });
    // The pill shows what the wording reads, not its syntax.
    await expect(
      attributes
        .pills(PAGE_TEXT)
        .locator('data.variable-pill[data-attribute-type="dynamic"]'),
    ).toHaveAttribute('value', 'some years / one year / severa…');

    await new StageEditor(page).save();
    const stage = await readStageJson(page, INFO_INDEX, (saved) =>
      JSON.stringify(saved).includes('some years'),
    );
    const [attribute] = Object.values(dynamicAttributesOf(stage));
    if (attribute?.logic !== 'number') {
      throw new Error(`expected number wording, got ${attribute?.logic}`);
    }
    expect(attribute.value).toBe(AGE);
    expect(attribute.missing).toEqual({ en: 'some years' });
    expect(
      switchesIn(attribute.wording.en ?? '').map(({ argument, keys }) => ({
        argument,
        keys,
      })),
    ).toEqual([{ argument: 'count', keys: ['one', 'other'] }]);
    expect(attribute.wording.en).toBe(
      '{count, plural, one {one year} other {several years}}',
    );

    // Written in Arabic, a new one asks for Arabic's six forms.
    await openStage(page, INFO_STAGE_ID);
    await attributes.editIn(PAGE_TEXT, 'Arabic');
    await attributes.focusEnd(PAGE_TEXT);
    await attributes.insert(PAGE_TEXT, 'Create dynamic attribute');
    const dialog = attributes.createDialog();
    await attributes.chooseLogic(dialog, numberLogic);
    await expectNames(versionsFor(dialog), [
      'When it is 0',
      'When it is 1',
      'When it is 2',
      'When it is 3, 4, 5, …',
      'When it is 11, 12, 13, …',
      'When it is 100, 101, 102, …',
    ]);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('text that names a value that does not exist', () => {
  test('is kept as it is and refused by the stage editor with an error that names it', async ({
    architectPage: page,
    seed,
  }) => {
    const attributes = new TextAttributes(page);
    const editor = new StageEditor(page);
    await seed(protocolNamingUnknownValue());
    await openStage(page, INFO_STAGE_ID);

    // The text shows, the unknown name as a pill carrying the recorded name.
    const text = attributes.textbox(PAGE_TEXT);
    await attributes.expectPills(PAGE_TEXT, ['ghost']);
    await expect(text).toContainText(/ welcome$/);
    await expect(text).toHaveAttribute('aria-invalid', 'true');
    await expect(
      attributes.field(PAGE_TEXT).getByText(GHOST_PROBLEM),
    ).toBeVisible();
    // The stage's outline already says which section has the problem.
    const section = editor
      .outline()
      .getByRole('button', { name: /^Content Has a problem/ });
    await expect(section).toBeVisible();

    // Edited, the stage will not save.
    await attributes.focusEnd(PAGE_TEXT);
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
    await expect(
      box.locator('[data-inline-value] data.variable-pill'),
    ).toHaveAttribute('value', 'ghost');
    await expect(box).toContainText(/ welcome$/);
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

/** The boxes of the versions of a number's wording, one for each form. */
function versionsFor(within: Locator): Locator {
  return within
    .getByRole('group', { name: /^Wording that fits the number/ })
    .getByRole('textbox');
}

/** Writes `words` in each version box, in order. */
async function typeVersions(
  page: Page,
  boxes: Locator,
  words: readonly string[],
): Promise<void> {
  await expect(boxes).toHaveCount(words.length);
  for (const [index, wording] of words.entries()) {
    await boxes.nth(index).click();
    await page.keyboard.type(wording);
  }
}

async function expectNames(boxes: Locator, names: string[]): Promise<void> {
  expect(names.length).toBeGreaterThan(0);
  await expect(boxes).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(boxes.nth(index)).toHaveAccessibleName(name);
  }
}
