import type { Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';
import { Timeline } from '../../pageobjects/timeline.js';

test('creates a valid Information stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Information');
  await editor.setStageName('About This Study');

  // Title.tsx's Page Heading field: `data-field-name="title"` wraps a plain
  // `<input>` (fresco-ui InputField), UI-required even though the schema
  // marks `title` optional (Title.tsx's `validation={{ required: true }}`).
  await editor.field('title').getByRole('textbox').fill('Welcome');

  // The add button names what it adds, so it needs no section scoping to be
  // unambiguous — the whole point of #1391's rename.
  await architectPage
    .getByRole('button', { name: 'Create new content item', exact: true })
    .click();

  // The item dialog is a top-level Dialog (not nested under the Items
  // section's DOM), so its controls are queried on the page directly —
  // matching timeline.spec.ts's already-verified "insert stage" flow.
  await architectPage.getByRole('radio', { name: 'Text' }).click();
  await editor.fillRichText('Content', 'Thanks for taking part.');
  // `exact` avoids matching the RichTextEditor toolbar's "Add link" button
  // (timeline.spec.ts hit this same ambiguity).
  await architectPage.getByRole('button', { name: 'Add', exact: true }).click();

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Information');
  // `stageSnapshotJson` (helpers/normalize-stage.ts) normalizes generated ids
  // AND serializes to the exact string `toMatchSnapshot`'s file-snapshot mode
  // needs — see that function's comment for why a bare `normalizeStage(...)`
  // object or a plain `JSON.stringify` (no trailing newline) both break here.
  // This is the pattern every other interface spec should copy.
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'information-stage.json',
  );
});

// A saved image item plus the asset it points at, so the item dialog opens on
// a real resolved image rather than a dangling reference.
const INFORMATION_WITH_IMAGE_ITEM = (): CurrentProtocol => ({
  ...emptyProtocol(),
  assetManifest: {
    'photo-asset': {
      name: 'photo.svg',
      type: 'image',
      source: 'photo.svg',
    },
  },
  stages: [
    {
      id: 'info-1',
      type: 'Information',
      label: 'About This Study',
      title: 'Welcome',
      items: [
        { id: 'item-image', type: 'asset', content: 'photo-asset' },
        { id: 'item-text', type: 'text', content: 'Original text body' },
      ],
    },
  ],
});

const PHOTO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
  <rect width="80" height="80" fill="#6ecae8" />
</svg>`;

// `readStageJson` returns the whole Stage union, which has no `items` on
// every member. Narrow at runtime rather than asserting, so a stage that
// somehow committed without items fails loudly here instead of comparing
// `undefined` against the expected rows.
function informationItems(stage: unknown): unknown {
  if (typeof stage !== 'object' || stage === null || !('items' in stage)) {
    throw new Error('committed Information stage has no items');
  }
  return stage.items;
}

const openItemDialog = async (
  editor: StageEditor,
  page: Page,
  position: number,
) => {
  await editor
    .section('Items')
    .getByRole('button', { name: 'Edit item' })
    .nth(position)
    .click();
  const dialog = page.getByRole('dialog', { name: 'Edit Item' });
  await expect(dialog).toBeVisible();
  return dialog;
};

// #1393. Changing an item's content type used to hand the outgoing type's
// value to the incoming control: an image asset's id appeared in the rich text
// editor and, on the second save, became the text a participant reads.
test('never turns an image item into its own asset id as participant text', async ({
  architectPage,
  seed,
}) => {
  await seed(INFORMATION_WITH_IMAGE_ITEM(), {
    assets: [{ assetId: 'photo-asset', name: 'photo.svg', data: PHOTO_SVG }],
  });
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');

  const editor = new StageEditor(architectPage);
  const dialog = await openItemDialog(editor, architectPage, 0);

  await dialog.getByRole('radio', { name: 'Text', exact: true }).click();

  // The editor is empty, and the asset id is nowhere in the Content section.
  const contentSection = dialog.locator('section[data-name="Content"]');
  const contentEditor = contentSection.getByRole('textbox');
  await expect(contentEditor).toBeEditable();
  await expect(contentEditor).toHaveText('');
  await expect(contentSection).not.toContainText('photo-asset');

  // The save is REFUSED, visibly: it used to be swallowed with no error, no
  // invalid control and focus on <body> — and that silent attempt is what
  // wrote the asset id back into the form.
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText('This field is required.')).toBeVisible();
  await expect(contentEditor).toHaveAttribute('aria-invalid', 'true');
  await expect(contentEditor).toBeFocused();

  await editor.fillRichText('Content', 'Prose the researcher actually typed');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await editor.save();

  const stage = await readStageJson(architectPage, 0, (saved) =>
    JSON.stringify(saved).includes('actually typed'),
  );
  expect(informationItems(stage)).toEqual([
    {
      id: 'item-image',
      type: 'text',
      content: 'Prose the researcher actually typed',
    },
    { id: 'item-text', type: 'text', content: 'Original text body' },
  ]);
});

test('keeps an unsaved text draft across a round trip through Image', async ({
  architectPage,
  seed,
}) => {
  await seed(INFORMATION_WITH_IMAGE_ITEM(), {
    assets: [{ assetId: 'photo-asset', name: 'photo.svg', data: PHOTO_SVG }],
  });
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');

  const editor = new StageEditor(architectPage);
  const dialog = await openItemDialog(editor, architectPage, 1);

  const contentEditor = dialog
    .locator('section[data-name="Content"]')
    .getByRole('textbox');
  await expect(contentEditor).toHaveText('Original text body');
  await editor.fillRichText('Content', 'Original text body plus unsaved work');

  await dialog.getByRole('radio', { name: 'Image', exact: true }).click();
  await expect(
    dialog
      .locator('section[data-name="Content"]')
      .getByRole('button', { name: 'Select resource' }),
  ).toBeVisible();

  await dialog.getByRole('radio', { name: 'Text', exact: true }).click();
  await expect(
    dialog.locator('section[data-name="Content"]').getByRole('textbox'),
  ).toHaveText('Original text body plus unsaved work');
});

// The per-type drafts are session state, and the row is committed by
// `DialogArrayField`'s `mergeEditedRow`, which walks the form store's DORMANT
// values through lodash-style `set`/`unset` before `normalizeType` runs. That
// walk is why the slots carry flat names: a `content.text`-style name would be
// read as a path and replace the committed `content` STRING with an object.
// Only a real save exercises it, so this saves after leaving a diverged text
// draft behind.
test('drops a text draft left behind by a switch to Image', async ({
  architectPage,
  seed,
}) => {
  await seed(INFORMATION_WITH_IMAGE_ITEM(), {
    assets: [{ assetId: 'photo-asset', name: 'photo.svg', data: PHOTO_SVG }],
  });
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');

  const editor = new StageEditor(architectPage);
  const dialog = await openItemDialog(editor, architectPage, 1);
  const contentSection = dialog.locator('section[data-name="Content"]');

  // Diverge the text slot from the value it registered with, so its dormant
  // entry is a real edit that `mergeEditedRow` writes onto the row.
  await editor.fillRichText('Content', 'A text draft that must not be saved');

  await dialog.getByRole('radio', { name: 'Image', exact: true }).click();
  await contentSection.getByRole('button', { name: 'Select resource' }).click();
  await expect(
    architectPage.getByRole('dialog', { name: 'Resource Browser' }),
  ).toBeVisible();
  await architectPage
    .getByRole('dialog', { name: 'Resource Browser' })
    .getByText('photo.svg')
    .click();
  await expect(
    contentSection.getByRole('button', { name: 'Update resource' }),
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await editor.save();

  const stage = await readStageJson(architectPage, 0, (saved) =>
    JSON.stringify(saved).includes('"item-text","type":"asset"'),
  );
  expect(informationItems(stage)).toEqual([
    { id: 'item-image', type: 'asset', content: 'photo-asset' },
    { id: 'item-text', type: 'asset', content: 'photo-asset' },
  ]);
});
