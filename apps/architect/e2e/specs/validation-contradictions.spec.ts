import { type Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { openValidationSection } from '../pageobjects/editor-sections/form-field-controls.js';
import { addFormField } from '../pageobjects/editor-sections/forms.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

// The repair guidance a researcher is given for an inverted min/max pair
// (`validationContradictionMessages.invertedBounds`, protocol-validation's own
// catalog), with the attribute named because by the time rules can be set the
// attribute exists and has a name.
const INVERTED_BOUNDS =
  'The minimum and maximum rules for age leave no permitted answer. Adjust the bounds or the required-answer rule.';

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
    inputControl: 'Number input',
  });
  return editor;
}

/**
 * Reopen the field just added and open the codebook rules for its attribute.
 *
 * Two steps rather than one because the rules are the CODEBOOK's now: they are
 * offered against an attribute that exists, and while one is still being
 * invented the button that opens them is not on screen at all. So the field is
 * added first — which is what creates the attribute — and reopened.
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

  // Each rule is a checkbox that switches it on, with the value beside it in
  // a number input carrying the same (visually hidden) name — role tells the
  // two apart (`VariableValidationEditor`).
  const minValue = rules.getByRole('spinbutton', {
    name: 'Minimum value',
    exact: true,
  });
  const maxValue = rules.getByRole('spinbutton', {
    name: 'Maximum value',
    exact: true,
  });
  const saveRules = rules.getByRole('button', {
    name: 'Save validation',
    exact: true,
  });

  await rules
    .getByRole('checkbox', { name: 'Minimum value', exact: true })
    .check();
  await minValue.fill('10');
  await minValue.blur();

  // Attempt maxValue 2 — the reason must be shown, and the value must be held
  // for correction rather than dropped.
  await rules
    .getByRole('checkbox', { name: 'Maximum value', exact: true })
    .check();
  await maxValue.fill('2');
  await expect(rules.getByText(INVERTED_BOUNDS, { exact: true })).toBeVisible();
  // The pair being refused is what the editor's own save reports now: it is
  // held shut for as long as the rule map has an issue. (The old field-level
  // `aria-invalid` marked a rule switched on with no value at all, which this
  // is not — both ends carry a number.)
  await expect(saveRules).toBeDisabled();
  await maxValue.blur();
  await expect(maxValue).toHaveValue('2');

  // Correcting the value clears the complaint and lets the write through.
  await maxValue.fill('20');
  await expect(saveRules).toBeEnabled();
  await saveRules.click();
  await rules.waitFor({ state: 'detached' });

  await fieldDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await fieldDialog.waitFor({ state: 'detached' });

  await editor.expectNoIssues();
  await editor.save();

  // Confirm the corrected pair (not the rejected 10/2 pair) is what actually
  // persisted, proving the gate didn't just block the UI but let the fixed
  // rule through end-to-end.
  const protocol = await readProtocolJson(architectPage);
  const variables = protocol.codebook.ego?.variables ?? {};
  const ageVariable = Object.values(variables).find((v) => v.name === 'age');
  if (!ageVariable || ageVariable.type !== 'number') {
    throw new Error('expected a saved number variable named "age"');
  }
  expect(ageVariable.validation?.minValue).toBe(10);
  expect(ageVariable.validation?.maxValue).toBe(20);
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
    .getByRole('checkbox', { name: 'Minimum value', exact: true })
    .check();
  await minValue.fill('100');
  await minValue.blur();
  await rules
    .getByRole('checkbox', { name: 'Maximum value', exact: true })
    .check();
  await maxValue.fill('50');
  await maxValue.blur();

  // Attempt the save without correcting anything.
  const saveRules = rules.getByRole('button', {
    name: 'Save validation',
    exact: true,
  });
  await expect(saveRules).toBeDisabled();

  // The editor stays open with both entered values intact, and says why.
  await expect(rules).toBeVisible();
  await expect(rules.getByText(INVERTED_BOUNDS, { exact: true })).toBeVisible();
  await expect(minValue).toHaveValue('100');
  await expect(maxValue).toHaveValue('50');

  // The attribute itself is in the codebook: it was written when the field ROW
  // was saved, and an attribute belongs to the codebook rather than to the
  // stage that collects it. The refused rule map is not: neither bound reached
  // it, which is exactly the failure #1383 was filed for — the editor closing,
  // the save succeeding, and the offending rule gone without a word.
  const protocol = await readProtocolJson(architectPage);
  const variables = protocol.codebook.ego?.variables ?? {};
  const ageVariable = Object.values(variables).find((v) => v.name === 'age');
  if (!ageVariable || ageVariable.type !== 'number') {
    throw new Error('expected a saved number variable named "age"');
  }
  expect(ageVariable.validation?.minValue).toBeUndefined();
  expect(ageVariable.validation?.maxValue).toBeUndefined();
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
  await fieldDialog
    .getByRole('combobox', { name: 'Attribute', exact: true })
    .selectOption({ label: 'Create a new attribute…' });
  // An attribute a participant chooses an answer from IS its list of values —
  // the schema refuses fewer than two — so it is invented in the codebook's
  // own editor rather than from a name and a type. Driven here rather than
  // through forms.ts's helper because the whole point is the refusal, which
  // that helper would wait for a successful create through.
  await fieldDialog
    .getByRole('combobox', { name: 'Kind of answer', exact: true })
    .selectOption({ label: 'Categorical' });
  const openEditor = 'Create this attribute and its values';
  await fieldDialog
    .getByRole('button', { name: openEditor, exact: true })
    .click();
  const attributeEditor = page.getByRole('dialog', {
    name: openEditor,
    exact: true,
  });
  await attributeEditor
    .getByRole('textbox', { name: 'Attribute name', exact: true })
    .fill('venue');

  const addOption = attributeEditor.getByRole('button', {
    name: 'Create new option',
    exact: true,
  });
  const optionLabel = (position: number) =>
    attributeEditor.getByRole('textbox', {
      name: `Option ${position} label`,
      exact: true,
    });
  const optionValue = (position: number) =>
    attributeEditor.getByRole('textbox', {
      name: `Option ${position} value`,
      exact: true,
    });

  // Written with explicit escapes so the source file's own encoding cannot
  // quietly normalise the decomposed spelling into the precomposed one.
  const PRECOMPOSED = 'Caf\u00e9';
  const DECOMPOSED = 'Cafe\u0301';

  await addOption.click();
  await optionLabel(1).fill(PRECOMPOSED);
  await optionValue(1).fill('cafe_a');
  await addOption.click();
  await optionLabel(2).fill(DECOMPOSED);
  await optionValue(2).fill('cafe_b');

  const createAttribute = attributeEditor.getByRole('button', {
    name: 'Create attribute',
    exact: true,
  });
  await createAttribute.click();

  await expect(createAttribute).toBeVisible();
  await expect(
    attributeEditor.getByText('Every option needs a unique label.').first(),
  ).toBeVisible();

  const protocol = await readProtocolJson(architectPage);
  const variables = protocol.codebook.ego?.variables ?? {};
  expect(
    Object.values(variables).some((variable) => variable.name === 'venue'),
  ).toBe(false);
});
