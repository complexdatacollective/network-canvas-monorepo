import { expect } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { chooseOrCreateAttribute } from './variables.js';

// The quick-add section (`@codaco/protocol-builder`'s
// `editors/name-generator-quick-add/sections/QuickAddSection.tsx`, `Quick add`)
// holds one field, `quickAdd`, labelled "Select an attribute" and rendered by
// `VariablePickerField`. Facts read from that source:
// - The picker is a trigger opening the attribute window over the node type's
//   TEXT attributes; because this section passes `onCreateOption`, the window
//   also offers to create one under whatever is typed into its search box.
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
  // Scoped to the field: a prompt dialog's attribute stamps render a picker of
  // their own, and so does the codebook surface.
  const picker = editor.field('quickAdd');
  await chooseOrCreateAttribute(picker, variableName);
  // And the FIELD holds it, not merely the codebook: a create that landed
  // while the section had moved on answers `{ status: 'unassigned' }`, which
  // leaves the trigger reading "Select attribute".
  await expect(
    picker.getByRole('button', { name: 'Change attribute', exact: true }),
  ).toBeVisible();

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
