import type { BrowserContext, Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol } from '../fixtures/seed.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
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

async function settle(page: Page) {
  await page
    .locator('#boot-loader')
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});
}

// Keys of the app's IndexedDB `protocols` store, without going through
// `readProtocolJson` (which requires a row to exist). A phantom protocol must
// leave this empty.
async function readProtocolIds(page: Page): Promise<string[]> {
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

type Role = Parameters<Page['getByRole']>[0];

type ViewControl = {
  role: Role;
  name: RegExp;
  // For controls named by protocol content: allowed only inside this landmark.
  within?: { role: Role; name: RegExp };
};

// What a tab that cannot edit may still do: move around the protocol, look at
// it, and take a copy of it. Everything else that acts or accepts input must be
// disabled. The same allowlist as `readOnlyBrowsing.test.tsx`, which sweeps
// every route in jsdom; this one sweeps them as a browser computes them.
const VIEW_CONTROLS: readonly ViewControl[] = [
  { role: 'button', name: /^return to start screen$/i },
  { role: 'button', name: /^return to stages$/i },
  { role: 'button', name: /^open menu$/i },
  { role: 'combobox', name: /^interface language:/i },
  { role: 'button', name: /^download$/i },
  { role: 'button', name: /^print$/i },
  // The browser's own storage warning, offering to install the app.
  {
    role: 'button',
    name: /^dismiss$/i,
    within: { role: 'status', name: /^install architect$/i },
  },
  {
    role: 'button',
    name: /./,
    within: { role: 'navigation', name: /^breadcrumb$/i },
  },
  { role: 'button', name: /^edit stage \d+:/i },
  { role: 'button', name: /^how to get a mapbox token$/i },
  { role: 'searchbox', name: /^search the codebook/i },
  { role: 'checkbox', name: /^show unused only$/i },
  { role: 'button', name: /^(name|used in)$/i },
  { role: 'button', name: /^preview$/i },
  {
    role: 'button',
    name: /^(all|image|video|audio|network|geojson|api key)$/i,
  },
  { role: 'button', name: /^preview ./i },
  { role: 'button', name: /^download ./i },
  { role: 'button', name: /^go back$/i },
  {
    role: 'button',
    name: /./,
    within: { role: 'navigation', name: /^stage sections$/i },
  },
  { role: 'button', name: /^cancel$/i },
  { role: 'button', name: /^preview settings$/i },
];

const ACTION_ROLES: readonly Role[] = [
  'button',
  'checkbox',
  'combobox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'radio',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'textbox',
];

const VIEW_MARK = 'data-e2e-view-control';

// Every enabled control on the page that is not a view or navigation action.
async function editingControls(page: Page): Promise<string[]> {
  await page.evaluate((mark) => {
    for (const element of document.querySelectorAll(`[${mark}]`)) {
      element.removeAttribute(mark);
    }
  }, VIEW_MARK);
  for (const { role, name, within } of VIEW_CONTROLS) {
    const scope = within
      ? page.getByRole(within.role, { name: within.name })
      : page.locator('body');
    await scope.getByRole(role, { name }).evaluateAll((elements, mark) => {
      for (const element of elements) element.setAttribute(mark, '');
    }, VIEW_MARK);
  }

  const describe = (elements: Element[], mark: string) =>
    elements
      .filter(
        (element) =>
          !element.hasAttribute(mark) &&
          element.closest('[inert], [aria-disabled="true"]') === null,
      )
      .map(
        (element) =>
          `<${element.tagName.toLowerCase()}> ${(
            element.getAttribute('aria-label') ??
            element.textContent ??
            ''
          )
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 80)}`,
      );

  const found: string[] = [];
  for (const role of ACTION_ROLES) {
    found.push(
      ...(await page
        .getByRole(role, { disabled: false })
        .evaluateAll(describe, VIEW_MARK)),
    );
  }
  // Inputs without a role of their own, such as a file input. Base UI's
  // aria-hidden native inputs stand in for a visible control checked above.
  found.push(
    ...(await page
      .locator(
        [
          'input:enabled:not([type="hidden"]):not([aria-hidden="true"])',
          'textarea:enabled',
          'select:enabled',
          '[contenteditable]:not([contenteditable="false"])',
        ].join(', '),
      )
      .evaluateAll(describe, VIEW_MARK)),
  );
  return [...new Set(found)];
}

async function openInSecondTab(
  context: BrowserContext,
  protocolId: string,
  route: string,
): Promise<Page> {
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
  await secondTab.goto(route);
  await settle(secondTab);
  return secondTab;
}

const readOnlyBanner = (page: Page) =>
  page.getByRole('status').filter({
    hasText: 'This protocol is open in another tab',
  });

const STAGE_READ_ONLY_MESSAGE =
  'Another tab is editing this stage, so you can read it but not change it.';

test('a second tab on the same protocol can look through every page, changes nothing, and edits in place once the first tab closes', async ({
  architectPage,
  context,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const protocolId = await seed(protocol, { name: 'Collision Test', assets });
  await gotoProtocol(architectPage);

  const before = await readProtocolJson(architectPage);
  const assetKeysBefore = await readAssetKeys(architectPage);
  // Proves the asset-store oracle below reads something, rather than
  // comparing empty to empty and passing regardless.
  expect(assetKeysBefore.length).toBeGreaterThan(0);

  const secondTab = await openInSecondTab(context, protocolId, '/protocol');
  await expect(readOnlyBanner(secondTab)).toBeVisible();
  await expect(readOnlyBanner(secondTab)).toContainText('read-only here');
  await expect(secondTab.getByText('Read only')).toBeVisible();

  const main = secondTab.getByRole('navigation', { name: 'Main navigation' });

  // The stage list, and the editor of a stage opened from it.
  await expect(secondTab).toHaveURL(/\/protocol$/);
  await expect(
    secondTab.getByRole('button', { name: /^Edit stage 1:/ }),
  ).toBeVisible();
  expect(await editingControls(secondTab)).toEqual([]);

  await secondTab.getByRole('button', { name: /^Edit stage 1:/ }).click();
  await expect(secondTab.getByText(STAGE_READ_ONLY_MESSAGE)).toBeVisible();
  expect(await editingControls(secondTab)).toEqual([]);
  await secondTab.getByRole('button', { name: 'Cancel' }).click();
  await expect(secondTab).toHaveURL(/\/protocol$/);

  for (const [tab, url] of [
    ['Codebook', /\/protocol\/codebook$/],
    ['Resources', /\/protocol\/assets$/],
    ['Summary', /\/protocol\/summary$/],
  ] as const) {
    await main.getByRole('link', { name: new RegExp(`^${tab}`) }).click();
    await expect(secondTab).toHaveURL(url);
    await expect(readOnlyBanner(secondTab)).toBeVisible();
    expect(await editingControls(secondTab), tab).toEqual([]);
  }

  // Experiments has no link; it is reached by address.
  await secondTab.evaluate(() => {
    history.pushState(null, '', '/protocol/experiments');
  });
  await expect(
    secondTab.getByRole('button', { name: 'Go Back' }),
  ).toBeVisible();
  expect(await editingControls(secondTab)).toEqual([]);

  // Experiments has no project navigation of its own; leave it the way it
  // offers.
  await secondTab.getByRole('button', { name: 'Go Back' }).click();
  await expect(secondTab).toHaveURL(/\/protocol$/);

  await main.getByRole('link', { name: /^Codebook/ }).click();
  await expect(secondTab).toHaveURL(/\/protocol\/codebook$/);
  const createNodeType = secondTab.getByRole('button', {
    name: 'Create node type',
  });
  await expect(createNodeType).toBeDisabled();

  // Nothing was written: not a blob into the owning tab's asset scope, and
  // not a byte of the row the owning tab saved.
  expect(await readAssetKeys(secondTab)).toEqual(assetKeysBefore);
  expect(await readProtocolJson(architectPage)).toEqual(before);

  // Closing the holder releases the protocol. This tab reclaims it where it
  // is: same page, now editable. This is what the banner promises.
  await architectPage.close();
  await expect(readOnlyBanner(secondTab)).toHaveCount(0);
  await expect(secondTab.getByText('Read only')).toHaveCount(0);
  await expect(secondTab).toHaveURL(/\/protocol\/codebook$/);
  await expect(createNodeType).toBeEnabled();
});

test('a stage editor open read-only becomes editable in place when the other tab closes', async ({
  architectPage,
  context,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  const protocolId = await seed(protocol, { name: 'Stage Reclaim', assets });
  await gotoProtocol(architectPage);

  const secondTab = await openInSecondTab(context, protocolId, '/protocol');
  await expect(readOnlyBanner(secondTab)).toBeVisible();
  await secondTab.getByRole('button', { name: /^Edit stage 1:/ }).click();
  await expect(secondTab.getByText(STAGE_READ_ONLY_MESSAGE)).toBeVisible();
  const stageUrl = secondTab.url();
  const stageName = secondTab.getByRole('textbox', { name: 'Stage name' });
  await expect(stageName).toBeDisabled();

  await architectPage.close();

  await expect(secondTab.getByText(STAGE_READ_ONLY_MESSAGE)).toHaveCount(0);
  expect(secondTab.url()).toBe(stageUrl);
  await expect(stageName).toBeEnabled();

  // And what is typed into it now is saved.
  await stageName.fill('Renamed after the reclaim');
  await secondTab.getByRole('button', { name: 'Finished Editing' }).click();
  await secondTab.waitForURL(/\/protocol$/);
  const saved = await readProtocolJson(
    secondTab,
    (row) => row.stages[0]?.label === 'Renamed after the reclaim',
  );
  expect(saved.stages[0]?.label).toBe('Renamed after the reclaim');
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

  const secondTab = await openInSecondTab(context, protocolId, '/protocol');
  await expect(readOnlyBanner(secondTab)).toBeVisible();

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

  const secondTab = await openInSecondTab(context, protocolId, '/protocol');

  await expect(readOnlyBanner(secondTab)).toBeVisible();
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
