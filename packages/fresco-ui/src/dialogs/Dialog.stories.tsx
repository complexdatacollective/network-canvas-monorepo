import type { StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

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
      "Your work is saved automatically in your browser, so you can return to the editor at any time. Don't forget to download your protocol when you are ready to collect data. This additional sentence demonstrates that generated descriptions retain a readable line length rather than expanding the dialog shell.",
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
