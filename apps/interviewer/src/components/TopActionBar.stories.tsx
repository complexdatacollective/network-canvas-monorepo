import type { Meta, StoryObj } from '@storybook/react-vite';

import { TopActionBarView } from './TopActionBar';

// The header's right-hand action cluster: view switcher, optional lock
// button (only when a security mode is enrolled), and settings. The default
// export (TopActionBar) reads the enrolled mode from useAuth; TopActionBarView
// is the pure presentation (ViewSwitcher itself reads the active route).

type StoryArgs = {
  showLock: boolean;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/TopActionBar',
  args: { showLock: true },
  argTypes: {
    showLock: {
      control: 'boolean',
      description: 'mode !== undefined && mode !== "none", from useAuth',
    },
  },
  render: ({ showLock }) => (
    <TopActionBarView
      showLock={showLock}
      onLock={() => {}}
      onOpenSettings={() => {}}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
