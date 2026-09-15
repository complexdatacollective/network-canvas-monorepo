import type { StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test';

import Button from '../Button';
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

Use \`size="readable"\` for confirmations, notices, and small forms; \`editor\` for substantial forms; \`workspace\` for collections, maps, and previews; and \`fullscreen\` for immersive workflows. Every size fills the available width on narrow containers and stops growing at its semantic cap. \`className\` is merged last as an escape hatch.`,
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
