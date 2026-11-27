import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import {
  blockBoxProps,
  BlockTab,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';

import { BlockSettingsPopover } from './BlockSettingsPopover.tsx';

/**
 * A block with its tab, as a view in the rich text editor draws one, and its
 * settings opened from the button in the tab.
 */
function Block({ select }: Readonly<{ select: () => void }>) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-16">
      <div
        className="bg-surface-1 relative h-40 w-96 rounded-sm"
        {...blockBoxProps(true)}
      >
        <BlockTab selected>
          <BlockSettingsPopover
            name="Image settings"
            open={open}
            onOpenChange={setOpen}
            select={select}
          >
            <label className="flex flex-col gap-1">
              Description
              <input className="text-own-direction rounded border px-2" />
            </label>
          </BlockSettingsPopover>
        </BlockTab>
      </div>
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Block settings popover',
  component: Block,
  args: { select: fn() },
} satisfies Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Closed until the button is pressed. Pressing it selects the block and opens
 * the settings below the button, with focus at their first control; Escape
 * closes them and gives focus back to the button.
 */
export const OpenedFromTheButton: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body);
    const button = within(canvasElement).getByRole('button', {
      name: 'Image settings',
    });
    await expect(page.queryByRole('dialog')).toBeNull();

    await userEvent.click(button);
    const settings = await page.findByRole('dialog', {
      name: 'Image settings',
    });
    await expect(args.select).toHaveBeenCalled();
    await waitFor(() =>
      expect(within(settings).getByRole('textbox')).toHaveFocus(),
    );
    await waitFor(() => {
      expect(settings).toHaveAttribute('data-side', 'bottom');
      expect(settings.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        button.getBoundingClientRect().bottom,
      );
    });

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
  },
};
