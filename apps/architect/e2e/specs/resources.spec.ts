import path from 'node:path';

import { expect, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { readProtocolJson } from '../helpers/read-store.js';

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
  // waiting past the 600ms autosave debounce (protocolLibraryListener.ts)
  // lets any (regression) erroneous delete's write land in IndexedDB before
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
});
