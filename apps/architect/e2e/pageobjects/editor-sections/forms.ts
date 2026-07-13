import { type Page } from '@playwright/test';

import { createVariableViaSpotlight } from './variables.js';

// AlterForm/AlterEdgeForm/EgoForm's `form.fields` array (sections/Form/Form.tsx)
// wires the same DialogArrayField pattern as prompts.ts, with
// `editorFieldsComponent: FieldFields` (sections/Form/FieldFields.tsx,
// confusingly exported as `PromptFields`). "Create new" is
// DialogArrayField's default `addButtonLabel`.
//
// Inside that dialog:
// - `variable`: VariablePicker, driven the same way as any other spotlight
//   picker (variables.ts) — its own label defaults to "Create or select a
//   variable" but stays unhidden, which doesn't matter here since the
//   picker's *button* text ("Select variable") is what `createVariableViaSpotlight`
//   targets.
// - `prompt`: a RichText field whose accessible name is explicitly
//   overridden to "Prompt text" (FieldFields.tsx:
//   `componentProps={{ label: 'Prompt text', labelHidden: true, ... }}`) —
//   NOT the field's raw name ("prompt"), unlike RichText fields elsewhere
//   that fall back to `input.name`.
// - `component` ("Input Control", labelHidden): a real native `<select>`
//   (fresco-ui's `NativeSelectField`), so `selectOption` works directly.
//   Its Subsection is `disabled={!variable}` (FieldFields.tsx) — i.e. it
//   doesn't even mount until a variable is selected, which is why the
//   variable step must run first.
// - The submit button reads "Add" for a brand-new field
//   (DialogArrayField.tsx's `DialogEditor`: `isNewItem ? 'Add' : 'Save'`).
//
// "Text Input" (the default `inputControl`) is a real INPUT_OPTIONS label
// (config/variables.ts) available whenever the variable is newly created
// (`componentOptions` falls back to the full `formattedInputOptions` list).
export async function addFormField(
  page: Page,
  opts: {
    variableName: string;
    promptText: string;
    inputControl?: string;
  },
): Promise<void> {
  await page.getByRole('button', { name: 'Create new' }).click();
  await createVariableViaSpotlight(page, { variableName: opts.variableName });
  const prompt = page.getByRole('textbox', { name: 'Prompt text' });
  await prompt.click();
  await prompt.fill(opts.promptText);
  await page
    .getByLabel('Input control')
    .selectOption({ label: opts.inputControl ?? 'Text Input' });
  await page.getByRole('button', { name: 'Add' }).click();
}
