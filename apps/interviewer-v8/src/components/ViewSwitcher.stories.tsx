import type { Meta, StoryObj } from '@storybook/react-vite';

import { type View, ViewSwitcherView } from './ViewSwitcher';

// The Protocols/Data segmented tab pill shown in Home's header. The default
// export (ViewSwitcher) reads the active segment from wouter's route;
// ViewSwitcherView is the pure presentation, storied here with `value` set
// directly. Each segment is a real link (see ViewSwitcher), so clicking one
// in this story navigates like it would in the app.

type StoryArgs = { value: View };

const meta: Meta<StoryArgs> = {
  title: 'Components/ViewSwitcher',
  args: { value: 'protocols' },
  argTypes: {
    value: {
      control: 'inline-radio',
      options: ['protocols', 'data'],
    },
  },
  render: ({ value }) => <ViewSwitcherView value={value} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
