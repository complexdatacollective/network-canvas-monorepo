import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { createVariableViaSpotlight } from './variables.js';

// AssignAttributes rows inside a NameGenerator(QuickAdd) prompt dialog
// (components/AssignAttributes/*). Facts verified against source:
// - 'Add new variable to assign' is an immediateAdd ArrayField: one click
//   inserts a bare `{}` row inline (no sub-dialog).
// - The row's picker (data-field-name="additionalAttributes[N].variable") is
//   type-locked to boolean; creating through it writes exactly
//   `{ name, type: 'boolean' }` into the codebook — no forced validation
//   (Attribute.tsx passes no validation argument to handleCreateVariable).
// - Once the variable is set, the 'Set value of variable to:' fieldset
//   appears (data-field-name="additionalAttributes[N].value") with radios
//   'True' / 'False'; a saved row is exactly `{ variable, value }`.
export async function assignBooleanAttribute(
  editor: StageEditor,
  page: Page,
  index: number,
  variableName: string,
  value: boolean,
): Promise<void> {
  await page
    .getByRole('button', { name: 'Add new attribute to assign' })
    .click();
  const variableField = editor.field(`additionalAttributes[${index}].variable`);
  await createVariableViaSpotlight(page, {
    variableName,
    scope: variableField,
    until: variableField.getByRole('button', { name: 'Change attribute' }),
  });
  await editor
    .field(`additionalAttributes[${index}].value`)
    .getByRole('radio', { name: value ? 'True' : 'False', exact: true })
    .click();
}
