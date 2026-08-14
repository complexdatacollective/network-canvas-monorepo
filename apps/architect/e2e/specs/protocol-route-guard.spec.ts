import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { readAssetKeys, readProtocolJson } from '../helpers/read-store.js';

// Every /protocol URL an address bar, a bookmark, or a restored session can
// land on. Before ProtocolRouteGuard each of these rendered a fully editable
// "Untitled protocol" whose every edit was dropped by the reducer.
const PROTOCOL_ROUTES = [
  '/protocol',
  '/protocol/codebook',
  '/protocol/assets',
  '/protocol/summary',
  '/protocol/stage/new?type=Information',
  '/protocol/experiments',
];

async function settle(page: import('@playwright/test').Page) {
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

// Keys of the app's IndexedDB `protocols` store, without going through
// `readProtocolJson` (which requires a row to exist). A phantom protocol must
// leave this empty.
async function readProtocolIds(
  page: import('@playwright/test').Page,
): Promise<string[]> {
  const ids: unknown = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ArchitectProtocolDB');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!db.objectStoreNames.contains('protocols')) {
      db.close();
      return [];
    }
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = db
        .transaction('protocols', 'readonly')
        .objectStore('protocols')
        .getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return keys.map(String);
  });
  return Array.isArray(ids) ? ids.map(String) : [];
}

for (const route of PROTOCOL_ROUTES) {
  test(`a direct ${route} link with no protocol open lands on the start screen`, async ({
    architectPage,
  }) => {
    await architectPage.goto(route);
    await settle(architectPage);

    await expect(architectPage).toHaveURL(/\/$/);
    await expect(architectPage.getByText('Untitled protocol')).toHaveCount(0);
    // Nothing was created to back the route, either.
    expect(await readProtocolIds(architectPage)).toEqual([]);
  });
}

// The startup restore rewrites a /protocol URL before React mounts, so a full
// page load alone would not prove the guard itself works. Navigate in-app
// instead: wouter observes pushState, and only the React guard can answer.
test('navigating in-app to a protocol route with no protocol open returns to the start screen', async ({
  architectPage,
}) => {
  await architectPage.goto('/');
  await settle(architectPage);

  await architectPage.evaluate(() => {
    history.pushState(null, '', '/protocol/codebook');
  });

  await expect(architectPage).toHaveURL(/\/$/);
  await expect(architectPage.getByText('Untitled protocol')).toHaveCount(0);
  expect(await readProtocolIds(architectPage)).toEqual([]);
});

test('a second tab on the same protocol is read-only, writes nothing, and recovers when the first tab closes', async ({
  architectPage,
  context,
  seed,
}) => {
  const protocolId = await seed(emptyProtocol(), {
    name: 'Collision Test',
    // Seeded so the asset-store oracle below is proven to read something,
    // rather than comparing empty to empty and passing regardless.
    assets: [{ assetId: 'seeded-asset', name: 'roster.json', data: '[]' }],
  });
  await gotoProtocol(architectPage);

  const before = await readProtocolJson(architectPage);
  const assetKeysBefore = await readAssetKeys(architectPage);
  expect(assetKeysBefore).toEqual([`${protocolId}::seeded-asset`]);

  // sessionStorage is per-tab, so the second tab is given the same active
  // protocol id the library would have set had the user opened it there.
  const secondTab = await context.newPage();
  await secondTab.goto('/');
  await secondTab.evaluate((storageId) => {
    sessionStorage.setItem(
      '@@remember-app',
      JSON.stringify({ activeProtocolId: storageId }),
    );
  }, protocolId);
  await secondTab.goto('/protocol/codebook');
  await settle(secondTab);

  const banner = secondTab.getByRole('status').filter({
    hasText: 'This protocol is open in another tab',
  });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('read-only mode');

  // The URL the user asked for is theirs; losing the lock does not move them.
  await expect(secondTab).toHaveURL(/\/protocol\/codebook$/);

  // Nothing editable, and no nav affordance that would push history and do
  // nothing: the editor tabs are replaced by a statement of the state.
  await expect(secondTab.getByText('Read only')).toBeVisible();
  await expect(secondTab.getByRole('link', { name: /Codebook/ })).toHaveCount(
    0,
  );
  await expect(secondTab.getByRole('link', { name: /Resources/ })).toHaveCount(
    0,
  );
  await expect(secondTab.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await expect(secondTab.getByRole('button', { name: 'Redo' })).toHaveCount(0);
  await expect(
    secondTab.getByRole('button', { name: /Create node type/i }),
  ).toHaveCount(0);
  await expect(secondTab.getByRole('textbox')).toHaveCount(0);

  // The read-only tab cannot reach the resource dropzone, so it cannot write a
  // blob into the owning tab's asset scope — the one durable write a collision
  // tab used to be able to perform.
  await expect(secondTab.locator('input[type="file"]')).toHaveCount(0);
  expect(await readAssetKeys(secondTab)).toEqual(assetKeysBefore);

  // The canonical row is byte-identical to what the owning tab saved.
  expect(await readProtocolJson(architectPage)).toEqual(before);

  // Closing the holder releases the protocol; this tab reclaims it and the
  // route it was asked for renders. This is what the banner promises.
  await architectPage.close();
  await expect(banner).toHaveCount(0);
  await expect(secondTab).toHaveURL(/\/protocol\/codebook$/);
  await expect(secondTab.getByRole('link', { name: /Codebook/ })).toBeVisible();
});

// Regaining the lock must not turn this tab's snapshot into the truth. Its
// buffer predates whatever the owning tab did while it was demoted, and a
// commit writes the whole row (and garbage-collects assets no longer named in
// its manifest), so editing may only resume against a freshly read row.
test('a tab that regains the lock picks up the other tab’s work rather than overwriting it', async ({
  architectPage,
  context,
  seed,
}) => {
  const protocolId = await seed(emptyProtocol(), { name: 'Reclaim Test' });
  await gotoProtocol(architectPage);

  const secondTab = await context.newPage();
  await secondTab.goto('/');
  await secondTab.evaluate((storageId) => {
    sessionStorage.setItem(
      '@@remember-app',
      JSON.stringify({ activeProtocolId: storageId }),
    );
  }, protocolId);
  await secondTab.goto('/protocol');
  await settle(secondTab);
  await expect(
    secondTab.getByRole('status').filter({ hasText: 'read-only mode' }),
  ).toBeVisible();

  // The owning tab edits while the second tab is read-only.
  const description = architectPage.getByRole('textbox', {
    name: 'Protocol description',
  });
  await description.fill('Written by the first tab');
  await description.blur();
  await readProtocolJson(
    architectPage,
    (protocol) => protocol.description === 'Written by the first tab',
  );

  await architectPage.close();

  // The second tab reclaims the protocol, and does so by re-reading the row.
  await expect(
    secondTab.getByRole('textbox', { name: 'Protocol description' }),
  ).toHaveValue('Written by the first tab');

  // Its own next edit must therefore extend that row rather than replace it.
  const name = secondTab.getByRole('textbox', { name: 'Protocol name' });
  await name.fill('Renamed by the second tab');
  await name.blur();
  const saved = await readProtocolJson(
    secondTab,
    (protocol) => protocol.name === 'Renamed by the second tab',
  );
  expect(saved.description).toBe('Written by the first tab');
});

test('the leave dialog describes persistence honestly and never shows a stack trace', async ({
  architectPage,
  context,
  seed,
}) => {
  const protocolId = await seed(emptyProtocol(), { name: 'Leave Copy' });
  await gotoProtocol(architectPage);

  // The owning tab: its work really is saved on this device.
  await architectPage
    .getByRole('toolbar')
    .getByRole('button', { name: 'Return to Start Screen' })
    .click();
  const ownerDialog = architectPage.getByRole('dialog', {
    name: 'Return to start screen?',
  });
  await expect(ownerDialog).toContainText('saved automatically on this device');
  await expect(ownerDialog).not.toContainText(/at https?:\/\//);
  await architectPage.getByTestId('dialog-cancel').click();

  const secondTab = await context.newPage();
  await secondTab.goto('/');
  await secondTab.evaluate((storageId) => {
    sessionStorage.setItem(
      '@@remember-app',
      JSON.stringify({ activeProtocolId: storageId }),
    );
  }, protocolId);
  await secondTab.goto('/protocol');
  await settle(secondTab);

  await expect(
    secondTab.getByRole('status').filter({ hasText: 'read-only mode' }),
  ).toBeVisible();
  await secondTab
    .getByRole('toolbar')
    .getByRole('button', { name: 'Return to Start Screen' })
    .click();

  // The read-only tab must not be told its work is saved here.
  const readOnlyDialog = secondTab.getByRole('dialog', {
    name: 'Return to start screen?',
  });
  await expect(readOnlyDialog).toContainText('holds the saved copy');
  await expect(readOnlyDialog).not.toContainText('saved automatically');
  await expect(readOnlyDialog).not.toContainText(/at https?:\/\//);
  await expect(readOnlyDialog).not.toContainText('"stack"');
});
