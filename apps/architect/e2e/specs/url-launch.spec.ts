import type { Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';

/**
 * The root build's side of the Architect 8 / Architect 9 hand-off. The URL
 * entry points exist in every build, so `?open=` works here too; everything
 * that sends a protocol to Architect 9 belongs to the /v8/ build only, and
 * e2e/subpath-specs/ covers it there.
 */

async function settle(page: Page): Promise<void> {
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

test('?open= opens that row of the library and leaves the address bar clean', async ({
  architectPage,
  seed,
}) => {
  const id = await seed(
    { ...emptyProtocol(), name: 'Opened At Root' },
    { id: 'e2e-open-at-root' },
  );
  await architectPage.evaluate(() => {
    sessionStorage.clear();
  });

  await architectPage.goto(`/?open=${id}`);
  await settle(architectPage);

  await expect(architectPage).toHaveURL(/\/protocol$/);
  await expect(
    architectPage.getByRole('textbox', { name: 'Protocol name' }),
  ).toHaveValue('Opened At Root');
});

test('the root build offers no Architect 8 banner and no Upgrade to schema 9', async ({
  architectPage,
  seed,
}) => {
  await seed({ ...emptyProtocol(), name: 'Root Study' });

  // The row menu, once it is open, lists every action the row has.
  await architectPage
    .getByRole('button', { name: 'Actions for Root Study' })
    .click();
  await expect(
    architectPage.getByRole('menuitem', { name: 'Open' }),
  ).toBeVisible();
  await expect(
    architectPage.getByRole('menuitem', { name: 'Upgrade to schema 9' }),
  ).toHaveCount(0);
  await architectPage.keyboard.press('Escape');

  // The editor has rendered before the banner's absence is asserted.
  await gotoProtocol(architectPage);
  await expect(
    architectPage.getByRole('textbox', { name: 'Protocol name' }),
  ).toHaveValue('Root Study');
  await expect(
    architectPage.getByText('This is Architect 8, for schema 8 protocols.'),
  ).toHaveCount(0);
  await expect(
    architectPage.getByRole('button', { name: 'Upgrade to schema 9' }),
  ).toHaveCount(0);
});
