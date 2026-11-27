import type { Meta, StoryObj } from '@storybook/react-vite';
import { MotionConfig, MotionGlobalConfig } from 'motion/react';
import { type ReactNode, useEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { testId, testTypeId } from '../__tests__/testIds';
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

function buildRawPayload(
  stageCount: number,
  localization?: { defaultLocale: string; locales: string[] },
): string {
  const si = new SyntheticInterview();
  if (localization) si.setLocalization(localization);

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
    // The first stage starts with people in it, so the stages after it have
    // someone to show and stay on the route.
    si.addStage(base.type, {
      label,
      ...(i === 0 && { initialNodes: { count: 2 } }),
    }).addPrompt({ text: base.prompt });
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
            id: testId('skip-rule'),
            options: {
              type: testTypeId('never-existing-type'),
              operator: 'EXISTS',
            },
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

const openTextSizePopover = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  const textSizeButton = await canvas.findByRole('button', {
    name: 'Text size',
  });
  await userEvent.click(textSizeButton);

  return canvas.findByRole('dialog', { name: 'Text size' });
};

const exitAndAssertConfirmation = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);

  await userEvent.click(
    await canvas.findByRole('button', { name: 'Exit interview' }),
  );

  const dialog = await canvas.findByRole('dialog', {
    name: /exit interview/i,
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

    await userEvent.click(canvas.getByRole('button', { name: 'Exit review' }));

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

const SEVERAL_LANGUAGES = {
  defaultLocale: 'en',
  locales: ['en', 'es', 'fr', 'ar'],
};
let severalLanguagesPayload: string | undefined;
const getSeveralLanguagesPayload = () =>
  (severalLanguagesPayload ??= buildRawPayload(5, SEVERAL_LANGUAGES));

// A choice is kept in the tab, so one story's would carry into the next.
const forgetInterviewLanguage = () => {
  for (const key of Object.keys(window.sessionStorage)) {
    if (key.startsWith('network-canvas:interview-locale-preference:')) {
      window.sessionStorage.removeItem(key);
    }
  }
};

const chooseInterviewLanguage = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const trigger = await canvas.findByRole(
    'combobox',
    { name: /^Interview language: English$/ },
    { timeout: 10_000 },
  );
  await userEvent.click(trigger);
  const popup = await within(canvasElement.ownerDocument.body).findByRole(
    'dialog',
    { name: 'Interview language' },
  );
  // The languages alone, each named in itself: an interview has no automatic
  // entry.
  await expect(
    within(popup)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['English', 'español', 'français', 'العربية']);
  await userEvent.click(within(popup).getByRole('option', { name: 'español' }));
  await waitFor(() =>
    expect(
      canvasElement.querySelector('main[data-theme-interview]'),
    ).toHaveAttribute('lang', 'es'),
  );
};

/**
 * With more than one language in the protocol, a languages button in the bar
 * changes the interview language from any screen, as a Language Chooser stage
 * does. It is not shown on a Language Chooser stage, nor for a protocol in one language.
 * Interviewer's default bar: exit, text size, language, then the steps.
 */
export const InterviewLanguage: Story = {
  name: 'Interview language (vertical rail)',
  beforeEach: forgetInterviewLanguage,
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getSeveralLanguagesPayload()}
        navigationOrientation="vertical"
        allowUserScaling
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await chooseInterviewLanguage(canvasElement);
  },
};

export const HorizontalInterviewLanguage: Story = {
  name: 'Interview language (horizontal bar)',
  beforeEach: forgetInterviewLanguage,
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getSeveralLanguagesPayload()}
        navigationOrientation="horizontal"
        allowUserScaling
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await chooseInterviewLanguage(canvasElement);
  },
};

export const TextSize: Story = {
  name: 'Text size',
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
    const popover = await openTextSizePopover(canvasElement);
    // One choice for each size, named by the button that opened it; the
    // popover shows no label of its own.
    const sizes = within(popover).getByRole('group', { name: 'Text size' });
    const option = (size: string) =>
      within(sizes).getByRole('button', { name: size });
    await expect(
      within(sizes)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['90%', '100%', '110%', '120%', '130%']);
    await expect(option('100%')).toHaveAttribute('aria-pressed', 'true');
    // Named for screen readers only: nothing on screen says "Text size".
    await expect(popover.innerText).not.toMatch(/text size/i);

    const main = canvasElement.querySelector('main[data-theme-interview]');
    await expect(main).not.toBeNull();
    const shownScale = () =>
      getComputedStyle(main as Element)
        .getPropertyValue('--interview-text-scale')
        .trim();

    await userEvent.click(option('120%'));
    await expect(option('120%')).toHaveAttribute('aria-pressed', 'true');
    await expect(option('100%')).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(shownScale()).toBe('1.2'));

    // The arrow keys move between the sizes, and Enter chooses one.
    await userEvent.keyboard('{ArrowRight}');
    await expect(option('130%')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(option('130%')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(shownScale()).toBe('1.3'));

    await userEvent.click(option('120%'));
    await waitFor(() => expect(shownScale()).toBe('1.2'));

    // Escape dismisses the popover and returns focus to the trigger.
    await userEvent.keyboard('{Escape}');
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.queryByRole('dialog', { name: 'Text size' }),
      ).not.toBeInTheDocument(),
    );
    const textSizeButton = canvas.getByRole('button', { name: 'Text size' });
    await waitFor(() => expect(textSizeButton).toHaveFocus());

    // Reopen so the visual snapshot captures the control with the enlarged
    // scale applied and 120% displayed.
    await openTextSizePopover(canvasElement);
  },
};

// A Welcome screen, then a name generator whose name field is encrypted, so
// the participant must enter their passphrase before they can add anyone.
function buildEncryptedNamePayload(localization?: {
  defaultLocale: string;
  locales: string[];
}): string {
  const si = new SyntheticInterview();
  if (localization) si.setLocalization(localization);

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

  return SuperJSON.stringify(si.getInterviewPayload({ currentStep: 1 }));
}

let encryptedNamePayload: string | undefined;
const getEncryptedNamePayload = () =>
  (encryptedNamePayload ??= buildEncryptedNamePayload());

let encryptedNameInLanguagesPayload: string | undefined;
const getEncryptedNameInLanguagesPayload = () =>
  (encryptedNameInLanguagesPayload ??= buildEncryptedNamePayload({
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'ar'],
  }));

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
    ...nav.queryAllByRole('button', {
      name: /^(Exit interview|Exit review|Text size)$/,
    }),
    ...nav.queryAllByRole('combobox', { name: /^Interview language: / }),
    ...nav.queryAllByRole('button', { name: 'Passphrase' }),
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
  const textSize = nav.getByRole('button', { name: 'Text size' });
  // Keyboard throughout, so the tooltip later opens on focus as it does for a
  // keyboard user.
  textSize.focus();
  await userEvent.keyboard('{Enter}');
  const popover = await within(canvasElement).findByRole('dialog', {
    name: 'Text size',
  });
  const sizes = within(popover).getByRole('group', { name: 'Text size' });
  const main = canvasElement.querySelector('main[data-theme-interview]');
  if (!main) throw new Error('The interview shell is not rendered.');

  // The size starts at 100%; choose the smallest first, then each larger one.
  within(sizes).getAllByRole('button')[0]?.focus();
  for (const [index, scale] of TEXT_SCALE_OPTIONS.entries()) {
    if (index > 0) await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Enter}');
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
  'Some answers here are protected by your passphrase. Enter your passphrase to see and change them.';

const enterPassphraseAndAddPerson = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const navigation = await canvas.findByRole('navigation');
  const nav = within(navigation);

  const prompter = await nav.findByRole(
    'button',
    { name: 'Passphrase' },
    { timeout: 10_000 },
  );
  await expect(prompter).toHaveAccessibleDescription(PASSPHRASE_NEEDED);

  const addPerson = canvas.getByRole('button', { name: /add a person/i });
  await expect(addPerson).toBeDisabled();

  await expectBarFitsAtEveryTextSize(canvasElement, navigation);

  // Keyboard only: the prompter follows the bar's other features in the tab
  // order, ahead of the progress bar, Back and Next.
  nav.getByRole('button', { name: 'Text size' }).focus();
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

  // No passphrase has been chosen in this interview yet, so the prompter asks
  // for one to be chosen and confirmed. Both passphrase dialogs share a
  // title; the confirmation field below is what marks this one as choosing.
  const passphraseDialog = await canvas.findByRole('dialog', {
    name: 'Passphrase',
  });
  const passphraseField = within(passphraseDialog).getByLabelText(
    /^passphrase/i,
    {
      selector: 'input',
    },
  );
  await waitFor(() => expect(passphraseField).toHaveFocus());
  await userEvent.type(passphraseField, 'correct horse battery');
  await userEvent.type(
    within(passphraseDialog).getByLabelText(/^confirm passphrase/i, {
      selector: 'input',
    }),
    'correct horse battery',
  );
  await userEvent.click(
    within(passphraseDialog).getByRole('button', { name: 'Continue' }),
  );

  await waitFor(() => expect(passphraseDialog).not.toBeInTheDocument());
  await waitFor(() =>
    expect(
      nav.queryByRole('button', { name: 'Passphrase' }),
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
    within(personDialog).getByRole('button', { name: /done/i }),
  );

  // The name is encrypted on write and decrypted again for its label.
  await expect(
    await canvas.findByRole('option', { name: 'Alice' }, { timeout: 15_000 }),
  ).toBeInTheDocument();
};

export const PassphrasePrompt: Story = {
  name: 'Passphrase prompt (vertical rail, small tablet in landscape)',
  parameters: {
    controls: { exclude: ['stageCount'] },
    // The smallest supported screen turned on its side, where the rail is
    // shortest. Declared as its own size because the test runner ignores
    // `isRotated`.
    viewport: {
      options: {
        smallTabletLandscape: {
          name: 'Small tablet (landscape)',
          styles: { width: '1024px', height: '768px' },
          type: 'tablet',
        },
      },
    },
  },
  globals: { viewport: { value: 'smallTabletLandscape', isRotated: false } },
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
  name: 'Passphrase prompt (horizontal bar, small tablet)',
  parameters: {
    controls: { exclude: ['stageCount'] },
    // The smallest supported screen, where the bar has the least room for
    // the prompter.
    viewport: {
      options: {
        smallTablet: {
          name: 'Small tablet',
          styles: { width: '768px', height: '1024px' },
          type: 'tablet',
        },
      },
    },
  },
  globals: { viewport: { value: 'smallTablet', isRotated: false } },
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

// Every button the bar can show at once, on a screen where Back is enabled.
const expectEveryButton = async (canvasElement: HTMLElement) => {
  const nav = within(await within(canvasElement).findByRole('navigation'));
  const controls = [
    await nav.findByRole('button', { name: 'Exit interview' }),
    nav.getByRole('button', { name: 'Text size' }),
    nav.getByRole('combobox', { name: /^Interview language: / }),
    await nav.findByRole('button', { name: 'Passphrase' }, { timeout: 10_000 }),
    nav.getByRole('button', { name: 'Previous Step' }),
    nav.getByRole('button', { name: 'Next Step' }),
  ];
  // The bar's controls fade in.
  for (const control of controls) {
    await waitFor(() => expect(control).toBeVisible());
  }
  await expect(
    nav.getByRole('button', { name: 'Previous Step' }),
  ).toBeEnabled();
};

/**
 * Every button the bar can show: exit, text size and language, the
 * passphrase prompt for an interview with protected answers, then Back and
 * Next. The optional buttons are drawn quieter than Back and Next until
 * they are pointed at, focused or open.
 */
export const EveryButton: Story = {
  name: 'Every button (vertical rail)',
  parameters: { controls: { exclude: ['stageCount'] } },
  beforeEach: forgetInterviewLanguage,
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getEncryptedNameInLanguagesPayload()}
        navigationOrientation="vertical"
        allowUserScaling
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expectEveryButton(canvasElement);
  },
};

export const HorizontalEveryButton: Story = {
  name: 'Every button (horizontal bar)',
  parameters: { controls: { exclude: ['stageCount'] } },
  beforeEach: forgetInterviewLanguage,
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getEncryptedNameInLanguagesPayload()}
        navigationOrientation="horizontal"
        allowUserScaling
        onExit={() => {
          console.log('Exited the interview.');
        }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expectEveryButton(canvasElement);
  },
};

export const TextSizeWithoutExit: Story = {
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
    const popover = await openTextSizePopover(canvasElement);
    await expect(
      within(popover).getByRole('group', { name: 'Text size' }),
    ).toBeInTheDocument();

    // Without an exit handler there is no exit button.
    const nav = within(await within(canvasElement).findByRole('navigation'));
    await expect(
      nav.queryByRole('button', { name: /exit/i }),
    ).not.toBeInTheDocument();
  },
};

/**
 * A host that leaves text size to the browser, as Fresco does, shows only the
 * exit button.
 */
export const ExitWithoutTextSize: Story = {
  name: 'Exit without text size',
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
    const nav = within(await within(canvasElement).findByRole('navigation'));
    const exit = await nav.findByRole('button', { name: 'Exit interview' });
    // The bar's controls fade in.
    await waitFor(() => expect(exit).toBeVisible());
    await expect(
      nav.queryByRole('button', { name: 'Text size' }),
    ).not.toBeInTheDocument();
  },
};

// These stories are also for trying the animation by hand, so in a browser
// their play functions leave the bar alone; only the test runner, an
// automated host, plays them.
const isTestRunner = () => window.navigator.webdriver;

/**
 * Automated hosts turn Motion off (`AnimationProvider`), which would let these
 * stories pass whether or not anything moved. They turn it on again while they
 * are shown, so the play functions below measure the animation itself. The
 * flag is global: it is set while rendering, after the provider has set it,
 * and put back when the story unmounts.
 */
const WithMotion = ({ children }: { children: ReactNode }) => {
  const [skipping] = useState(() => MotionGlobalConfig.skipAnimations);
  // oxlint-disable-next-line react/immutability -- must be set while rendering, after AnimationProvider has set it and before the bar mounts
  MotionGlobalConfig.skipAnimations = false;
  useEffect(
    () => () => {
      MotionGlobalConfig.skipAnimations = skipping;
    },
    [skipping],
  );
  return <MotionConfig skipAnimations={false}>{children}</MotionConfig>;
};

const ToggledControls = ({
  orientation,
}: {
  orientation: 'vertical' | 'horizontal';
}) => {
  const [showExit, setShowExit] = useState(true);
  const [showTextSize, setShowTextSize] = useState(true);
  return (
    <WithMotion>
      <div className="relative flex h-dvh w-full">
        {/* oxlint-disable formatjs/no-literal-string-in-jsx -- story controls, not interview copy */}
        <div className="absolute inset-e-2 top-2 z-10 flex gap-2">
          <button type="button" onClick={() => setShowExit((show) => !show)}>
            Toggle exit button
          </button>
          <button
            type="button"
            onClick={() => setShowTextSize((show) => !show)}
          >
            Toggle text size
          </button>
        </div>
        {/* oxlint-enable formatjs/no-literal-string-in-jsx */}
        <StoryInterviewShell
          rawPayload={getRawPayload(5)}
          navigationOrientation={orientation}
          allowUserScaling={showTextSize}
          onExit={showExit ? () => {} : undefined}
        />
      </div>
    </WithMotion>
  );
};

// The bar's direct child that contains the control whose name starts with
// this (the language button's name ends with the language).
const barSlot = (nav: HTMLElement, name: string) =>
  [...nav.children].find((child) =>
    child.querySelector(`[aria-label^="${name}"]`),
  );

const transformOf = (element: Element | undefined) => {
  const transform = element ? getComputedStyle(element).transform : 'none';
  return new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
};

// Reads the bar over the frames that follow a change. Whether the change
// animates or not, Motion can hold a control at its old place for the first
// frame, so a glide is told apart from a jump by a frame on which the control
// that moves (`mover`) is part of the way between the two places (`glided`).
// `smallestScale` is the smallest scale of the control that comes or goes
// (`comer`) while it is on the bar. Eight frames leave room for both even
// when the frames are slow.
const sampleFrames = async (
  nav: HTMLElement,
  { mover = 'Text size', comer = 'Exit interview' } = {},
  frames = 8,
) => {
  const offsets: number[] = [];
  let smallestScale = Number.POSITIVE_INFINITY;
  for (let frame = 0; frame < frames; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const offset = transformOf(barSlot(nav, mover));
    offsets.push(Math.hypot(offset.e, offset.f));
    const slot = barSlot(nav, comer);
    if (slot) {
      smallestScale = Math.min(smallestScale, transformOf(slot).a);
    }
  }
  const distance = Math.max(...offsets);
  const glided = offsets.some(
    (offset) => offset > 0.5 && offset < distance - 0.5,
  );
  return { glided, smallestScale };
};

const toggleExit = (canvasElement: HTMLElement) =>
  within(canvasElement)
    .getByRole('button', { name: /toggle exit/i })
    .click();

// Waits until the bar has finished arriving, with every control in place
// and none of them still animating, and the exit button shown or not.
const settled = async (nav: HTMLElement, exitShown: boolean) => {
  await waitFor(
    () => {
      expect(Boolean(barSlot(nav, 'Exit interview'))).toBe(exitShown);
      expect(nav.style.opacity).toBe('1');
      for (const slot of nav.children) {
        if (!(slot instanceof HTMLElement)) continue;
        const offset = transformOf(slot);
        expect(Math.hypot(offset.e, offset.f)).toBeLessThan(0.5);
        expect(['', 'none']).toContain(slot.style.filter);
      }
    },
    { timeout: 5_000 },
  );
};

const expectControlsComeAndGo = async (canvasElement: HTMLElement) => {
  const nav = await within(canvasElement).findByRole('navigation');
  await within(nav).findByRole('button', { name: 'Exit interview' });
  await settled(nav, true);

  // A removed button stays on the bar while it shrinks away, and Text size
  // glides into the space it leaves rather than jumping there.
  toggleExit(canvasElement);
  await expect(barSlot(nav, 'Exit interview')).toBeDefined();
  const removal = await sampleFrames(nav);
  await expect(removal.smallestScale).toBeLessThan(0.99);
  await expect(removal.glided).toBe(true);
  await settled(nav, false);

  // An added button grows in, and Text size glides aside to make room.
  toggleExit(canvasElement);
  const addition = await sampleFrames(nav);
  await expect(addition.smallestScale).toBeLessThan(0.99);
  await expect(addition.glided).toBe(true);
  await settled(nav, true);
};

/**
 * The bar's optional controls animate in and out as the segmented toolbar's
 * segments do, and the controls that stay glide to their new places. Use the
 * buttons in the corner to add and remove them.
 */
export const ControlsComeAndGo: Story = {
  name: 'Controls come and go (vertical rail)',
  parameters: { controls: { exclude: ['stageCount'] } },
  render: () => <ToggledControls orientation="vertical" />,
  play: async ({ canvasElement }) => {
    if (!isTestRunner()) return;
    await expectControlsComeAndGo(canvasElement);
  },
};

export const HorizontalControlsComeAndGo: Story = {
  name: 'Controls come and go (horizontal bar)',
  parameters: { controls: { exclude: ['stageCount'] } },
  render: () => <ToggledControls orientation="horizontal" />,
  play: async ({ canvasElement }) => {
    if (!isTestRunner()) return;
    await expectControlsComeAndGo(canvasElement);
  },
};

/**
 * With reduced motion a button that comes or goes only fades, and the
 * other controls move straight to their new places.
 */
export const ReducedMotionControlsComeAndGo: Story = {
  name: 'Controls come and go (reduced motion)',
  parameters: { controls: { exclude: ['stageCount'] } },
  globals: { reducedMotion: 'always' },
  render: () => <ToggledControls orientation="vertical" />,
  play: async ({ canvasElement }) => {
    if (!isTestRunner()) return;
    const nav = await within(canvasElement).findByRole('navigation');
    await within(nav).findByRole('button', { name: 'Exit interview' });
    await settled(nav, true);

    toggleExit(canvasElement);
    const removal = await sampleFrames(nav);
    await expect(removal.glided).toBe(false);
    await settled(nav, false);

    toggleExit(canvasElement);
    const addition = await sampleFrames(nav);
    await expect(addition.glided).toBe(false);
    await expect(addition.smallestScale).toBeGreaterThan(0.99);
    await settled(nav, true);
  },
};

// A Language Chooser stage, then an information stage, in four languages.
let languageChooserPayload: string | undefined;
const getLanguageChooserPayload = () => {
  if (languageChooserPayload) return languageChooserPayload;
  const si = new SyntheticInterview();
  si.setLocalization(SEVERAL_LANGUAGES);
  si.addStage('LanguageChooser');
  si.addInformationStage({
    title: 'Welcome',
    text: 'Welcome to the interview.',
  });
  languageChooserPayload = SuperJSON.stringify(
    si.getInterviewPayload({ currentStep: 0 }),
  );
  return languageChooserPayload;
};

const LANGUAGE_BUTTON = 'Interview language';

// Follows the bar from a change until the language button has been on it for
// a dozen frames. Returns the furthest the exit button was moved from its
// place, which should be nowhere: the language button comes after it. A bar
// measured in the wrong place while the stages change would send every
// control flying back. Also returns whether the progress bar glided to make
// room.
const followLanguageArrival = async (nav: HTMLElement) => {
  let exitMoved = 0;
  const progressOffsets: number[] = [];
  let framesWithButton = 0;
  for (let frame = 0; frame < 240 && framesWithButton < 12; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const exit = transformOf(barSlot(nav, 'Exit interview'));
    exitMoved = Math.max(exitMoved, Math.hypot(exit.e, exit.f));
    const progress = transformOf(barSlot(nav, 'Progress indicator'));
    progressOffsets.push(Math.hypot(progress.e, progress.f));
    if (barSlot(nav, LANGUAGE_BUTTON)) framesWithButton++;
  }
  const distance = Math.max(...progressOffsets);
  return {
    sawButton: framesWithButton > 0,
    exitMoved,
    progressGlided: progressOffsets.some(
      (offset) => offset > 0.5 && offset < distance - 0.5,
    ),
  };
};

const languageButtonStory = (
  orientation: 'vertical' | 'horizontal',
): Story => ({
  parameters: { controls: { exclude: ['stageCount'] } },
  beforeEach: forgetInterviewLanguage,
  render: () => (
    <WithMotion>
      <div className="flex h-dvh w-full">
        <StoryInterviewShell
          rawPayload={getLanguageChooserPayload()}
          navigationOrientation={orientation}
          allowUserScaling
          onExit={() => {}}
        />
      </div>
    </WithMotion>
  ),
  play: async ({ canvasElement }) => {
    if (!isTestRunner()) return;
    const canvas = within(canvasElement);
    const nav = await canvas.findByRole('navigation');
    await within(nav).findByRole('button', { name: 'Exit interview' });
    await settled(nav, true);
    await expect(barSlot(nav, LANGUAGE_BUTTON)).toBeUndefined();

    // On the next screen the language button grows in after Text size, the
    // progress bar glides to give it room, and the buttons before it stay
    // where they are.
    await userEvent.click(canvas.getByRole('button', { name: 'Next Step' }));
    const arrival = await followLanguageArrival(nav);
    await expect(arrival.sawButton).toBe(true);
    await expect(arrival.exitMoved).toBeLessThan(0.5);
    await expect(arrival.progressGlided).toBe(true);

    // Back on the Language Chooser stage it shrinks away again.
    await userEvent.click(
      canvas.getByRole('button', { name: 'Previous Step' }),
    );
    await waitFor(() => expect(barSlot(nav, LANGUAGE_BUTTON)).toBeUndefined(), {
      timeout: 10_000,
    });
  },
});

/**
 * The bar has no language button on a Language Chooser stage, because the
 * stage offers the same choice. Moving on to the next screen brings the
 * button in, and going back takes it away again, with the same animation as
 * the bar's other optional buttons.
 */
export const LanguageButtonComesAndGoes: Story = {
  ...languageButtonStory('vertical'),
  name: 'Language button comes and goes (vertical rail)',
};

export const HorizontalLanguageButtonComesAndGoes: Story = {
  ...languageButtonStory('horizontal'),
  name: 'Language button comes and goes (horizontal bar)',
};

// A form with one required question, so the screen is ready to continue only
// while that question is answered.
function buildRequiredAnswerPayload(): string {
  const si = new SyntheticInterview();

  const stage = si.addStage('EgoForm', {
    label: 'About you',
    introductionPanel: { title: 'About you' },
  });
  const nameVar = si.addEgoVariable({
    type: 'text',
    component: 'Text',
    name: 'fullName',
    validation: { required: true },
  });
  stage.addFormField({
    variable: nameVar.id,
    component: 'Text',
    prompt: 'What is your name?',
  });

  si.addInformationStage({
    title: 'Complete',
    text: 'Thank you for taking part.',
  });

  return SuperJSON.stringify(si.getInterviewPayload({ currentStep: 0 }));
}

let requiredAnswerPayload: string | undefined;
const getRequiredAnswerPayload = () =>
  (requiredAnswerPayload ??= buildRequiredAnswerPayload());

const READY_TO_CONTINUE = 'You can continue to the next step.';

export const ReadyToContinue: Story = {
  name: 'Ready to continue (status message)',
  parameters: { controls: { exclude: ['stageCount'] } },
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getRequiredAnswerPayload()}
        navigationOrientation="vertical"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const next = await canvas.findByRole('button', { name: 'Next Step' });
    const announcer = canvas.getByTestId('ready-to-continue-announcer');
    const name = await canvas.findByRole('textbox', {
      name: /what is your name/i,
    });

    await expect(announcer).toHaveRole('status');

    // The synthetic interview fills the answer in, so clear it first.
    await userEvent.clear(name);
    await waitFor(() => expect(next).not.toHaveAccessibleDescription());
    await expect(announcer).toBeEmptyDOMElement();

    await userEvent.type(name, 'Ada');
    await userEvent.tab();
    await waitFor(() =>
      expect(next).toHaveAccessibleDescription(READY_TO_CONTINUE),
    );
    await expect(next).toHaveAccessibleName('Next Step');
    await expect(announcer).toHaveTextContent(READY_TO_CONTINUE);
    const firstAnnouncement = announcer.firstElementChild;
    await expect(firstAnnouncement).not.toBeNull();

    await userEvent.clear(name);
    await waitFor(() => expect(next).not.toHaveAccessibleDescription());
    await expect(announcer).toBeEmptyDOMElement();

    await userEvent.type(name, 'Grace');
    await waitFor(() =>
      expect(next).toHaveAccessibleDescription(READY_TO_CONTINUE),
    );
    await expect(announcer).toHaveTextContent(READY_TO_CONTINUE);
    // Regaining readiness adds a fresh node to the region.
    await expect(announcer.firstElementChild).not.toBeNull();
    await expect(announcer.firstElementChild).not.toBe(firstAnnouncement);
  },
};

// A Welcome screen, then name generators with no minimum, which are ready as
// soon as they appear, and finally one that needs a person first.
function buildReadyScreensPayload(): string {
  const si = new SyntheticInterview();

  si.addInformationStage({
    title: 'Welcome',
    text: 'Welcome to the interview.',
  });

  const person = si.addNodeType({ name: 'Person' });
  const nameVar = person.addVariable({ type: 'text', name: 'fullName' });
  const addQuickAddStage = (
    label: string,
    prompts: string[],
    behaviours?: { minNodes: number },
  ) => {
    const stage = si.addStage('NameGeneratorQuickAdd', {
      label,
      subject: { entity: 'node', type: person.id },
      quickAdd: nameVar.id,
      ...(behaviours && { behaviours }),
    });
    for (const text of prompts) stage.addPrompt({ text });
  };

  addQuickAddStage('Friends', ['Name your friends', 'Name your neighbours']);
  addQuickAddStage('Family', ['Name your family']);
  addQuickAddStage('Clubs', ['Name your club members']);
  addQuickAddStage('Colleagues', ['Name your colleagues'], { minNodes: 1 });

  si.addInformationStage({
    title: 'Complete',
    text: 'Thank you for taking part.',
  });

  return SuperJSON.stringify(si.getInterviewPayload({ currentStep: 0 }));
}

let readyScreensPayload: string | undefined;
const getReadyScreensPayload = () =>
  (readyScreensPayload ??= buildReadyScreensPayload());

export const ReadyToContinueAcrossScreens: Story = {
  name: 'Ready to continue across stages and prompts',
  parameters: { controls: { exclude: ['stageCount'] } },
  render: () => (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={getReadyScreensPayload()}
        navigationOrientation="vertical"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const next = await canvas.findByRole('button', { name: 'Next Step' });
    await canvas.findByText('Welcome to the interview.');
    const announcer = canvas.getByTestId('ready-to-continue-announcer');

    const added: Node[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) added.push(...record.addedNodes);
    });
    observer.observe(announcer, { childList: true, subtree: true });

    const goForwardTo = async (prompt: string) => {
      await userEvent.click(next);
      await canvas.findByText(prompt);
    };
    const expectAnnouncements = async (count: number) => {
      await waitFor(() => expect(added).toHaveLength(count));
      await expect(added.at(-1)?.textContent).toBe(READY_TO_CONTINUE);
      await expect(added.at(-1)?.isConnected).toBe(true);
    };

    try {
      await expect(announcer).toBeEmptyDOMElement();

      await goForwardTo('Name your friends');
      await expectAnnouncements(1);

      await goForwardTo('Name your neighbours');
      await expectAnnouncements(2);

      await goForwardTo('Name your family');
      await expectAnnouncements(3);

      await goForwardTo('Name your club members');
      await expectAnnouncements(4);

      // Not ready on arrival, so nothing is added for it.
      await goForwardTo('Name your colleagues');
      await waitFor(() => expect(next).not.toHaveAccessibleDescription());
      // Nothing signals that the sentence will not arrive, so wait well past
      // the task that would release it for this screen before checking that
      // the leaving stage's readiness added nothing.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await expect(announcer).toBeEmptyDOMElement();
      await expect(added).toHaveLength(4);
    } finally {
      observer.disconnect();
    }
  },
};
