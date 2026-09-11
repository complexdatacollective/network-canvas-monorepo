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
// - Creating writes `{ type: 'text', component: 'Text' }` into the codebook and
//   selects the new attribute (`createQuickAddAttribute`).
export async function selectOrCreateQuickAddVariable(
  editor: StageEditor,
  variableName: string,
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
}
