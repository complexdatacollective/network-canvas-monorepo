import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { FinishOutcome } from '@codaco/protocol-validation';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

type StoryArgs = {
  title: string;
  content: string;
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
    title: args.title,
    content: args.content,
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
    title: {
      control: 'text',
      description: 'Heading; inline markdown (emphasis) only',
    },
    content: {
      control: 'text',
      description: 'Markdown shown below the heading',
    },
    outcome: {
      control: 'inline-radio',
      options: ['completed', 'ineligible', 'terminated'],
      description:
        'How an interview that ends here ended; recorded by the host, never shown',
    },
  },
  args: {
    title: 'Finish Interview',
    content:
      'You have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now.',
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
    title: 'Thank you for *your time*',
    content:
      'Based on your answers, this study is not looking for more people like you right now.\n\nFinish the interview to close it. **Your answers will not be used.**',
    outcome: 'ineligible',
  },
  render: (args) => <FinishSessionStoryWrapper {...args} />,
};

/**
 * Finishing replaces the interview with its completed state: the closing text,
 * a notice that the answers can no longer be changed, and the host's action.
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
      await canvas.findByText(
        'This interview is finished, and its answers can no longer be changed.',
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Finish' }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByTestId('previous-button')).toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'Exit' }));
    await expect(args.onCompletedAction).toHaveBeenCalledTimes(1);
  },
};
