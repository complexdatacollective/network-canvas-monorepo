import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { createAssetBlockView } from './assetBlocks.tsx';

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
    attributes: {
      assetId: 'a1',
      description: '',
      size: 'small',
      align: 'center',
      autoplay: true,
      loop: true,
    },
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
 * page beside it the settings that change how it shows.
 */
export const SelectedImage: Story = {
  play: async ({ canvasElement, args }) => {
    // The settings stand over the page, outside the story's own element.
    const settings = within(
      await within(canvasElement.ownerDocument.body).findByRole('dialog', {
        name: 'Image settings',
      }),
    );
    await userEvent.click(settings.getByRole('button', { name: 'Large' }));
    await expect(args.update).toHaveBeenCalledWith({ size: 'large' });
    await userEvent.click(
      settings.getByRole('button', { name: 'Remove from the text' }),
    );
    await expect(args.remove).toHaveBeenCalled();
  },
};

/** Not selected: just the picture, as the participant will meet it. */
export const NotSelected: Story = {
  args: { selected: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole('button', {
        name: 'Remove from the text',
      }),
    ).toBeNull();
  },
};

/** A block naming a file the protocol no longer holds says so. */
export const MissingFile: Story = {
  args: { attributes: { ...meta.args.attributes, assetId: 'missing' } },
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
 * The corner that resizes a picture is the one that moves as it grows: the
 * bottom corner on the side away from the edge the picture is held against.
 */
const cornerIsWhereThePictureGrows: Story['play'] = async ({
  canvasElement,
}) => {
  const corner = await waitFor(() => {
    const found = canvasElement.querySelector('[data-asset-block-resize]');
    if (found === null) throw new Error('No corner yet');
    return found.getBoundingClientRect();
  });
  const image = canvasElement.querySelector('img');
  if (image === null) throw new Error('No picture');
  const box = image.getBoundingClientRect();
  // Square, and as tall as its element: so that much of the element's width.
  const drawn = box.height;
  await expect(drawn).toBeLessThan(box.width);
  const across =
    Number.parseFloat(getComputedStyle(image).objectPosition) / 100;
  const left = box.left + (box.width - drawn) * across;
  // Held against the right of its box, it grows to the left; else the right.
  const grows = across === 1 ? left : left + drawn;
  await expect(
    Math.abs((corner.left + corner.right) / 2 - grows),
  ).toBeLessThanOrEqual(2);
  await expect(
    Math.abs((corner.top + corner.bottom) / 2 - box.bottom),
  ).toBeLessThanOrEqual(2);
};

// These stories are each about one direction of text, which they set
// themselves, so there is no other direction to draw them in and compare.
const ONE_DIRECTION = ['!mirror'];

const drawnIn = (direction: 'ltr' | 'rtl'): Story['render'] =>
  function Drawn(args) {
    return (
      <div dir={direction} className="w-[600px]">
        <DrawnView {...args} />
      </div>
    );
  };

/** Text that reads left to right, its picture where a line ends. */
export const CornerOfAPictureAtTheEnd: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'end' } },
  render: drawnIn('ltr'),
  tags: ONE_DIRECTION,
  play: cornerIsWhereThePictureGrows,
};

/**
 * Text that reads right to left, its picture where a line starts: against the
 * right of its box, as above, though the page runs the other way.
 */
export const CornerOfAPictureInRightToLeftText: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'start' } },
  render: drawnIn('rtl'),
  tags: ONE_DIRECTION,
  play: cornerIsWhereThePictureGrows,
};

/** Right to left, and where a line ends: against the left of its box. */
export const CornerOfAPictureAtTheEndOfRightToLeftText: Story = {
  args: { attributes: { ...meta.args.attributes, align: 'end' } },
  render: drawnIn('rtl'),
  tags: ONE_DIRECTION,
  play: cornerIsWhereThePictureGrows,
};
