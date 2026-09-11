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
// - Creating writes `{ name, type: 'text', validation: { required: true } }`
//   into the codebook and selects the new attribute
//   (`createQuickAddAttribute`). The requirement is deliberate — quick add's
//   attribute is the only thing the participant gave.
// - Once an attribute is held, the section mounts a nested toggleable
//   "Validation" section over that attribute's own rules
//   (`codebook/validation/CodebookVariableValidationSection.tsx`). It opens
//   when the attribute already carries a rule, and switching it off clears
//   them — silently, straight to the codebook, outside the stage draft. That
//   is what `clearRequiredValidation` reaches.
export async function selectOrCreateQuickAddVariable(
  editor: StageEditor,
  variableName: string,
  options: { clearRequiredValidation?: boolean } = {},
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

  if (options.clearRequiredValidation !== true) return;
  const toggle = editor
    .section('Validation')
    .getByRole('switch', { name: 'Validation', exact: true });
  // The attribute this stage just created carries `required`, so the section
  // starts open; one click clears it. Asserted rather than assumed, because a
  // section that opened switched off would take the click the other way and
  // leave the rule in the codebook.
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
}
