import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

function buildRawPayload() {
  const si = new SyntheticInterview();

  si.addInformationStage({
    title: 'Welcome',
    text: 'Welcome to the interview.',
  });
  si.addStage('NameGenerator', { label: 'People you know' }).addPrompt({
    text: 'Who do you know?',
  });
  si.addStage('Sociogram', { label: 'Your connections' }).addPrompt({
    text: 'Position the people you know.',
  });
  si.addStage('OrdinalBin', { label: 'How close' }).addPrompt({
    text: 'How close are you to each person?',
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'Thank you for taking part.',
  });

  const payload = si.getInterviewPayload({ currentStep: 0 });

  const skippedStage = payload.protocol.stages[2];
  if (skippedStage) {
    skippedStage.skipLogic = {
      action: 'SHOW',
      filter: {
        join: 'AND',
        rules: [
          {
            type: 'node',
            id: 'skip-rule',
            options: { type: 'never-existing-type', operator: 'EXISTS' },
          },
        ],
      },
    };
  }

  return SuperJSON.stringify(payload);
}

const rawPayload = buildRawPayload();

const meta: Meta = {
  title: 'Components/Navigation',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj;

const openAndAssertMenu = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  const trigger = await canvas.findByRole('button', {
    name: /go to a stage/i,
  });
  await userEvent.click(trigger);

  const menu = await canvas.findByRole('listbox', { name: /stages/i });
  const scoped = within(menu);

  await expect(scoped.getAllByRole('option')).toHaveLength(5);
  await expect(scoped.getByText('Skipped')).toBeInTheDocument();
  await expect(
    scoped.getByRole('option', { current: 'step' }),
  ).toHaveTextContent(/welcome/i);

  const filter = canvas.getByRole('searchbox', { name: /filter/i });
  await userEvent.type(filter, 'complete');
  await waitFor(() => expect(scoped.getAllByRole('option')).toHaveLength(1));

  await userEvent.click(scoped.getByRole('option', { name: /complete/i }));

  await waitFor(() =>
    expect(canvas.getByText(/thank you for taking part/i)).toBeInTheDocument(),
  );
};

export const StageNavigation: Story = {
  name: 'Stage navigation (vertical rail)',
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={rawPayload}
        navigationOrientation="vertical"
        allowStageNavigation
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await openAndAssertMenu(canvasElement);
  },
};

export const HorizontalStageNavigation: Story = {
  name: 'Stage navigation (horizontal bar)',
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={rawPayload}
        navigationOrientation="horizontal"
        allowStageNavigation
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await openAndAssertMenu(canvasElement);
  },
};
