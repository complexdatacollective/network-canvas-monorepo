import { expect, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';

const INITIALS = `function nodeLabelWorker({ node }) {
  return 'label for ' + node.networkCanvasType;
}`;

// Runs against the production build, so the script engine has to load and run
// under the app's real Content-Security-Policy.
test('writes a node label worker, previews it and saves it with the protocol', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/codebook');

  await architectPage
    .getByRole('button', { name: 'Add node label worker' })
    .click();
  const dialog = architectPage.getByRole('dialog');
  const script = dialog.getByRole('textbox', { name: /^Script/ });

  // The starter script labels each sample node, so the preview fills in.
  await expect(dialog.getByRole('listitem').first()).toBeVisible({
    timeout: 30_000,
  });

  await script.fill('function nodeLabelWorker( {');
  await expect(dialog.getByRole('alert')).toContainText(
    'This script cannot be used.',
  );
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeVisible();
  expect((await readProtocolJson(architectPage)).nodeLabelWorker).toBe(
    undefined,
  );

  await script.fill(INITIALS);
  await expect(dialog.getByRole('listitem').first()).toContainText(
    /^label for \S/,
    { timeout: 30_000 },
  );
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(async () => (await readProtocolJson(architectPage)).nodeLabelWorker)
    .toBe(INITIALS);

  await architectPage.getByRole('button', { name: 'Remove' }).click();
  await architectPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect
    .poll(async () => (await readProtocolJson(architectPage)).nodeLabelWorker)
    .toBe(undefined);
});
