import { expect } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// NodePanels section (sections/NodePanels/*, `Section title="Side Panels"`,
// toggleable, collapsed on a fresh stage, disabled until `subject.type` is
// set). Facts verified against source:
// - The header toggle and each panel's nested Filter section share the same
//   'Turn this feature on or off' accessible name — the header switch is
//   first in DOM order, hence `.first()`.
// - 'Add new panel' is an `immediateAdd` ArrayField: one click inserts
//   `{ id: uuid(), title: null, dataSource: 'existing', filter: null }`
//   (NodePanels.tsx createNodePanel) inline — no dialog. `title` is filled
//   through its visually-hidden 'Panel title' label; `dataSource` stays the
//   template's 'existing' (the matching radio is pre-checked); the untouched
//   `filter: null` is pruned at save, so the saved panel is exactly
//   `{ id, title, dataSource: 'existing' }`.
export async function addExistingNetworkPanel(
  editor: StageEditor,
  title: string,
): Promise<void> {
  const section = editor.section('Side Panels');
  await section
    .getByRole('switch', { name: 'Turn this feature on or off' })
    .first()
    .click();
  await section.getByRole('button', { name: 'Add new panel' }).click();
  const panel = section.getByRole('listitem').first();
  await panel.getByRole('textbox', { name: 'Panel title' }).fill(title);
  await expect(
    panel.getByRole('radio', {
      name: 'Use the network from the in-progress interview',
    }),
  ).toBeChecked();
}
