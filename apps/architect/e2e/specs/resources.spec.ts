import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { Toolbar } from '../pageobjects/toolbar.js';

// Use the same responsive SVG that readers can download from the documentation
// article. This proves the Architect dropzone accepts `.svg` as an image
// resource and keeps the tested fixture aligned with the documented example.
const TEST_IMAGE_PATH = path.resolve(
  import.meta.dirname,
  '../../../documentation/public/assets/responsive-svg-background.svg',
);
const TEST_IMAGE_NAME = 'responsive-svg-background.svg';

type AssetManifestEntry = { name: string };

// Narrow one `assetManifest` value with a real runtime guard (mirroring
// `toStage` in timeline.spec.ts) rather than an `as` cast, so a
// drifted/malformed entry throws here instead of silently producing a
// mis-typed object the assertions would then trust.
function toAssetManifestEntry(value: unknown): AssetManifestEntry {
  if (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string'
  ) {
    return { name: value.name };
  }
  throw new Error('assetManifest entry missing a string name');
}

// `readProtocolJson` returns `Record<string, unknown>`; extract its
// `assetManifest` map's values as real `AssetManifestEntry[]` via
// `toAssetManifestEntry` (no `as`). Each `unknown` value is narrowed
// runtime-side, so callers get a real typed array.
function assetManifestOf(
  protocol: Record<string, unknown>,
): AssetManifestEntry[] {
  const manifest = protocol.assetManifest;
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('protocol JSON has no assetManifest object');
  }
  return Object.values(manifest).map(toAssetManifestEntry);
}

test('adds a new resource via the dropzone and lists it', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/assets');

  // Dropzone.tsx's root is `role="button" aria-label="Upload file"`, wrapping
  // react-dropzone's hidden `input[type=file]` (`noClick:false`, so this is
  // the same input a real drag-and-drop or click-to-browse would populate).
  const fileInput = architectPage
    .getByRole('button', { name: 'Upload file' })
    .locator('input[type="file"]');
  await fileInput.setInputFiles(TEST_IMAGE_PATH);

  // Assets.tsx's Collection is `role="listbox" aria-label="Resource
  // library"`; each AssetCard's name renders as an `h4` (AssetCard.tsx).
  const assetList = architectPage.getByRole('listbox', {
    name: 'Resource library',
  });
  await expect(
    assetList.getByRole('heading', {
      level: 4,
      name: TEST_IMAGE_NAME,
      exact: true,
    }),
  ).toBeVisible();
});

test('refuses to delete a resource that is used by a stage', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/assets');

  // The fixture's `geo_data` asset (displayed as "Regions") is wired as the
  // Geospatial stage's `mapOptions.dataSourceAssetId`
  // (packages/protocols/e2e/all-interfaces/protocol.json), so it's in use.
  const assetList = architectPage.getByRole('listbox', {
    name: 'Resource library',
  });
  await expect(
    assetList.getByRole('heading', { level: 4, name: 'Regions', exact: true }),
  ).toBeVisible();

  // AssetCard.tsx labels the in-use delete button "<name> is in use and
  // cannot be deleted" (the `isUsed` branch of its `aria-label`); clicking it
  // routes through AssetBrowser's `handleDelete(id, isUsed=true)` guard
  // rather than the destructive confirm.
  await architectPage
    .getByRole('button', { name: 'Regions is in use and cannot be deleted' })
    .click();

  // AssetBrowser.tsx's `isUsed` branch opens an `acknowledge`/info dialog
  // titled "Cannot delete resource" with a single OK action (no cancel) —
  // confirmed against the real component's `openDialog` call, not assumed.
  const guardDialog = architectPage.getByRole('dialog', {
    name: 'Cannot delete resource',
  });
  await expect(guardDialog).toBeVisible();
  await expect(guardDialog.getByTestId('dialog-cancel')).toHaveCount(0);
  await expect(guardDialog.getByTestId('dialog-primary')).toHaveText('OK');

  // Dialog shown AND deletion did not proceed. The guard returns before any
  // `deleteAsset` dispatch, so no store change happens; acknowledging then
  // waiting lets any (regression) erroneous accepted delete reach IndexedDB
  // before
  // asserting it did NOT — closing the "dialog shown but deletion silently
  // proceeds anyway" gap, mirroring timeline.spec.ts's stage-delete guard
  // test.
  await guardDialog.getByTestId('dialog-primary').click();
  await architectPage.waitForTimeout(1000);

  await expect(
    assetList.getByRole('heading', { level: 4, name: 'Regions', exact: true }),
  ).toBeVisible();
  const manifest = assetManifestOf(await readProtocolJson(architectPage));
  expect(manifest.some((asset) => asset.name === 'Regions')).toBe(true);
});

test('deletes an unused resource and removes it from the asset manifest', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/assets');

  const fileInput = architectPage
    .getByRole('button', { name: 'Upload file' })
    .locator('input[type="file"]');
  await fileInput.setInputFiles(TEST_IMAGE_PATH);

  const assetList = architectPage.getByRole('listbox', {
    name: 'Resource library',
  });
  await expect(
    assetList.getByRole('heading', {
      level: 4,
      name: TEST_IMAGE_NAME,
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      assetManifestOf(await readProtocolJson(architectPage)).some(
        (asset) => asset.name === TEST_IMAGE_NAME,
      ),
    )
    .toBe(true);

  // Unused, so AssetCard.tsx's delete button is labelled "Delete <name>"
  // (not the in-use variant) and routes through AssetBrowser's destructive
  // `confirm(...)` rather than the acknowledge guard.
  await architectPage
    .getByRole('button', { name: `Delete ${TEST_IMAGE_NAME}` })
    .click();

  // `confirm(...)`'s title is "Delete Resource?" with `confirmLabel: 'Delete
  // Resource'` on the `dialog-primary` action — confirmed against
  // AssetBrowser.tsx's real `handleDelete` call, not assumed.
  const confirmDialog = architectPage.getByRole('dialog', {
    name: 'Delete Resource?',
  });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByTestId('dialog-primary')).toHaveText(
    'Delete Resource',
  );
  await confirmDialog.getByTestId('dialog-primary').click();

  await expect(
    assetList.getByRole('heading', {
      level: 4,
      name: TEST_IMAGE_NAME,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      assetManifestOf(await readProtocolJson(architectPage)).some(
        (asset) => asset.name === TEST_IMAGE_NAME,
      ),
    )
    .toBe(false);

  // The deletion remains one undoable protocol commit. Its Blob must survive
  // canonical persistence so Undo restores both the manifest entry and a
  // working preview, not a dangling resource reference.
  await new Toolbar(architectPage).undo();
  await expect
    .poll(async () =>
      assetManifestOf(await readProtocolJson(architectPage)).some(
        (asset) => asset.name === TEST_IMAGE_NAME,
      ),
    )
    .toBe(true);
  const restoredPreview = architectPage.getByRole('img', {
    name: TEST_IMAGE_NAME,
  });
  await expect(restoredPreview).toBeVisible();
  await expect
    .poll(() =>
      restoredPreview.evaluate((image) =>
        image instanceof HTMLImageElement && image.naturalWidth > 0
          ? 'loaded'
          : 'pending',
      ),
    )
    .toBe('loaded');
});

// #1396. Three defects that all surface at the moment a resource is imported:
// duplicate filenames were indistinguishable, a REFUSED import still moved the
// undo history, and dismissing the resulting dialog left nothing focused.

// A `.json` resource is a network roster, so an object that is not one is
// refused by `validateAsset` (code NETWORK_EMPTY) after react-dropzone has
// already accepted the extension — the "rejected import" of the report, not an
// unsupported file type.
const REFUSED_IMPORT = {
  name: 'rubbish.json',
  mimeType: 'application/json',
  buffer: Buffer.from('{"a":1}'),
};

const uploadControl = (page: Page) =>
  page.getByRole('button', { name: 'Upload file' });

const fileInputOf = (page: Page) =>
  uploadControl(page).locator('input[type="file"]');

test('a refused import leaves the undo history exactly as it was', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/assets');

  const toolbar = new Toolbar(architectPage);
  // Nothing has been changed yet, so there is nothing to undo. This is the
  // baseline the refusal must not move. `aria-disabled` rather than
  // `toBeDisabled()`: ActionToolbar renders an inoperable item as an
  // `aria-disabled` button that stays reachable, so this asserts the state the
  // researcher's screen reader is actually told.
  await expect(toolbar.button('undo')).toHaveAttribute('aria-disabled', 'true');
  await expect(toolbar.button('redo')).toHaveAttribute('aria-disabled', 'true');
  const manifestBefore = assetManifestOf(
    await readProtocolJson(architectPage),
  ).map((asset) => asset.name);

  await fileInputOf(architectPage).setInputFiles(REFUSED_IMPORT);

  const errorDialog = architectPage.getByRole('dialog', {
    name: 'That file could not be added',
  });
  await expect(errorDialog).toBeVisible();
  await errorDialog.getByTestId('dialog-primary').click();
  await expect(errorDialog).toHaveCount(0);

  // Undo enabled here means the refusal recorded a history point: activating
  // it would announce "Change undone" and write a fresh `lastModified` while
  // changing nothing the researcher can see.
  await expect(toolbar.button('undo')).toHaveAttribute('aria-disabled', 'true');
  await expect(toolbar.button('redo')).toHaveAttribute('aria-disabled', 'true');
  expect(
    assetManifestOf(await readProtocolJson(architectPage)).map(
      (asset) => asset.name,
    ),
  ).toEqual(manifestBefore);
});

test('a refused import does not throw away a pending redo', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/assets');

  const toolbar = new Toolbar(architectPage);
  await fileInputOf(architectPage).setInputFiles(TEST_IMAGE_PATH);
  await expect
    .poll(async () =>
      assetManifestOf(await readProtocolJson(architectPage)).some(
        (asset) => asset.name === TEST_IMAGE_NAME,
      ),
    )
    .toBe(true);

  await toolbar.undo();
  await expect(toolbar.button('redo')).toHaveAttribute(
    'aria-disabled',
    'false',
  );

  await fileInputOf(architectPage).setInputFiles(REFUSED_IMPORT);
  const errorDialog = architectPage.getByRole('dialog', {
    name: 'That file could not be added',
  });
  await expect(errorDialog).toBeVisible();
  await errorDialog.getByTestId('dialog-primary').click();
  await expect(errorDialog).toHaveCount(0);

  // The refusal used to clear the redo stack before recording itself, so the
  // resource the researcher had just undone became unrecoverable.
  await expect(toolbar.button('redo')).toHaveAttribute(
    'aria-disabled',
    'false',
  );
  await toolbar.redo();
  await expect
    .poll(async () =>
      assetManifestOf(await readProtocolJson(architectPage)).some(
        (asset) => asset.name === TEST_IMAGE_NAME,
      ),
    )
    .toBe(true);
});

test('dismissing an import error returns focus to the upload control', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/assets');

  const dropzone = uploadControl(architectPage);

  // Drive the real keyboard path — focus the control and activate it — so the
  // control genuinely holds focus when the import starts. `setInputFiles` on
  // the hidden input moves no focus, and would let this pass while the path a
  // researcher actually takes still lost it.
  await dropzone.focus();
  await expect(dropzone).toBeFocused();
  const chooser = architectPage.waitForEvent('filechooser');
  await dropzone.press('Enter');
  await (await chooser).setFiles(REFUSED_IMPORT);

  const errorDialog = architectPage.getByRole('dialog', {
    name: 'That file could not be added',
  });
  await expect(errorDialog).toBeVisible();
  await errorDialog.getByTestId('dialog-primary').click();
  await expect(errorDialog).toHaveCount(0);

  await expect(dropzone).toBeFocused();
  // And it is still a tab stop: focus that lands on an element the browser has
  // taken out of the tab order is focus the next Tab cannot recover.
  await expect(dropzone).toHaveAttribute('tabindex', '0');
});

test('an import error dismissed from a drop returns focus to the upload control', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/assets');

  const dropzone = uploadControl(architectPage);
  // A file dropped onto the page activates nothing, so the dialog has no
  // opener to return to — the case that left focus on `<body>` and made the
  // next Tab restart at the page header.
  await architectPage.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await expect
    .poll(() =>
      architectPage.evaluate(() => document.activeElement?.tagName ?? 'NONE'),
    )
    .toBe('BODY');

  await fileInputOf(architectPage).setInputFiles(REFUSED_IMPORT);

  const errorDialog = architectPage.getByRole('dialog', {
    name: 'That file could not be added',
  });
  await expect(errorDialog).toBeVisible();
  await errorDialog.getByTestId('dialog-primary').click();
  await expect(errorDialog).toHaveCount(0);

  await expect(dropzone).toBeFocused();
  await expect(dropzone).toHaveAttribute('tabindex', '0');
});

test('two resources with the same filename are told apart', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });
  await architectPage.goto('/protocol/assets');

  const roster = (rows: string) => ({
    name: 'people.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(rows),
  });

  await fileInputOf(architectPage).setInputFiles(
    roster('name,age\nAda,36\nGrace,45\n'),
  );
  const assetList = architectPage.getByRole('listbox', {
    name: 'Resource library',
  });
  await expect(
    assetList.getByRole('heading', {
      level: 4,
      name: 'people.csv',
      exact: true,
    }),
  ).toBeVisible();

  await fileInputOf(architectPage).setInputFiles(
    roster('name,age\nAlan,41\nKatherine,52\n'),
  );

  // Both cards are on screen, and nothing about them reads the same: the
  // heading, and the accessible name of every action on the card.
  await expect(
    assetList.getByRole('heading', {
      level: 4,
      name: 'people.csv',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    assetList.getByRole('heading', {
      level: 4,
      name: 'people (2).csv',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    architectPage.getByRole('button', {
      name: 'Delete people.csv',
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    architectPage.getByRole('button', {
      name: 'Delete people (2).csv',
      exact: true,
    }),
  ).toHaveCount(1);

  // The disambiguation is for reading only: the protocol still records the
  // filenames the researcher chose, so nothing they never typed is saved,
  // exported, or handed to Interviewer.
  const stored = assetManifestOf(await readProtocolJson(architectPage))
    .map((asset) => asset.name)
    .filter((name) => name.startsWith('people'));
  expect(stored).toEqual(['people.csv', 'people.csv']);
});
