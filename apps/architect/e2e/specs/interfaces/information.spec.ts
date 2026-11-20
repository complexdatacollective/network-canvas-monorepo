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
  await imageSettings(architectPage)
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

test('resizes an image by its corner, to the nearest of the sizes', async ({
  architectPage,
  seed,
}) => {
  await seed(
    withPage('# Welcome\n\n![A photo](asset:photo-asset?size=large)\n\nBye.'),
    // Stored as the image it is, so that the picture is drawn: a picture that
    // cannot be drawn has no corner to take hold of.
    {
      assets: seedOptions.assets.map((asset) => ({
        ...asset,
        mediaType: 'image/svg+xml',
      })),
    },
  );
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('About This Study');
  const image = pageEditor(architectPage).getByRole('img', { name: 'A photo' });
  await image.click();
  await expect(imageSettings(architectPage)).toBeVisible();

  // The whole picture in view, so the pointer stays on the page as it goes.
  await image.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  const corner = architectPage.locator('[data-asset-block-resize]');
  const handle = await corner.boundingBox();
  const picture = await image.boundingBox();
  if (handle === null || picture === null) {
    throw new Error('The image and its corner are not drawn');
  }
  // A square picture, centred in its box and held to the large size. Where the
  // pointer is let go, it is 160px tall by both of the measures taken (160px
  // below its top, and 80px out from its middle), which is nearest to small.
  const middle = picture.x + picture.width / 2;
  await architectPage.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await architectPage.mouse.down();
  await architectPage.mouse.move(middle + 80, picture.y + 160, { steps: 10 });
  // While it is dragged: the size it would take is named beside the corner,
  // and the settings stand aside.
  await expect(
    pageEditor(architectPage).getByText('Small', { exact: true }),
  ).toBeVisible();
  await expect(imageSettings(architectPage)).toBeHidden();
  await architectPage.mouse.up();

  // Let go, the settings come back with the new size chosen.
  await expect(
    imageSettings(architectPage).getByRole('button', {
      name: 'Small',
      exact: true,
      pressed: true,
    }),
  ).toBeVisible();

  // Back in the text, which takes the settings off the page: in a window this
  // short they have nowhere to stand but over the bar that saves the stage.
  await pageEditor(architectPage).locator('p', { hasText: 'Bye.' }).click();
  await expect(imageSettings(architectPage)).toBeHidden();
  await new StageEditor(architectPage).save();
  const stage = await readStageJson(architectPage, 0, (saved) =>
    (pageText(saved) ?? '').includes('size=small'),
  );
  expect(pageText(stage)).toBe(
    '# Welcome\n\n![A photo](asset:photo-asset?size=small)\n\nBye.',
  );
});

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
