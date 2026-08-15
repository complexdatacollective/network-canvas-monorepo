import { expect, type Locator, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { pickResource, uploadIntoResourceBrowser } from './asset-upload.js';

// Information stage Items (sections/ContentGrid/*). The item dialog is
// titled 'Edit Item' for both new and edit; its type radios are 'Image' /
// 'Video' / 'Audio' / 'Text' (ContentGrid/options.tsx), the Content section
// mounts once a type is chosen, and 'Display size' radios ('Full size' /
// 'Small' / 'Medium' / 'Large') render for image/video only — 'Full size'
// writes no `size` key (normalizeType drops the '' value). Saved items are
// `{ id, content, type: 'text' | 'asset' }` (+ `size`), in add order.
// Open the item dialog and wait for the shared `editable-list-form` to hold
// the FRESH draft: a new item has no `type`, so the Content section must be
// absent before the type radio is clicked. Without this guard, back-to-back
// item adds can race the form reinitialize and submit a second item carrying
// the previous item's id — the app then rejects the whole stage commit with
// "Items contain duplicate ID" (observed live).
async function openFreshItemDialog(
  editor: StageEditor,
  page: Page,
): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Edit Item' });
  const create = editor
    .section('Items')
    .getByRole('button', { name: 'Create new content item', exact: true });
  await create.click();
  await expect(dialog).toBeVisible();
  // A fresh item has no `type`, so no Content section. On a stale reopen,
  // cancel — the full close cycle forces the unmount that destroys the
  // shared form — and try once more.
  const contentSection = dialog.locator('section[data-name="Content"]');
  try {
    await expect(contentSection).toBeHidden({ timeout: 3_000 });
  } catch {
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await cancel.click();
    await dialog.waitFor({ state: 'detached' });
    await create.click();
    await expect(dialog).toBeVisible();
    await expect(contentSection).toBeHidden();
  }
  return dialog;
}

export async function addTextItem(
  editor: StageEditor,
  page: Page,
  markdown: string,
): Promise<void> {
  const dialog = await openFreshItemDialog(editor, page);
  await dialog.getByRole('radio', { name: 'Text', exact: true }).click();
  await editor.fillRichTextMarkdown('Content', markdown);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  // Full unmount, not just hidden — see openFreshItemDialog: the dialog form
  // never reinitializes while mounted, so the next open must remount it.
  await dialog.waitFor({ state: 'detached' });
}

export async function addAssetItem(
  editor: StageEditor,
  page: Page,
  opts: {
    kind: 'Image' | 'Video';
    // Upload at first use (single upload auto-selects and closes the
    // browser) or select an already-uploaded asset by display name.
    source: { upload: string } | { select: string };
    size?: 'Small' | 'Medium' | 'Large';
  },
): Promise<void> {
  const dialog = await openFreshItemDialog(editor, page);
  await dialog.getByRole('radio', { name: opts.kind, exact: true }).click();
  // Scoped by the Content section, not by the content field's NAME: the item
  // editor keeps a separate draft field per content type
  // (ContentGrid/itemTypes.ts `CONTENT_SLOT_NAMES`), so `data-field-name`
  // varies with the chosen type. The section is the stable handle.
  const contentSection = dialog.locator('section[data-name="Content"]');
  await contentSection.getByRole('button', { name: 'Select resource' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Resource Browser' }),
  ).toBeVisible();
  if ('upload' in opts.source) {
    await uploadIntoResourceBrowser(page, opts.source.upload);
  } else {
    await pickResource(page, opts.source.select);
  }
  // The browser closes on selection; the picker button flips once the field
  // value commits.
  await expect(
    contentSection.getByRole('button', { name: 'Update resource' }),
  ).toBeVisible();
  if (opts.size) {
    await dialog.getByRole('radio', { name: opts.size, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}
