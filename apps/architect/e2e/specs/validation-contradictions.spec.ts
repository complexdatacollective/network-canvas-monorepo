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
  // redux-form validate fails `editor.save()` without them — mirrors
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

  // Add minValue 10.
  await validationSection
    .getByRole('button', { name: 'Add new', exact: true })
    .click();
  await page
    .locator('select[name="validation-key"]')
    .selectOption({ label: 'Minimum value' });
  await page.locator('input[name="validation-value"]').fill('10');
  await page
    .getByRole('button', { name: 'Add validation rule', exact: true })
    .click();

  // Attempt maxValue 2 — the tick must disable and the reason must show.
  await validationSection
    .getByRole('button', { name: 'Add new', exact: true })
    .click();
  await page
    .locator('select[name="validation-key"]')
    .selectOption({ label: 'Maximum value' });
  await page.locator('input[name="validation-value"]').fill('2');
  await expect(
    page.getByRole('button', { name: 'Add validation rule', exact: true }),
  ).toBeDisabled();
  await expect(page.getByText('is greater than maxValue')).toBeVisible();

  // Correct the value — the tick re-enables and the rule saves.
  await page.locator('input[name="validation-value"]').fill('20');
  await page
    .getByRole('button', { name: 'Add validation rule', exact: true })
    .click();
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
