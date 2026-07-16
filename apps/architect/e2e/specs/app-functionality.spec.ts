import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';
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

test('clears all stored protocols', async ({ architectPage, seed }) => {
  const { protocol } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'To Be Cleared' });
  // `seed` already leaves the page on `/` (it navigates there to reach
  // IndexedDB before writing the library row); re-navigating here is
  // harmless and makes the starting point of the test explicit.
  await architectPage.goto('/');

  await expect(architectPage.getByText('To Be Cleared')).toBeVisible();

  await architectPage
    .getByRole('button', { name: 'Clear all protocols from this browser' })
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

  // The undo timeline (ducks/middleware/timeline.ts) resets to an empty
  // history on every rehydrate (activeProtocolPersistence.ts only persists
  // `present`, never `past`/`future`), and its very first post-rehydrate
  // action always seeds the timeline's baseline locus without pushing
  // history — it doesn't yet know whether a following edit is "the" edit to
  // make undoable. This priming edit absorbs that one-time no-history
  // action deterministically, so the assertions below exercise a real,
  // single-step undo/redo of the *second* edit rather than depending on
  // incidental app-boot dispatches (validation, scroll-restore, etc.) to
  // have already consumed that slot.
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
