import type { Meta, StoryObj } from '@storybook/react-vite';

import Button from '@codaco/fresco-ui/Button';

import { SettingsRow } from './SettingsRow';

// A labelled row used throughout SettingsDialog: a title/description pair on
// the left, an arbitrary control on the right (a value, a button, a toggle).
// Pure presentation — storied directly with a sample control passed via
// `render`, matching SettingsDialog's own usage.

type StoryArgs = {
  title: string;
  desc: string;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/SettingsRow',
  args: {
    title: 'Delete synthetic data',
    desc: 'There are currently 3 synthetic sessions on this device.',
  },
  render: ({ title, desc }) => (
    <div className="w-md">
      <SettingsRow
        title={title}
        desc={desc}
        control={
          <Button color="destructive" onClick={() => {}}>
            Delete All
          </Button>
        }
      />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
