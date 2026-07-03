import type { Meta, StoryObj } from '@storybook/react-vite';

import { TopActionBarView } from './TopActionBar';
import type { View } from './ViewSwitcher';

// The header's right-hand action cluster: view switcher, optional lock
// button (only when a security mode is enrolled), and settings. The default
// export (TopActionBar) reads the enrolled mode from useAuth and the active
// route from wouter; TopActionBarView is the pure presentation.

type StoryArgs = {
  view: View;
  showLock: boolean;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/TopActionBar',
  args: { view: 'protocols', showLock: true },
  argTypes: {
    view: {
      control: 'inline-radio',
      options: ['protocols', 'data'],
    },
    showLock: {
      control: 'boolean',
      description: 'mode !== undefined && mode !== "none", from useAuth',
    },
  },
  render: ({ view, showLock }) => (
    <TopActionBarView
      view={view}
      showLock={showLock}
      onLock={() => {}}
      onOpenSettings={() => {}}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
