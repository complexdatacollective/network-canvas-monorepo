import type { Meta, StoryObj } from '@storybook/react-vite';

import { LegacyInterviewsNotice } from './LegacyInterviewsNotice';

// The line at the top of the data view when Interviewer 8 keeps interviews
// from schema 8 protocols. Open leaves for Interviewer 8's data view (a full
// page load, so it does nothing useful inside Storybook).

const meta: Meta<typeof LegacyInterviewsNotice> = {
  title: 'Components/DataView/LegacyInterviewsNotice',
  component: LegacyInterviewsNotice,
  args: {
    count: 12,
    interviewer: { version: '8.5.0', path: '/v8/' },
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
