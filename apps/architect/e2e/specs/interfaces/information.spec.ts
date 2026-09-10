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

  const pageContent = editor.section('Page content');

  // The page heading and the blocks are one section (protocol-builder's
  // `sections/page-content/PageContentSection.tsx`, the `page` variant). The
  // heading is UI-required even though the schema marks `title` optional.
  await pageContent
    .locator('[data-field-name="title"]')
    .getByRole('textbox')
    .fill('Welcome');

  // The add button names what it adds, so it needs no section scoping to be
  // unambiguous — the whole point of #1391's rename.
  await pageContent
    .getByRole('button', { name: 'Create new content block', exact: true })
    .click();

  // The block dialog is a page-level portal (protocol-builder's
  // `form/rowDialog.tsx` -> `DialogForm` -> fresco-ui `Dialog`), not nested
  // under the section's DOM, so its controls are queried on the page directly.
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

// What one committed block holds, by its id. `undefined` for a block that is
// not there, or whose `content` is not a string — both of which a poll
// predicate reads as "not what this test wrote", so it keeps waiting or lets
// the assertion below say what did arrive.
function informationItemContent(
  stage: unknown,
  id: string,
): string | undefined {
  const items = informationItems(stage);
  if (!Array.isArray(items)) return undefined;
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    if (Reflect.get(item, 'id') !== id) continue;
    const content: unknown = Reflect.get(item, 'content');
    return typeof content === 'string' ? content : undefined;
  }
  return undefined;
}

const openItemDialog = async (
  editor: StageEditor,
  page: Page,
  position: number,
) => {
  // Each row of the blocks list names its own affordances after the list's
  // noun ("block" — `pageItemNoun` in PageContentSection.tsx), so the row
  // buttons read "Edit block" / "Remove block" and the dialog they open is
  // titled for the row that already exists.
  await editor
    .field('items')
    .getByRole('button', { name: 'Edit block', exact: true })
    .nth(position)
    .click();
  const dialog = page.getByRole('dialog', { name: 'Edit content block' });
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

  // The editor is empty, and the asset id is nowhere in the Content field.
  const contentEditor = dialog.getByRole('textbox', { name: 'Content' });
  await expect(contentEditor).toBeEditable();
  await expect(contentEditor).toHaveText('');
  await expect(dialog).not.toContainText('photo-asset');

  // The save is REFUSED, visibly: it used to be swallowed with no error, no
  // invalid control and focus on <body> — and that silent attempt is what
  // wrote the asset id back into the form. The refusal is the block editor's
  // own sentence (`contentBlock.textRequired`), not the generic one.
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    dialog.getByText('Write the text this block shows.'),
  ).toBeVisible();
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

  const contentEditor = dialog.getByRole('textbox', { name: 'Content' });
  await expect(contentEditor).toHaveText('Original text body');
  await editor.fillRichText('Content', 'Original text body plus unsaved work');

  await dialog.getByRole('radio', { name: 'Image', exact: true }).click();
  // The resource picker names the kind it is choosing
  // (`resourceKinds.imageSelectAction`), so an image block's picker is the
  // only control that could be reading the text draft.
  await expect(
    dialog.getByRole('button', { name: 'Select an image', exact: true }),
  ).toBeVisible();

  await dialog.getByRole('radio', { name: 'Text', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Content' })).toHaveText(
    'Original text body plus unsaved work',
  );
});

// The per-type drafts are session state: the block editor gives each content
// type a slot of its own (`CONTENT_BLOCK_SLOTS` in
// `sections/content-blocks/contentBlockTypes.ts`), and the row dialog commits
// the row by writing the form store's DORMANT values through a lodash-style
// `set` before `collapseContentBlock` strips every slot and promotes the
// chosen type's one into `content`. That walk is why the slots carry flat
// names: a `content.text`-style name would be read as a path and replace the
// committed `content` STRING with an object. Only a real save exercises it, so
// this saves after leaving a diverged text draft behind.
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
  // Diverge the text slot from the value it registered with, so its dormant
  // entry is a real edit the row merge writes onto the row.
  await editor.fillRichText('Content', 'A text draft that must not be saved');

  await dialog.getByRole('radio', { name: 'Image', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Select an image', exact: true })
    .click();
  // The browser is titled for the kind the field accepts
  // (`resourceKinds.imageBrowserTitle`), and each stored resource is a button
  // named for its own file — selecting one closes the browser.
  const resourceBrowser = architectPage.getByRole('dialog', {
    name: 'Choose an image',
  });
  await expect(resourceBrowser).toBeVisible();
  await resourceBrowser
    .getByRole('button', { name: 'photo.svg', exact: true })
    .click();
  await expect(
    dialog.getByRole('button', { name: 'Change the image', exact: true }),
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await editor.save();

  // The predicate is the WAIT for the commit, not the judgement of it: the
  // stage is seeded, so `readStageJson`'s existence check passes on the first
  // poll and would hand back the pre-save row. It asks whether the edited
  // block still holds the text the seed gave it — a question about that
  // block's own value, rather than about the order the app happens to write an
  // item's keys in, which is what the JSON substring this replaces depended
  // on. What the save actually produced is judged by the assertion below, so a
  // commit that got it wrong fails with a diff instead of a bare poll timeout.
  const stage = await readStageJson(
    architectPage,
    0,
    (saved) =>
      informationItemContent(saved, 'item-text') !== 'Original text body',
  );
  expect(informationItems(stage)).toEqual([
    { id: 'item-image', type: 'asset', content: 'photo-asset' },
    { id: 'item-text', type: 'asset', content: 'photo-asset' },
  ]);
});
