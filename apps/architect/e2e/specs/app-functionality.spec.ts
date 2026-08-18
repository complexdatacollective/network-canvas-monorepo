import { validateProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { Timeline } from '../pageobjects/timeline.js';
import { Toolbar } from '../pageobjects/toolbar.js';

test('downloads the active protocol as a .netcanvas', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await gotoProtocol(architectPage);

  const toolbar = new Toolbar(architectPage);
  const [download] = await Promise.all([
    architectPage.waitForEvent('download'),
    toolbar.download(),
  ]);

  // Filename format is built in `downloadProtocolAsNetcanvas`
  // (apps/architect/src/utils/bundleProtocol.ts): the protocol name with
  // spaces replaced by underscores, then a local `YYYY-MM-DD_HH-MM` timestamp.
  expect(download.suggestedFilename()).toMatch(
    /^All_Interfaces-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.netcanvas$/,
  );

  // ProjectActions.tsx swaps the button's label to "Downloaded" once the
  // export promise resolves (reverting to "Download" after a 2s timeout), so
  // this proves the export actually completed rather than just that the
  // anchor's synchronous `.click()` fired.
  await toolbar.expectLabel('download', 'Downloaded');
});

test('downloads the active protocol while returning to the start screen', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'Download On Exit', assets });
  await gotoProtocol(architectPage);

  const toolbar = new Toolbar(architectPage);
  await toolbar.returnToStart();

  const [download] = await Promise.all([
    architectPage.waitForEvent('download'),
    architectPage.getByTestId('dialog-secondary').click(),
  ]);

  expect(download.suggestedFilename()).toMatch(
    /^Download_On_Exit-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.netcanvas$/,
  );
  await expect(architectPage).toHaveURL(/\/$/);
  await expect(architectPage.getByText('Download On Exit')).toBeVisible();
});

test('discards an invalid stage draft before returning to the start screen', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const informationStage = protocol.stages.find(
    (stage) => stage.type === 'Information',
  );
  if (!informationStage) throw new Error('fixture has no Information stage');

  await seed(protocol, { name: 'Discard Invalid Draft', assets });
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage(informationStage.label);

  // Clearing Information's required page heading makes the in-progress stage
  // invalid. The stage editor keeps this in its separate draft until the user
  // chooses "Finished Editing", so it must never replace the durable protocol
  // shown on the start screen.
  await architectPage.getByRole('textbox', { name: 'Page heading' }).fill('');

  // The stage editor replaces ProjectActions with StageEditorNav, so leaving
  // the protocol from here uses Brand's app-header button rather than the
  // overview toolbar action.
  await architectPage
    .getByRole('button', { name: 'Return to start screen', exact: true })
    .click();
  const dialog = architectPage.getByRole('dialog', {
    name: 'Discard unsaved changes?',
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Return and download now' }),
  ).toHaveCount(0);
  await dialog
    .getByRole('button', { name: 'Discard Changes and Return' })
    .click();

  await expect(architectPage).toHaveURL(/\/$/);
  await expect(architectPage.getByText('Discard Invalid Draft')).toBeVisible();

  const persistedProtocol = await readProtocolJson(architectPage);
  expect(
    persistedProtocol.stages.find((stage) => stage.id === informationStage.id),
  ).toEqual(informationStage);
  expect((await validateProtocol(persistedProtocol)).success).toBe(true);
});

test('clears all stored protocols', async ({ architectPage, seed }) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'To Be Cleared' });
  // `seed` already leaves the page on `/` (it navigates there to reach
  // IndexedDB before writing the library row); re-navigating here is
  // harmless and makes the starting point of the test explicit.
  await architectPage.goto('/');

  await expect(architectPage.getByText('To Be Cleared')).toBeVisible();

  await architectPage
    .getByRole('button', { name: 'Clear all locally saved protocols' })
    .click();
  // LibraryPanel's `handleClearAll` opens a `type: 'choice'` dialog titled
  // "Remove all data?"; `dialog-primary` is the confirm ("Remove all") action.
  await architectPage.getByTestId('dialog-primary').click();

  // `clearAllStorage()` calls `location.reload()` on success, so the recents
  // list re-renders from a now-empty IndexedDB. LibraryPanel's Collection
  // `emptyState` for the "recent" tab.
  await expect(
    architectPage.getByText('No recent protocols yet.'),
  ).toBeVisible();
  await expect(architectPage.getByText('To Be Cleared')).toHaveCount(0);
});

test('imports a .netcanvas via the home dropzone', async ({
  architectPage,
}) => {
  await architectPage.goto('/');
  await architectPage
    .locator('input[type="file"]')
    .setInputFiles('e2e/fixtures/files/all-interfaces.netcanvas');
  await architectPage.waitForURL(/\/protocol$/);
  await expect(architectPage).toHaveURL(/\/protocol$/);
});

test('reload restores the canonical protocol instead of a legacy session body', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'Canonical Reload' });
  await gotoProtocol(architectPage);

  await architectPage.evaluate(() => {
    sessionStorage.setItem(
      '@@remember-activeProtocol',
      JSON.stringify({
        activeProtocolId: 'e2e-protocol',
        present: {
          name: 'Invalid Session Copy',
          schemaVersion: 8,
          codebook: null,
          stages: null,
        },
      }),
    );
  });
  await architectPage.reload();

  await expect(
    architectPage.getByRole('textbox', { name: 'Protocol name' }),
  ).toHaveValue('Canonical Reload');
  await expect(
    architectPage.getByRole('dialog', { name: 'Misconfigured Protocol' }),
  ).toHaveCount(0);
});

test('does not leave a cleared protocol in browser history', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'Browser History Seed' });
  // The seed writes directly to IndexedDB after the start screen has already
  // rendered. Reload so the Recent collection reads the new library row.
  await architectPage.reload();

  await architectPage
    .getByText('Browser History Seed', { exact: true })
    .click();
  await expect(architectPage).toHaveURL(/\/protocol$/);

  await architectPage.getByRole('link', { name: 'Resources' }).click();
  await expect(architectPage).toHaveURL(/\/protocol\/assets$/);
  await architectPage.getByRole('link', { name: 'Codebook' }).click();
  await expect(architectPage).toHaveURL(/\/protocol\/codebook$/);

  // Protocol routes keep their normal Back/Forward behavior while editing.
  await architectPage.goBack();
  await expect(architectPage).toHaveURL(/\/protocol\/assets$/);
  await architectPage.goForward();
  await expect(architectPage).toHaveURL(/\/protocol\/codebook$/);

  const toolbar = new Toolbar(architectPage);
  await toolbar.returnToStart();
  await architectPage.getByTestId('dialog-primary').click();
  await expect(architectPage).toHaveURL(/\/$/);

  await architectPage.goBack();
  await expect(architectPage).toHaveURL(/\/$/);
  await expect(
    architectPage.getByText('Browser History Seed', { exact: true }),
  ).toBeVisible();
  await expect(
    architectPage.getByRole('textbox', { name: 'Protocol name' }),
  ).toHaveCount(0);
});

test('undoes and redoes a protocol-name edit', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'Undo Redo Seed' });
  await gotoProtocol(architectPage);

  const toolbar = new Toolbar(architectPage);
  const nameField = architectPage.getByRole('textbox', {
    name: 'Protocol name',
  });
  await expect(nameField).toHaveValue('Undo Redo Seed');

  // Canonical restore seeds a fresh timeline baseline. Two edits below make
  // the single-step undo/redo target explicit.
  await nameField.fill('Undo Redo Intermediate');
  await nameField.blur();
  await expect(nameField).toHaveValue('Undo Redo Intermediate');

  await nameField.fill('Undo Redo Final');
  await nameField.blur();
  await expect(nameField).toHaveValue('Undo Redo Final');
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Undo Redo Final',
  );

  await toolbar.undo();
  await expect(nameField).toHaveValue('Undo Redo Intermediate');
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Undo Redo Intermediate',
  );

  await toolbar.redo();
  await expect(nameField).toHaveValue('Undo Redo Final');
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Undo Redo Final',
  );
});

// #1396: the protocol name commits on blur, so clicking into the field and
// away again — reading it, or tabbing past it — dispatched a rename to the
// name it already had. `updateProtocolName` rebuilds the protocol rather than
// mutating it, so that rebuilt-but-identical protocol counted as a change: it
// invented an undo step and, worse, discarded a redo the researcher still had.
test('clicking into the protocol name and out again is not a change', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'No Op Seed' });
  await gotoProtocol(architectPage);

  const toolbar = new Toolbar(architectPage);
  const nameField = architectPage.getByRole('textbox', {
    name: 'Protocol name',
  });
  await expect(nameField).toHaveValue('No Op Seed');

  // One real rename, then undo it: that leaves an empty undo stack and a
  // pending redo — both of which the no-op below used to destroy.
  await nameField.fill('No Op Renamed');
  await nameField.blur();
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'No Op Renamed',
  );

  await toolbar.undo();
  await expect(nameField).toHaveValue('No Op Seed');
  await expect(toolbar.button('undo')).toHaveAttribute('aria-disabled', 'true');
  await expect(toolbar.button('redo')).toHaveAttribute(
    'aria-disabled',
    'false',
  );

  // The whole interaction under test: focus the field, type nothing, leave.
  await nameField.focus();
  await nameField.blur();

  await expect(toolbar.button('undo')).toHaveAttribute('aria-disabled', 'true');
  await expect(toolbar.button('redo')).toHaveAttribute(
    'aria-disabled',
    'false',
  );

  // And the redo still leads where it did.
  await toolbar.redo();
  await expect(nameField).toHaveValue('No Op Renamed');
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'No Op Renamed',
  );
});

// #1389: activating Undo from a page other than the one the change was made on
// used to navigate and stop, leaving the change in place until the researcher
// pressed the same control a second time. Every assertion below reads the
// canonical IndexedDB row, so a route change alone can never satisfy it.
//
// In-app links, never page.goto: the undo timeline is session-local (see
// ducks/store.ts), so a reload would throw away the history under test.
test('applies one history operation per activation from Resources', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'Cross Page Seed' });
  await gotoProtocol(architectPage);

  const toolbar = new Toolbar(architectPage);
  const nameField = architectPage.getByRole('textbox', {
    name: 'Protocol name',
  });
  await expect(nameField).toHaveValue('Cross Page Seed');

  await nameField.fill('Cross Page Renamed');
  await nameField.blur();
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Cross Page Renamed',
  );

  await architectPage.getByRole('link', { name: 'Resources' }).click();
  await expect(architectPage).toHaveURL(/\/protocol\/assets$/);

  // ONE activation: the change is reverted in the canonical row AND the
  // researcher is brought to the page that shows it.
  await toolbar.undo();
  await expect(architectPage).toHaveURL(/\/protocol$/);
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Cross Page Seed',
  );

  // Redo becomes available from that same activation, and reapplies in one
  // press without a further route change (we are already on its page).
  await toolbar.redo();
  await expect(architectPage).toHaveURL(/\/protocol$/);
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Cross Page Renamed',
  );
});

test('applies one history operation per activation for a codebook change', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'Codebook History Seed' });
  await gotoProtocol(architectPage);

  const toolbar = new Toolbar(architectPage);
  await architectPage.getByRole('link', { name: 'Codebook' }).click();
  await expect(architectPage).toHaveURL(/\/protocol\/codebook$/);

  // Rename a variable through the codebook's own editor, so the timeline
  // records the locus at /protocol/codebook (VariablePill.tsx).
  await architectPage
    .getByRole('button', {
      name: 'Edit attribute name: biologicalSex',
      exact: true,
    })
    .click();
  // VariablePill.tsx labels the editor dialog "Edit variable name" and its
  // input "Variable name".
  const variableEditor = architectPage.getByRole('dialog', {
    name: 'Edit attribute name',
  });
  await variableEditor
    .getByRole('textbox', { name: 'Attribute name' })
    .fill('biologicalSexRenamed');
  await variableEditor.getByRole('button', { name: 'Save Changes' }).click();
  await readProtocolJson(architectPage, (current) =>
    JSON.stringify(current.codebook).includes('biologicalSexRenamed'),
  );

  await architectPage.getByRole('link', { name: 'Resources' }).click();
  await expect(architectPage).toHaveURL(/\/protocol\/assets$/);

  await toolbar.undo();
  await expect(architectPage).toHaveURL(/\/protocol\/codebook$/);
  await readProtocolJson(
    architectPage,
    (current) =>
      !JSON.stringify(current.codebook).includes('biologicalSexRenamed'),
  );

  // Same-page redo: reapplies without moving the researcher.
  await toolbar.redo();
  await expect(architectPage).toHaveURL(/\/protocol\/codebook$/);
  await readProtocolJson(architectPage, (current) =>
    JSON.stringify(current.codebook).includes('biologicalSexRenamed'),
  );
});

// Acceptance criterion 1: the history controls behave identically on Summary,
// which is a read-only report — the authoring affordance (save-to-source) stays
// hidden there, but recovery does not.
test('applies one history operation per activation from Summary', async ({
  architectPage,
  seed,
}) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'Summary History Seed' });
  await gotoProtocol(architectPage);

  const toolbar = new Toolbar(architectPage);
  const nameField = architectPage.getByRole('textbox', {
    name: 'Protocol name',
  });
  await nameField.fill('Summary History Renamed');
  await nameField.blur();
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Summary History Renamed',
  );

  await architectPage.getByRole('link', { name: 'Summary' }).click();
  await expect(architectPage).toHaveURL(/\/protocol\/summary$/);
  await expect(toolbar.button('undo')).toBeVisible();
  // The authoring affordance stays hidden on the report.
  await expect(
    architectPage.getByRole('button', { name: 'Save to source' }),
  ).toHaveCount(0);

  // The report renders the whole protocol, so the revert is visible in place
  // and the researcher keeps their position in it.
  await toolbar.undo();
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Summary History Seed',
  );
  await expect(architectPage).toHaveURL(/\/protocol\/summary$/);

  await toolbar.redo();
  await readProtocolJson(
    architectPage,
    (current) => current.name === 'Summary History Renamed',
  );
  await expect(architectPage).toHaveURL(/\/protocol\/summary$/);
});
