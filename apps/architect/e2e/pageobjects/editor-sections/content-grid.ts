import { expect, type Locator, type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import { pickResource, uploadIntoResourceBrowser } from './asset-upload.js';

// The Information stage's `items` field is `@codaco/protocol-builder`'s shared
// page section (`sections/page-content/PageContentSection.tsx`, `page`
// variant) given the content-block editor
// (`sections/content-blocks/ContentBlockEditor.tsx`). The list adds a block
// through "Create new content block"; the dialog that opens is titled "Create
// content block" for a new one and "Edit content block" for one that already
// exists; its content-type radios are 'Image' / 'Video' / 'Audio' / 'Text';
// the Content field mounts once a type is chosen; a media block also offers an
// optional "Description"; and 'Display size' radios ('Full size' / 'Small' /
// 'Medium' / 'Large') render for image/video on this stage only — 'Full size'
// writes no `size` key. Saved blocks are `{ id, content, type: 'text' |
// 'asset' }` (+ `size`, + `description`), in add order.
//
// Which resource picker a media block gets is the block's own kind, and the
// picker names that kind on every control it offers, so the words below are
// per kind rather than generic.
const RESOURCE_COPY = {
  Image: {
    select: 'Select an image',
    change: 'Change the image',
    browser: 'Choose an image',
  },
  Video: {
    select: 'Select a video',
    change: 'Change the video',
    browser: 'Choose a video',
  },
} as const;

// Open the block dialog and wait for its form to hold the FRESH draft: a new
// block has no content type, so the per-type Content field must be absent
// before the type radio is clicked. Without this guard, back-to-back adds can
// race the form reinitialize and submit a second block carrying the previous
// block's id — the app then rejects the whole stage commit with a duplicate-id
// refusal (observed live).
async function openFreshItemDialog(
  editor: StageEditor,
  page: Page,
): Promise<Locator> {
  const dialog = page.getByRole('dialog', { name: 'Create content block' });
  const create = editor
    .field('items')
    .getByRole('button', { name: 'Create new content block', exact: true });
  await create.click();
  await expect(dialog).toBeVisible();
  // A fresh block has no type, so no per-type content control: the editor
  // keeps each kind's draft in a slot of its own (`contentText`,
  // `contentImage`, `contentAudio`, `contentVideo`), and none of them is
  // mounted until a kind is chosen. On a stale reopen, cancel — the full close
  // cycle forces the unmount that destroys the form — and try once more.
  const contentField = dialog.locator('[data-field-name^="content"]');
  try {
    await expect(contentField).toBeHidden({ timeout: 3_000 });
  } catch {
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await cancel.click();
    await dialog.waitFor({ state: 'detached' });
    await create.click();
    await expect(dialog).toBeVisible();
    await expect(contentField).toBeHidden();
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
    // Upload at first use (a staged import auto-selects and closes the
    // browser) or select an already-uploaded resource by display name.
    source: { upload: string } | { select: string };
    size?: 'Small' | 'Medium' | 'Large';
  },
): Promise<void> {
  const dialog = await openFreshItemDialog(editor, page);
  await dialog.getByRole('radio', { name: opts.kind, exact: true }).click();
  const resource = RESOURCE_COPY[opts.kind];
  // The field-level accessible name stays "Content" whichever kind is chosen,
  // even though the editor keeps a separate draft slot per kind.
  await dialog
    .getByRole('button', { name: resource.select, exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: resource.browser }),
  ).toBeVisible();
  if ('upload' in opts.source) {
    await uploadIntoResourceBrowser(page, opts.source.upload);
  } else {
    await pickResource(page, opts.source.select);
  }
  // The browser closes on selection; the picker button flips once the field
  // value commits.
  await expect(
    dialog.getByRole('button', { name: resource.change, exact: true }),
  ).toBeVisible();
  if (opts.size) {
    await dialog.getByRole('radio', { name: opts.size, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
}
