import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../storybook-support/StoryInterviewShell';

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
  // Filtering round-trips a web worker (index + search); under full-suite
  // load that can outlive the 1s default waitFor window, so allow headroom.
  await waitFor(() => expect(scoped.getAllByRole('option')).toHaveLength(1), {
    timeout: 10_000,
  });

  await userEvent.click(scoped.getByRole('option', { name: /complete/i }));

  await waitFor(
    () =>
      expect(
        canvas.getByText(/thank you for taking part/i),
      ).toBeInTheDocument(),
    { timeout: 10_000 },
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

const openSettingsMenu = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  const settingsButton = await canvas.findByRole('button', {
    name: /settings/i,
  });
  await userEvent.click(settingsButton);

  return canvas.findByRole('menu');
};

const exitAndAssertConfirmation = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  const menu = await openSettingsMenu(canvasElement);
  await userEvent.click(
    within(menu).getByRole('menuitem', { name: /exit interview/i }),
  );

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

export const ReviewMode: Story = {
  name: 'Read-only review',
  render: ({ stageCount }) => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getRawPayload(stageCount)}
        initialStep={stageCount - 1}
        navigationOrientation="vertical"
        allowStageNavigation
        reviewMode
        onExit={() => {
          console.log('Exited the review.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByRole('button', { name: /next step/i }),
    ).toBeDisabled();

    const menu = await openSettingsMenu(canvasElement);
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: /exit review/i }),
    );

    const dialog = await canvas.findByRole('dialog', {
      name: /exit this review/i,
    });
    const scoped = within(dialog);
    await expect(
      scoped.getByText(/changes made during this review will not be saved/i),
    ).toBeInTheDocument();
    await userEvent.click(scoped.getByRole('button', { name: /cancel/i }));
  },
};

export const TextSize: Story = {
  name: 'Text size (settings menu)',
  render: ({ stageCount }) => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getRawPayload(stageCount)}
        navigationOrientation="vertical"
        allowUserScaling
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const menu = await openSettingsMenu(canvasElement);
    const group = within(menu).getByRole('group', { name: /text size/i });

    const options = within(group).getAllByRole('menuitemradio');
    await expect(options).toHaveLength(5);
    await expect(
      within(group).getByRole('menuitemradio', { name: '100%' }),
    ).toHaveAttribute('aria-checked', 'true');

    // Selecting a size keeps the menu open (live preview) and rescales the
    // whole interview via the Shell's --interview-text-scale multiplier.
    await userEvent.click(
      within(group).getByRole('menuitemradio', { name: '120%' }),
    );

    const main = canvasElement.querySelector('main[data-theme-interview]');
    await expect(main).not.toBeNull();
    await waitFor(() =>
      expect(
        getComputedStyle(main as Element)
          .getPropertyValue('--interview-text-scale')
          .trim(),
      ).toBe('1.2'),
    );
    await expect(
      within(group).getByRole('menuitemradio', { name: '120%' }),
    ).toHaveAttribute('aria-checked', 'true');

    // Escape dismisses the menu and returns focus to the trigger.
    await userEvent.keyboard('{Escape}');
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.queryByRole('menu')).not.toBeInTheDocument(),
    );
    const settingsButton = canvas.getByRole('button', { name: /settings/i });
    await waitFor(() => expect(settingsButton).toHaveFocus());

    // Reopen so the visual snapshot captures the control with the enlarged
    // scale applied and 120% checked.
    await openSettingsMenu(canvasElement);
  },
};

export const SettingsMenuScalingOnly: Story = {
  name: 'Text size without exit handler',
  render: ({ stageCount }) => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getRawPayload(stageCount)}
        navigationOrientation="vertical"
        allowUserScaling
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const menu = await openSettingsMenu(canvasElement);

    // Without an exit handler the menu holds only the text-size control.
    await expect(
      within(menu).queryByRole('menuitem', { name: /exit/i }),
    ).not.toBeInTheDocument();
    await expect(
      within(menu).getByRole('group', { name: /text size/i }),
    ).toBeInTheDocument();
  },
};
