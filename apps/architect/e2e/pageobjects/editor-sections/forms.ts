import { type Locator } from '@playwright/test';

import { createVariableViaSpotlight } from './variables.js';

// AlterForm/AlterEdgeForm/EgoForm's `form.fields` array (sections/Form/Form.tsx)
// wires the same DialogArrayField pattern as prompts.ts, with
// `editorFieldsComponent: FieldFields` (sections/Form/FieldFields.tsx,
// confusingly exported as `PromptFields`). "Create new" is
// DialogArrayField's default `addButtonLabel`.
//
// Takes the enclosing section `Locator` (e.g. `editor.section('Form')`) rather
// than the Page, and scopes the "Create new" OPEN click to it: NameGenerator
// renders both a `Form` AND a `NameGeneratorPrompts` DialogArrayField at once
// (StageEditor/Interfaces.tsx), each with the same default "Create new" label,
// so an unscoped match hits 2+ buttons and Playwright strict-mode throws. The
// opened dialog is a single page-level portal, so its fields and the final
// "Add" submit are unambiguous and reached via `section.page()`.
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
  section: Locator,
  opts: {
    variableName: string;
    promptText: string;
    inputControl?: string;
  },
): Promise<void> {
  const page = section.page();
  await section
    .getByRole('button', { name: 'Create new', exact: true })
    .click();
  await createVariableViaSpotlight(page, { variableName: opts.variableName });
  const prompt = page.getByRole('textbox', { name: 'Prompt text' });
  await prompt.click();
  await prompt.fill(opts.promptText);
  await page
    .getByLabel('Input control')
    .selectOption({ label: opts.inputControl ?? 'Text Input' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
}
