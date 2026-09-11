import { expect } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';

// The side-panels section (`@codaco/protocol-builder`'s
// `sections/panels/NodePanelsSection.tsx`, `Side panels`). Facts read from
// that source:
// - It is a capability section: switched off on a fresh stage and disabled
//   until the stage has a subject, with the switch named by its own heading.
// - Panels are rows of the shared `RowList`, so "Create new panel" opens a row
//   dialog rather than inserting a row inline. Inside it, "Panel title" is the
//   title and "People in this panel" is the source; "Add" commits the row.
// - A new row starts as `{ dataSource: 'existing' }` (`newPanel()`) with an id
//   the list itself supplies (`rowTemplate`), and the source picker shows that
//   as the checked "Use the network from the in-progress interview" radio
//   (`AssetPickerField`'s `canUseExisting` choice). The panel's filter is a
//   toggleable group of its own that stays off, so the saved panel is exactly
//   `{ id, title, dataSource: 'existing' }`.
export async function addExistingNetworkPanel(
  editor: StageEditor,
  title: string,
): Promise<void> {
  const section = editor.section('Side panels');
  await section
    .getByRole('switch', { name: 'Side panels', exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Create new panel', exact: true })
    .click();
  const page = section.page();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Panel title' }).fill(title);
  await expect(
    dialog.getByRole('radio', {
      name: 'Use the network from the in-progress interview',
      exact: true,
    }),
  ).toBeChecked();
  const submit = page.getByRole('button', { name: 'Add', exact: true });
  await submit.click();
  // The dialog owns the submit, so waiting for it to leave the DOM is waiting
  // for the dialog itself to finish closing over the section beneath it.
  await submit.waitFor({ state: 'detached' });
}
