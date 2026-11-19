import type { Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readProtocolJson, readStageJson } from '../../helpers/read-store.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';
import { Timeline } from '../../pageobjects/timeline.js';

// The page is ONE rich text: a heading is a heading in it, and each image,
// audio recording or video is a block in it, saved as a markdown image whose
// address names a protocol resource (`![alt](asset:<id>?size=medium)`).

/**
 * The page's editor. Its field is named for its section ("Page content"); the
 * toolbar above it formats the text and inserts media.
 */
const pageEditor = (page: Page) =>
  page.getByRole('textbox', { name: 'Page content' });

/**
 * Types a heading, then a paragraph, as a researcher does: `# ` opens a
 * heading through the editor's own input rule, and the words go in as
 * insertions so that nothing in them is read as markdown shorthand.
 */
async function writeHeadingAndText(
  page: Page,
  heading: string,
  text: string,
): Promise<void> {
  const editor = pageEditor(page);
  await expect(editor).toBeEditable();
  await editor.click();
  await page.keyboard.type('# ');
  await page.keyboard.insertText(heading);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText(text);
}

/** The English text the stage committed, once it holds `fragment`. */
function pageText(stage: unknown): string | undefined {
  if (typeof stage !== 'object' || stage === null) return undefined;
  const content: unknown = Reflect.get(stage, 'content');
  if (typeof content !== 'object' || content === null) return undefined;
  const english: unknown = Reflect.get(content, 'en');
  return typeof english === 'string' ? english : undefined;
}

test('creates a valid Information stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Information');
  await editor.setStageName('About This Study');

  await writeHeadingAndText(
    architectPage,
    'Welcome',
    'Thanks for taking part.',
  );

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Information');
  expect(pageText(stage)).toBe('# Welcome\n\nThanks for taking part.');
  // `stageSnapshotJson` (helpers/normalize-stage.ts) normalizes generated ids
  // AND serializes to the exact string `toMatchSnapshot`'s file-snapshot mode
  // needs — see that function's comment for why a bare `normalizeStage(...)`
  // object or a plain `JSON.stringify` (no trailing newline) both break here.
  // This is the pattern every other interface spec should copy.
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'information-stage.json',
  );
});

const PHOTO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">
  <rect width="80" height="80" fill="#6ecae8" />
</svg>`;

const PHOTO_ASSET = {
  'photo-asset': {
    name: 'photo.svg',
    type: 'image' as const,
    source: 'photo.svg',
  },
};

const withPage = (content: string): CurrentProtocol => ({
  ...emptyProtocol(),
  assetManifest: PHOTO_ASSET,
  stages: [
    {
      id: 'info-1',
      type: 'Information',
      label: { en: 'About This Study' },
      content: { en: content },
    },
    ...emptyProtocol().stages,
  ],
});

const seedOptions = {
  assets: [{ assetId: 'photo-asset', name: 'photo.svg', data: PHOTO_SVG }],
};

test('places an image in the text from the toolbar, with its settings', async ({
  architectPage,
  seed,
}) => {
  await seed({ ...emptyProtocol(), assetManifest: PHOTO_ASSET }, seedOptions);
  await gotoProtocol(architectPage);
  const editor = new StageEditor(architectPage);
  await editor.createNew('Information');
  await editor.setStageName('About This Study');
  await writeHeadingAndText(architectPage, 'Welcome', 'Look at this.');

  await editor
    .section('Page content')
    .getByRole('button', { name: 'Insert image', exact: true })
    .click();
  // The browser is titled for the kind the field accepts, and each stored
  // resource is a button named for its own file; choosing one closes it.
  const resourceBrowser = architectPage.getByRole('dialog', {
    name: 'Choose an image',
  });
  await expect(resourceBrowser).toBeVisible();
  await resourceBrowser
    .getByRole('button', { name: 'photo.svg', exact: true })
    .click();
  await expect(resourceBrowser).toBeHidden();

  // Selecting the block shows its settings below it. An image has a size and a
  // description, and no playback. With no description yet, it is named for its
  // file.
  await pageEditor(architectPage)
    .getByRole('img', { name: 'photo.svg' })
    .click();
  await architectPage
    .getByLabel('Description', { exact: true })
    .fill('A photo');
  await architectPage
    .getByRole('group', { name: 'Display size' })
    .getByText('Medium', { exact: true })
    .click();
  await expect(
    architectPage.getByLabel('Start playing automatically'),
  ).toHaveCount(0);

  await editor.save();

  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').includes('asset:photo-asset'),
  );
  expect(pageText(stage)).toBe(
    '# Welcome\n\nLook at this.\n\n![A photo](asset:photo-asset?size=medium)',
  );
});

test('takes a placed image out of the text without deleting the resource', async ({
  architectPage,
  seed,
}) => {
  await seed(
    withPage('# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.'),
    seedOptions,
  );
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');

  // Clicking a block selects it and shows its settings.
  await pageEditor(architectPage).getByRole('img', { name: 'A photo' }).click();
  await architectPage
    .getByRole('button', { name: 'Remove from the text', exact: true })
    .click();
  await expect(
    pageEditor(architectPage).getByRole('img', { name: 'A photo' }),
  ).toHaveCount(0);

  await new StageEditor(architectPage).save();

  const stage = await readStageJson(
    architectPage,
    0,
    (saved) => !(pageText(saved) ?? '').includes('asset:'),
  );
  expect(pageText(stage)).toBe('# Welcome\n\nBye.');
  // The file stays among the protocol's resources.
  const protocol = await readProtocolJson(architectPage);
  expect(Object.keys(protocol.assetManifest ?? {})).toContain('photo-asset');
});

test('keeps a placed image, byte for byte, through an edit of the text around it', async ({
  architectPage,
  seed,
}) => {
  const block = '![A photo](asset:photo-asset?size=large&align=end)';
  await seed(withPage(`# Welcome\n\n${block}\n\nBye`), seedOptions);
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');

  // The caret goes to the end of the last paragraph, after the block.
  await pageEditor(architectPage).locator('p').last().click();
  await architectPage.keyboard.press('End');
  await architectPage.keyboard.insertText('!');
  await new StageEditor(architectPage).save();

  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').endsWith('Bye!'),
  );
  expect(pageText(stage)).toBe(`# Welcome\n\n${block}\n\nBye!`);
});
