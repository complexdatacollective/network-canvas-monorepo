import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { createAttribute } from './variables.js';

// The attribute stamps a name-generator prompt applies to everything named on
// it (`@codaco/protocol-builder`'s `form/arrayFields/AssignAttributes.tsx` and
// `Attribute.tsx`, mounted by `NameGeneratorPromptsSection` as the prompt
// dialog's `additionalAttributes` field). Facts read from that source:
// - "Add new attribute to assign" is an `immediateAdd` ArrayField: one click
//   inserts a bare `{}` row inline, with no sub-dialog of its own.
// - Each row's two cells keep the `data-field-name` seam —
//   `additionalAttributes[N].variable` and `[N].value`.
// - The variable cell is a `VariablePickerField`: a trigger opening the
//   attribute window, which offers the assignable attributes and — because
//   this row passes `onCreateOption` — a create row on whatever is typed into
//   its search box. Creating through it writes exactly
//   `{ name, type: 'boolean' }` — a stamp is unvalidated, so no validation is
//   forced on the codebook entry.
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
  // The create is a round trip through the host and the row only takes the new
  // attribute once it hears the codebook holds it — and the row can move under
  // the create while it runs, in which case the attribute exists and this row
  // is not the one holding it. `createAttribute` waits for the cell to be
  // holding one, which is what tells those apart before the value below is set.
  await createAttribute(
    editor.field(`additionalAttributes[${index}].variable`),
    variableName,
  );
  await editor
    .field(`additionalAttributes[${index}].value`)
    .getByRole('radio', { name: value ? 'True' : 'False', exact: true })
    .click();
}
