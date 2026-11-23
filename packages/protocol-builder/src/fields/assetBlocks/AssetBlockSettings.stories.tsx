import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from '@codaco/fresco-ui/Button';
import type { RichTextAssetBlockAttributes } from '@codaco/fresco-ui/form/fields/RichTextEditor';
import { assetBlockAttributes } from '@codaco/fresco-ui/testing/assetBlock';

import {
  type AssetBlockFileField,
  AssetBlockSettings,
} from './AssetBlockSettings.tsx';

type SettingsProps = ComponentProps<typeof AssetBlockSettings>;

/**
 * The settings as a block's view holds them: each change is the block's at
 * once, so what the settings offer next follows from what was just chosen.
 */
function HeldSettings(props: SettingsProps) {
  const [attributes, setAttributes] = useState(props.attributes);
  return (
    <AssetBlockSettings
      {...props}
      attributes={attributes}
      update={(changes: Partial<RichTextAssetBlockAttributes>) => {
        props.update(changes);
        setAttributes((current) => ({ ...current, ...changes }));
      }}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Asset block settings',
  component: AssetBlockSettings,
  render: HeldSettings,
  args: {
    asset: { kind: 'image', name: 'harbour.png' },
    attributes: assetBlockAttributes({ autoplay: false, loop: false }),
    direction: 'ltr',
    language: undefined,
    FileField: undefined,
    update: fn(),
    remove: fn(),
    returnToText: fn(),
    onBrowserOpenChange: fn(),
  },
} satisfies Meta<typeof AssetBlockSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * An image's settings: what it says to a screen reader and how large it is
 * drawn. Where it sits across the page is offered only once it is held to a
 * size, since a picture drawn as large as it is has nowhere else to sit; and
 * nothing about playing, which a picture does not do.
 */
export const ForAnImage: Story = {
  play: async ({ canvasElement, args }) => {
    const settings = within(canvasElement);
    await expect(
      settings.getByRole('textbox', { name: 'Description' }),
    ).toBeVisible();
    await expect(
      settings.queryByRole('group', { name: 'Alignment' }),
    ).toBeNull();
    await expect(settings.queryByRole('switch')).toBeNull();

    const size = settings.getByRole('group', { name: 'Display size' });
    await userEvent.click(within(size).getByRole('button', { name: 'Small' }));
    await expect(args.update).toHaveBeenLastCalledWith({ size: 'small' });

    const alignment = await settings.findByRole('group', { name: 'Alignment' });
    await userEvent.click(
      within(alignment).getByRole('button', { name: 'Align to the end' }),
    );
    await expect(args.update).toHaveBeenLastCalledWith({ align: 'end' });

    // Back to its own size, which is no size at all.
    await userEvent.click(
      within(size).getByRole('button', { name: 'Full size' }),
    );
    await expect(args.update).toHaveBeenLastCalledWith({ size: null });
    await expect(
      settings.queryByRole('group', { name: 'Alignment' }),
    ).toBeNull();
  },
};

/**
 * A recording's settings: no size, since a player is the height it is, but
 * always where it sits, and whether it plays by itself and again.
 */
export const ForAudio: Story = {
  args: { asset: { kind: 'audio', name: 'instructions.mp3' } },
  play: async ({ canvasElement, args }) => {
    const settings = within(canvasElement);
    await expect(
      settings.queryByRole('group', { name: 'Display size' }),
    ).toBeNull();
    await expect(
      settings.getByRole('group', { name: 'Alignment' }),
    ).toBeVisible();

    const autoplay = settings.getByRole('switch', {
      name: 'Start playing automatically',
    });
    await expect(autoplay).not.toBeChecked();
    await userEvent.click(autoplay);
    await expect(args.update).toHaveBeenLastCalledWith({ autoplay: true });
    await expect(autoplay).toBeChecked();
  },
};

/** A video's settings: how large it is drawn, and how it plays. */
export const ForAVideo: Story = {
  args: {
    asset: { kind: 'video', name: 'walkthrough.mp4' },
    attributes: assetBlockAttributes({
      size: 'medium',
      autoplay: false,
      loop: false,
    }),
  },
  play: async ({ canvasElement, args }) => {
    const settings = within(canvasElement);
    const size = settings.getByRole('group', { name: 'Display size' });
    await expect(
      within(size).getByRole('button', { name: 'Medium' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      settings.getByRole('group', { name: 'Alignment' }),
    ).toBeVisible();

    await userEvent.click(
      settings.getByRole('switch', { name: 'Repeat when it ends' }),
    );
    await expect(args.update).toHaveBeenLastCalledWith({ loop: true });
    await expect(
      settings.getByRole('switch', { name: 'Start playing automatically' }),
    ).not.toBeChecked();
  },
};

/**
 * Text that runs right to left: the alignment that sits a picture where a
 * line starts is drawn against the right, where its lines start, whichever
 * way the interface reads.
 */
export const InTextThatRunsRightToLeft: Story = {
  args: {
    direction: 'rtl',
    attributes: assetBlockAttributes({ size: 'small' }),
  },
  play: async ({ canvasElement }) => {
    const alignment = within(canvasElement).getByRole('group', {
      name: 'Alignment',
    });
    const iconOf = (name: string) =>
      within(alignment).getByRole('button', { name }).querySelector('svg');
    await expect(iconOf('Align to the start')).toHaveClass(
      'lucide-align-right',
    );
    await expect(iconOf('Align to the end')).toHaveClass('lucide-align-left');
  },
};

/**
 * A stand-in for the field the host offers a block's file in, with one way
 * to take the file away.
 */
const FileTakenAwayField: AssetBlockFileField = ({ onChange }) => (
  <Button type="button" size="sm" onClick={() => onChange?.(undefined)}>
    Take the file away
  </Button>
);

/**
 * A block is its file: one whose file is taken away in its settings is
 * deleted, rather than left naming nothing.
 */
export const AFileTakenAway: Story = {
  args: { FileField: FileTakenAwayField },
  play: async ({ canvasElement, args }) => {
    const settings = within(canvasElement);
    // Offered under the name of the kind of file the block holds.
    await expect(settings.getByText('Image')).toBeVisible();
    await userEvent.click(
      settings.getByRole('button', { name: 'Take the file away' }),
    );
    await expect(args.remove).toHaveBeenCalledOnce();
    await expect(args.update).not.toHaveBeenCalled();
  },
};
