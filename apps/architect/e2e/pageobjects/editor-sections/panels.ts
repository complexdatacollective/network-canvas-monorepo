import { expect } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// NodePanels section (sections/NodePanels/*, `Section title="Side Panels"`,
// toggleable, collapsed on a fresh stage, disabled until `subject.type` is
// set). Facts verified against source:
// - Each section toggle is named by its own heading, so the header switch is
//   'Side Panels' and a panel's nested Filter switch is 'Filter'. `.first()`
//   survives from when both carried one shared name; it is harmless and keeps
//   the header switch selected if a future panel repeats the heading.
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
  const section = editor.section('Side Panels');
  await section.getByRole('switch', { name: 'Side Panels' }).first().click();
  await section.getByRole('button', { name: 'Add new panel' }).click();
  const panel = section.getByRole('listitem').first();
  await panel.getByRole('textbox', { name: 'Panel title' }).fill(title);
  await expect(
    panel.getByRole('radio', {
      name: 'Use the network from the in-progress interview',
    }),
  ).toBeChecked();
}
