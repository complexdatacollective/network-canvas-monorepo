import type { Meta, StoryObj } from '@storybook/react-vite';

import { withFormStore } from '~/storybook/decorators';

import { NewSessionFormView } from './NewSessionForm';

// The case-ID entry form shown before an interview starts. The interesting
// branch is offline + a protocol that needs the internet (a Geospatial
// stage): submitting then warns before creating the session. Toggle `online`
// and `requiresInternet` to see it.
type StoryArgs = { online: boolean; requiresInternet: boolean };

const meta: Meta<StoryArgs> = {
  title: 'Components/NewSessionForm',
  parameters: { layout: 'padded' },
  decorators: [withFormStore],
  args: { online: true, requiresInternet: true },
  argTypes: {
    online: { control: 'boolean' },
    requiresInternet: { control: 'boolean' },
  },
  render: ({ online, requiresInternet }) => (
    <div className="max-w-md">
      <NewSessionFormView
        online={online}
        requiresInternet={requiresInternet}
        onCancel={() => {
          // No-op in the story: there's no host screen to return to.
        }}
        onSubmit={async (_caseId) => {
          await new Promise((r) => setTimeout(r, 200));
          return { success: true };
        }}
      />
    </div>
  ),
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};

// Offline with an internet-requiring protocol: submitting surfaces the
// "You appear to be offline" warning dialog before the session is created.
export const OfflineRequiresInternet: Story = {
  args: { online: false, requiresInternet: true },
};
