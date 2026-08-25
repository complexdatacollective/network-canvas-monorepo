import { expect } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// NodePanels section (sections/NodePanels/*, `Section title="Side panels"`,
// toggleable, collapsed on a fresh stage, disabled until `subject.type` is
// set). Facts verified against source:
// - Each section toggle is named by its own heading, so the header switch is
//   'Side panels' and a panel's nested filter switch is 'Panel filter'.
// - 'Add new panel' is an `immediateAdd` ArrayField: one click inserts
//   `{ id: uuid(), title: null, dataSource: 'existing', filter: null }`
//   (NodePanels.tsx createNodePanel) inline — no dialog. Each panel's fields
//   render bare (no per-field Section), so `title` is filled through its
//   visible 'Panel title' label; `dataSource` stays the template's 'existing'
//   (the matching radio is pre-checked, under the per-panel 'Data source for
//   panel N' label); the untouched `filter: null` is pruned at save, so the
//   saved panel is exactly `{ id, title, dataSource: 'existing' }`.
export async function addExistingNetworkPanel(
  editor: StageEditor,
  title: string,
): Promise<void> {
  const section = editor.section('Side panels');
  await section
    .getByRole('switch', { name: 'Side panels', exact: true })
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
