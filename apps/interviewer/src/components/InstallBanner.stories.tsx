import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StorageRisk } from '@codaco/fresco-ui/StorageRiskBanner';

import { InstallBannerView } from './InstallBanner';

// The top-of-dashboard install nudge. InstallBanner (the container) reads
// the deferred beforeinstallprompt event and the installed-display-mode /
// per-session-dismissal state; InstallBannerView is the pure presentation.
// Its risk prop selects both the product-specific copy and the shared intent.

type StoryArgs = {
  risk: StorageRisk;
  canPromptInstall: boolean;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/InstallBanner',
  parameters: { layout: 'fullscreen' },
  args: {
    risk: 3,
    canPromptInstall: true,
  },
  argTypes: {
    risk: {
      control: 'select',
      options: [1, 2, 3],
      description:
        'Browser-storage danger: 1 Safari/high, 2 Firefox/medium, 3 Chromium/low.',
    },
    canPromptInstall: {
      control: 'boolean',
      description: 'Whether a one-tap Install button is available',
    },
  },
  render: ({ risk, canPromptInstall }) => (
    <InstallBannerView
      risk={risk}
      canPromptInstall={canPromptInstall}
      onInstall={() => {}}
      onDismiss={() => {}}
    />
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

export const ChromiumWithoutPrompt: Story = {
  args: { risk: 3, canPromptInstall: false },
};

export const SafariOnMac: Story = {
  args: { risk: 1, canPromptInstall: false },
};

export const Firefox: Story = {
  args: { risk: 2, canPromptInstall: false },
};
