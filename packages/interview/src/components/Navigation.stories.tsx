import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

// Middle (non-Information) stages the demo cycles through as the stage count
// grows. Each is a real interface type with a generated preview image.
const MIDDLE_STAGES = [
  {
    type: 'NameGenerator',
    label: 'People you know',
    prompt: 'Who do you know?',
  },
  {
    type: 'Sociogram',
    label: 'Your connections',
    prompt: 'Position the people you know.',
  },
  {
    type: 'OrdinalBin',
    label: 'How close',
    prompt: 'How close are you to each person?',
  },
] as const;

function buildRawPayload(stageCount: number): string {
  const si = new SyntheticInterview();

  si.addInformationStage({
    title: 'Welcome',
    text: 'Welcome to the interview.',
  });

  const middleCount = Math.max(0, stageCount - 2);
  for (let i = 0; i < middleCount; i++) {
    const base = MIDDLE_STAGES[i % MIDDLE_STAGES.length];
    if (!base) continue;
    const label =
      i < MIDDLE_STAGES.length ? base.label : `${base.label} ${i + 1}`;
    si.addStage(base.type, { label }).addPrompt({ text: base.prompt });
  }

  si.addInformationStage({
    title: 'Complete',
    text: 'Thank you for taking part.',
  });

  const payload = si.getInterviewPayload({ currentStep: 0 });

  // Mark a middle stage as skip-logic-hidden so the menu shows the skipped
  // indicator (only when there is a middle stage to hide).
  const skipIndex = middleCount > 0 ? Math.min(2, stageCount - 2) : -1;
  const skippedStage =
    skipIndex >= 0 ? payload.protocol.stages[skipIndex] : undefined;
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

const payloadCache = new Map<number, string>();
function getRawPayload(stageCount: number): string {
  const cached = payloadCache.get(stageCount);
  if (cached) return cached;
  const built = buildRawPayload(stageCount);
  payloadCache.set(stageCount, built);
  return built;
}

type StoryArgs = { stageCount: number };

const meta: Meta<StoryArgs> = {
  title: 'Components/Navigation',
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    stageCount: 5,
  },
  argTypes: {
    stageCount: {
      name: 'Number of stages',
      control: { type: 'number', min: 2, max: 40, step: 1 },
      description:
        'Total stages in the protocol (Welcome + middle stages + Complete).',
    },
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

const openAndAssertMenu = async (
  canvasElement: HTMLElement,
  stageCount: number,
) => {
  const canvas = within(canvasElement);

  const trigger = await canvas.findByRole('button', {
    name: /go to another screen/i,
  });
  await userEvent.click(trigger);

  const menu = await canvas.findByRole('listbox', {
    name: /interview screens/i,
  });
  const scoped = within(menu);

  await expect(scoped.getAllByRole('option')).toHaveLength(stageCount);
  if (stageCount >= 3) {
    await expect(scoped.getByText(/hidden by answers/i)).toBeInTheDocument();
  }
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
  render: ({ stageCount }) => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getRawPayload(stageCount)}
        navigationOrientation="vertical"
        allowStageNavigation
      />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    await openAndAssertMenu(canvasElement, args.stageCount);
  },
};

export const HorizontalStageNavigation: Story = {
  name: 'Stage navigation (horizontal bar)',
  render: ({ stageCount }) => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getRawPayload(stageCount)}
        navigationOrientation="horizontal"
        allowStageNavigation
      />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    await openAndAssertMenu(canvasElement, args.stageCount);
  },
};

const exitAndAssertConfirmation = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  const exitButton = await canvas.findByRole('button', {
    name: /exit interview/i,
  });
  await userEvent.click(exitButton);

  const dialog = await canvas.findByRole('dialog', {
    name: /exit this interview/i,
  });
  const scoped = within(dialog);

  await expect(
    scoped.getByText(/your answers so far will be saved/i),
  ).toBeInTheDocument();

  // Cancel rather than confirm, so the story stays on the interview.
  await userEvent.click(scoped.getByRole('button', { name: /cancel/i }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
};

export const ExitConfirmation: Story = {
  name: 'Exit confirmation (vertical rail)',
  render: ({ stageCount }) => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getRawPayload(stageCount)}
        navigationOrientation="vertical"
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await exitAndAssertConfirmation(canvasElement);
  },
};

export const HorizontalExitConfirmation: Story = {
  name: 'Exit confirmation (horizontal bar)',
  render: ({ stageCount }) => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getRawPayload(stageCount)}
        navigationOrientation="horizontal"
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await exitAndAssertConfirmation(canvasElement);
  },
};
