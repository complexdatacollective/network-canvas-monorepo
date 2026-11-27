import {
  DRAWN_FILES,
  expect,
  gotoProtocol,
  informationProtocol,
  PHOTO_ASSET,
  PHOTO_FILE,
  test,
} from '../../fixtures/information-page.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import {
  pageText,
  readProtocolJson,
  readStageJson,
} from '../../helpers/read-store.js';
import { AssetBlocks, placeBlockAt } from '../../pageobjects/asset-block.js';
import { writeHeadingAndText } from '../../pageobjects/rich-text.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// The page is ONE rich text: a heading is a heading in it, and each image,
// audio recording or video is a block in it, saved as a markdown image whose
// address names a protocol resource (`![alt](asset:<id>?size=medium)`). The
// page's editor is the "Rich Text" field of the "Content" section
// (`StageEditor.richText()`); the toolbar above it formats the text and
// inserts media, and has a spec of its own (`rich-text-toolbar.spec.ts`).

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
    editor.richText(),
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

test('places an image in the text from the toolbar, with its settings', async ({
  architectPage,
  seed,
}) => {
  await seed(
    { ...emptyProtocol(), assetManifest: PHOTO_ASSET },
    {
      assets: PHOTO_FILE,
    },
  );
  await gotoProtocol(architectPage);
  const editor = new StageEditor(architectPage);
  await editor.createNew('Information');
  await editor.setStageName('About This Study');
  await writeHeadingAndText(editor.richText(), 'Welcome', 'Look at this.');

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

  // The image just placed is selected; its settings open from the button in
  // its tab. An image has a size and a description, and no playback. With
  // no description yet, it is named for its file.
  const blocks = new AssetBlocks(architectPage);
  await expect(blocks.image('photo.svg')).toBeVisible();
  const settings = await blocks.openSettings(blocks.block('photo.svg'));
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
  openInformationPage,
}) => {
  await openInformationPage(
    informationProtocol(
      '# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.',
    ),
    PHOTO_FILE,
  );
  const blocks = new AssetBlocks(architectPage);

  // Clicking a block selects it; its settings open from its tab.
  const settings = await blocks.openSettings(blocks.block('A photo'));
  await settings.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(blocks.image('A photo')).toHaveCount(0);

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
  openInformationPage,
}) => {
  const block = '![A photo](asset:photo-asset?size=large&align=end)';
  await openInformationPage(
    informationProtocol(`# Welcome\n\n${block}\n\nBye`),
    PHOTO_FILE,
  );
  const editor = new StageEditor(architectPage);

  // The caret goes to the end of the last paragraph, after the block.
  await editor.richText().locator('p').last().click();
  await architectPage.keyboard.press('End');
  await architectPage.keyboard.insertText('!');
  await editor.save();

  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').endsWith('Bye!'),
  );
  expect(pageText(stage)).toBe(`# Welcome\n\n${block}\n\nBye!`);
});

test('shows an image’s settings only while it is selected and the researcher is in the field', async ({
  architectPage,
  openInformationPage,
}) => {
  await openInformationPage(
    informationProtocol(
      '# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.',
    ),
    PHOTO_FILE,
  );
  const pageEditor = new StageEditor(architectPage).richText();
  const blocks = new AssetBlocks(architectPage);
  const settings = blocks.settings();
  const description = settings.getByLabel('Description', { exact: true });
  await expect(pageEditor).toBeEditable();
  await expect(settings).toBeHidden();

  // Selecting the image shows its settings button, not its settings, and
  // leaves the keyboard in the text.
  const button = blocks.settingsButton(blocks.block('A photo'));
  await blocks.image('A photo').click();
  await expect(button).toBeVisible();
  await expect(settings).toBeHidden();
  await expect(pageEditor).toBeFocused();

  // Enter presses the button: the settings open, at their first control.
  // Escape closes them, and gives focus back to the button; the image is
  // still selected, and Enter on the button opens them again.
  await architectPage.keyboard.press('Enter');
  await expect(description).toBeFocused();
  await architectPage.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(button).toBeFocused();
  await expect(blocks.block('A photo')).toHaveAttribute(
    'data-selected',
    'true',
  );
  await architectPage.keyboard.press('Enter');
  await expect(description).toBeFocused();

  // A press in the text closes them.
  await pageEditor.locator('p', { hasText: 'Bye.' }).click();
  await expect(settings).toBeHidden();
});

test('resizes an image by dragging its corner, a size at a time', async ({
  architectPage,
  openInformationPage,
}) => {
  await openInformationPage(
    informationProtocol(
      '# Welcome\n\n![A photo](asset:photo-asset?size=large)\n\nBye.',
    ),
    // Stored as the image it is, so that the picture is drawn: a picture that
    // cannot be drawn has no corner to take hold of.
    DRAWN_FILES,
  );
  const blocks = new AssetBlocks(architectPage);
  const image = blocks.image('A photo');
  const settings = await blocks.openSettings(blocks.block('A photo'));

  // The whole picture in view, so the pointer stays on the page as it goes.
  await image.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  const handle = await blocks.resizeCorner().boundingBox();
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
    new StageEditor(architectPage).richText().getByText(name, { exact: true });
  await expect(pill('Medium')).toBeVisible();
  await expect(settings).toBeHidden();
  await architectPage.mouse.move(x, y - 220, { steps: 10 });
  await expect(pill('Small')).toBeVisible();
  await architectPage.mouse.up();

  // Let go, the settings come back with the new size chosen.
  await expect(
    settings.getByRole('button', { name: 'Small', exact: true, pressed: true }),
  ).toBeVisible();

  await blocks.saveFromText('Bye.');
  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').includes('size=small'),
  );
  expect(pageText(stage)).toBe(
    '# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.',
  );
});

// The corner is drawn on the frame round the selected picture, at the bottom,
// on the side the picture grows towards: away from the side it is held
// against.
for (const [align, corner] of [
  ['start', 'right'],
  ['end', 'left'],
] as const) {
  test(`puts the resize corner on the bottom ${corner} of the frame of an image aligned to the ${align}`, async ({
    architectPage,
    openInformationPage,
  }) => {
    const address = `size=small&align=${align}`;
    await openInformationPage(
      informationProtocol(
        `# Welcome\n\n![A photo](asset:photo-asset?${address})\n\nBye.`,
      ),
      DRAWN_FILES,
    );
    const blocks = new AssetBlocks(architectPage);
    await blocks.image('A photo').click();
    const block = blocks.block('A photo');
    await expect(block).toHaveAttribute('data-selected', 'true');
    // Selecting the block opens nothing.
    await expect(blocks.settings()).toHaveCount(0);

    const handle = await blocks.resizeCorner().boundingBox();
    if (handle === null) throw new Error('The corner is not drawn');
    const frame = await blocks.selectedFrame().evaluate((element) => {
      const box = element.getBoundingClientRect();
      // The middle of the frame's line, inside its outer edge.
      const inset =
        Number.parseFloat(getComputedStyle(element).borderTopWidth) / 2;
      return {
        width: Number.parseFloat(getComputedStyle(element).borderTopWidth),
        left: box.left + inset,
        right: box.right - inset,
        bottom: box.bottom - inset,
      };
    });
    // A frame is drawn, or there is no line for the corner to sit on.
    expect(frame.width).toBeGreaterThan(0);
    const middle = {
      x: handle.x + handle.width / 2,
      y: handle.y + handle.height / 2,
    };
    expect(Math.abs(middle.y - frame.bottom)).toBeLessThanOrEqual(2);
    expect(Math.abs(middle.x - frame[corner])).toBeLessThanOrEqual(2);
  });
}

test('replaces the file of a placed image, keeping its settings', async ({
  architectPage,
  openInformationPage,
}) => {
  await openInformationPage(
    informationProtocol(
      '# Welcome\n\n![A photo](asset:photo-asset?size=small&align=end)\n\nBye.',
      { moreFiles: true },
    ),
    DRAWN_FILES,
  );
  const blocks = new AssetBlocks(architectPage);
  const settings = await blocks.openSettings(blocks.block('A photo'));

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
  // The block is drawn again for the other file, still selected, with the
  // keyboard in the text: Enter opens its settings again.
  await expect(blocks.block('A photo')).toHaveAttribute(
    'data-selected',
    'true',
  );
  await expect(new StageEditor(architectPage).richText()).toBeFocused();
  await architectPage.keyboard.press('Enter');
  await expect(settings).toBeVisible();

  // The block now shows the other file, under the same description, size and
  // alignment.
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

  await blocks.saveFromText('Bye.');
  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').includes('asset:garden-asset'),
  );
  expect(pageText(stage)).toBe(
    '# Welcome\n\n![A photo](asset:garden-asset?size=small&align=end)\n\nBye.',
  );
});

test('marks a block that a selection of the text runs across, and outlines one selected by itself', async ({
  architectPage,
  openInformationPage,
}) => {
  await openInformationPage(
    informationProtocol(
      '# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.',
    ),
    DRAWN_FILES,
  );
  const pageEditor = new StageEditor(architectPage).richText();
  const blocks = new AssetBlocks(architectPage);
  const block = blocks.block('A photo');
  await expect(pageEditor).toBeEditable();

  // Everything selected: the block is part of the selection, not selected on
  // its own, so it has no settings.
  await pageEditor.locator('p', { hasText: 'Bye.' }).click();
  await expect(block).not.toHaveAttribute('data-in-selected-text');
  await architectPage.keyboard.press('ControlOrMeta+a');
  await expect(block).toHaveAttribute('data-in-selected-text', 'true');
  await expect(block).not.toHaveAttribute('data-selected');
  await expect(blocks.settings()).toHaveCount(0);

  // A caret in the text selects nothing.
  await pageEditor.locator('p', { hasText: 'Bye.' }).click();
  await expect(block).not.toHaveAttribute('data-in-selected-text');

  // The block clicked is selected by itself: framed, and not marked.
  await blocks.image('A photo').click();
  await expect(block).toHaveAttribute('data-selected', 'true');
  await expect(block).not.toHaveAttribute('data-in-selected-text');
  await expect(blocks.selectedFrame()).toBeVisible();
});

test('reaches and uses Delete in a video’s settings in a short window', async ({
  architectPage,
  openInformationPage,
}) => {
  // Shorter than an ordinary window, so that the whole of a video's settings
  // cannot be seen at once (they can at 1280×720).
  await architectPage.setViewportSize({ width: 1280, height: 560 });
  await openInformationPage(
    informationProtocol(
      '# Welcome\n\n![A clip](asset:clip-asset?size=medium)\n\nBye.',
      { moreFiles: true },
    ),
    DRAWN_FILES,
  );
  const blocks = new AssetBlocks(architectPage);
  const block = blocks.blocks();
  await expect(block).toHaveCount(1);
  const settings = await blocks.openSettings(block, 'Video');

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

// The bar at the top of the window and the action toolbar at its bottom stand
// over the page, and each publishes how far into the page it reaches
// (`--architect-nav-bar-reach`, `--architect-action-toolbar-reach`). In a
// short window, an image's settings fit on no side of their button, so they
// are cut short and scrolled within, on the side of the button with more
// room, and keep 8px clear of the bar on that side: below the top bar when
// the image is low in the window, above the toolbar when it is high.
for (const [width, height, cases] of [
  [
    1280,
    560,
    [
      ['top bar', 560 - 140],
      ['action toolbar', 205],
    ],
  ],
  [
    1440,
    640,
    [
      ['top bar', 640 - 140],
      ['action toolbar', 205],
    ],
  ],
] as const) {
  for (const [bar, top] of cases) {
    test(`keeps an image’s settings 8px clear of the ${bar} at ${width}×${height}`, async ({
      architectPage,
      openInformationPage,
    }) => {
      await architectPage.setViewportSize({ width, height });
      const lines = (from: number) =>
        Array.from({ length: 20 }, (_, index) => `Line ${from + index}.`).join(
          '\n\n',
        );
      await openInformationPage(
        informationProtocol(
          `# Welcome\n\n${lines(1)}\n\n![A photo](asset:photo-asset?size=large)\n\n${lines(21)}`,
        ),
        DRAWN_FILES,
      );
      const blocks = new AssetBlocks(architectPage);
      const settings = await blocks.openSettings(blocks.block('A photo'));
      await placeBlockAt(blocks.block('A photo'), top);

      // What each bar publishes is how far it really reaches into the page:
      // the top bar from the top of what the page scrolls in, and the toolbar
      // (the fixed box drawn around its controls) from the bottom of the
      // window.
      const toolbar = architectPage.getByRole('toolbar', {
        name: 'Stage editor actions',
      });
      await expect(toolbar).toBeVisible();
      const bars = await toolbar.evaluate((controls) => {
        const root = getComputedStyle(document.documentElement);
        const header = document.querySelector('header');
        const topBar = header?.firstElementChild?.getBoundingClientRect();
        const page = header?.parentElement?.getBoundingClientRect();
        let fixed: Element | null = controls;
        while (fixed !== null && getComputedStyle(fixed).position !== 'fixed') {
          fixed = fixed.parentElement;
        }
        if (topBar === undefined || page === undefined || fixed === null) {
          throw new Error('A bar is not drawn');
        }
        return {
          topBar: topBar.bottom,
          topBarReach: topBar.bottom - page.top,
          publishedTopBarReach: Number.parseFloat(
            root.getPropertyValue('--architect-nav-bar-reach'),
          ),
          toolbar: fixed.getBoundingClientRect().top,
          toolbarReach: window.innerHeight - fixed.getBoundingClientRect().top,
          publishedToolbarReach: Number.parseFloat(
            root.getPropertyValue('--architect-action-toolbar-reach'),
          ),
        };
      });
      expect(bars.publishedTopBarReach).toBeCloseTo(bars.topBarReach, 0);
      expect(bars.publishedToolbarReach).toBeCloseTo(bars.toolbarReach, 0);

      // Cut short and scrolled within, on the side with more room.
      await expect(settings).toHaveAttribute('data-scrolls', 'true');
      await expect(settings).toHaveAttribute(
        'data-side',
        bar === 'top bar' ? 'top' : 'bottom',
      );
      // Clear of both, and held 8px (to the pixel) from the one it is against.
      await expect
        .poll(async () => {
          const box = await settings.boundingBox();
          if (box === null) throw new Error('The settings are not drawn');
          return {
            belowTopBar: Math.round(box.y - bars.topBar),
            aboveToolbar: Math.round(bars.toolbar - (box.y + box.height)),
          };
        })
        .toEqual(
          bar === 'top bar'
            ? { belowTopBar: 8, aboveToolbar: expect.any(Number) }
            : { belowTopBar: expect.any(Number), aboveToolbar: 8 },
        );
      const box = await settings.boundingBox();
      if (box === null) throw new Error('The settings are not drawn');
      expect(box.y - bars.topBar).toBeGreaterThanOrEqual(7.5);
      expect(bars.toolbar - (box.y + box.height)).toBeGreaterThanOrEqual(7.5);
    });
  }
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
    openInformationPage,
  }) => {
    await architectPage.setViewportSize({ width: 1440, height: 1000 });
    const lines = (from: number) =>
      Array.from({ length: 20 }, (_, index) => `Line ${from + index}.`).join(
        '\n\n',
      );
    await openInformationPage(
      informationProtocol(
        `# Welcome\n\n${lines(1)}\n\n![A photo](asset:photo-asset?size=small)\n\n${lines(21)}`,
        { moreFiles: true },
      ),
      DRAWN_FILES,
    );
    const blocks = new AssetBlocks(architectPage);
    const settings = await blocks.openSettings(blocks.block('A photo'));
    await placeBlockAt(blocks.block('A photo'), top);

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
  openInformationPage,
}) => {
  const lines = Array.from({ length: 80 }, (_, index) => `Line ${index + 1}.`);
  await openInformationPage(
    informationProtocol(lines.join('\n\n')),
    PHOTO_FILE,
  );
  const field = new StageEditor(architectPage).richText();
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
