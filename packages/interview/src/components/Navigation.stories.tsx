import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expectMaskedPassphraseField } from '../storybook-support/expectMaskedPassphraseField';
import StoryInterviewShell from '../storybook-support/StoryInterviewShell';
import { TEXT_SCALE_OPTIONS } from './Navigation';

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

const openSettingsPopover = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  const settingsButton = await canvas.findByRole('button', {
    name: /settings/i,
  });
  await userEvent.click(settingsButton);

  return canvas.findByRole('dialog', { name: /interview settings/i });
};

const exitAndAssertConfirmation = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  const popover = await openSettingsPopover(canvasElement);
  await userEvent.click(
    within(popover).getByRole('button', { name: /exit interview/i }),
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

    const popover = await openSettingsPopover(canvasElement);
    await userEvent.click(
      within(popover).getByRole('button', { name: /exit review/i }),
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
  name: 'Text size (settings popover)',
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
    const popover = await openSettingsPopover(canvasElement);
    const group = within(popover).getByRole('group', { name: /text size/i });
    const decrease = within(group).getByRole('button', {
      name: /decrease text size/i,
    });
    const increase = within(group).getByRole('button', {
      name: /increase text size/i,
    });
    const input = within(group).getByRole('spinbutton', {
      name: /text size percentage/i,
    });
    const currentSize = within(group).getByRole('status');

    await expect(currentSize).toHaveTextContent('100%');
    await expect(input).toHaveValue(100);
    await expect(input).toHaveAttribute('min', '90');
    await expect(input).toHaveAttribute('max', '130');
    await expect(input).toHaveAttribute('step', '10');
    await expect(decrease).toBeEnabled();
    await expect(increase).toBeEnabled();

    // Text size is the first setting, so opening the popover focuses its
    // native number field (the steppers are out of the tab order), and Tab
    // moves on to the exit action. Arrow-key stepping then proves scaling
    // works without a pointer.
    //
    // Waited for rather than read once: the popover moves focus itself, a
    // frame or more after it opens, and until it does focus is still on the
    // trigger.
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.tab();
    await expect(
      within(popover).getByRole('button', { name: /exit interview/i }),
    ).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(input).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await expect(input).toHaveValue(120);
    await expect(currentSize).toHaveTextContent('120%');

    const main = canvasElement.querySelector('main[data-theme-interview]');
    await expect(main).not.toBeNull();
    await waitFor(() =>
      expect(
        getComputedStyle(main as Element)
          .getPropertyValue('--interview-text-scale')
          .trim(),
      ).toBe('1.2'),
    );

    // Each stepper becomes unavailable at its corresponding bound while the
    // opposite direction remains actionable.
    await userEvent.click(increase);
    await expect(input).toHaveValue(130);
    await expect(currentSize).toHaveTextContent('130%');
    await expect(increase).toBeDisabled();
    await expect(decrease).toBeEnabled();

    await userEvent.click(decrease);
    await userEvent.click(decrease);
    await userEvent.click(decrease);
    await userEvent.click(decrease);
    await expect(input).toHaveValue(90);
    await expect(currentSize).toHaveTextContent('90%');
    await expect(decrease).toBeDisabled();
    await expect(increase).toBeEnabled();

    // Direct entry is available as well as stepping. An off-step draft stays
    // intact while focus moves to a stepper, so native stepping starts from
    // the displayed value instead of rolling back to the last committed size.
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, '100');
    await expect(currentSize).toHaveTextContent('100%');

    await userEvent.clear(input);
    await userEvent.type(input, '115');
    await expect(input).toHaveValue(115);
    await expect(currentSize).toHaveTextContent('100%');
    await expect(decrease).toBeEnabled();
    await expect(increase).toBeEnabled();
    await userEvent.click(decrease);
    await expect(input).toHaveValue(110);
    await expect(currentSize).toHaveTextContent('110%');

    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, '115');
    await userEvent.click(increase);
    await expect(input).toHaveValue(120);
    await expect(currentSize).toHaveTextContent('120%');

    // Escape dismisses the popover and returns focus to the trigger.
    await userEvent.keyboard('{Escape}');
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.queryByRole('dialog', { name: /interview settings/i }),
      ).not.toBeInTheDocument(),
    );
    const settingsButton = canvas.getByRole('button', { name: /settings/i });
    await waitFor(() => expect(settingsButton).toHaveFocus());

    // Reopen so the visual snapshot captures the control with the enlarged
    // scale applied and 120% displayed.
    await openSettingsPopover(canvasElement);
  },
};

// A Welcome screen, then a name generator whose name field is encrypted, so
// the participant must enter their passphrase before they can add anyone.
function buildEncryptedNamePayload(): string {
  const si = new SyntheticInterview();

  si.addInformationStage({
    title: 'Welcome',
    text: 'Welcome to the interview.',
  });

  const person = si.addNodeType({ name: 'Person' });
  const nameVar = person.addVariable({
    type: 'text',
    name: 'fullName',
    component: 'Text',
    encrypted: true,
  });
  const stage = si.addStage('NameGenerator', {
    label: 'People you know',
    subject: { entity: 'node', type: person.id },
  });
  stage.addFormField({
    variable: nameVar.id,
    component: 'Text',
    prompt: 'What is their name?',
  });
  stage.addPrompt({ text: 'Who do you know?' });

  si.addInformationStage({
    title: 'Complete',
    text: 'Thank you for taking part.',
  });

  const payload = si.getInterviewPayload({ currentStep: 1 });

  // This schema still gates encryption behind the protocol's
  // `encryptedVariables` experiment. It is switched on in the payload itself,
  // not through the synthetic builder, so nothing here depends on the
  // experiment once encrypted attributes no longer need it.
  return SuperJSON.stringify({
    ...payload,
    protocol: {
      ...payload.protocol,
      experiments: { encryptedVariables: true },
    },
  });
}

let encryptedNamePayload: string | undefined;
const getEncryptedNamePayload = () =>
  (encryptedNamePayload ??= buildEncryptedNamePayload());

// By more than a pixel: the controls abut, and motion's transforms leave
// fractions of a pixel between neighbours.
const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right - 1 &&
  b.left < a.right - 1 &&
  a.top < b.bottom - 1 &&
  b.top < a.bottom - 1;

// The navigation and its controls spring into place; measure once two
// consecutive frames agree. A crowded bar can leave the progress bar with no
// length, but never with no size at all.
const settledRect = (element: Element) =>
  waitFor(
    async () => {
      const before = element.getBoundingClientRect();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const after = element.getBoundingClientRect();
      await expect(after.width + after.height).toBeGreaterThan(0);
      await expect(after.toJSON()).toEqual(before.toJSON());
      return after;
    },
    { timeout: 5_000 },
  );

// Every control sits inside the bar, clear of the others, with a usable touch
// target. Only the progress bar may give up its length.
const expectBarFits = async (navigation: HTMLElement) => {
  const nav = within(navigation);
  const navRect = await settledRect(navigation);
  const buttons = [
    nav.getByRole('button', { name: /settings/i }),
    ...nav.queryAllByRole('button', { name: /enter your passphrase/i }),
    nav.getByRole('button', { name: /previous step/i }),
    nav.getByRole('button', { name: /next step/i }),
  ];
  const placed: { label: string; rect: DOMRect }[] = [];
  for (const control of [...buttons, nav.getByRole('progressbar')]) {
    const label = control.getAttribute('aria-label') ?? control.role ?? '';
    const rect = await settledRect(control);
    const where = `${label} at ${JSON.stringify(rect)} in ${JSON.stringify(navRect)}`;
    await expect(rect.left, where).toBeGreaterThanOrEqual(navRect.left);
    await expect(rect.right, where).toBeLessThanOrEqual(navRect.right);
    await expect(rect.top, where).toBeGreaterThanOrEqual(navRect.top);
    await expect(rect.bottom, where).toBeLessThanOrEqual(navRect.bottom);
    for (const other of placed) {
      await expect(
        overlaps(rect, other.rect),
        `${where} overlaps ${other.label} at ${JSON.stringify(other.rect)}`,
      ).toBe(false);
    }
    placed.push({ label, rect });
  }
  for (const { label, rect } of placed.slice(0, buttons.length)) {
    await expect(rect.width, label).toBeGreaterThanOrEqual(44);
    await expect(rect.height, label).toBeGreaterThanOrEqual(44);
  }
};

// Steps the text size through every option with the participant's own
// control, checking the bar at each, and leaves it at the largest.
const expectBarFitsAtEveryTextSize = async (
  canvasElement: HTMLElement,
  navigation: HTMLElement,
) => {
  const nav = within(navigation);
  const settings = nav.getByRole('button', { name: /settings/i });
  // Keyboard throughout, so the tooltip later opens on focus as it does for a
  // keyboard user.
  settings.focus();
  await userEvent.keyboard('{Enter}');
  const popover = await within(canvasElement).findByRole('dialog', {
    name: /interview settings/i,
  });
  const input = within(popover).getByRole('spinbutton', {
    name: /text size percentage/i,
  });
  const main = canvasElement.querySelector('main[data-theme-interview]');
  if (!main) throw new Error('The interview shell is not rendered.');

  // The size starts at 100%; step down to the smallest option first.
  input.focus();
  await userEvent.keyboard('{ArrowDown}'.repeat(TEXT_SCALE_OPTIONS.indexOf(1)));
  for (const [index, scale] of TEXT_SCALE_OPTIONS.entries()) {
    if (index > 0) await userEvent.keyboard('{ArrowUp}');
    await waitFor(() =>
      expect(
        getComputedStyle(main)
          .getPropertyValue('--interview-text-scale')
          .trim(),
      ).toBe(String(scale)),
    );
    await expectBarFits(navigation);
  }

  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(popover).not.toBeInTheDocument());
};

const PASSPHRASE_NEEDED =
  'Your passphrase is needed to show data on this screen. Click here to enter it.';

const enterPassphraseAndAddPerson = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const navigation = await canvas.findByRole('navigation');
  const nav = within(navigation);

  const prompter = await nav.findByRole(
    'button',
    { name: /enter your passphrase/i },
    { timeout: 10_000 },
  );
  await expect(prompter).toHaveAccessibleDescription(PASSPHRASE_NEEDED);

  const addPerson = canvas.getByRole('button', { name: /add a person/i });
  await expect(addPerson).toBeDisabled();

  await expectBarFitsAtEveryTextSize(canvasElement, navigation);

  // Keyboard only: the prompter follows the back button in the tab order.
  nav.getByRole('button', { name: /previous step/i }).focus();
  await userEvent.tab();
  await expect(prompter).toHaveFocus();

  // Focus opens the tooltip, which only echoes the button's description:
  // assistive technology must not meet that text a second time, and at the
  // largest text size it must still fit on screen.
  const tooltip = await waitFor(() => {
    const popup = canvasElement.ownerDocument.querySelector('[role="tooltip"]');
    if (!(popup instanceof HTMLElement)) throw new Error('No tooltip is open.');
    return popup;
  });
  await expect(tooltip).toHaveTextContent(PASSPHRASE_NEEDED);
  await expect(
    within(canvasElement.ownerDocument.body).queryByRole('tooltip'),
  ).toBeNull();
  await expect(prompter).toHaveAccessibleDescription(PASSPHRASE_NEEDED);
  const tooltipRect = await settledRect(tooltip);
  const { clientWidth, clientHeight } =
    canvasElement.ownerDocument.documentElement;
  await expect(tooltipRect.left).toBeGreaterThanOrEqual(0);
  await expect(tooltipRect.right).toBeLessThanOrEqual(clientWidth);
  await expect(tooltipRect.top).toBeGreaterThanOrEqual(0);
  await expect(tooltipRect.bottom).toBeLessThanOrEqual(clientHeight);

  await userEvent.keyboard('{Enter}');

  const passphraseDialog = await canvas.findByRole('dialog', {
    name: /enter your passphrase/i,
  });
  // Where the field falls back to a password input it has no ARIA role, so it
  // is found by its label, which also carries a visual required marker.
  const passphraseField = within(passphraseDialog).getByLabelText(
    /^Passphrase/,
    { selector: 'input' },
  );
  await expectMaskedPassphraseField(passphraseField);
  await waitFor(() => expect(passphraseField).toHaveFocus());
  await userEvent.type(passphraseField, 'correct horse battery');
  await userEvent.click(
    within(passphraseDialog).getByRole('button', {
      name: /submit passphrase/i,
    }),
  );

  await waitFor(() => expect(passphraseDialog).not.toBeInTheDocument());
  await waitFor(() =>
    expect(
      nav.queryByRole('button', { name: /enter your passphrase/i }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(addPerson).toBeEnabled());
  // Without the prompter, the bar still fits at the largest text size.
  await expectBarFits(navigation);

  await userEvent.click(addPerson);
  const personDialog = await canvas.findByRole('dialog', {
    name: /add a person/i,
  });
  await userEvent.type(
    within(personDialog).getByRole('textbox', {
      name: /what is their name/i,
    }),
    'Alice',
  );
  await userEvent.click(
    within(personDialog).getByRole('button', { name: /finished/i }),
  );

  // The name is encrypted on write and decrypted again for its label.
  await expect(
    await canvas.findByRole('option', { name: 'Alice' }, { timeout: 15_000 }),
  ).toBeInTheDocument();
};

export const PassphrasePrompt: Story = {
  name: 'Passphrase prompt (vertical rail, small phone in landscape)',
  parameters: {
    controls: { exclude: ['stageCount'] },
    // The narrowest preset turned on its side, where the rail is shortest.
    // Declared as its own size because the test runner ignores `isRotated`.
    viewport: {
      options: {
        smallPhoneLandscape: {
          name: 'Small phone (landscape)',
          styles: { width: '568px', height: '320px' },
          type: 'mobile',
        },
      },
    },
  },
  globals: { viewport: { value: 'smallPhoneLandscape', isRotated: false } },
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getEncryptedNamePayload()}
        navigationOrientation="vertical"
        allowUserScaling
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await enterPassphraseAndAddPerson(canvasElement);
  },
};

export const HorizontalPassphrasePrompt: Story = {
  name: 'Passphrase prompt (horizontal bar, small phone)',
  parameters: { controls: { exclude: ['stageCount'] } },
  // The narrowest preset, where the bar has the least room for the prompter.
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getEncryptedNamePayload()}
        navigationOrientation="horizontal"
        allowUserScaling
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await enterPassphraseAndAddPerson(canvasElement);
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
    const popover = await openSettingsPopover(canvasElement);

    // Without an exit handler the popover holds only the text-size control.
    await expect(
      within(popover).queryByRole('button', { name: /exit/i }),
    ).not.toBeInTheDocument();
    await expect(
      within(popover).getByRole('group', { name: /text size/i }),
    ).toBeInTheDocument();
  },
};
