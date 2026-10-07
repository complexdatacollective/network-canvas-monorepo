import type { StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import Button from '../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import ComboboxField from '../form/fields/Combobox/Combobox';
import SelectField from '../form/fields/Select/Styled';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { PortalContainerProvider } from '../PortalContainer';
import Paragraph from '../typography/Paragraph';
import Dialog, { type DialogProps, STATE_VARIANTS } from './Dialog';
import { DIALOG_SIZES } from './DialogPopup';

const meta = {
  title: 'Systems/Dialogs/Dialog',
  component: Dialog as never,
  args: {
    closeDialog: fn(),
  },
  argTypes: {
    accent: {
      control: {
        type: 'select',
        options: STATE_VARIANTS,
      },
    },
    size: {
      control: {
        type: 'select',
      },
      options: DIALOG_SIZES,
      description:
        'Semantic width preset. Use className only for exceptional sizing requirements.',
    },
    title: {
      control: 'text',
    },
    description: {
      control: 'text',
    },
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `Accessible modal dialog with a fixed header and footer and a scrollable content region.

Use \`size="readable"\` for confirmations, notices, and small forms; \`editor\` for substantial forms; \`workspace\` for collections, maps, and previews; \`fullscreen\` for immersive workflows; and \`viewport\` for tools, such as large tables, that need the whole viewport less a narrow margin. Every size fills the available width on narrow containers and stops growing at its semantic cap; \`viewport\` has none. \`className\` is merged last as an escape hatch.`,
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Dialog>;

const DialogTemplate = (args: DialogProps) => (
  <Dialog
    {...args}
    open={true}
    footer={
      <>
        <Button onClick={args.closeDialog}>Cancel</Button>
        <Button color="primary" onClick={args.closeDialog}>
          Continue
        </Button>
      </>
    }
  >
    <Paragraph margin="none">
      This is additional content inside the dialog.
    </Paragraph>
  </Dialog>
);

export const Default: Story = {
  args: {
    title: 'Default Dialog',
    description: 'This is a default dialog description',
  },
  render: (args) => <DialogTemplate {...args} />,
};

export const Editor: Story = {
  args: {
    title: 'Edit field',
    description:
      'Editor dialogs provide enough room for structured forms and rich input controls.',
    size: 'editor',
  },
  render: (args) => <DialogTemplate {...args} />,
};

export const Workspace: Story = {
  args: {
    title: 'Resource browser',
    description:
      'Workspace dialogs are intended for collections, maps, media previews, and other horizontally demanding tools.',
    size: 'workspace',
  },
  render: (args) => <DialogTemplate {...args} />,
};

export const Fullscreen: Story = {
  args: {
    title: 'Select an interface',
    description:
      'Fullscreen dialogs provide a viewport-like workspace while retaining dialog focus management and actions.',
    size: 'fullscreen',
  },
  render: (args) => <DialogTemplate {...args} />,
};

export const Viewport: Story = {
  args: {
    title: 'Translation table',
    description:
      'Viewport dialogs fill the whole viewport less a narrow margin, with no width or height cap, for tools such as large tables whose content is wider and taller than any screen.',
    size: 'viewport',
  },
  render: (args) => <DialogTemplate {...args} />,
};

export const LongDescription: Story = {
  args: {
    title: 'Return to start screen?',
    description:
      "Your work is saved automatically on this device, so you can return to the editor at any time. Don't forget to download your protocol when you are ready to collect data. This additional sentence demonstrates that generated descriptions retain a readable line length rather than expanding the dialog shell.",
    size: 'readable',
  },
  render: (args) => <DialogTemplate {...args} />,
};

export const Success: Story = {
  args: {
    title: 'Success Dialog',
    description: 'This dialog indicates success.',
    accent: 'success',
  },
  render: (args) => <DialogTemplate {...args} />,
};

export const Destructive: Story = {
  args: {
    title: 'Destructive Dialog',
    description: 'This dialog indicates destructive.',
    accent: 'destructive',
  },
  render: (args) => <DialogTemplate {...args} />,
};

export const Info: Story = {
  args: {
    title: 'Info Dialog',
    description: 'This dialog provides some information.',
    accent: 'info',
  },
  render: (args) => <DialogTemplate {...args} />,
};

function DialogWithinADialogExample() {
  const [inner, setInner] = useState(false);

  return (
    <Dialog
      open
      title="Edit this prompt"
      description="Opening a second dialog from in here dims this one the same way this one dims the page."
      size="editor"
    >
      <Paragraph margin="none">
        The attribute this prompt asks about is chosen in its own dialog.
      </Paragraph>
      <Button color="primary" onClick={() => setInner(true)}>
        Change attribute
      </Button>
      <Dialog
        open={inner}
        title="Choose an attribute"
        description="Written inside the dialog above, rather than beside it."
        closeDialog={() => setInner(false)}
        footer={<Button onClick={() => setInner(false)}>Cancel</Button>}
      >
        <Paragraph margin="none">
          Pretend there is a list of attributes here.
        </Paragraph>
      </Dialog>
    </Dialog>
  );
}

/**
 * A dialog written inside another dialog's children, rather than opened
 * beside it through `useDialog`.
 *
 * Each open layer dims and blurs what is behind it, so the page recedes
 * further the deeper the stack goes. Base UI's own default is the opposite —
 * it suppresses the backdrop of any dialog nested inside an open one, and
 * nesting is React context, so a portalled overlay opened from inside a dialog
 * counts — which would leave this inner dialog floating over an undimmed
 * parent. `Modal` overrides it for every modal surface in the system.
 */
export const DialogWithinADialog: Story = {
  render: () => <DialogWithinADialogExample />,
  play: async () => {
    const backdrops = () =>
      document.querySelectorAll('[data-modal-backdrop]').length;

    await expect(
      await screen.findByRole('dialog', { name: 'Edit this prompt' }),
    ).toBeInTheDocument();
    await waitFor(async () => {
      await expect(backdrops()).toBe(1);
    });

    await userEvent.click(
      screen.getByRole('button', { name: 'Change attribute' }),
    );

    await expect(
      await screen.findByRole('dialog', { name: 'Choose an attribute' }),
    ).toBeInTheDocument();
    // The inner dialog's own dimmed layer, on top of the outer one's. Left
    // open: the stacked dim is what this story is a picture of.
    await waitFor(async () => {
      await expect(backdrops()).toBe(2);
    });
  },
};

function PopupsInsideADialogExample() {
  const [open, setOpen] = useState(true);
  const [language, setLanguage] = useState<string | number | undefined>();
  const [people, setPeople] = useState<(string | number)[]>([]);

  return (
    // Every app mounts the shared portal container (Architect at its root,
    // `ThemedRegion` for the themed surfaces), and that container is what
    // put popups beside the dialog instead of in it. Storybook's default
    // theme mounts none, which lets Base UI nest the popups by itself and
    // hides the bug, so this story mounts one explicitly.
    <PortalContainerProvider>
      <Button onClick={() => setOpen(true)}>Edit the label</Button>
      <Dialog
        open={open}
        closeDialog={() => setOpen(false)}
        title="Edit this label"
        description="Every popup opened from in here has to reach a screen reader, not only the eye."
        footer={
          <Button color="primary" onClick={() => setOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col items-start gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Editing language
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>English</DropdownMenuItem>
              <DropdownMenuItem>Español</DropdownMenuItem>
              <DropdownMenuItem>Français</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SelectField
            name="interview-language"
            aria-label="Interview language"
            placeholder="Choose a language"
            options={[
              { value: 'en', label: 'English' },
              { value: 'es', label: 'Español' },
              { value: 'fr', label: 'Français' },
            ]}
            value={language}
            onChange={setLanguage}
          />
          <ComboboxField
            name="translators"
            aria-label="Translators"
            placeholder="Choose translators"
            options={[
              { value: 'p1', label: 'Alice Johnson' },
              { value: 'p2', label: 'Bob Smith' },
            ]}
            value={people}
            onChange={(next) => setPeople(next ?? [])}
          />
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              Formatting help
            </PopoverTrigger>
            <PopoverContent>
              <Paragraph margin="none">Wrap a word in asterisks.</Paragraph>
              <Button size="sm">Insert an example</Button>
            </PopoverContent>
          </Popover>
        </div>
      </Dialog>
    </PortalContainerProvider>
  );
}

/**
 * Menus, selects, comboboxes and popovers opened from inside a dialog.
 *
 * Each popup portals into the dialog's own portal node. When the dialog
 * opens, Base UI hides everything outside it with `aria-hidden`, and it only
 * exempts portals nested in that dialog's portal node. Popups used to portal
 * into the shared container beside the dialog instead. The menu and the
 * popover stay mounted while closed, so their portals already existed when the
 * dialog opened and were hidden: they could be seen and clicked, but a screen
 * reader could not read them. That is why every query in this story leaves
 * out `hidden: true`.
 *
 * Escape closes the popup first and the dialog second, and focus stays trapped
 * in the dialog between the two.
 */
export const PopupsInsideADialog: Story = {
  render: () => <PopupsInsideADialogExample />,
  play: async ({ step }) => {
    const title = 'Edit this label';

    // Testing Library already refuses an element under `aria-hidden="true"`
    // unless `hidden: true` is passed. `inert` takes a subtree out of the
    // accessibility tree too, and it does not check that, so check both.
    const expectExposed = async (element: Element) => {
      await expect(element.closest('[aria-hidden="true"], [inert]')).toBeNull();
    };

    // Opens the popup from its trigger and returns the trigger. Every
    // trigger here reports its popup's state through `aria-expanded`, which
    // is the one closed-state signal all four share: Base UI keeps a closed
    // select's listbox in the DOM.
    const openFrom = async (trigger: HTMLElement) => {
      await userEvent.click(trigger);
      await waitFor(async () => {
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
      return trigger;
    };

    // One Escape closes the popup and nothing else: the dialog stays open.
    const closeWithEscape = async (trigger: HTMLElement) => {
      await userEvent.keyboard('{Escape}');
      await waitFor(async () => {
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      });
      await expect(screen.getByRole('dialog', { name: title })).toBeVisible();
    };

    let dialog = await screen.findByRole('dialog', { name: title });

    const menuTrigger = within(dialog).getByRole('button', {
      name: 'Editing language',
    });

    await step('a menu inside the dialog is exposed', async () => {
      await openFrom(menuTrigger);
      const menu = await screen.findByRole('menu');
      const items = within(menu).getAllByRole('menuitem');
      await expect(items.map((item) => item.textContent)).toEqual([
        'English',
        'Español',
        'Français',
      ]);
      await expectExposed(menu);
    });

    await step(
      'Escape closes the menu and returns focus to its trigger',
      async () => {
        await closeWithEscape(menuTrigger);
        await waitFor(async () => {
          await expect(menuTrigger).toHaveFocus();
        });
      },
    );

    await step('a select inside the dialog is exposed', async () => {
      const trigger = await openFrom(
        within(dialog).getByRole('combobox', { name: 'Interview language' }),
      );
      const listbox = await screen.findByRole('listbox');
      await expect(within(listbox).getAllByRole('option')).toHaveLength(3);
      await expectExposed(listbox);
      await closeWithEscape(trigger);
    });

    await step('a combobox inside the dialog is exposed', async () => {
      const trigger = await openFrom(
        within(dialog).getByRole('combobox', { name: 'Translators' }),
      );
      const listbox = await screen.findByRole('listbox');
      await expect(within(listbox).getAllByRole('option')).toHaveLength(2);
      await expectExposed(listbox);
      await closeWithEscape(trigger);
    });

    await step('a popover inside the dialog is exposed', async () => {
      const trigger = await openFrom(
        within(dialog).getByRole('button', { name: 'Formatting help' }),
      );
      await expectExposed(
        await screen.findByRole('button', { name: 'Insert an example' }),
      );
      await closeWithEscape(trigger);
    });

    await step('Tab stays inside the dialog', async () => {
      // A Tab off either end lands on one of Base UI's focus guards, which
      // sends focus back into the dialog on the next animation frame, so
      // each press waits for focus to settle in the dialog. Focus that
      // escaped would not come back, and the wait would time out.
      const expectFocusInDialog = () =>
        waitFor(async () => {
          await expect(dialog).toContainElement(
            document.activeElement as HTMLElement | null,
          );
        });

      // More presses than the dialog has tab stops, so the trap has to wrap
      // at least once in each direction.
      for (let press = 0; press < 10; press += 1) {
        await userEvent.tab();
        await expectFocusInDialog();
      }
      for (let press = 0; press < 10; press += 1) {
        await userEvent.tab({ shift: true });
        await expectFocusInDialog();
      }
    });

    await step('with no popup open, Escape closes the dialog', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(async () => {
        await expect(
          screen.queryByRole('dialog', { name: title, hidden: true }),
        ).toBeNull();
      });
    });

    await step('closing the dialog releases the page behind it', async () => {
      await expectExposed(
        screen.getByRole('button', { name: 'Edit the label' }),
      );
    });

    // Reopened and left with the menu showing: the menu over the dialog is
    // what this story is a picture of.
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit the label' }),
    );
    dialog = await screen.findByRole('dialog', { name: title });
    await openFrom(
      within(dialog).getByRole('button', { name: 'Editing language' }),
    );
    await expectExposed(await screen.findByRole('menu'));
  },
};
