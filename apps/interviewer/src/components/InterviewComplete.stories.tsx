import type { Meta, StoryObj } from '@storybook/react-vite';

import { InterviewComplete } from './InterviewComplete';

// The terminal screen shown once an interview finishes. Pure presentation —
// its only prop is the exit callback — so it's storied directly.

type StoryArgs = {
  onExit: () => void;
};

const meta: Meta<StoryArgs> = {
  title: 'Components/InterviewComplete',
  parameters: { layout: 'fullscreen' },
  render: ({ onExit }) => <InterviewComplete onExit={onExit} />,
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  args: { onExit: () => {} },
};
