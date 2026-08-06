import { expect, type Locator, type Page } from '@playwright/test';

// Resource Browser interactions (AssetBrowser/*). Facts verified against
// source:
// - The dialog ('Resource Browser') opens from any resource-picker field's
//   'Select resource' / 'Update resource' button and has no confirm button —
//   selection is single-click and closes the dialog.
// - The dropzone is `role="button" aria-label="Upload file"` wrapping
//   react-dropzone's hidden single-file input (resources.spec.ts precedent).
//   Uploading exactly one valid file auto-selects the new asset into the
//   opening field and closes the browser (AssetBrowser.tsx handleCreate →
//   File.tsx handleSelectAsset). The manifest entry is
//   `{ id: uuid(), type: <by extension>, name: file.name, source: file.name }`.
// - When opened from a typed field (image/video/audio) the library is
//   pre-filtered to that type.
export async function openResourceBrowser(field: Locator): Promise<Locator> {
  const page = field.page();
  await field
    .getByRole('button', { name: /^(Select|Update) resource$/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Resource Browser' });
  await expect(dialog).toBeVisible();
  return dialog;
}

// Upload a file through the open Resource Browser's dropzone. The browser
// auto-selects the uploaded asset and closes itself; callers should assert
// on the opening field afterwards (e.g. the button flipping to
// 'Update resource').
export async function uploadIntoResourceBrowser(
  page: Page,
  filePath: string,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Resource Browser' });
  await dialog
    .getByRole('button', { name: 'Upload file' })
    .locator('input[type="file"]')
    .setInputFiles(filePath);
  await expect(dialog).toBeHidden();
}

// Select an already-uploaded asset by its display name (heading click —
// data-source.ts precedent).
export async function pickResource(
  page: Page,
  assetName: string,
): Promise<void> {
  await page
    .getByRole('dialog', { name: 'Resource Browser' })
    .getByRole('listbox', { name: 'Resource library' })
    .getByRole('heading', { level: 4, name: assetName, exact: true })
    .click();
}
