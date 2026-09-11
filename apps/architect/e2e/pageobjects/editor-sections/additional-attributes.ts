import { expect, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// The attribute stamps a name-generator prompt applies to everything named on
// it (`@codaco/protocol-builder`'s `form/arrayFields/AssignAttributes.tsx` and
// `Attribute.tsx`, mounted by `NameGeneratorPromptsSection` as the prompt
// dialog's `additionalAttributes` field). Facts read from that source:
// - "Add new attribute to assign" is an `immediateAdd` ArrayField: one click
//   inserts a bare `{}` row inline, with no sub-dialog of its own.
// - Each row's two cells keep the `data-field-name` seam —
//   `additionalAttributes[N].variable` and `[N].value`.
// - The variable cell is a `VariablePickerField`: a native select of the
//   assignable attributes plus an inline create pair ("Create a new
//   attribute" textbox, "Create the attribute" button). Creating through it
//   writes exactly `{ name, type: 'boolean' }` — a stamp is unvalidated, so no
//   validation is forced on the codebook entry.
// - The value cell is a boolean control (fresco-ui's `Boolean`, a
//   `role="radiogroup"`) labelled "Value to assign", with radios 'True' and
//   'False'. A saved row is exactly `{ variable, value }`.
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
  await variableField
    .getByRole('textbox', { name: 'Create a new attribute', exact: true })
    .fill(variableName);
  await variableField
    .getByRole('button', { name: 'Create the attribute', exact: true })
    .click();
  // The create is a round trip through the host and the row only takes the new
  // attribute once it hears the codebook holds it — and the row can move under
  // the create while it runs, in which case the attribute exists and this row
  // is not the one holding it. Requiring the cell to be showing the created
  // name is what tells those apart before the value below is set.
  await expect(
    variableField.getByRole('combobox', {
      name: 'Create or select an attribute',
      exact: true,
    }),
  ).toHaveValue(/.+/);
  await editor
    .field(`additionalAttributes[${index}].value`)
    .getByRole('radio', { name: value ? 'True' : 'False', exact: true })
    .click();
}
