import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { assetBlockFrameVariants } from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { assetBlockAttributes } from '@codaco/fresco-ui/testing/assetBlock';
import {
  ASSET_BLOCK_ALIGNMENTS,
  ASSET_BLOCK_SIZES,
} from '@codaco/shared-consts';

import {
  IMAGE_RESOURCE,
  PROTOCOL_RESOURCES,
  type StoryResource,
} from '../../resources/components/storyFixtures.ts';
import { PageContentStoryHost } from '../../testing/PageContentStoryHost.tsx';
import { messages } from './assetBlockMessages.ts';
import { createAssetBlockView } from './AssetBlockView.tsx';
import { SETTINGS_MARGIN } from './settingsPlacement.ts';

// What a block's view draws, from stand-ins for where its files come from.
const View = createAssetBlockView({
  useAsset: (assetId) =>
    assetId === 'missing' ? undefined : { kind: 'image', name: 'harbour.png' },
  Preview: ({ name }) => (
    <div className="bg-surface-1 h-24 rounded p-2">{name}</div>
  ),
});

const meta = {
  title: 'Protocol Builder/Fields/Asset blocks',
  component: View,
  args: {
    attributes: assetBlockAttributes({ size: 'small' }),
    selected: true,
    editable: true,
    active: true,
    update: fn(),
    remove: fn(),
    returnToText: fn(),
  },
} satisfies Meta<typeof View>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A selected image in a field the researcher is in: its picture, and over the
 * page beside it the settings that change how it shows, each a labelled field.
 */
export const SelectedImage: Story = {
  play: async ({ canvasElement, args }) => {
    // The settings stand over the page, outside the story's own element.
    const settingsElement = await within(
      canvasElement.ownerDocument.body,
    ).findByRole('dialog', { name: 'Image settings' });
    const settings = within(settingsElement);
    // Labelled, with their guidance shown under the label.
    await waitFor(() =>
      expect(settings.getByText('Description')).toBeVisible(),
    );
    await expect(
      settings.getByText(
        'This is read aloud to participants who use screen reader technology. Leave it blank if the image is decorative.',
      ),
    ).toBeVisible();
    await expect(settings.getByText('Display size')).toBeVisible();
    const size = settings.getByRole('group', { name: 'Display size' });
    await expect(size).toHaveAccessibleDescription(
      'How tall this is shown on the page. Full size shows it at its natural height. You can also drag the handle at its corner.',
    );
    await expect(
      settings.getByRole('group', { name: 'Alignment' }),
    ).toBeVisible();
    await userEvent.click(within(size).getByRole('button', { name: 'Large' }));
    await expect(args.update).toHaveBeenCalledWith({ size: 'large' });
    // Delete, marked with a bin.
    const remove = settings.getByRole('button', { name: 'Delete' });
    await expect(remove.querySelector('svg')).toBeVisible();
    await userEvent.click(remove);
    await expect(args.remove).toHaveBeenCalled();
  },
};

/** Not selected: just the picture, as the participant will meet it. */
export const NotSelected: Story = {
  args: { selected: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('button', {
        name: 'Delete',
      }),
    ).toBeNull();
  },
};

/** A block naming a file the protocol no longer holds says so. */
export const MissingFile: Story = {
  args: { attributes: { ...meta.args.attributes, assetId: 'missing' } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(messages.unusable.defaultMessage),
    ).toBeVisible();
  },
};

// A square picture that is drawn, so that it has a corner: held to a size, it
// is narrower than its box, and sits against one side of it.
const SQUARE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#6ecae8"/></svg>',
)}`;

const DrawnView = createAssetBlockView({
  useAsset: () => ({ kind: 'image', name: 'square.svg' }),
  Preview: ({ name, className }) => (
    <img src={SQUARE} alt={name} className={className} />
  ),
});

/**
 * Where the corner that resizes the picture in `scope` is wanted: on the
 * bottom corner of the outline a selected block is drawn with, on the side
 * the picture grows towards, which is the left for a picture held against the
 * right of its box, and the right otherwise. Whatever size the picture is, so
 * that a small picture in a wide box has its corner where the selected box
 * has one. Read from the outline as it is drawn: around the block in the
 * editor, around a stand-in for it in the stories that draw a view alone.
 */
const expectCornerOfTheBox = async (scope: Element) => {
  const corner = await waitFor(() => {
    const found = scope.querySelector('[data-asset-block-resize]');
    if (found === null) throw new Error('No corner yet');
    return found.getBoundingClientRect();
  });
  const image = scope.querySelector('img');
  const block = scope.querySelector('[data-asset-block]');
  if (image === null || block === null) throw new Error('No picture');
  const style = getComputedStyle(block);
  await expect(style.outlineStyle).not.toBe('none');
  // The middle of the line the outline is drawn as.
  const out =
    Number.parseFloat(style.outlineOffset) +
    Number.parseFloat(style.outlineWidth) / 2;
  const box = block.getBoundingClientRect();
  const across =
    Number.parseFloat(getComputedStyle(image).objectPosition) / 100;
  const x = across === 1 ? box.left - out : box.right + out;
  await expect(
    Math.abs((corner.left + corner.right) / 2 - x),
  ).toBeLessThanOrEqual(1);
  await expect(
    Math.abs((corner.top + corner.bottom) / 2 - (box.bottom + out)),
  ).toBeLessThanOrEqual(1);
};

/**
 * A view drawn alone, in the frame the editor draws around a selected block,
 * so that its corner is measured against the editor's own outline.
 */
function Outlined({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      data-asset-block=""
      className={assetBlockFrameVariants({ selected: true })}
    >
      {children}
    </div>
  );
}

const cornerIsAtTheBoxsCorner: Story['play'] = async ({ canvasElement }) => {
  await expectCornerOfTheBox(canvasElement);
};

// These stories are each about one direction of text, which they set
// themselves, so there is no other direction to draw them in and compare.
const ONE_DIRECTION = ['!mirror'];

const drawnIn = (direction: 'ltr' | 'rtl'): Story['render'] =>
  function Drawn(args) {
    return (
      <div dir={direction} className="w-[600px]">
        <Outlined>
          <DrawnView {...args} />
        </Outlined>
      </div>
    );
  };

/** Text that reads left to right, its picture where a line ends. */
export const CornerOfAPictureAtTheEnd: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'end' } },
  render: drawnIn('ltr'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheBoxsCorner,
};

/**
 * Text that reads right to left, its picture where a line starts: against the
 * right of its box, as above, though the page runs the other way.
 */
export const CornerOfAPictureInRightToLeftText: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'start' } },
  render: drawnIn('rtl'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheBoxsCorner,
};

/** Right to left, and where a line ends: against the left of its box. */
export const CornerOfAPictureAtTheEndOfRightToLeftText: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'end' } },
  render: drawnIn('rtl'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheBoxsCorner,
};

const SIZE_CHOICES = [null, ...ASSET_BLOCK_SIZES] as const;

/**
 * A picture at each size and in each place across the page, each selected:
 * its corner is at the corner of its box every time, the box's height being
 * the picture's and its width the page's.
 */
export const CornerAtEverySize: Story = {
  args: { active: false },
  tags: ONE_DIRECTION,
  render: function EverySize(args) {
    return (
      <div dir="ltr" className="flex w-[600px] flex-col gap-10">
        {SIZE_CHOICES.flatMap((size) =>
          ASSET_BLOCK_ALIGNMENTS.map((align) => (
            <div
              key={`${size}-${align}`}
              data-testid={`${size ?? 'full'}-${align}`}
            >
              <Outlined>
                <DrawnView
                  {...args}
                  attributes={{ ...args.attributes, size, align }}
                />
              </Outlined>
            </div>
          )),
        )}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const blocks = within(canvasElement).getAllByTestId(/-/);
    await expect(blocks).toHaveLength(12);
    for (const block of blocks) await expectCornerOfTheBox(block);
  },
};

/** A small picture in the middle of the page, with its settings beside it. */
export const SmallPicture: Story = {
  render: drawnIn('ltr'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheBoxsCorner,
};

// How much of the page the host in `KeptClearOfTheHostsBars` covers with bars
// of its own, at the top and the bottom.
const BARS = { top: 120, bottom: 100 } as const;

/**
 * A page that scrolls in a frame whose host covers its top and bottom with
 * bars of its own, and says so (`--protocol-builder-covered-top` and
 * `-bottom`): the settings of a picture low in the frame stand clear of both.
 */
export const KeptClearOfTheHostsBars: Story = {
  tags: ONE_DIRECTION,
  render: function InAFrame(args) {
    return (
      <div
        data-testid="frame"
        dir="ltr"
        className="h-[560px] w-[600px] overflow-y-auto [--protocol-builder-covered-bottom:100px] [--protocol-builder-covered-top:120px]"
      >
        <div className="h-[340px]" />
        <Outlined>
          <DrawnView {...args} />
        </Outlined>
        <div className="h-[800px]" />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const frame = within(canvasElement)
      .getByTestId('frame')
      .getBoundingClientRect();
    const settings = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: 'Image settings' },
    );
    // Clear of each bar by the space the settings keep from it.
    await waitFor(() => {
      const box = settings.getBoundingClientRect();
      expect(box.height).toBeGreaterThan(0);
      expect(box.top).toBeGreaterThanOrEqual(
        frame.top + BARS.top + SETTINGS_MARGIN - 0.5,
      );
      expect(box.bottom).toBeLessThanOrEqual(
        frame.bottom - BARS.bottom - SETTINGS_MARGIN + 0.5,
      );
    });
  },
};

/** A second picture to choose in place of the first: square, where it is wide. */
const SQUARE_RESOURCE: StoryResource = Object.freeze({
  kind: 'image',
  id: 'image-2',
  name: 'Square sketch',
  source: 'square.svg',
  contentType: 'image/svg+xml',
  bytes:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#6ecae8"/></svg>',
});

/**
 * A page being written in a stage editor, its text holding the block `block`
 * spells, over a host that also holds the square picture to replace a file
 * with.
 */
function PageHost({ block }: Readonly<{ block: string }>) {
  return (
    <PageContentStoryHost
      resources={[...PROTOCOL_RESOURCES, SQUARE_RESOURCE]}
      content={`Welcome to the study.\n\n${block}\n\nPlease read on.`}
    />
  );
}

/**
 * Whether `media` is drawn: a picture once it has loaded, which until then
 * has no height, so its block has none either; a player once it has a box.
 */
const isDrawn = (media: Element): boolean =>
  media instanceof HTMLImageElement
    ? media.complete && media.naturalWidth > 0
    : media.getBoundingClientRect().height > 0;

/**
 * Selects the block in the page, and waits for its settings. Clicked once
 * its file is drawn: the preview arrives after the block, and a click where
 * an empty block is lands in the text around it.
 */
const selectBlock = async (canvasElement: HTMLElement, name: string) => {
  const { block, target } = await waitFor(() => {
    const found =
      canvasElement.querySelector<HTMLElement>('[data-asset-block]');
    const media = found?.querySelector('img, video, audio');
    if (found === null || media === null || media === undefined) {
      throw new Error('No file in the block yet');
    }
    if (!isDrawn(media)) throw new Error('The file is not drawn yet');
    return { block: found, target: media };
  });
  // Clicked where it is drawn, as a pointer clicks: the text finds what was
  // clicked from where the click was.
  const { left, top, width, height } = target.getBoundingClientRect();
  await userEvent.pointer({
    keys: '[MouseLeft]',
    target,
    coords: { clientX: left + width / 2, clientY: top + height / 2 },
  });
  await waitFor(() => expect(block).toHaveAttribute('data-selected'));
  const settings = await within(canvasElement.ownerDocument.body).findByRole(
    'dialog',
    { name },
  );
  return { block, settings: within(settings) };
};

const pressed = (button: HTMLElement) =>
  expect(button).toHaveAttribute('aria-pressed', 'true');

// The page is a whole editor rather than a layout in the reading direction:
// the other stories mirror the block itself.
const WHOLE_EDITOR = ['!mirror'];

/**
 * A picture's file replaced from its settings: the resource browser opens
 * over them, and once a file is chosen the block draws it, is still
 * selected, and keeps its description, size and place.
 */
export const ReplacingThePicture: Story = {
  tags: WHOLE_EDITOR,
  render: () => (
    <PageHost
      block={`![The neighbourhood](asset:${IMAGE_RESOURCE.id}?size=small&align=end)`}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const { block, settings } = await selectBlock(
      canvasElement,
      'Image settings',
    );
    const file = settings.getByRole('group', { name: 'Image' });
    await expect(file).toHaveAccessibleDescription(
      'The file shown here. Choosing another keeps the description and other settings.',
    );
    await expect(within(file).getByText('Neighbourhood photo')).toBeVisible();

    // Closed with nothing chosen, the browser leaves the block as it was.
    await userEvent.click(
      within(file).getByRole('button', { name: 'Change the image' }),
    );
    await body.findByRole('dialog', { name: 'Choose an image' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Choose an image' }),
      ).toBeNull(),
    );
    await expect(block).toHaveAttribute('data-selected');
    const settingsAfterEscape = await body.findByRole('dialog', {
      name: 'Image settings',
    });
    await expect(
      within(settingsAfterEscape).getByText('Neighbourhood photo'),
    ).toBeVisible();

    await userEvent.click(
      within(settingsAfterEscape).getByRole('button', {
        name: 'Change the image',
      }),
    );
    const browser = await body.findByRole('dialog', {
      name: 'Choose an image',
    });
    await userEvent.click(
      await within(browser).findByRole('button', { name: /Square sketch/ }),
    );

    // The new file, drawn: square, where the first was wide.
    await waitFor(() => {
      const image = block.querySelector('img');
      expect(image?.naturalWidth).toBeGreaterThan(0);
      expect(image?.naturalWidth).toBe(image?.naturalHeight);
    });
    // Still the selection, with the caret on it, where Enter goes back into
    // its settings; and those are over the page again.
    await expect(block).toHaveAttribute('data-selected');
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole('textbox', { name: /^Rich Text/ }),
      ).toHaveFocus(),
    );
    const again = within(
      await body.findByRole('dialog', { name: 'Image settings' }),
    );
    await expect(
      within(again.getByRole('group', { name: 'Image' })).getByText(
        'Square sketch',
      ),
    ).toBeVisible();
    // Its corner is on the corner of the selected box, small as it is.
    await expectCornerOfTheBox(canvasElement);
    // Its other settings are kept.
    await expect(
      again.getByRole('textbox', { name: 'Description' }),
    ).toHaveValue('The neighbourhood');
    await pressed(again.getByRole('button', { name: 'Small' }));
    await pressed(again.getByRole('button', { name: 'Align to the end' }));
    // And nothing else was chosen as the browser closed.
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Choose an image' }),
      ).toBeNull(),
    );
  },
};

/** A video's settings: its playback, as well as how it shows. */
export const VideoSettings: Story = {
  tags: WHOLE_EDITOR,
  render: () => (
    <PageHost block="![A walkthrough](asset:video-1?size=medium&autoplay=false)" />
  ),
  play: async ({ canvasElement }) => {
    const { settings } = await selectBlock(canvasElement, 'Video settings');
    await expect(
      settings.getByRole('switch', { name: 'Start playing automatically' }),
    ).not.toBeChecked();
    await expect(
      settings.getByRole('switch', { name: 'Repeat when it ends' }),
    ).toBeChecked();
    await expect(
      settings.getByRole('group', { name: 'Video' }),
    ).toBeInTheDocument();
    await expect(
      settings.getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
  },
};

/**
 * A picture in English text, edited in an Arabic interface. The size the
 * corner is dragged to is named in the interface's words, over the text, so
 * it says the interface's language; the description, typed in settings that
 * stand over the page, is the text's own, and says the text's language.
 */
export const InterfaceWordsInTextOfAnotherLanguage: Story = {
  globals: { appLocale: 'ar' },
  // The text's direction is fixed by its language, whichever way the
  // interface reads, so there is no other direction to draw it in.
  tags: ONE_DIRECTION,
  render: function Drawn(args) {
    return (
      <div lang="en-US" dir="ltr" className="w-[600px]">
        <Outlined>
          <DrawnView {...args} />
        </Outlined>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const languageOf = (element: Element) => ({
      lang: element.closest('[lang]')?.getAttribute('lang'),
      dir: element.closest('[dir]')?.getAttribute('dir'),
    });
    const settings = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: 'Image settings' },
    );
    const description = within(settings).getByRole('textbox');
    await expect(languageOf(description)).toEqual({
      lang: 'en-US',
      dir: 'ltr',
    });
    // What the settings say themselves is the interface's.
    const label = settings.querySelector(`label[for="${description.id}"]`);
    if (label === null) throw new Error('The description has no label');
    await expect(languageOf(label).lang).toBe('ar');

    const corner = await waitFor(() => {
      const found = canvasElement.querySelector('[data-asset-block-resize]');
      if (!(found instanceof HTMLElement)) throw new Error('No corner yet');
      return found;
    });
    await userEvent.pointer({ keys: '[MouseLeft>]', target: corner });
    const sizeName = await waitFor(() => {
      const found = corner.nextElementSibling;
      if (found === null) throw new Error('No size named yet');
      return found;
    });
    await expect(languageOf(sizeName)).toEqual({ lang: 'ar', dir: 'rtl' });
    await expect(getComputedStyle(sizeName).fontFamily).toMatch(/Readex Pro/);
    await userEvent.pointer({ keys: '[/MouseLeft]', target: corner });
  },
};
