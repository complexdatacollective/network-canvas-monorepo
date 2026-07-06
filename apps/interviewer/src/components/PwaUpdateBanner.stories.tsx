import type { Meta, StoryObj } from '@storybook/react-vite';

import { PwaUpdateBannerView } from './PwaUpdateBanner';

// The bottom-centre "a new version is available" prompt. The default export
// (PwaUpdateBanner) wires this to useRegisterSW's needRefresh flag and
// wouter's location (withheld while an interview is active); this story
// drives the pure view directly via its `visible` prop.

type StoryArgs = {
  visible: boolean;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/PwaUpdateBanner',
  parameters: { layout: 'fullscreen' },
  args: { visible: true },
  argTypes: {
    visible: {
      control: 'boolean',
      description:
        'needRefresh && !dismissed && !interviewActive, computed by the container',
    },
  },
  render: ({ visible }) => (
    <PwaUpdateBannerView
      visible={visible}
      onReload={() => {}}
      onDismiss={() => {}}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
