import type { Locator, Page } from '@playwright/test';

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
 * The page's editor: the "Rich Text" field of the "Content" section. The
 * toolbar above it formats the text and inserts media.
 */
const pageEditor = (page: Page) =>
  page.getByRole('textbox', { name: 'Rich Text' });

/**
 * What changes how a selected image shows. It stands over the page beside the
 * image, and is there only while the image is selected and the researcher is
 * in the field.
 */
const imageSettings = (page: Page) =>
  page.getByRole('dialog', { name: 'Image settings' });

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

const GARDEN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80">
  <rect width="120" height="80" fill="#8fd18f" />
</svg>`;

const PHOTO_ASSET = {
  'photo-asset': {
    name: 'photo.svg',
    type: 'image' as const,
    source: 'photo.svg',
  },
};

// A second image, a recording and a video, for a page with more than one kind
// of file, or more than one file to choose between.
const MORE_ASSETS = {
  'garden-asset': {
    name: 'garden.svg',
    type: 'image' as const,
    source: 'garden.svg',
  },
  'clip-asset': {
    name: 'clip.mp4',
    type: 'video' as const,
    source: 'clip.mp4',
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

/** `seedOptions`, with each file stored as the kind it is, so it is drawn. */
const drawnSeedOptions = {
  assets: [
    {
      assetId: 'photo-asset',
      name: 'photo.svg',
      data: PHOTO_SVG,
      mediaType: 'image/svg+xml',
    },
    {
      assetId: 'garden-asset',
      name: 'garden.svg',
      data: GARDEN_SVG,
      mediaType: 'image/svg+xml',
    },
    { assetId: 'clip-asset', name: 'clip.mp4', data: 'not a video' },
  ],
};

/** `withPage`, with the further files of `MORE_ASSETS` among its resources. */
const withPageAndFiles = (content: string): CurrentProtocol => {
  const protocol = withPage(content);
  return {
    ...protocol,
    assetManifest: { ...protocol.assetManifest, ...MORE_ASSETS },
  };
};

/** The block, of all a page's text holds, that is the image named `name`. */
const blockOf = (page: Page, name: string) =>
  pageEditor(page)
    .locator('[data-asset-block]')
    .filter({ has: page.getByRole('img', { name, exact: true }) });

/**
 * Saves the stage from the text, as a researcher does once a block is done
 * with: the caret back in the text takes the block's settings off the page.
 */
async function saveFromText(page: Page, paragraph: string): Promise<void> {
  await pageEditor(page).locator('p', { hasText: paragraph }).click();
  await expect(page.getByRole('dialog', { name: /settings$/ })).toHaveCount(0);
  await new StageEditor(page).save();
}

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
    .section('Content')
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

  // The image just placed is selected, which shows its settings beside it. An
  // image has a size and a description, and no playback. With no description
  // yet, it is named for its file.
  await expect(
    pageEditor(architectPage).getByRole('img', { name: 'photo.svg' }),
  ).toBeVisible();
  const settings = imageSettings(architectPage);
  await expect(settings).toBeVisible();
  await settings.getByLabel('Description', { exact: true }).fill('A photo');
  await settings
    .getByRole('group', { name: 'Display size' })
    .getByText('Medium', { exact: true })
    .click();
  await expect(settings.getByLabel('Start playing automatically')).toHaveCount(
    0,
  );

  await editor.save();

  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').includes('asset:photo-asset'),
  );
  expect(pageText(stage)).toBe(
    '# Welcome\n\nLook at this.\n\n![A photo](asset:photo-asset?size=medium)',
  );
});

test('deletes a placed image from the text, keeping its file among the resources', async ({
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
  await imageSettings(architectPage)
    .getByRole('button', { name: 'Delete', exact: true })
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

test('shows an image\u2019s settings only while it is selected and the researcher is in the field', async ({
  architectPage,
  seed,
}) => {
  await seed(
    withPage('# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.'),
    seedOptions,
  );
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');
  const settings = imageSettings(architectPage);
  const description = settings.getByLabel('Description', { exact: true });
  await expect(pageEditor(architectPage)).toBeEditable();
  await expect(settings).toBeHidden();

  // Selecting the image shows them, and leaves the keyboard in the text.
  await pageEditor(architectPage).getByRole('img', { name: 'A photo' }).click();
  await expect(settings).toBeVisible();
  await expect(pageEditor(architectPage)).toBeFocused();

  // Enter goes into them; Escape comes back to the image, still selected.
  await architectPage.keyboard.press('Enter');
  await expect(description).toBeFocused();
  await architectPage.keyboard.press('Escape');
  await expect(pageEditor(architectPage)).toBeFocused();
  await expect(settings).toBeVisible();

  // The caret going into the text takes them away.
  await pageEditor(architectPage).locator('p', { hasText: 'Bye.' }).click();
  await expect(settings).toBeHidden();

  // And so does leaving the field with the image still selected.
  await pageEditor(architectPage).getByRole('img', { name: 'A photo' }).click();
  await expect(settings).toBeVisible();
  await architectPage.getByRole('textbox', { name: 'Stage name' }).focus();
  await expect(settings).toBeHidden();
});

test('resizes an image by dragging its corner, a size at a time', async ({
  architectPage,
  seed,
}) => {
  await seed(
    withPage('# Welcome\n\n![A photo](asset:photo-asset?size=large)\n\nBye.'),
    // Stored as the image it is, so that the picture is drawn: a picture that
    // cannot be drawn has no corner to take hold of.
    drawnSeedOptions,
  );
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');
  const image = pageEditor(architectPage).getByRole('img', { name: 'A photo' });
  await image.click();
  const settings = imageSettings(architectPage);
  await expect(settings).toBeVisible();

  // The whole picture in view, so the pointer stays on the page as it goes.
  await image.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  const handle = await architectPage
    .locator('[data-asset-block-resize]')
    .boundingBox();
  if (handle === null) throw new Error('The corner is not drawn');
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;

  // The size follows how far the pointer has gone from where it took hold,
  // not where it is: a little way up is one size smaller, further is two.
  // (A square picture held to 60% of this 720px window is 432px tall; Medium
  // holds it to 384px and Small to 192px.)
  await architectPage.mouse.move(x, y);
  await architectPage.mouse.down();
  await architectPage.mouse.move(x, y - 60, { steps: 5 });
  // While it is dragged, the size it would take is named beside the corner,
  // and the settings stand aside.
  const pill = (name: string) =>
    pageEditor(architectPage).getByText(name, { exact: true });
  await expect(pill('Medium')).toBeVisible();
  await expect(settings).toBeHidden();
  await architectPage.mouse.move(x, y - 220, { steps: 10 });
  await expect(pill('Small')).toBeVisible();
  await architectPage.mouse.up();

  // Let go, the settings come back with the new size chosen.
  await expect(
    settings.getByRole('button', { name: 'Small', exact: true, pressed: true }),
  ).toBeVisible();

  await saveFromText(architectPage, 'Bye.');
  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').includes('size=small'),
  );
  expect(pageText(stage)).toBe(
    '# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.',
  );
});

// The corner is drawn on the outline of the selected block, at the bottom, on
// the side its picture grows towards: away from the side it is held against.
for (const [align, corner] of [
  ['start', 'right'],
  ['end', 'left'],
] as const) {
  test(`puts the resize corner on the bottom ${corner} of the outline of an image aligned to the ${align}`, async ({
    architectPage,
    seed,
  }) => {
    const address = `size=small&align=${align}`;
    await seed(
      withPage(`# Welcome\n\n![A photo](asset:photo-asset?${address})\n\nBye.`),
      drawnSeedOptions,
    );
    await gotoProtocol(architectPage);
    await new Timeline(architectPage).openStage('About This Study');
    await pageEditor(architectPage)
      .getByRole('img', { name: 'A photo' })
      .click();
    await expect(imageSettings(architectPage)).toBeVisible();
    const block = blockOf(architectPage, 'A photo');
    await expect(block).toHaveAttribute('data-selected', 'true');

    const handle = await architectPage
      .locator('[data-asset-block-resize]')
      .boundingBox();
    if (handle === null) throw new Error('The corner is not drawn');
    const outline = await block.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      // The outline's line runs half its width out from where it is offset.
      const out =
        Number.parseFloat(style.outlineOffset) +
        Number.parseFloat(style.outlineWidth) / 2;
      return {
        width: Number.parseFloat(style.outlineWidth),
        left: box.left - out,
        right: box.right + out,
        bottom: box.bottom + out,
      };
    });
    // An outline is drawn, or there is no line for the corner to sit on.
    expect(outline.width).toBeGreaterThan(0);
    const middle = {
      x: handle.x + handle.width / 2,
      y: handle.y + handle.height / 2,
    };
    expect(Math.abs(middle.y - outline.bottom)).toBeLessThanOrEqual(2);
    expect(Math.abs(middle.x - outline[corner])).toBeLessThanOrEqual(2);
  });
}

test('replaces the file of a placed image, keeping its settings', async ({
  architectPage,
  seed,
}) => {
  await seed(
    withPageAndFiles(
      '# Welcome\n\n![A photo](asset:photo-asset?size=small&align=end)\n\nBye.',
    ),
    drawnSeedOptions,
  );
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');
  await pageEditor(architectPage).getByRole('img', { name: 'A photo' }).click();
  const settings = imageSettings(architectPage);

  // The file the block shows, with the way to choose another.
  const file = settings.getByRole('group', { name: 'Image', exact: true });
  await expect(file.getByText('photo.svg', { exact: true })).toBeVisible();
  await file
    .getByRole('button', { name: 'Change the image', exact: true })
    .click();
  const resourceBrowser = architectPage.getByRole('dialog', {
    name: 'Choose an image',
  });
  await expect(resourceBrowser).toBeVisible();
  // The settings stand aside while the browser is open, and do not cover the
  // files in it.
  await expect(settings).toBeHidden();
  // Cancelled, they come back as they were, with the button that opened it.
  await resourceBrowser
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(resourceBrowser).toBeHidden();
  const change = file.getByRole('button', {
    name: 'Change the image',
    exact: true,
  });
  await expect(change).toBeFocused();
  await change.click();
  await expect(settings).toBeHidden();
  await resourceBrowser
    .getByRole('button', { name: 'garden.svg', exact: true })
    .click();
  await expect(resourceBrowser).toBeHidden();
  await expect(settings).toBeVisible();

  // The block, still selected, now shows the other file, under the same
  // description, size and alignment.
  await expect(file.getByText('garden.svg', { exact: true })).toBeVisible();
  await expect(settings.getByLabel('Description', { exact: true })).toHaveValue(
    'A photo',
  );
  await expect(
    settings.getByRole('button', { name: 'Small', exact: true, pressed: true }),
  ).toBeVisible();
  await expect(
    settings.getByRole('button', {
      name: 'Align to the end',
      exact: true,
      pressed: true,
    }),
  ).toBeVisible();

  await saveFromText(architectPage, 'Bye.');
  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').includes('asset:garden-asset'),
  );
  expect(pageText(stage)).toBe(
    '# Welcome\n\n![A photo](asset:garden-asset?size=small&align=end)\n\nBye.',
  );
});

test('marks a block that a selection of the text runs across, and outlines one selected by itself', async ({
  architectPage,
  seed,
}) => {
  await seed(
    withPage('# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.'),
    drawnSeedOptions,
  );
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');
  const block = blockOf(architectPage, 'A photo');
  await expect(pageEditor(architectPage)).toBeEditable();

  // Everything selected: the block is part of the selection, not selected on
  // its own, so it has no settings.
  await pageEditor(architectPage).locator('p', { hasText: 'Bye.' }).click();
  await expect(block).not.toHaveAttribute('data-in-selected-text');
  await architectPage.keyboard.press('ControlOrMeta+a');
  await expect(block).toHaveAttribute('data-in-selected-text', 'true');
  await expect(block).not.toHaveAttribute('data-selected');
  await expect(imageSettings(architectPage)).toHaveCount(0);

  // A caret in the text selects nothing.
  await pageEditor(architectPage).locator('p', { hasText: 'Bye.' }).click();
  await expect(block).not.toHaveAttribute('data-in-selected-text');

  // The block clicked is selected by itself: outlined, and not marked.
  await pageEditor(architectPage).getByRole('img', { name: 'A photo' }).click();
  await expect(block).toHaveAttribute('data-selected', 'true');
  await expect(block).not.toHaveAttribute('data-in-selected-text');
  expect(
    await block.evaluate(
      (element) => Number.parseFloat(getComputedStyle(element).outlineWidth),
      undefined,
    ),
  ).toBeGreaterThan(0);
});

test('shows each text style in the list of them as it is set in the text', async ({
  architectPage,
  seed,
}) => {
  await seed(withPage('# Welcome\n\nBye.'), seedOptions);
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');
  await pageEditor(architectPage).locator('p', { hasText: 'Bye.' }).click();
  await new StageEditor(architectPage)
    .section('Content')
    .getByRole('button', { name: /^Text style:\s*Paragraph$/ })
    .click();
  const fontSize = (name: string) =>
    architectPage
      .getByRole('menuitemradio', { name, exact: true })
      .getByText(name, { exact: true })
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
  const paragraph = await fontSize('Paragraph');
  const heading = await fontSize('Heading 1');
  expect(heading).toBeGreaterThan(paragraph);
  // The list's own button is not a sample: it is set as the toolbar is.
  const trigger = await new StageEditor(architectPage)
    .section('Content')
    .getByRole('button', { name: /^Text style:/ })
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).fontSize),
    );
  expect(trigger).toBeLessThan(heading);
});

test('reaches and uses Delete in a video’s settings in a short window', async ({
  architectPage,
  seed,
}) => {
  // Shorter than an ordinary window, so that the whole of a video's settings
  // cannot be seen at once (they can at 1280×720).
  await architectPage.setViewportSize({ width: 1280, height: 560 });
  await seed(
    withPageAndFiles(
      '# Welcome\n\n![A clip](asset:clip-asset?size=medium)\n\nBye.',
    ),
    drawnSeedOptions,
  );
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');
  const block = pageEditor(architectPage).locator('[data-asset-block]');
  await expect(block).toHaveCount(1);
  await block.click();
  const settings = architectPage.getByRole('dialog', {
    name: 'Video settings',
  });
  await expect(settings).toBeVisible();

  // The settings stay in the window, below the bar at its top (and below the
  // banner a browser tab shows over it), and scroll within themselves to what
  // does not fit.
  const box = await settings.boundingBox();
  const bars = await architectPage.evaluate(() => {
    // The app's bar, drawn inside the padding of the header that holds it.
    const top = document
      .querySelector('header')
      ?.firstElementChild?.getBoundingClientRect();
    if (top === undefined) throw new Error('No bar at the top');
    return { top: top.bottom, bottom: window.innerHeight };
  });
  if (box === null) throw new Error('Nothing is drawn');
  expect(box.y).toBeGreaterThanOrEqual(bars.top);
  expect(box.y + box.height).toBeLessThanOrEqual(bars.bottom);
  const remove = settings.getByRole('button', { name: 'Delete', exact: true });
  // Delete is out of sight, and the edge it is hidden behind fades, so that
  // there is evidently more.
  const hidden = await remove.evaluate(
    (element) =>
      new Promise<boolean>((resolve) => {
        new IntersectionObserver((entries, observer) => {
          observer.disconnect();
          resolve((entries[0]?.intersectionRatio ?? 0) < 1);
        }).observe(element);
      }),
  );
  expect(hidden).toBe(true);
  const fade = await settings
    .locator('.scroll-area-viewport')
    .evaluate((element) =>
      Number.parseFloat(getComputedStyle(element, '::after').height),
    );
  expect(fade).toBeGreaterThan(0);
  // Reached from the keyboard, it is scrolled into sight whole.
  await remove.focus();
  await expect(remove).toBeInViewport({ ratio: 1 });

  await remove.click();
  await expect(block).toHaveCount(0);
  await new StageEditor(architectPage).save();
  const stage = await readStageJson(
    architectPage,
    0,
    (saved) => !(pageText(saved) ?? '').includes('asset:'),
  );
  expect(pageText(stage)).toBe('# Welcome\n\nBye.');
});

/**
 * Scrolls the page so that the top of `block` is `top` pixels from the top of
 * the window.
 */
async function placeBlockAt(block: Locator, top: number): Promise<void> {
  await block.evaluate((element, wanted) => {
    let scroller: Element | null = element.parentElement;
    while (
      scroller !== null &&
      !(
        scroller.scrollHeight > scroller.clientHeight &&
        /auto|scroll/.test(getComputedStyle(scroller).overflowY)
      )
    ) {
      scroller = scroller.parentElement;
    }
    const target = scroller ?? document.scrollingElement;
    if (target === null) throw new Error('Nothing scrolls');
    target.scrollTop += element.getBoundingClientRect().top - wanted;
  }, top);
}

// A small image in a long page, at the top of the window (just under the
// app's bar), in the middle of it, and at the bottom of it: wherever it is,
// its settings are seen whole in a window of an ordinary size, with nothing
// of them scrolled out of sight.
for (const [where, top] of [
  ['top', 110],
  ['middle', 404],
  ['bottom', 1000 - 110 - 192],
] as const) {
  test(`shows the whole of an image’s settings at 1440×1000 with the image at the ${where} of the window`, async ({
    architectPage,
    seed,
  }) => {
    await architectPage.setViewportSize({ width: 1440, height: 1000 });
    const lines = (from: number) =>
      Array.from({ length: 20 }, (_, index) => `Line ${from + index}.`).join(
        '\n\n',
      );
    await seed(
      withPageAndFiles(
        `# Welcome\n\n${lines(1)}\n\n![A photo](asset:photo-asset?size=small)\n\n${lines(21)}`,
      ),
      drawnSeedOptions,
    );
    await gotoProtocol(architectPage);
    await new Timeline(architectPage).openStage('About This Study');
    const image = pageEditor(architectPage).getByRole('img', {
      name: 'A photo',
    });
    await image.click();
    const settings = imageSettings(architectPage);
    await expect(settings).toBeVisible();
    await placeBlockAt(blockOf(architectPage, 'A photo'), top);

    // Seen whole where they are, without scrolling the page or the settings.
    for (const part of [
      settings.getByLabel('Description', { exact: true }),
      settings.getByRole('group', { name: 'Display size' }),
      settings.getByRole('group', { name: 'Alignment' }),
      settings.getByRole('group', { name: 'Image', exact: true }),
      settings.getByRole('button', { name: 'Change the image', exact: true }),
      settings.getByRole('button', { name: 'Delete', exact: true }),
    ]) {
      await expect(part).toBeInViewport({ ratio: 1 });
    }
    // Nothing inside them holds more than it shows.
    expect(
      await settings.evaluate((element) =>
        [element, ...element.querySelectorAll('*')].some(
          (at) =>
            at.scrollHeight > at.clientHeight + 1 &&
            /auto|scroll/.test(getComputedStyle(at).overflowY),
        ),
      ),
    ).toBe(false);
  });
}

test('shows the whole page however long it is, with nothing of it scrolled out of sight inside the field', async ({
  architectPage,
  seed,
}) => {
  const lines = Array.from({ length: 80 }, (_, index) => `Line ${index + 1}.`);
  await seed(withPage(lines.join('\n\n')), seedOptions);
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');
  const field = pageEditor(architectPage);
  await expect(field.locator('p')).toHaveCount(80);

  // Taller than the window, so a limit on the field's height would bite.
  const viewport = architectPage.viewportSize();
  const box = await field.boundingBox();
  expect(box?.height).toBeGreaterThan(viewport?.height ?? Infinity);

  // Nothing from the text up to its section holds more than it shows: the
  // page as a whole scrolls, and no box within the field does.
  const holdingBack = await field.evaluate((element) => {
    const found: string[] = [];
    for (
      let at: Element | null = element;
      at !== null && at.tagName !== 'SECTION';
      at = at.parentElement
    ) {
      if (
        at.scrollHeight > at.clientHeight + 1 &&
        getComputedStyle(at).overflowY !== 'visible'
      ) {
        found.push(`${at.tagName.toLowerCase()}.${at.className}`);
      }
    }
    return found;
  });
  expect(holdingBack).toEqual([]);
});

// The toolbar holds more than one line of controls at most widths. Its groups
// break across lines, so a line is filled before the next begins, and the rule
// that marks where a group starts is drawn only between two controls.
for (const width of [1280, 1024, 820, 640, 480]) {
  test(`wraps the toolbar a control at a time at ${width}px, with no rule at either end of a line`, async ({
    architectPage,
    seed,
  }) => {
    await architectPage.setViewportSize({ width, height: 720 });
    await seed(withPage('# Welcome\n\nBye.'), seedOptions);
    await gotoProtocol(architectPage);
    await new Timeline(architectPage).openStage('About This Study');
    await expect(pageEditor(architectPage)).toBeEditable();
    const toolbar = new StageEditor(architectPage)
      .section('Content')
      .getByRole('toolbar');
    await expect(
      toolbar.getByRole('button', { name: 'Insert video', exact: true }),
    ).toBeVisible();

    const drawn = await toolbar.evaluate((bar) => {
      // The bar shows of its line of controls what is inside this box.
      const clip = bar.firstElementChild;
      if (clip === null) throw new Error('The toolbar holds nothing');
      const shown = clip.getBoundingClientRect();
      const controls = Array.from(bar.querySelectorAll('button')).map(
        (button) => {
          const box = button.getBoundingClientRect();
          // Each control is one piece with the space before it, which is
          // where the rule of a group's first control is drawn.
          const rule =
            button.previousElementSibling?.firstElementChild?.getBoundingClientRect();
          return {
            name: button.getAttribute('aria-label') ?? button.textContent,
            left: box.left,
            right: box.right,
            middle: (box.top + box.bottom) / 2,
            // A rule is seen where it is inside what the bar shows of itself.
            rule:
              rule !== undefined &&
              rule.width > 0 &&
              rule.right > shown.left &&
              rule.left < shown.right
                ? { left: rule.left, right: rule.right }
                : undefined,
          };
        },
      );
      const lines: (typeof controls)[] = [];
      for (const control of controls) {
        const line = lines.find(
          ([first]) =>
            first !== undefined && Math.abs(first.middle - control.middle) < 4,
        );
        if (line === undefined) lines.push([control]);
        else line.push(control);
      }
      // The bar's own padding is where the focus ring of a control at its
      // edge is drawn; its controls run from one side of that to the other.
      const padding = Number.parseFloat(getComputedStyle(clip).paddingLeft);
      return {
        start: shown.left + padding,
        end: shown.right - padding,
        lines: lines.map((line) => line.toSorted((a, b) => a.left - b.left)),
      };
    });

    expect(drawn.lines.length).toBeGreaterThan(1);
    for (const [index, line] of drawn.lines.entries()) {
      const names = line.map((control) => control.name).join(', ');
      const first = line[0];
      const last = line.at(-1);
      if (first === undefined || last === undefined) continue;
      // The line begins at the bar's edge, with a control and not a rule.
      expect(first.left, names).toBeCloseTo(drawn.start, 0);
      // Every rule seen has a control on each side of it, on its own line.
      for (const { rule, name } of line) {
        if (rule === undefined) continue;
        expect(
          line.some((control) => control.right <= rule.left + 0.5),
          `a control before the rule at "${name}"`,
        ).toBe(true);
        expect(
          line.some((control) => control.left >= rule.right - 0.5),
          `a control after the rule at "${name}"`,
        ).toBe(true);
      }
      // And the line is full: the control that begins the next one, with the
      // space before it, would not have fitted at the end of this one.
      const next = drawn.lines[index + 1]?.[0];
      if (next !== undefined) {
        expect(
          last.right + 12 + (next.right - next.left),
          `"${next.name}" after "${last.name}"`,
        ).toBeGreaterThan(drawn.end);
      }
    }
  });
}
