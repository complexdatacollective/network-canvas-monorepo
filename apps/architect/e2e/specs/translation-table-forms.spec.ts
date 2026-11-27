import type { Locator, Page } from '@playwright/test';

import {
  dynamicValueNameFor,
  fieldBlockMarkdown,
  parseDynamicValueName,
} from '@codaco/protocol-validation';

import { expect, test } from '../fixtures/architect-test.js';
import {
  EGO_FIRST_NAME_ID,
  FORM_FIELD_IDS,
  INFO_STAGE_ID,
  MOOD_WORDING_ID,
  protocolWithFormLogic,
  protocolWithSpanishForm,
} from '../fixtures/piped-text-protocol.js';
import { readStageJson } from '../helpers/read-store.js';
import { chooseAttribute } from '../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../pageobjects/stage-editor.js';
import { TextAttributes } from '../pageobjects/text-attributes.js';

/**
 * The translation table for text whose languages may differ: a form whose
 * Spanish document leaves out a field, and a dynamic attribute that only the
 * English text shows. A string that a language does not use is shown as not
 * used there, cannot be edited there, and is not counted in that language's
 * progress.
 */
const NOT_USED = 'Not used in Spanish';

const translationTable = (page: Page): Locator =>
  page.getByRole('dialog', { name: 'Translation table', exact: true });

async function openTable(page: Page): Promise<Locator> {
  await page.goto('/protocol/localization?table=open');
  const table = translationTable(page).getByRole('table', {
    name: /^Everything participants see/,
  });
  await expect(table).toBeVisible();
  return table;
}

/**
 * `over` is drawn on top of `under` wherever the two overlap, as the document
 * draws them. The dialog that is open makes everything outside it `inert`,
 * and the hit test of `elementFromPoint` passes through an inert element as
 * if it were not drawn, so the attribute is taken off for the question and
 * put back straight after.
 */
async function expectDrawnOver(over: Locator, under: Locator): Promise<void> {
  const top = await over.elementHandle();
  const bottom = await under.elementHandle();
  const drawn = await top?.evaluate((element, other) => {
    if (!(other instanceof Element)) return null;
    const a = element.getBoundingClientRect();
    const b = other.getBoundingClientRect();
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const upper = Math.max(a.top, b.top);
    const lower = Math.min(a.bottom, b.bottom);
    if (right - left < 20 || lower - upper < 20) return null;
    const inert = Array.from(document.querySelectorAll('[inert]'));
    for (const node of inert) node.removeAttribute('inert');
    try {
      return [
        [(left + right) / 2, (upper + lower) / 2],
        [left + 10, upper + 10],
        [right - 10, lower - 10],
      ].map(([x, y]) => element.contains(document.elementFromPoint(x!, y!)));
    } finally {
      for (const node of inert) node.setAttribute('inert', '');
    }
  }, bottom);
  // Without an overlap there is nothing to cover.
  expect(drawn).toEqual([true, true, true]);
}

/** The rows of one stage, below the heading that names it. */
const stageRows = (table: Locator, heading: RegExp): Locator =>
  table.getByRole('rowgroup').filter({
    has: table.page().getByRole('rowheader', { name: heading }),
  });

/** A row, by the name in its first cell. */
const row = (rows: Locator, name: string): Locator =>
  rows.getByRole('row').filter({
    has: rows.page().getByRole('rowheader', { name, exact: true }),
  });

/** The numbers in a column heading's "N of M translated". */
async function progressOf(table: Locator, language: string) {
  const text = await table
    .getByRole('columnheader', { name: language, exact: true })
    .getByText(/^\d+ of \d+ translated$/)
    .textContent();
  const [translated = NaN, total = NaN] = (text ?? '')
    .split(' ')
    .filter((word) => /^\d+$/.test(word))
    .map(Number);
  return { translated, total };
}

test.describe('the translation table, for text that differs between languages', () => {
  test('shows a question as not used in a language whose form leaves its field out', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithSpanishForm());
    const table = await openTable(page);
    const form = stageRows(table, /^Stage 1 · About you/);

    const age = row(form, 'Form › age › Question');
    await expect(age.getByRole('cell').last()).toHaveText(NOT_USED);
    await expect(age.getByRole('button', { name: /Spanish$/ })).toHaveCount(0);
    await expect(
      age.getByRole('button', { name: /Question English$/ }),
    ).toHaveCount(1);

    // The questions that the Spanish form asks are translated as usual.
    const name = row(form, 'Form › first_name › Question');
    await expect(name).toContainText('¿Tu nombre?');
    await expect(
      name.getByRole('button', { name: /Question Spanish$/ }),
    ).toHaveCount(1);
    await expect(form.getByText(NOT_USED, { exact: true })).toHaveCount(1);

    // A string that Spanish does not use is not counted for Spanish.
    const notUsed = await table.getByText(NOT_USED, { exact: true }).count();
    expect(notUsed).toBeGreaterThan(0);
    const english = await progressOf(table, 'English');
    const spanish = await progressOf(table, 'Spanish');
    expect(english.translated).toBe(english.total);
    expect(spanish.total).toBe(english.total - notUsed);
  });

  test("shows the text of each language's form with its questions, and says where those are translated", async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithSpanishForm());
    const table = await openTable(page);
    const text = row(stageRows(table, /^Stage 1 · About you/), 'Form');
    const [english, spanish] = [
      text.getByRole('cell').nth(0),
      text.getByRole('cell').nth(1),
    ];

    await expect(english).toContainText('About you');
    await expect(english.locator('[data-field-summary]')).toHaveText([
      'Your name?',
      'Your age?',
      'Your mood?',
    ]);
    await expect(spanish).toContainText('Sobre ti');
    await expect(spanish.locator('[data-field-summary]')).toHaveText([
      '¿Tu nombre?',
      '¿Tu ánimo?',
    ]);
    await expect(
      text.getByText(
        'The question and hint of each field are translated in their own rows.',
      ),
    ).toHaveCount(2);
  });

  test("puts one of the form's own fields in a language's text, whose question is then translated", async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithSpanishForm());
    const table = await openTable(page);
    const form = stageRows(table, /^Stage 1 · About you/);
    const text = row(form, 'Form');

    await text.getByRole('button', { name: /Form Spanish$/ }).click();
    const editor = text.getByRole('textbox', { name: /Form Spanish$/ });
    await expect(editor).toBeFocused();
    // The questions are translated in their own rows, not typed here.
    await expect(editor.locator('[data-field-question]')).toHaveText([
      '¿Tu nombre?',
      '¿Tu ánimo?',
    ]);
    await expect(
      editor.getByRole('button', { name: 'Field settings' }),
    ).toHaveCount(0);
    // A click on the mood field selects it, and the new field goes after it.
    await editor.locator('[data-field-question]').last().click();
    await page.getByRole('button', { name: 'Field', exact: true }).click();
    const picker = page.getByRole('dialog', {
      name: 'Attribute of the new field',
    });
    // Only the form's own fields, by their attributes.
    await expect(picker.getByRole('option')).toHaveCount(3);
    await expect(
      picker.getByRole('option', { name: /^first_name/ }),
    ).toHaveAttribute('aria-disabled', 'true');
    await picker.getByRole('option', { name: /^age/ }).click();
    await expect(picker).toBeHidden();
    await expect(editor.locator('[data-field-question]')).toHaveText([
      '¿Tu nombre?',
      '¿Tu ánimo?',
      'No question in this language yet',
    ]);

    // The age question is now used in Spanish, and is typed in its row.
    const age = row(form, 'Form › age › Question');
    await age.getByRole('button', { name: /Question Spanish$/ }).click();
    await expect(
      age.getByRole('textbox', { name: /Question Spanish$/ }),
    ).toBeFocused();
    await page.keyboard.type('¿Tu edad?');
    await translationTable(page)
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect(translationTable(page)).toBeHidden();

    const stage = await readStageJson(page, 0, (saved) =>
      JSON.stringify(saved).includes('¿Tu edad?'),
    );
    const saved = stage.type === 'EgoForm' ? stage.form : undefined;
    expect(saved?.content.es).toBe(
      [
        '# Sobre ti',
        fieldBlockMarkdown(FORM_FIELD_IDS.firstName),
        fieldBlockMarkdown(FORM_FIELD_IDS.mood),
        fieldBlockMarkdown(FORM_FIELD_IDS.age),
      ].join('\n\n'),
    );
    expect(
      saved?.fields.find(({ id }) => id === FORM_FIELD_IDS.age)?.prompt,
    ).toEqual({ en: 'Your age?', es: '¿Tu edad?' });
  });

  test("copies one language's text of a form into another, with its fields, logic blocks and dynamic attributes", async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithFormLogic());
    const table = await openTable(page);
    const text = row(stageRows(table, /^Stage 1 · About you/), 'Form');

    await text.getByRole('button', { name: /Form English$/ }).click();
    await expect(
      text.getByRole('textbox', { name: /Form English$/ }),
    ).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+c');
    await text.getByRole('button', { name: /Form Spanish$/ }).click();
    const spanish = text.getByRole('textbox', { name: /Form Spanish$/ });
    await expect(spanish).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('ControlOrMeta+v');
    await expect(spanish.locator('[data-logic-block]')).toHaveCount(1);
    await expect(spanish.locator('[data-field-id]')).toHaveCount(3);
    await translationTable(page)
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect(translationTable(page)).toBeHidden();

    const stage = await readStageJson(
      page,
      0,
      (saved) =>
        saved.type === 'EgoForm' &&
        saved.form.content.es?.startsWith('# About you') === true,
    );
    const saved = stage.type === 'EgoForm' ? stage.form : undefined;
    expect(saved?.content.es).toBe(saved?.content.en);
  });

  test("expects a dynamic attribute's wording in a language once that language's text shows it", async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithSpanishForm());
    const welcome = /^Stage 2 · Welcome/;

    // Only the English text shows it: its wording is not used in Spanish.
    let table = await openTable(page);
    const versions = 5;
    await expect(
      stageRows(table, welcome).getByText(NOT_USED, { exact: true }),
    ).toHaveCount(versions);

    // Shown by the Spanish text too.
    const attributes = new TextAttributes(page);
    await page.goto(`/protocol/stage/${INFO_STAGE_ID}`);
    await attributes.editIn('Rich Text', 'Spanish');
    await attributes.focusEnd('Rich Text');
    await page.keyboard.type(' Pareces ');
    await attributes.insertByKeyboard('happy');
    await new StageEditor(page).save();
    const name = dynamicValueNameFor({
      kind: 'dynamicAttribute',
      id: MOOD_WORDING_ID,
    });
    await readStageJson(page, 1, (stage) =>
      JSON.stringify(stage).includes(`Pareces {${name}}`),
    );

    // Each version now needs Spanish wording, and can be written here.
    table = await openTable(page);
    const rows = stageRows(table, welcome);
    await expect(rows.getByText(NOT_USED, { exact: true })).toHaveCount(0);
    await expect(rows.getByRole('textbox', { name: /Spanish$/ })).toHaveCount(
      // The stage name, and each version of the dynamic attribute.
      1 + versions,
    );
  });

  test("puts an attribute inserted at the end of a form's text outside the question of its last field, which is not edited in the table", async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithSpanishForm());
    const table = await openTable(page);
    const text = row(stageRows(table, /^Stage 1 · About you/), 'Form');
    await text.getByRole('button', { name: /Form English$/ }).click();
    const editor = text.getByRole('textbox', { name: /Form English$/ });
    await expect(editor).toBeFocused();
    // The text ends with a field, whose question and hint are hidden here.
    await page.keyboard.press('Control+End');
    const attributes = new TextAttributes(page);
    await text.getByRole('button', { name: 'Attribute', exact: true }).click();
    await expect(attributes.menu()).toBeVisible();
    await attributes
      .menu()
      .getByRole('option', { name: /first_name/ })
      .click();
    await expect(attributes.menu()).toBeHidden();
    // In the text, where it can be seen, not in a hidden question.
    const inserted = editor.locator('[data-inline-value]');
    await expect(inserted).toHaveCount(1);
    await expect(inserted).toBeVisible();

    await translationTable(page)
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect(translationTable(page)).toBeHidden();

    const firstName = dynamicValueNameFor({
      kind: 'attribute',
      role: 'ego',
      variableId: EGO_FIRST_NAME_ID,
    });
    const stage = await readStageJson(page, 0, (saved) =>
      JSON.stringify(saved).includes(firstName),
    );
    const content = stage.type === 'EgoForm' ? stage.form.content.en : '';
    expect(content).toBe(
      [
        '# About you',
        `Tell us.{${firstName}}`,
        fieldBlockMarkdown(FORM_FIELD_IDS.firstName),
        fieldBlockMarkdown(FORM_FIELD_IDS.age),
        fieldBlockMarkdown(FORM_FIELD_IDS.mood),
      ].join('\n\n'),
    );
  });

  test("creates a dynamic attribute, and the rules of a logic block, in a form's text, which the stage has once the table is saved", async ({
    architectPage: page,
    seed,
  }) => {
    await seed(protocolWithSpanishForm());
    const table = await openTable(page);
    const text = row(stageRows(table, /^Stage 1 · About you/), 'Form');
    await text.getByRole('button', { name: /Form English$/ }).click();
    const editor = text.getByRole('textbox', { name: /Form English$/ });
    await expect(editor).toBeFocused();
    // The caret at the end of the paragraph under the heading.
    const paragraph = editor.getByText('Tell us.', { exact: true });
    const box = await paragraph.boundingBox();
    if (box === null) throw new Error('The paragraph is not drawn.');
    await paragraph.click({
      position: { x: box.width - 2, y: box.height / 2 },
    });
    const attributes = new TextAttributes(page);

    // A dynamic attribute, created from the Attribute menu as in the stage
    // editor.
    await text.getByRole('button', { name: 'Attribute', exact: true }).click();
    await attributes
      .menu()
      .getByRole('option', { name: 'Create dynamic attribute' })
      .click();
    const create = attributes.createDialog();
    await expect(create).toBeVisible();
    await attributes.chooseLogic(create, 'Different wording for each answer');
    // The attribute that it reads is chosen, and a version is drawn for each
    // of its answers, after the logic is: wait for all of them, or a version
    // that appears after the others were written is left empty, and the
    // dialog refuses to create the dynamic attribute.
    await expect(
      create.getByRole('combobox', { name: /^Attribute/ }),
    ).toHaveText('mood');
    const versions = [
      'If not known',
      'Happy',
      'Sad',
      'Calm',
      'Any other answer',
    ];
    const wordings = create
      .getByRole('region', { name: 'Wording for each answer' })
      .getByRole('textbox');
    await expect(wordings).toHaveCount(versions.length);
    for (const [index, name] of versions.entries()) {
      await expect(wordings.nth(index)).toHaveAccessibleName(name);
      await wordings.nth(index).fill(`word ${index + 1}`);
    }
    await create
      .getByRole('button', { name: 'Create dynamic attribute', exact: true })
      .click();
    await expect(create).toBeHidden();
    await expect(
      editor.locator('data.variable-pill[data-attribute-type="dynamic"]'),
    ).toHaveCount(1);

    // A logic block whose rules are written here.
    await text
      .getByRole('button', { name: 'Logic block', exact: true })
      .click();
    const block = page.getByRole('dialog', {
      name: 'Logic block',
      exact: true,
    });
    await expect(block).toBeVisible();
    await attributes.chooseLogic(block, 'If … else');
    await block.getByRole('button', { name: 'Add new rule' }).click();
    const rule = page.getByRole('dialog', { name: 'Construct a Rule' });
    await expect(rule).toBeVisible();
    await expectDrawnOver(rule, block);
    await rule.getByRole('radio', { name: /^Participant/ }).click();
    await chooseAttribute(
      rule.locator('[data-field-name="options.attribute"]'),
      'first_name',
    );
    await rule
      .getByRole('combobox', { name: 'Operator' })
      .selectOption({ label: 'is exactly' });
    await rule.getByRole('textbox', { name: 'Attribute value' }).fill('Sam');
    await rule.getByRole('button', { name: 'Finish and Close' }).click();
    await rule.waitFor({ state: 'detached' });
    await expect(block.getByRole('button', { name: /^Edit rule/ })).toHaveCount(
      1,
    );

    await translationTable(page)
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    await expect(translationTable(page)).toBeHidden();

    const stage = await readStageJson(page, 0, (saved) =>
      JSON.stringify(saved).includes('word 1'),
    );
    const content = stage.type === 'EgoForm' ? stage.form.content.en : '';
    const names = Array.from(
      (content ?? '').matchAll(/\{([^,}\s]+)/g),
      ([, name]) =>
        name === undefined ? undefined : parseDynamicValueName(name),
    );
    const [dynamicId] = Object.keys(stage.dynamicAttributes ?? {});
    const [conditionId] = Object.keys(stage.conditions ?? {});
    expect(dynamicId).toBeDefined();
    expect(conditionId).toBeDefined();
    // The text shows the new dynamic attribute, and its logic block tests
    // the new rules.
    expect(names).toContainEqual({ kind: 'dynamicAttribute', id: dynamicId });
    expect(names).toContainEqual({ kind: 'condition', conditionId });
    expect(stage.dynamicAttributes?.[dynamicId ?? '']).toMatchObject({
      logic: 'answers',
      missing: { en: 'word 1' },
    });
    expect(stage.conditions?.[conditionId ?? '']).toMatchObject({
      rules: [
        {
          type: 'ego',
          options: { operator: 'EXACTLY', value: 'Sam' },
        },
      ],
    });
  });
});
