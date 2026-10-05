import { type Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { openValidationSection } from '../pageobjects/editor-sections/form-field-controls.js';
import { addFormField } from '../pageobjects/editor-sections/forms.js';
import { createAttribute } from '../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

// The repair guidance a researcher is given for an inverted min/max pair
// (`validationContradictionMessages.invertedBounds`, protocol-validation's own
// catalog), with the attribute named because by the time rules can be set the
// attribute exists and has a name.
const INVERTED_BOUNDS =
  'The minimum and maximum rules for age leave no permitted answer. Adjust the bounds or the required-answer rule.';

/**
 * The same sentence as a pattern, for reading it off a control's own
 * description: a rule row describes its number box with its hint and its
 * error together, so the description holds this sentence among others.
 */
const invertedBounds = new RegExp(
  INVERTED_BOUNDS.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`),
);

/**
 * The rules the codebook holds for the `age` attribute, as the protocol has
 * them right now.
 *
 * The attribute is written when the field ROW is saved, so it is there long
 * before any rule is; `undefined` is "no rules on it", which is what a refused
 * write leaves behind.
 */
function ageValidation(
  protocol: CurrentProtocol,
): Record<string, unknown> | undefined {
  const variables = protocol.codebook.ego?.variables ?? {};
  const age = Object.values(variables).find(
    (variable) => variable.name === 'age',
  );
  if (!age || age.type !== 'number') {
    throw new Error('expected a saved number variable named "age"');
  }
  return age.validation;
}

/**
 * An EgoForm carrying one number field on a new `age` attribute, left open.
 *
 * The introduction panel is filled because both its halves are
 * `z.string().min(1)` (protocol-validation's `IntroductionPanelSchema`), so
 * the stage cannot be saved without them — mirrors ego-form.spec.ts.
 */
async function egoFormWithAgeField(architectPage: Page): Promise<StageEditor> {
  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About You');
  await editor.fillRichText(
    'Introduction text',
    'Thanks for taking part in this study.',
  );
  await addFormField(editor.section('Form configuration'), {
    variableName: 'age',
    promptText: 'How old are you?',
    inputControl: 'Number Input',
  });
  return editor;
}

/**
 * Reopen the field just added and open the codebook rules for its attribute.
 *
 * Two steps rather than one because the rules are the CODEBOOK's: the nested
 * Validation section is rendered against an attribute that exists, and while
 * one is still being invented the section the row shows holds a draft written
 * with the create instead. So the field is added first — which is what creates
 * the attribute — and reopened.
 */
async function openAgeRules(editor: StageEditor) {
  const section = editor.section('Form configuration');
  await section
    .getByRole('button', { name: 'Edit field', exact: true })
    .click();
  const fieldDialog = section
    .page()
    .getByRole('dialog', { name: 'Edit form field' });
  await expect(fieldDialog).toBeVisible();
  return { fieldDialog, rules: await openValidationSection(fieldDialog) };
}

test('the field editor blocks an inverted min/max validation pair', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await egoFormWithAgeField(architectPage);
  const { fieldDialog, rules } = await openAgeRules(editor);

  // Each rule is a switch, with the value beside it in a number input carrying
  // the same (visually hidden) name — role tells the two apart
  // (`VariableValidationEditor`, `ValidationRule`).
  const minValue = rules.getByRole('spinbutton', {
    name: 'Minimum value',
    exact: true,
  });
  const maxValue = rules.getByRole('spinbutton', {
    name: 'Maximum value',
    exact: true,
  });

  await rules
    .getByRole('switch', { name: 'Minimum value', exact: true })
    .click();
  await minValue.fill('10');
  await minValue.blur();

  // Attempt maxValue 2 — the reason must be shown, and the value must be held
  // for correction rather than dropped.
  await rules
    .getByRole('switch', { name: 'Maximum value', exact: true })
    .click();
  await maxValue.fill('2');
  // A rule's number is held as typing and commits when the researcher has
  // finished with it — raising a maximum from 5 to 40 passes through 4, and a
  // map written at every keystroke would judge every intermediate. So the
  // blur is what puts 2 into the rule map for the pair to be judged.
  await maxValue.blur();
  // On each of the two rows that make it, because either is a place to repair
  // it — which is how Architect's rule list reports a contradiction
  // (`Validations.tsx` runs the check for every row). Read off the controls'
  // own descriptions rather than as free text, so a sentence about some other
  // rule could not satisfy this.
  await expect(minValue).toHaveAccessibleDescription(invertedBounds);
  await expect(maxValue).toHaveAccessibleDescription(invertedBounds);
  // The pair being refused is what keeps it out of the codebook: the section
  // writes each answerable change as it is made and simply does not write one
  // the attribute cannot carry, so the refusal is the record staying as it was
  // while both ends are on screen.
  await expect(maxValue).toHaveValue('2');
  expect(
    ageValidation(await readProtocolJson(architectPage)),
  ).not.toMatchObject({ maxValue: 2 });

  // Correcting the value clears the complaint and lets the write through.
  await maxValue.fill('20');
  await maxValue.blur();
  await expect(rules.getByText(INVERTED_BOUNDS).first()).toBeHidden();

  await fieldDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await fieldDialog.waitFor({ state: 'detached' });

  await editor.expectNoIssues();
  await editor.save();

  // Confirm the corrected pair (not the rejected 10/2 pair) is what actually
  // persisted, proving the gate didn't just block the UI but let the fixed
  // rule through end-to-end.
  expect(ageValidation(await readProtocolJson(architectPage))).toMatchObject({
    minValue: 10,
    maxValue: 20,
  });
});

// Issue #1383. The spec above only proves the CORRECTED pair saves. The
// failure it was filed for is the uncorrected path: the editor closed, the
// save succeeded, and the offending rule was gone from the codebook without a
// word.
test('the field editor refuses to save an uncorrected min/max pair', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = await egoFormWithAgeField(architectPage);
  const { rules } = await openAgeRules(editor);

  const minValue = rules.getByRole('spinbutton', {
    name: 'Minimum value',
    exact: true,
  });
  const maxValue = rules.getByRole('spinbutton', {
    name: 'Maximum value',
    exact: true,
  });

  await rules
    .getByRole('switch', { name: 'Minimum value', exact: true })
    .click();
  await minValue.fill('100');
  await minValue.blur();
  await rules
    .getByRole('switch', { name: 'Maximum value', exact: true })
    .click();
  await maxValue.fill('50');
  await maxValue.blur();

  // The section stays open with both entered values intact, and says why — on
  // each of the two rows that make the pair.
  await expect(rules).toBeVisible();
  await expect(minValue).toHaveAccessibleDescription(invertedBounds);
  await expect(maxValue).toHaveAccessibleDescription(invertedBounds);
  await expect(minValue).toHaveValue('100');
  await expect(maxValue).toHaveValue('50');

  // What the codebook holds, rule by rule. The section commits each answerable
  // change as the researcher makes it rather than at a submit, so the minimum
  // landed as it was entered — and switching the maximum ON gave it the
  // minimum's own value, which is a pair the attribute can carry. The 50 that
  // contradicts it never reached the record: that is the failure #1383 was
  // filed for said the other way round — not an editor that closed and a save
  // that succeeded with the offending rule gone without a word, but a rule
  // that never landed while the pair it would make is on screen saying why.
  const validation = ageValidation(await readProtocolJson(architectPage));
  expect(validation?.minValue).toBe(100);
  expect(validation?.maxValue).not.toBe(50);
  expect(validation?.maxValue).toBeGreaterThanOrEqual(100);
});

// Issue #1383. `Café` written with the precomposed U+00E9 and `Café` written
// as `e` + a combining acute render identically, so they reach the
// participant as two choices nothing tells apart.
test('the option editor rejects canonically equivalent labels', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const page = architectPage;
  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About You');
  await editor.fillRichText(
    'Introduction text',
    'Thanks for taking part in this study.',
  );

  await editor
    .section('Form configuration')
    .getByRole('button', { name: 'Create new form field', exact: true })
    .click();
  const fieldDialog = page.getByRole('dialog', { name: 'Create form field' });
  // The name is taken in the picker's own window, on its create row.
  await createAttribute(
    fieldDialog.locator('[data-field-name="variable"]'),
    'venue',
  );
  await fieldDialog
    .getByRole('combobox', { name: 'Input control', exact: true })
    .selectOption({ label: 'Checkbox Group' });
  const values = fieldDialog.getByRole('region', {
    name: 'Choice values',
    exact: true,
  });

  // Written with explicit escapes so the source file's own encoding cannot
  // quietly normalise the decomposed spelling into the precomposed one.
  const PRECOMPOSED = 'Caf\u00e9';
  const DECOMPOSED = 'Cafe\u0301';

  for (const [label, value] of [
    [PRECOMPOSED, 'cafe_a'],
    [DECOMPOSED, 'cafe_b'],
  ] as const) {
    await values
      .getByRole('button', { name: 'Create new option', exact: true })
      .click();
    await values
      .getByRole('textbox', { name: 'Label', exact: true })
      .fill(label);
    await values
      .getByRole('textbox', { name: 'Value', exact: true })
      .fill(value);
    await values
      .getByRole('button', { name: 'Finish editing option', exact: true })
      .click();
  }
  const prompt = fieldDialog.getByRole('textbox', { name: 'Question text' });
  await prompt.click();
  await prompt.fill('Where do you usually meet?');

  const submit = fieldDialog.getByRole('button', { name: 'Add', exact: true });
  await submit.click();

  await expect(submit).toBeVisible();
  await expect(
    fieldDialog.getByText('Every option needs a unique label.').first(),
  ).toBeVisible();

  const protocol = await readProtocolJson(architectPage);
  const variables = protocol.codebook.ego?.variables ?? {};
  expect(
    Object.values(variables).some((variable) => variable.name === 'venue'),
  ).toBe(false);
});
