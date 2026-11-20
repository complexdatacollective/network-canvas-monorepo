import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

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
