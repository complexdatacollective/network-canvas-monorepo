import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import {
  blockBoxProps,
  BlockTab,
} from '@codaco/fresco-ui/form/fields/RichTextEditor';
import Section from '@codaco/fresco-ui/Section';

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

/**
 * A block in a page that scrolls inside a frame 500 pixels tall, its settings
 * button 200 pixels down: there is no room for its settings below or above
 * the button, so they open at the end of the line. Its settings have a
 * section that the researcher can open, such as a field's validation.
 */
function BlockWithSection({ select }: Readonly<{ select: () => void }>) {
  const [open, setOpen] = useState(false);
  return (
    <div
      data-testid="frame"
      dir="ltr"
      className="overflow-y-auto"
      style={{ width: 1000, height: 500 }}
    >
      <div style={{ height: 200 }} />
      <div
        className="bg-surface-1 relative ms-10 h-40 w-72 rounded-sm"
        {...blockBoxProps(true)}
      >
        <BlockTab selected>
          <BlockSettingsPopover
            name="Field settings"
            open={open}
            onOpenChange={setOpen}
            select={select}
          >
            <div className="flex w-72 flex-col">
              <label className="flex flex-col gap-1">
                Description
                <input className="text-own-direction rounded border px-2" />
              </label>
              <div style={{ height: 240 }} />
              <Section title="Validation" toggleable defaultOpen={false}>
                <div style={{ height: 400 }} />
              </Section>
            </div>
          </BlockSettingsPopover>
        </BlockTab>
      </div>
      <div className="h-[800px]" />
    </div>
  );
}

/**
 * Opening a section in the settings makes them taller than the room they
 * have. They stay where they are, on the side they opened on with their top
 * where it was, and scroll within, rather than moving to another side or
 * moving up: the switch that the researcher has just pressed stays under the
 * pointer.
 */
export const StayingPutAsTheyGrow: Story = {
  render: (args) => <BlockWithSection {...args} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Field settings' }),
    );
    const settings = await page.findByRole('dialog', {
      name: 'Field settings',
    });
    const opened = await waitFor(() => {
      expect(settings).toHaveAttribute('data-side', 'right');
      const box = settings.getBoundingClientRect();
      expect(box.height).toBeGreaterThan(0);
      return box;
    });

    await userEvent.click(within(settings).getByRole('switch'));

    // Taller than the frame: cut short, and scrolled within.
    await waitFor(() =>
      expect(settings).toHaveAttribute('data-scrolls', 'true'),
    );
    await waitFor(() => {
      const box = settings.getBoundingClientRect();
      expect(settings).toHaveAttribute('data-side', 'right');
      expect(box.top).toBeCloseTo(opened.top, 0);
      expect(box.left).toBeCloseTo(opened.left, 0);
      expect(box.height).toBeGreaterThanOrEqual(opened.height);
    });
  },
};
