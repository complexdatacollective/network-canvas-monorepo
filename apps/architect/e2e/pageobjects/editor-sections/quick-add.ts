import { expect } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// The quick-add section (`@codaco/protocol-builder`'s
// `editors/name-generator-quick-add/sections/QuickAddSection.tsx`, `Quick add`)
// holds one field, `quickAdd`, labelled "Attribute filled in" and rendered by
// `VariablePickerField`. Facts read from that source:
// - The picker is a native `<select>` of the node type's TEXT attributes plus,
//   because this section passes `onCreateOption`, an inline create pair: a
//   textbox labelled "Create a new attribute" and a "Create the attribute"
//   button. A type with no text attribute at all shows the section's empty
//   message in place of the select, so creation is the only way in until one
//   exists.
// - So this selects when the type already has the attribute and creates only
//   when it does not — a second quick-add stage on the same node type points
//   at the attribute the first one made, and asking the codebook for a name it
//   already holds is refused as a duplicate.
// - Creating writes `{ type: 'text', component: 'Text', validation:
//   { required: true } }` into the codebook and selects the new attribute
//   (`createQuickAddAttribute`). The requirement is deliberate — quick add's
//   attribute is the only thing the participant gave — and this section offers
//   no way to remove it: the attribute's other rules are edited from the
//   codebook surface.
export async function selectOrCreateQuickAddVariable(
  editor: StageEditor,
  variableName: string,
): Promise<void> {
  // Scoped to the field: a prompt dialog's attribute stamps render the same
  // "Create a new attribute" pair, and so does the codebook surface.
  const picker = editor.field('quickAdd');
  const chosen = picker.getByRole('combobox', {
    name: 'Attribute filled in',
    exact: true,
  });
  const offered = chosen.getByRole('option', {
    name: variableName,
    exact: true,
  });

  if (await offered.count()) {
    await chosen.selectOption({ label: variableName });
  } else {
    await picker
      .getByRole('textbox', { name: 'Create a new attribute', exact: true })
      .fill(variableName);
    await picker
      .getByRole('button', { name: 'Create the attribute', exact: true })
      .click();
    // The create is a round trip through the host, and the codebook can refuse
    // the name. Nothing below may run until the attribute exists.
    await expect(offered).toBeAttached();
  }

  // …and until the FIELD holds it. A create that landed while the section had
  // moved on answers `{ status: 'unassigned' }`: the option is there and the
  // select is still on its placeholder, whose value is empty.
  await expect(chosen).toHaveValue(/.+/);
}
