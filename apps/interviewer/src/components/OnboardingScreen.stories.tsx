import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { OnboardingScreenView } from './OnboardingScreen';

// The first-run welcome screen shown before the device is set up. "Get
// started" opens the setup wizard (a separate dialog flow, not storied here).
type StoryArgs = { onBegin: () => void };

const meta: Meta<StoryArgs> = {
  title: 'Components/OnboardingScreen',
  parameters: { layout: 'fullscreen' },
  args: { onBegin: fn() },
  render: ({ onBegin }) => <OnboardingScreenView onBegin={onBegin} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
