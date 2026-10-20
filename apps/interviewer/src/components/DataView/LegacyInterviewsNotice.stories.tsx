import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { LegacyInterviewsNotice } from './LegacyInterviewsNotice';

// The line at the top of the data view when Interviewer 8 keeps interviews
// from schema 8 protocols. Open is the caller's (Home settles the shared lock,
// then leaves for Interviewer 8's data view); here it is only logged.

const meta: Meta<typeof LegacyInterviewsNotice> = {
  title: 'Components/DataView/LegacyInterviewsNotice',
  component: LegacyInterviewsNotice,
  args: {
    count: 12,
    onOpen: fn(),
  },
  argTypes: {
    count: { control: { type: 'number', min: 1 } },
  },
  decorators: [
    (Story) => (
      <div className="w-[48rem] max-w-full">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LegacyInterviewsNotice>;

export const Default: Story = {};

export const OneInterview: Story = {
  args: { count: 1 },
};
