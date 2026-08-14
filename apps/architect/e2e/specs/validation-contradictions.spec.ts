import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { createVariableViaSpotlight } from '../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

test('the field editor blocks an inverted min/max validation pair', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('EgoForm');
  await editor.setStageName('About You');

  // EgoForm's introductionPanel title/text are both `z.string().min(1)`
  // (protocol-validation's IntroductionPanelSchema), so the dialog-level
  // submit validation fails `editor.save()` without them — mirrors
  // ego-form.spec.ts's create-from-scratch spec.
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('About You');
  await editor.fillRichText(
    'Introduction text',
    'Thanks for taking part in this study.',
  );

  // Open the field dialog and configure a number variable (mirrors
  // pageobjects/editor-sections/forms.ts's addFormField, inlined so the
  // dialog stays open for the Validation section).
  const page = architectPage;
  await editor
    .section('Form')
    .getByRole('button', { name: 'Create new', exact: true })
    .click();
  await createVariableViaSpotlight(page, { variableName: 'age' });
  const prompt = page.getByRole('textbox', { name: 'Prompt text' });
  await prompt.click();
  await prompt.fill('How old are you?');
  await page
    .getByLabel('Input control')
    .selectOption({ label: 'Number Input' });

  // Expand the toggleable Validation section. Section.tsx's `toggleable`
  // prop renders fresco-ui's `ToggleField`, a Base UI `Switch.Root`
  // (`role="switch"`) whose accessible name comes from the fixed `title`
  // prop Section.tsx passes — `"Turn this feature on or off"` — not from
  // the section's own "Validation" title.
  await editor
    .section('Validation')
    .getByRole('switch', { name: 'Turn this feature on or off' })
    .click();

  const validationSection = editor.section('Validation');

  const minValue = page.locator('input[name="validation-value-minValue"]');
  const maxValue = page.locator('input[name="validation-value-maxValue"]');

  await validationSection
    .getByRole('switch', { name: 'Minimum value', exact: true })
    .click();
  await minValue.fill('10');
  await minValue.blur();

  // Attempt maxValue 2 — the reason must show against both ends of the pair,
  // and the value must be held for correction rather than dropped.
  await validationSection
    .getByRole('switch', { name: 'Maximum value', exact: true })
    .click();
  await maxValue.fill('2');
  await expect(
    page.getByText('is greater than maxValue').first(),
  ).toBeVisible();
  await expect(maxValue).toHaveAttribute('aria-invalid', 'true');
  await maxValue.blur();
  await expect(maxValue).toHaveValue('2');

  // Correcting the value clears the row's complaint. No explicit blur here:
  // clicking the dialog's Add button is what takes focus off the field, which
  // is the realistic path and the one blur-commit has to survive. The row is
  // asserted through its own `aria-invalid` rather than through the message
  // text: the FIELD-level error tracks the COMMITTED rule map, so it
  // legitimately stands until that very blur commits the corrected value.
  await maxValue.fill('20');
  await expect(maxValue).not.toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

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
// failure it was filed for is the uncorrected path: the dialog closed, the
// save succeeded, and the offending rule was gone from the codebook without a
// word.
test('the field editor refuses to save an uncorrected min/max pair', async ({
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
    .section('Form')
    .getByRole('button', { name: 'Create new', exact: true })
    .click();
  await createVariableViaSpotlight(page, { variableName: 'age' });
  const prompt = page.getByRole('textbox', { name: 'Prompt text' });
  await prompt.click();
  await prompt.fill('How old are you?');
  await page
    .getByLabel('Input control')
    .selectOption({ label: 'Number Input' });

  await editor
    .section('Validation')
    .getByRole('switch', { name: 'Turn this feature on or off' })
    .click();

  const validationSection = editor.section('Validation');
  const minValue = page.locator('input[name="validation-value-minValue"]');
  const maxValue = page.locator('input[name="validation-value-maxValue"]');

  await validationSection
    .getByRole('switch', { name: 'Minimum value', exact: true })
    .click();
  await minValue.fill('100');
  await minValue.blur();
  await validationSection
    .getByRole('switch', { name: 'Maximum value', exact: true })
    .click();
  await maxValue.fill('50');
  await maxValue.blur();

  // Attempt the save without correcting anything.
  const addButton = page.getByRole('button', { name: 'Add', exact: true });
  await addButton.click();

  // The dialog stays open with both entered values intact, and says why.
  await expect(addButton).toBeVisible();
  await expect(
    page.getByText('is greater than maxValue').first(),
  ).toBeVisible();
  await expect(minValue).toHaveValue('100');
  await expect(maxValue).toHaveValue('50');

  // Nothing reached the codebook: the variable does not exist at all, because
  // it is the dialog's own save that would have created it.
  const protocol = await readProtocolJson(architectPage);
  const variables = protocol.codebook.ego?.variables ?? {};
  expect(
    Object.values(variables).some((variable) => variable.name === 'age'),
  ).toBe(false);
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
    .section('Form')
    .getByRole('button', { name: 'Create new', exact: true })
    .click();
  await createVariableViaSpotlight(page, { variableName: 'venue' });
  const prompt = page.getByRole('textbox', { name: 'Prompt text' });
  await prompt.click();
  await prompt.fill('Where did you meet?');
  await page
    .getByLabel('Input control')
    .selectOption({ label: 'Checkbox Group' });

  const addOption = page.getByRole('button', { name: 'Add new', exact: true });
  const optionLabel = (index: number) =>
    page.locator(`[name="options[${index}].label"]`);
  const optionValue = (index: number) =>
    page.locator(`[name="options[${index}].value"]`);

  // Written with explicit escapes so the source file's own encoding cannot
  // quietly normalise the decomposed spelling into the precomposed one.
  const PRECOMPOSED = 'Caf\u00e9';
  const DECOMPOSED = 'Cafe\u0301';

  await addOption.click();
  await optionLabel(0).fill(PRECOMPOSED);
  await optionValue(0).fill('cafe_a');
  await addOption.click();
  await optionLabel(1).fill(DECOMPOSED);
  await optionValue(1).fill('cafe_b');

  const addButton = page.getByRole('button', { name: 'Add', exact: true });
  await addButton.click();

  await expect(addButton).toBeVisible();
  await expect(
    page.getByText('Every option needs a unique label.').first(),
  ).toBeVisible();

  const protocol = await readProtocolJson(architectPage);
  const variables = protocol.codebook.ego?.variables ?? {};
  expect(
    Object.values(variables).some((variable) => variable.name === 'venue'),
  ).toBe(false);
});
