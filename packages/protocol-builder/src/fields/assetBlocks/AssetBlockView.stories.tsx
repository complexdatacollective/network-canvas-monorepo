import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useState } from 'react';
import {
  expect,
  fireEvent,
  fn,
  spyOn,
  userEvent,
  waitFor,
  within,
} from 'storybook/test';

import { assetBlockMediaVariants } from '@codaco/fresco-ui/assetBlockLayout';
import {
  AssetBlockResizeHandle,
  BLOCK_FRAME_OFFSET,
  BLOCK_FRAME_WIDTH,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { assetBlockAttributes } from '@codaco/fresco-ui/testing/assetBlock';
import { withMod } from '@codaco/fresco-ui/testing/modKey';
import { ASSET_BLOCK_SIZES, type AssetBlockSize } from '@codaco/shared-consts';

import {
  IMAGE_RESOURCE,
  PROTOCOL_RESOURCES,
  type StoryResource,
} from '../../resources/components/storyFixtures.ts';
import { PageContentStoryHost } from '../../testing/PageContentStoryHost.tsx';
import { messages } from './assetBlockMessages.ts';
import { createAssetBlockView } from './AssetBlockView.tsx';
import {
  KEEP_OUT_CLEARANCE,
  PLAYER_CONTROLS_HEIGHT,
  SETTINGS_MARGIN,
  SETTINGS_OFFSET,
} from './settingsPlacement.ts';

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
    hovered: false,
    editable: true,
    active: true,
    update: fn(),
    resizeHandle: null,
    resizing: undefined,
    remove: fn(),
    returnToText: fn(),
    selectKeepingFocus: fn(),
  },
} satisfies Meta<typeof View>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Presses the settings button in the tab of the block in `scope`, and waits
 * for the settings it opens, which stand over the page, outside the story's
 * own element.
 */
const openSettings = async (scope: HTMLElement, name: string) => {
  const button = await within(scope).findByRole('button', { name });
  await userEvent.click(button);
  return within(scope.ownerDocument.body).findByRole('dialog', { name });
};

/**
 * A selected image in a field the researcher is in: its picture, with the
 * settings button in its tab, and over the page beside the button the
 * settings that change how it shows, each a labelled field. They open only
 * from the button.
 */
export const SelectedImage: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    // Selected, the block shows its settings button, and not its settings.
    await expect(
      await within(canvasElement).findByRole('button', {
        name: 'Image settings',
      }),
    ).toBeVisible();
    await expect(body.queryByRole('dialog')).toBeNull();

    const settingsElement = await openSettings(canvasElement, 'Image settings');
    const settings = within(settingsElement);
    // Labelled, with their guidance shown under the label.
    await waitFor(() =>
      expect(settings.getByText('Description')).toBeVisible(),
    );
    // Focus is at the first of them.
    await waitFor(() =>
      expect(
        settings.getByRole('textbox', { name: 'Description' }),
      ).toHaveFocus(),
    );
    await expect(
      settings.getByText(
        'This is read aloud to participants who use screen reader technology. Leave it blank if the image is decorative.',
      ),
    ).toBeVisible();
    // Its size is set by dragging its corner, and nowhere in its settings;
    // where it sits across the page is not something Markdown can say.
    await expect(
      settings.queryByRole('group', { name: 'Display size' }),
    ).toBeNull();
    await expect(
      settings.queryByRole('group', { name: 'Alignment' }),
    ).toBeNull();
    // Delete, marked with a bin.
    const remove = settings.getByRole('button', { name: 'Delete image' });
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
      within(canvasElement).queryByRole('button', { name: 'Image settings' }),
    ).toBeNull();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('button', {
        name: 'Delete image',
      }),
    ).toBeNull();
  },
};

/**
 * The pointer over a block that is not selected: its tab shows the settings
 * button, which opens the settings and selects the block.
 */
export const Hovered: Story = {
  args: { selected: false, active: false, hovered: true },
  play: async ({ canvasElement, args }) => {
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('dialog'),
    ).toBeNull();
    await openSettings(canvasElement, 'Image settings');
    // Selected, with focus left in the settings.
    await expect(args.selectKeepingFocus).toHaveBeenCalled();
    await expect(args.returnToText).not.toHaveBeenCalled();
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
  // A stand-in for the card that shows the file, as tall as a short one.
  FileField: () => (
    <div className="bg-surface-1 h-16 rounded p-2">square.svg</div>
  ),
});

/**
 * A picture drawn as its block's node view draws it in an editor: inside an
 * element marked as the block, and, while it is selected and can be changed,
 * with the editor's resize handle, which says what a drag would do and hands
 * the size it is let go at to `update`.
 */
function DrawnBlock(args: ComponentProps<typeof DrawnView>) {
  const [resizing, setResizing] = useState<
    Readonly<{ size: AssetBlockSize | null }> | undefined
  >(undefined);
  const resizable = args.selected && args.editable;
  return (
    <div data-asset-block="" className="relative">
      <DrawnView
        {...args}
        resizing={resizable ? resizing : undefined}
        resizeHandle={
          resizable ? (
            <AssetBlockResizeHandle
              size={args.attributes.size}
              onPreview={setResizing}
              onResize={(size) => args.update({ size })}
              onLeave={args.returnToText}
            />
          ) : null
        }
      />
    </div>
  );
}

/**
 * Drags the resize handle by `by` from its middle and lets it go, with
 * pointer events. The browser gives pointer capture only to a real pointer,
 * so capturing it is stood in for while it is dragged.
 */
const dragHandle = async (
  handle: HTMLElement,
  by: Readonly<{ x: number; y: number }>,
  { release = true }: Readonly<{ release?: boolean }> = {},
) => {
  const { left, top, width, height } = handle.getBoundingClientRect();
  const middle = { clientX: left + width / 2, clientY: top + height / 2 };
  const to = { clientX: middle.clientX + by.x, clientY: middle.clientY + by.y };
  const pointer = { pointerId: 1, pointerType: 'mouse', button: 0 };
  const setCapture = spyOn(
    window.HTMLElement.prototype,
    'setPointerCapture',
  ).mockImplementation(() => {});
  try {
    await fireEvent.pointerDown(handle, { ...pointer, buttons: 1, ...middle });
    await fireEvent.pointerMove(handle, { ...pointer, buttons: 1, ...to });
    if (release) await fireEvent.pointerUp(handle, { ...pointer, ...to });
  } finally {
    setCapture.mockRestore();
  }
};

/**
 * Where the handle that resizes the picture in `scope` is wanted: on the
 * bottom corner of the frame drawn round the selected picture, at the end of
 * the line (the right in text that reads left to right, the left in text
 * that reads right to left). The frame goes round the picture
 * as it is drawn, however much narrower than its box it is. Read from the
 * frame where the editor draws one, and otherwise from where the view says
 * the frame goes (`data-block-box`): its outer edge `BLOCK_FRAME_OFFSET`
 * outside that, and its line `BLOCK_FRAME_WIDTH` wide inside the edge.
 */
const expectCornerOfTheFrame = async (scope: Element) => {
  const corner = await waitFor(() => {
    const found = scope.querySelector('[data-asset-block-resize]');
    if (found === null) throw new Error('No corner yet');
    return found.getBoundingClientRect();
  });
  const image = scope.querySelector('img');
  const framed = scope.querySelector('[data-block-box]');
  if (image === null || framed === null) throw new Error('No picture');
  const box = framed.getBoundingClientRect();
  // The frame's outer edge.
  const out = BLOCK_FRAME_OFFSET;
  const frame = scope.querySelector('[data-block-frame="selected"]');
  if (frame !== null) {
    // The frame the editor draws is where the view says it goes, once it has
    // followed the picture there.
    await waitFor(() => {
      const drawn = frame.getBoundingClientRect();
      const placed = framed.getBoundingClientRect();
      expect(Math.abs(drawn.left - (placed.left - out))).toBeLessThanOrEqual(1);
      expect(Math.abs(drawn.right - (placed.right + out))).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.abs(drawn.bottom - (placed.bottom + out)),
      ).toBeLessThanOrEqual(1);
    });
  }
  // The middle of the line the frame is drawn as.
  const middle = BLOCK_FRAME_OFFSET - BLOCK_FRAME_WIDTH / 2;
  const x =
    getComputedStyle(framed).direction === 'rtl'
      ? box.left - middle
      : box.right + middle;
  await expect(
    Math.abs((corner.left + corner.right) / 2 - x),
  ).toBeLessThanOrEqual(1);
  await expect(
    Math.abs((corner.top + corner.bottom) / 2 - (box.bottom + middle)),
  ).toBeLessThanOrEqual(1);
};

const cornerIsAtTheFramesCorner: Story['play'] = async ({ canvasElement }) => {
  await expectCornerOfTheFrame(canvasElement);
};

// These stories are each about one direction of text, which they set
// themselves, so there is no other direction to draw them in and compare.
const ONE_DIRECTION = ['!mirror'];

const drawnIn = (direction: 'ltr' | 'rtl'): Story['render'] =>
  function Drawn(args) {
    return (
      <div dir={direction} className="w-[600px] pt-12">
        <DrawnBlock {...args} />
      </div>
    );
  };

/**
 * Text that reads right to left: the picture is centred, and the handle is
 * on its bottom left corner, where the lines end.
 */
export const CornerOfAPictureInRightToLeftText: Story = {
  render: drawnIn('rtl'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheFramesCorner,
};

const SIZE_CHOICES = [null, ...ASSET_BLOCK_SIZES] as const;

/**
 * A picture at each size, each selected: its handle is at the corner of the
 * frame round the picture every time.
 */
export const CornerAtEverySize: Story = {
  args: { active: false },
  tags: ONE_DIRECTION,
  render: function EverySize(args) {
    return (
      <div dir="ltr" className="flex w-[600px] flex-col gap-10">
        {SIZE_CHOICES.map((size) => (
          <div key={size ?? 'full'} data-testid={`block-${size ?? 'full'}`}>
            <DrawnBlock {...args} attributes={{ ...args.attributes, size }} />
          </div>
        ))}
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const blocks = within(canvasElement).getAllByTestId(/^block-/);
    await expect(blocks).toHaveLength(4);
    for (const block of blocks) await expectCornerOfTheFrame(block);
  },
};

/** A small picture in the middle of the page. */
export const SmallPicture: Story = {
  render: drawnIn('ltr'),
  tags: ONE_DIRECTION,
  play: cornerIsAtTheFramesCorner,
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
        <DrawnBlock {...args} />
        <div className="h-[800px]" />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const frame = within(canvasElement)
      .getByTestId('frame')
      .getBoundingClientRect();
    const settings = await openSettings(canvasElement, 'Image settings');
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

/** How far apart two boxes are: 0 where they touch or overlap. */
const distanceBetween = (one: DOMRect, other: DOMRect): number =>
  Math.hypot(
    Math.max(other.left - one.right, one.left - other.right, 0),
    Math.max(other.top - one.bottom, one.top - other.bottom, 0),
  );

type Layout = Readonly<{
  /** How wide and tall the frame the page scrolls in is. */
  frame: Readonly<{ wide: number; tall: number }>;
  /** How far down the frame the picture starts. */
  above: number;
  /** How far in from the left of the frame the picture starts. */
  left: number;
  /** The picture's size: a square, as tall as the size holds it to. */
  size: 'medium' | 'large';
}>;

// How tall each size holds a picture to (`assetBlockMediaVariants`) in a
// window 900 pixels tall, which is as wide as a square picture.
const SIZE_PIXELS = { medium: 384, large: 540 } as const;

/**
 * A square picture in a frame that its page scrolls in, placed as `layout`
 * says: where its settings fit beside their button is what the stories that
 * use it are about. The settings of a picture are 628 pixels wide and about
 * 390 tall, and stand 10 pixels from their button, which is 40 pixels square,
 * at the picture's end and over its top. Under or over the button, their end
 * is at the end of the picture, where their arrow, which points at the
 * button's middle, keeps them; beside it, their top is 52 pixels above the
 * picture's.
 */
const placedIn = ({ frame, above, left, size }: Layout): Story['render'] =>
  function Placed(args) {
    return (
      <div
        data-testid="frame"
        dir="ltr"
        className="overflow-y-auto"
        style={{ width: frame.wide, height: frame.tall }}
      >
        <div style={{ height: above }} />
        <div style={{ marginLeft: left, width: SIZE_PIXELS[size] }}>
          <DrawnBlock {...args} attributes={{ ...args.attributes, size }} />
        </div>
        <div className="h-[800px]" />
      </div>
    );
  };

/**
 * The settings open on `side` of their button, with the whole of them inside
 * the frame, and leave the corner that resizes the picture uncovered, as far
 * from it as they stand from the button. The corner is what a pointer
 * pressed on its middle takes hold of: dragged up, it makes the picture
 * smaller.
 */
const opensOn =
  (
    side: 'bottom' | 'top' | 'right' | 'left',
    draggedTo: 'small' | 'medium',
  ): Story['play'] =>
  async ({ canvasElement, args }) => {
    const settings = await openSettings(canvasElement, 'Image settings');
    const button = within(canvasElement).getByRole('button', {
      name: 'Image settings',
    });
    const frame = within(canvasElement)
      .getByTestId('frame')
      .getBoundingClientRect();
    const corner = await waitFor(() => {
      const found = canvasElement.querySelector('[data-asset-block-resize]');
      if (!(found instanceof HTMLElement)) throw new Error('No corner yet');
      return found;
    });
    await waitFor(() => {
      const box = settings.getBoundingClientRect();
      expect(box.height).toBeGreaterThan(0);
      expect(settings).toHaveAttribute('data-side', side);
      expect(settings).not.toHaveAttribute('data-scrolls');
      const at = button.getBoundingClientRect();
      // On that side of the button.
      if (side === 'bottom') expect(box.top).toBeGreaterThanOrEqual(at.bottom);
      if (side === 'top') expect(box.bottom).toBeLessThanOrEqual(at.top);
      if (side === 'right') expect(box.left).toBeGreaterThanOrEqual(at.right);
      if (side === 'left') expect(box.right).toBeLessThanOrEqual(at.left);
      // The whole of them, inside the frame.
      expect(box.top).toBeGreaterThanOrEqual(frame.top - 0.5);
      expect(box.bottom).toBeLessThanOrEqual(frame.bottom + 0.5);
      expect(
        distanceBetween(box, corner.getBoundingClientRect()),
      ).toBeGreaterThanOrEqual(SETTINGS_OFFSET - 0.5);
    });
    const { left, top, width, height } = corner.getBoundingClientRect();
    const middle = { clientX: left + width / 2, clientY: top + height / 2 };
    // What a pointer pressed there would press: the corner, not the settings.
    const pressed = canvasElement.ownerDocument.elementFromPoint(
      middle.clientX,
      middle.clientY,
    );
    await expect(pressed).toBe(corner);

    await dragHandle(corner, { x: 0, y: -220 });
    await expect(args.update).toHaveBeenCalledWith({ size: draggedTo });
  };

/**
 * Below the button of a large picture, the settings stand over the picture
 * and stop well short of the corner at its bottom.
 */
export const SettingsBelowTheButton: Story = {
  tags: ONE_DIRECTION,
  render: placedIn({
    frame: { wide: 1200, tall: 900 },
    above: 60,
    left: 400,
    size: 'large',
  }),
  play: opensOn('bottom', 'medium'),
};

/**
 * Below the button of a medium picture, the settings would come to the
 * corner at its bottom: there is room for them there, but they open above
 * the button instead.
 */
export const SettingsAboveTheButton: Story = {
  tags: ONE_DIRECTION,
  render: placedIn({
    frame: { wide: 1200, tall: 900 },
    above: 480,
    left: 408,
    size: 'medium',
  }),
  play: opensOn('top', 'small'),
};

/**
 * Where they would come to the corner below the button and do not fit
 * above it, they open at the end of the line: the right, in text that reads
 * left to right.
 */
export const SettingsAtTheEndOfTheLine: Story = {
  tags: ONE_DIRECTION,
  render: placedIn({
    frame: { wide: 1200, tall: 900 },
    above: 80,
    left: 40,
    size: 'medium',
  }),
  play: opensOn('right', 'small'),
};

/** With no room at the end of the line either, they open at its start. */
export const SettingsAtTheStartOfTheLine: Story = {
  tags: ONE_DIRECTION,
  render: placedIn({
    frame: { wide: 1200, tall: 900 },
    above: 80,
    left: 600,
    size: 'medium',
  }),
  play: opensOn('left', 'small'),
};

/**
 * Where they fit on no side of the button, they open below it, stop short of
 * the corner, and scroll within.
 */
export const SettingsScrollWhereNoSideHasRoom: Story = {
  tags: ONE_DIRECTION,
  render: placedIn({
    frame: { wide: 700, tall: 600 },
    above: 80,
    left: 158,
    size: 'medium',
  }),
  play: async ({ canvasElement }) => {
    const settings = await openSettings(canvasElement, 'Image settings');
    const corner = await waitFor(() => {
      const found = canvasElement.querySelector('[data-asset-block-resize]');
      if (!(found instanceof HTMLElement)) throw new Error('No corner yet');
      return found;
    });
    await waitFor(() => {
      const box = settings.getBoundingClientRect();
      expect(box.height).toBeGreaterThan(0);
      expect(settings).toHaveAttribute('data-side', 'bottom');
      expect(settings).toHaveAttribute('data-scrolls');
      expect(box.bottom).toBeLessThanOrEqual(
        corner.getBoundingClientRect().top - KEEP_OUT_CLEARANCE + 0.5,
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
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#6ecae8"/></svg>',
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
 * Selects the block in the page, opens its settings from the button in its
 * tab, and waits for them. Clicked once its file is drawn: the preview
 * arrives after the block, and a click where an empty block is lands in the
 * text around it.
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
  // Selecting the block opens nothing.
  await expect(
    within(canvasElement.ownerDocument.body).queryByRole('dialog', { name }),
  ).toBeNull();
  const settings = await openSettings(block, name);
  return { block, settings: within(settings) };
};

// The page is a whole editor rather than a layout in the reading direction:
// the other stories mirror the block itself.
const WHOLE_EDITOR = ['!mirror'];

/**
 * A picture's file replaced from its settings: the resource browser opens
 * over them, and once a file is chosen the block draws it, is still
 * selected, and keeps its description, size and place. The settings close
 * with the view drawn for the first file, and open again from the block.
 */
export const ReplacingThePicture: Story = {
  tags: WHOLE_EDITOR,
  render: () => (
    <PageHost
      block={`![The neighbourhood](asset:${IMAGE_RESOURCE.id}?size=small)`}
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
    // How tall its size holds the first picture to.
    const heldTo = block.querySelector('img')?.getBoundingClientRect().height;
    if (heldTo === undefined) throw new Error('No picture');
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
    // Still the selection, with the caret on it. The view is made again for
    // the new file, and its settings with it: Enter on the block opens them.
    await expect(block).toHaveAttribute('data-selected');
    await waitFor(() =>
      expect(
        within(canvasElement).getByRole('textbox', { name: /^Rich Text/ }),
      ).toHaveFocus(),
    );
    await within(block).findByRole('button', { name: 'Image settings' });
    await userEvent.keyboard('{Enter}');
    const again = within(
      await body.findByRole('dialog', { name: 'Image settings' }),
    );
    await expect(
      within(again.getByRole('group', { name: 'Image' })).getByText(
        'Square sketch',
      ),
    ).toBeVisible();
    // Its corner is on the corner of the frame round it, small as it is.
    await expectCornerOfTheFrame(canvasElement);
    // Its other settings are kept.
    await expect(
      again.getByRole('textbox', { name: 'Description' }),
    ).toHaveValue('The neighbourhood');
    // So is its size, which holds the new picture to the same height, in
    // the middle of the line.
    const picture = block.querySelector('img');
    if (picture === null) throw new Error('No picture');
    await expect(picture.getBoundingClientRect().height).toBeCloseTo(heldTo, 0);
    await expect(getComputedStyle(picture).objectPosition).toBe('50% 50%');
    // And nothing else was chosen as the browser closed.
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Choose an image' }),
      ).toBeNull(),
    );
  },
};

/**
 * The settings reached from the keyboard: Enter on the selected block presses
 * its settings button, and focus goes to the first setting; Escape closes
 * them and gives focus back to the button, where Enter opens them again.
 * Enter on the block changes nothing in the text.
 */
export const SettingsFromTheKeyboard: Story = {
  tags: WHOLE_EDITOR,
  render: () => (
    <PageHost
      block={`![The neighbourhood](asset:${IMAGE_RESOURCE.id}?size=small)`}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const block = await waitFor(() => {
      const found =
        canvasElement.querySelector<HTMLElement>('[data-asset-block]');
      const image = found?.querySelector('img');
      if (found === null || image === null || image === undefined) {
        throw new Error('No picture yet');
      }
      if (!isDrawn(image)) throw new Error('The picture is not drawn yet');
      return found;
    });
    const text = within(canvasElement).getByRole('textbox', {
      name: /^Rich Text/,
    });
    // Selected with a click on the picture, which leaves focus in the text.
    const image = block.querySelector('img');
    if (image === null) throw new Error('No picture');
    const { left, top, width, height } = image.getBoundingClientRect();
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: image,
      coords: { clientX: left + width / 2, clientY: top + height / 2 },
    });
    await waitFor(() => expect(block).toHaveAttribute('data-selected'));
    await waitFor(() => expect(text).toHaveFocus());
    await expect(body.queryByRole('dialog')).toBeNull();

    await userEvent.keyboard('{Enter}');
    const settings = within(
      await body.findByRole('dialog', { name: 'Image settings' }),
    );
    const first = settings.getByRole('textbox', { name: 'Description' });
    await waitFor(() => expect(first).toHaveFocus());

    const button = within(block).getByRole('button', {
      name: 'Image settings',
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(body.queryByRole('dialog', { name: 'Image settings' })).toBeNull(),
    );
    await waitFor(() => expect(button).toHaveFocus());

    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(
        within(body.getByRole('dialog', { name: 'Image settings' })).getByRole(
          'textbox',
          { name: 'Description' },
        ),
      ).toHaveFocus(),
    );
    // Enter went to the settings: the page still has its block, and no new
    // paragraph took its place.
    await expect(canvasElement.querySelector('[data-asset-block]')).not.toBe(
      null,
    );
    await expect(text).toHaveTextContent(
      /^Welcome to the study\.Please read on\.$/,
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
    const { block, settings } = await selectBlock(
      canvasElement,
      'Video settings',
    );
    // The bar of controls along the bottom of the video stays uncovered.
    const video = block.querySelector('video');
    if (video === null) throw new Error('No video');
    const popup = settings
      .getByRole('textbox', { name: 'Description' })
      .closest('[role="dialog"]');
    if (popup === null) throw new Error('No settings');
    await waitFor(() => {
      const shown = popup.getBoundingClientRect();
      const file = video.getBoundingClientRect();
      expect(shown.height).toBeGreaterThan(0);
      const covers =
        shown.top < file.bottom &&
        shown.bottom > file.bottom - PLAYER_CONTROLS_HEIGHT &&
        shown.left < file.right &&
        shown.right > file.left;
      expect(covers).toBe(false);
    });
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
      settings.getByRole('button', { name: 'Delete video' }),
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
      <div lang="en-US" dir="ltr" className="w-[600px] pt-12">
        <DrawnBlock {...args} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const languageOf = (element: Element) => ({
      lang: element.closest('[lang]')?.getAttribute('lang'),
      dir: element.closest('[dir]')?.getAttribute('dir'),
    });
    // The settings button is named in plain English for a screen reader,
    // whatever the interface's language.
    const settings = await openSettings(canvasElement, 'Image settings');
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
    // While it is dragged, the size it would take is named by the handle.
    await dragHandle(corner, { x: 0, y: -20 }, { release: false });
    const sizeName = await waitFor(() => {
      const found = corner.nextElementSibling;
      if (found === null) throw new Error('No size named yet');
      return found;
    });
    await expect(languageOf(sizeName)).toEqual({ lang: 'ar', dir: 'rtl' });
    await expect(getComputedStyle(sizeName).fontFamily).toMatch(/Readex Pro/);
    corner.dispatchEvent(
      new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }),
    );
  },
};

/**
 * How wide a square picture is drawn at `size` in `block`, as the interview
 * draws it: an image given the classes that the interview gives it
 * (`assetBlockMediaVariants`), in a line as wide as the block's.
 */
const widthInTheInterview = async (
  block: HTMLElement,
  size: AssetBlockSize | null,
): Promise<number> => {
  const line = document.createElement('div');
  line.style.width = `${block.getBoundingClientRect().width}px`;
  const image = document.createElement('img');
  image.src = `data:image/svg+xml,${encodeURIComponent(SQUARE_RESOURCE.bytes ?? '')}`;
  image.className = assetBlockMediaVariants({ size: size ?? undefined });
  line.append(image);
  document.body.append(line);
  try {
    await waitFor(() => expect(isDrawn(image)).toBe(true));
    const { width, height } = image.getBoundingClientRect();
    // A square drawn whole inside the image's box.
    return Math.min(width, height);
  } finally {
    line.remove();
  }
};

/** How wide the picture in `block` is drawn, by the frame drawn round it. */
const drawnWidth = (block: HTMLElement): number => {
  const box = block.querySelector('[data-block-box]');
  if (box === null) throw new Error('No picture drawn');
  return box.getBoundingClientRect().width;
};

const sizeOf = (image: Element): AssetBlockSize | null =>
  ASSET_BLOCK_SIZES.find((size) =>
    image.classList.contains(
      { small: 'max-h-48', medium: 'max-h-96', large: 'max-h-[60vh]' }[size],
    ),
  ) ?? null;

/**
 * A picture resized with its handle, in the editor. While the handle is
 * dragged the picture grows and shrinks with the pointer and the size it
 * would take is named; let go, it takes the nearest size, drawn as wide as
 * the interview draws that size, and one undo takes it back. From the
 * keyboard, Tab reaches the handle after the settings button, and the arrow
 * keys move it a size at a time.
 */
export const ResizedByDragging: Story = {
  tags: WHOLE_EDITOR,
  render: () => (
    <PageHost block={`![A square](asset:${SQUARE_RESOURCE.id}?size=large)`} />
  ),
  play: async ({ canvasElement }) => {
    const block = await waitFor(() => {
      const found =
        canvasElement.querySelector<HTMLElement>('[data-asset-block]');
      const image = found?.querySelector('img');
      if (found === null || image === null || image === undefined) {
        throw new Error('No picture yet');
      }
      if (!isDrawn(image)) throw new Error('The picture is not drawn yet');
      return found;
    });
    const image = block.querySelector('img');
    if (image === null) throw new Error('No picture');
    await userEvent.click(image);
    await waitFor(() => expect(block).toHaveAttribute('data-selected'));
    const handle = await within(block).findByRole('slider', {
      name: 'Display size',
    });
    await expect(handle).toHaveAttribute('aria-valuetext', 'Large');
    await waitFor(async () =>
      expect(
        Math.abs(
          drawnWidth(block) - (await widthInTheInterview(block, 'large')),
        ),
      ).toBeLessThanOrEqual(1),
    );
    const large = drawnWidth(block);

    // Dragged up a little: the picture follows the pointer, a square 60
    // pixels shorter and narrower, between the sizes.
    await dragHandle(handle, { x: 0, y: -60 }, { release: false });
    await waitFor(() =>
      expect(Math.abs(drawnWidth(block) - (large - 60))).toBeLessThanOrEqual(1),
    );
    const named = handle.nextElementSibling;
    await expect(named?.textContent).toMatch(/^(Small|Medium|Large)$/);
    handle.dispatchEvent(
      new PointerEvent('lostpointercapture', { pointerId: 1, bubbles: true }),
    );
    // Let go of without a release, nothing changes.
    await waitFor(() => expect(drawnWidth(block)).toBeCloseTo(large, 0));
    await expect(sizeOf(image)).toBe('large');

    // Dragged to the width that the interview draws Small at, and let go.
    const small = await widthInTheInterview(block, 'small');
    await dragHandle(handle, { x: 0, y: -(large - small) });
    await waitFor(() => expect(sizeOf(image)).toBe('small'));
    await expect(handle).toHaveAttribute('aria-valuetext', 'Small');
    await expect(handle.nextElementSibling).toBeNull();
    await waitFor(() =>
      expect(Math.abs(drawnWidth(block) - small)).toBeLessThanOrEqual(1),
    );

    // One undo, in the text, takes it back.
    const text = within(canvasElement).getByRole('textbox', {
      name: /^Rich Text/,
    });
    await expect(text).toHaveFocus();
    await userEvent.keyboard(withMod('z'));
    await waitFor(() => expect(sizeOf(image)).toBe('large'));

    // From the keyboard: Tab reaches the settings button, then the handle.
    await userEvent.tab();
    await expect(
      within(block).getByRole('button', { name: 'Image settings' }),
    ).toHaveFocus();
    await userEvent.tab();
    await expect(handle).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(sizeOf(image)).toBe('medium'));
    await expect(handle).toHaveAttribute('aria-valuetext', 'Medium');
    await expect(handle).toHaveFocus();
    await waitFor(async () =>
      expect(
        Math.abs(
          drawnWidth(block) - (await widthInTheInterview(block, 'medium')),
        ),
      ).toBeLessThanOrEqual(1),
    );
  },
};
