import type { Meta, StoryObj } from '@storybook/react-vite';

import { InstallBannerView } from './InstallBanner';

// The top-of-dashboard install nudge. InstallBanner (the container) reads
// the deferred beforeinstallprompt event and the installed-display-mode /
// per-session-dismissal state; InstallBannerView is the pure presentation,
// storied here with the browser-specific copy passed in directly.

const CHROMIUM_WITH_PROMPT =
  'Interviews stored in a browser tab can be deleted by the browser. Install Interviewer to keep data safe on this device.';
const CHROMIUM_NO_PROMPT =
  "Interviews stored in a browser tab can be deleted by the browser. To keep data safe, install Interviewer using the install icon in the browser's address bar.";
const SAFARI_MAC =
  'Safari deletes data stored by a browser tab after about 7 days without use. To keep interview data safe, install Interviewer: choose Share → Add to Dock.';
const FIREFOX =
  "Interviews stored in a browser tab can be deleted by the browser, and Firefox can't install web apps. To keep data safe, install Interviewer from Chrome, Edge, or Safari on this device.";

type StoryArgs = {
  message: string;
  canPromptInstall: boolean;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/InstallBanner',
  parameters: { layout: 'fullscreen' },
  args: {
    message: CHROMIUM_WITH_PROMPT,
    canPromptInstall: true,
  },
  argTypes: {
    message: { control: 'text' },
    canPromptInstall: {
      control: 'boolean',
      description: 'Whether a one-tap Install button is available',
    },
  },
  render: ({ message, canPromptInstall }) => (
    <InstallBannerView
      message={message}
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
  args: { message: CHROMIUM_NO_PROMPT, canPromptInstall: false },
};

export const SafariOnMac: Story = {
  args: { message: SAFARI_MAC, canPromptInstall: false },
};

export const Firefox: Story = {
  args: { message: FIREFOX, canPromptInstall: false },
};
