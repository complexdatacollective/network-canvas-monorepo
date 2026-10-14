import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { FinishMode, FinishOutcome } from '@codaco/protocol-validation';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

type StoryArgs = {
  mode: FinishMode;
  content: string;
  finishedContent: string;
  outcome: FinishOutcome;
  onCompletedAction: () => void;
};

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();

  interview.addInformationStage({
    title: 'Before',
    text: 'Padding stage before the finish stage.',
  });
  interview.addFinishSessionStage({
    mode: args.mode,
    content: args.content,
    finishedContent: args.finishedContent,
    outcome: args.outcome,
  });

  return interview;
}

const FinishSessionStoryWrapper = (args: StoryArgs) => {
  const { onCompletedAction, ...stageArgs } = args;
  const configKey = JSON.stringify(stageArgs);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const interview = useMemo(() => buildInterview(args), [configKey]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );
  const completedActions = useMemo(
    () => [{ label: 'Exit', onAction: onCompletedAction }],
    [onCompletedAction],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        // A new configuration is a new interview, not a finished one.
        key={configKey}
        rawPayload={rawPayload}
        completedActions={completedActions}
      />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/FinishSession',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    mode: {
      control: 'inline-radio',
      options: ['confirmation', 'automatic'],
      description:
        'Confirmation shows the closing screen and asks before finishing; automatic finishes as soon as the stage is shown',
    },
    content: {
      control: 'text',
      description: 'Closing screen markdown, heading included',
    },
    finishedContent: {
      control: 'text',
      description: 'Finished screen markdown, heading included',
    },
    outcome: {
      control: 'inline-radio',
      options: ['completed', 'ineligible', 'terminated'],
      description:
        'How an interview that ends here ended; recorded by the host, never shown',
    },
  },
  args: {
    mode: 'confirmation',
    content:
      '# Finish Interview\n\nYou have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now.',
    finishedContent: '# Interview Finished\n\nThank you for participating!',
    outcome: 'completed',
    onCompletedAction: fn(),
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <FinishSessionStoryWrapper {...args} />,
};

export const AuthoredText: Story = {
  args: {
    content:
      '# Thank you for *your time*\n\nBased on your answers, this study is not looking for more people like you right now.\n\nFinish the interview to close it. **Your answers will not be used.**',
    finishedContent:
      '# Interview Finished\n\nThank you for your time. You can close this window.',
    outcome: 'ineligible',
  },
  render: (args) => <FinishSessionStoryWrapper {...args} />,
};

/**
 * Finishing replaces the interview with its finished screen and the host's
 * action.
 */
export const FinishingShowsCompletedState: Story = {
  render: (args) => <FinishSessionStoryWrapper {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Finish' }),
    );
    const dialog = await canvas.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Finish' }),
    );

    await expect(
      await canvas.findByRole('heading', { name: 'Interview Finished' }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Finish' }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('previous-button')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Exit' }));
    await expect(args.onCompletedAction).toHaveBeenCalledTimes(1);
  },
};

/**
 * An automatic finish stage ends the interview as soon as it is shown: no
 * closing screen, Finish button or question, straight to the finished screen.
 */
export const AutomaticFinish: Story = {
  args: { mode: 'automatic' },
  render: (args) => <FinishSessionStoryWrapper {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('heading', { name: 'Interview Finished' }),
    ).toBeVisible();
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Finish' }),
    ).not.toBeInTheDocument();
  },
};
