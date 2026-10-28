import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { ComponentType } from '@codaco/protocol-validation';

import EncryptedStoryInterviewShell from '../../storybook-support/EncryptedStoryInterviewShell';
import { enterPassphraseInPrompter } from '../../storybook-support/passphraseSteps';
import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

const FIELD_PRESETS: { component: ComponentType; prompt: string }[] = [
  { component: 'Text', prompt: 'Nickname' },
  { component: 'Number', prompt: 'Age' },
  { component: 'RadioGroup', prompt: 'How close are you to this person?' },
  { component: 'Toggle', prompt: 'Do they live nearby?' },
  { component: 'TextArea', prompt: 'Describe your relationship.' },
  { component: 'Boolean', prompt: 'Have you met in person?' },
  {
    component: 'CheckboxGroup',
    prompt: 'In what contexts do you interact?',
  },
  {
    component: 'LikertScale',
    prompt: 'How much do you trust this person?',
  },
  {
    component: 'VisualAnalogScale',
    prompt: 'How important is this relationship to you?',
  },
];

type StoryArgs = {
  initialNodeCount: number;
  fieldCount: number;
};

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();

  const nodeType = interview.addNodeType({ name: 'Person' });

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('AlterForm', {
    label: 'Alter Form',
    initialNodes: { count: args.initialNodeCount },
    subject: { entity: 'node', type: nodeType.id },
  });

  const fieldCount = Math.min(args.fieldCount, FIELD_PRESETS.length);
  for (let i = 0; i < fieldCount; i++) {
    const preset = FIELD_PRESETS[i]!;
    stage.addFormField({
      component: preset.component,
      prompt: preset.prompt,
    });
  }

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const AlterFormStoryWrapper = (args: StoryArgs) => {
  const configKey = JSON.stringify(args);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const interview = useMemo(() => buildInterview(args), [configKey]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell key={configKey} rawPayload={rawPayload} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/AlterForm',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    initialNodeCount: {
      control: { type: 'range', min: 0, max: 10 },
      description: 'Number of alter nodes in the network',
    },
    fieldCount: {
      control: { type: 'range', min: 1, max: FIELD_PRESETS.length },
      description: 'Number of form fields per node',
    },
  },
  args: {
    initialNodeCount: 3,
    fieldCount: 3,
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {
  render: (args) => <AlterFormStoryWrapper {...args} />,
};

export const ManyNodes: Story = {
  render: (args) => <AlterFormStoryWrapper {...args} />,
  args: {
    initialNodeCount: 8,
  },
};

export const SingleNode: Story = {
  render: (args) => <AlterFormStoryWrapper {...args} />,
  args: {
    initialNodeCount: 1,
  },
};

export const NoNodes: Story = {
  render: (args) => <AlterFormStoryWrapper {...args} />,
  args: {
    initialNodeCount: 0,
  },
};

export const ManyFields: Story = {
  render: (args) => <AlterFormStoryWrapper {...args} />,
  args: {
    fieldCount: FIELD_PRESETS.length,
  },
};

/**
 * Three people, the middle one family. The questions name each person and
 * are worded at greater length for family, so the form is taller for them.
 * The text is given by locale so that its message syntax is kept, as a
 * protocol writes it.
 */
function buildWordedPerPersonInterview() {
  const interview = new SyntheticInterview();
  const person = interview.addNodeType({ name: 'Person' });
  const name = person.addVariable({ name: 'name', type: 'text' });
  const family = person.addVariable({ name: 'family', type: 'boolean' });
  const closeness = person.addVariable({
    name: 'closeness',
    type: 'ordinal',
    component: 'LikertScale',
    options: [
      { label: 'Not at all close', value: 1 },
      { label: 'Not very close', value: 2 },
      { label: 'Somewhat close', value: 3 },
      { label: 'Very close', value: 4 },
      { label: 'Extremely close', value: 5 },
    ],
  });

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('AlterForm', {
    label: 'Alter Form (Worded per person)',
    subject: { entity: 'node', type: person.id },
  });
  stage.stageEntry.dynamicValues = {
    name: { path: `node.${name.id}` },
    family: { path: `node.${family.id}`, cases: { yes: true } },
  };
  stage.addFormField({
    component: 'Number',
    prompt: { 'en-US': 'How old is {name}?' },
  });
  stage.addFormField({
    variable: closeness.id,
    component: 'LikertScale',
    prompt: {
      'en-US':
        '{family, select, yes {{name} is part of your family. Leaving aside any sense of duty you feel because you are related, how close do you feel to {name} today?} other {How close are you to {name}?}}',
    },
  });
  stage.addFormField({
    component: 'TextArea',
    prompt: {
      'en-US':
        '{family, select, yes {Tell us about the place {name} has in your family.} other {How did you meet {name}?}}',
    },
    hint: {
      'en-US':
        '{family, select, yes {Family ties can be complicated. Mention anything you think matters: history you share, caring for one another, living apart, or disagreements. Write as much or as little as you like.} other {A sentence is enough.}}',
    },
  });

  interview.addManualNode(stage.id, person.id, 'alex', {
    [name.id]: 'Alex',
    [family.id]: false,
  });
  interview.addManualNode(stage.id, person.id, 'rosalind', {
    [name.id]: 'Rosalind',
    [family.id]: true,
  });
  interview.addManualNode(stage.id, person.id, 'sam', {
    [name.id]: 'Sam',
    [family.id]: false,
  });

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const WordedPerPersonWrapper = () => {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildWordedPerPersonInterview().getInterviewPayload({
          currentStep: 1,
        }),
      ),
    [],
  );
  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

/**
 * The questions are piped with each person's name, and worded at greater
 * length for family. Moving between people, the form eases to the next
 * person's height before their questions appear.
 */
export const WordedPerPerson: Story = {
  render: () => <WordedPerPersonWrapper />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole(
        'spinbutton',
        { name: /How old is .*Alex/ },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText('A sentence is enough.', { exact: false }),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByTestId('next-button'));
    await expect(
      await canvas.findByRole('spinbutton', { name: /How old is .*Rosalind/ }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/Family ties can be complicated/),
    ).toBeInTheDocument();
  },
};

function buildValidatedInterview() {
  const interview = new SyntheticInterview();
  const nodeType = interview.addNodeType({ name: 'Person' });

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('AlterForm', {
    label: 'Alter Form (Validated)',
    initialNodes: { count: 2 },
    subject: { entity: 'node', type: nodeType.id },
  });

  stage.addFormField({
    component: 'Text',
    prompt: 'Full name (required)',
    validation: { required: true },
  });
  stage.addFormField({
    component: 'Number',
    prompt: 'Age (required, 1–120)',
    validation: { required: true, minValue: 1, maxValue: 120 },
  });
  stage.addFormField({
    component: 'TextArea',
    prompt: 'Notes (required, 5–500 characters)',
    validation: { required: true, minLength: 5, maxLength: 500 },
  });
  stage.addFormField({
    component: 'CheckboxGroup',
    prompt: 'Contexts you interact in (required, pick 1–3)',
    validation: { required: true, minSelected: 1, maxSelected: 3 },
  });
  stage.addFormField({
    component: 'RadioGroup',
    prompt: 'How close are you? (required)',
    validation: { required: true },
  });

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const WithValidationWrapper = () => {
  const interview = useMemo(() => buildValidatedInterview(), []);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

export const WithValidation: Story = {
  render: () => <WithValidationWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates form fields with validation rules including required fields, min/max values, length constraints, and selection limits. Try advancing without completing the form to see validation errors. Going back from the first person with answers that cannot be saved asks before discarding them, as every other person does.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notes = await canvas.findByRole(
      'textbox',
      { name: /Notes \(required/ },
      { timeout: 10_000 },
    );
    await userEvent.clear(notes);
    await userEvent.type(notes, 'ab');
    await userEvent.click(canvas.getByTestId('previous-button'));

    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole('dialog', { name: 'Discard changes?' }),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole('button', { name: 'Cancel' }));

    await expect(
      await canvas.findByRole('textbox', { name: /Notes \(required/ }),
    ).toHaveValue('ab');
  },
};

/**
 * Two people whose answers all start empty, so choosing an option moves the
 * form on to the next question.
 */
function buildUnansweredInterview() {
  const interview = new SyntheticInterview();
  const person = interview.addNodeType({ name: 'Person' });
  const name = person.addVariable({ name: 'name', type: 'text' });

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('AlterForm', {
    label: 'Alter Form (Unanswered)',
    subject: { entity: 'node', type: person.id },
  });
  stage.addFormField({ component: 'Text', prompt: 'Nickname' });
  stage.addFormField({ component: 'Number', prompt: 'Age' });
  stage.addFormField({
    component: 'TextArea',
    prompt: 'Describe your relationship.',
  });
  stage.addFormField({
    component: 'RadioGroup',
    prompt: 'How close are you to this person?',
  });
  stage.addFormField({
    component: 'RadioGroup',
    prompt: 'How often do you talk?',
  });
  stage.addFormField({
    component: 'CheckboxGroup',
    prompt: 'In what contexts do you interact?',
  });
  // Enough below the second choice that the form can scroll it to the top.
  stage.addFormField({ component: 'TextArea', prompt: 'Anything else?' });
  stage.addFormField({
    component: 'CheckboxGroup',
    prompt: 'Which of these do you share?',
  });
  interview.addManualNode(stage.id, person.id, 'alice', {
    [name.id]: 'Alice',
  });
  interview.addManualNode(stage.id, person.id, 'bob', { [name.id]: 'Bob' });

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return interview;
}

const PortraitUnansweredWrapper = () => {
  const interview = useMemo(() => buildUnansweredInterview(), []);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  // Taller than it is wide, so the person sits above the form and sticks to
  // the top of it while it scrolls.
  return (
    <div className="flex h-[1000px] w-[720px]">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

const stuckAncestor = (element: Element) => {
  for (
    let current: Element | null = element;
    current;
    current = current.parentElement
  ) {
    if (getComputedStyle(current).position === 'sticky') return current;
  }
  throw new Error('No sticky ancestor');
};

const scrollingAncestor = (element: Element) => {
  for (
    let current = element.parentElement;
    current;
    current = current.parentElement
  ) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') return current;
  }
  throw new Error('No scrolling ancestor');
};

export const PortraitAutoScroll: Story = {
  render: () => <PortraitUnansweredWrapper />,
  parameters: {
    docs: {
      description: {
        story:
          'In a stage taller than it is wide the person sits above the form and stays at the top as it scrolls. Choosing an option brings the next unanswered question into view below the person, not underneath them.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const close = await canvas.findByRole(
      'radiogroup',
      { name: /How close are you/ },
      { timeout: 10_000 },
    );
    await waitFor(
      () =>
        expect(
          canvasElement.querySelector('[data-stage-ready="true"]'),
        ).not.toBeNull(),
      { timeout: 5_000 },
    );
    const next = canvas.getByRole('radiogroup', {
      name: /How often do you talk/,
    });
    const form = canvasElement.querySelector('[data-stage-section="form"]');
    if (!form) throw new Error('No form section');
    const header = stuckAncestor(
      within(form as HTMLElement).getByText('Alice'),
    );
    // Searched from the question as a whole, as QuestionFlow does: a group
    // of options can scroll on its own.
    const field = next.closest('[data-field-name]');
    if (!field) throw new Error('No field around the question');
    const scroller = scrollingAncestor(field);

    // The next question does not all show, so answering moves the form.
    await expect(next.getBoundingClientRect().bottom).toBeGreaterThan(
      scroller.getBoundingClientRect().bottom,
    );

    await userEvent.click(within(close).getAllByRole('radio')[0]!);

    // Focusing the option can move the form a little at once; the move to
    // the next question follows, smoothly. Wait for it to reach the top of
    // the form and come to rest before measuring.
    await waitFor(
      () =>
        expect(next.getBoundingClientRect().top).toBeLessThan(
          header.getBoundingClientRect().bottom + 80,
        ),
      { timeout: 5_000 },
    );
    let previous = -1;
    await waitFor(
      () => {
        const settled = scroller.scrollTop === previous;
        previous = scroller.scrollTop;
        expect(settled).toBe(true);
      },
      { timeout: 5_000, interval: 150 },
    );

    const headerBottom = header.getBoundingClientRect().bottom;
    const nextTop = next.getBoundingClientRect().top;
    await expect(nextTop).toBeGreaterThanOrEqual(headerBottom);
    await expect(nextTop).toBeLessThan(headerBottom + 80);
  },
};

const PASSPHRASE = 'correct horse battery staple';

/**
 * A person, Alice, whose nickname is protected. With `withBob`, a second
 * person whose nickname is protected too follows her.
 */
function buildProtectedInterview({ withBob = false } = {}) {
  const interview = new SyntheticInterview();
  const person = interview.addNodeType({ name: 'Person' });
  const name = person.addVariable({ name: 'name', type: 'text' });
  const nickname = person.addVariable({
    name: 'nickname',
    type: 'text',
    component: 'Text',
    encrypted: true,
  });
  const age = person.addVariable({
    name: 'age',
    type: 'number',
    component: 'Number',
  });

  const stage = interview.addStage('AlterForm', {
    label: 'Alter Form (Protected)',
    subject: { entity: 'node', type: person.id },
  });
  stage.addFormField({
    variable: nickname.id,
    component: 'Text',
    prompt: 'What nickname do you use for this person?',
  });
  stage.addFormField({
    variable: age.id,
    component: 'Number',
    prompt: 'How old are they?',
  });
  interview.addManualNode(stage.id, person.id, 'alice', {
    [name.id]: 'Alice',
    [nickname.id]: 'Ali',
    [age.id]: 34,
  });
  if (withBob) {
    interview.addManualNode(stage.id, person.id, 'bob', {
      [name.id]: 'Bob',
      [nickname.id]: 'Bobby',
      [age.id]: 41,
    });
  }

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return { interview, encryptedVariableIds: [nickname.id] };
}

const renderProtectedInterview = () => (
  <EncryptedStoryInterviewShell
    build={buildProtectedInterview}
    passphrase={PASSPHRASE}
    currentStep={0}
  />
);

const openLockedSlide = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(
    // The notice also describes the form from a hidden element, which is
    // not the text a participant reads.
    await canvas.findByText(
      /Some answers here are protected by your passphrase/,
      { ignore: 'script, style, [hidden]' },
      { timeout: 10_000 },
    ),
  ).toBeInTheDocument();
  await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument();
  await expect(canvas.queryByRole('spinbutton')).not.toBeInTheDocument();
  await expect(
    await canvas.findByRole('button', { name: 'Passphrase' }),
  ).toBeInTheDocument();
};

export const ProtectedAnswersLocked: Story = {
  render: renderProtectedInterview,
  parameters: {
    docs: {
      description: {
        story: `The person's nickname is protected with a passphrase ("${PASSPHRASE}") that is not in memory, as after the interview is resumed. Their form stays closed, with the reason shown, until the passphrase is entered.`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await openLockedSlide(canvasElement);
  },
};

export const ProtectedAnswersUnlocked: Story = {
  render: renderProtectedInterview,
  parameters: {
    docs: {
      description: {
        story: `As in Protected Answers Locked, until the passphrase ("${PASSPHRASE}") is entered through the prompter; the form then opens on the decrypted answers.`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await openLockedSlide(canvasElement);
    await enterPassphraseInPrompter(PASSPHRASE);

    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('textbox', {
        name: /What nickname do you use for this person/,
      }),
    ).toHaveValue('Ali');
    await expect(
      canvas.getByRole('spinbutton', { name: /How old are they/ }),
    ).toHaveValue(34);
  },
};

// Alice's nickname was encrypted for someone else, as when an answer is
// copied between people, so no passphrase can read it here. Bob's was not:
// the passphrase is checked by decrypting an answer the interview holds, so
// it is his that shows the passphrase is the right one.
const buildUnavailableInterview = () => ({
  ...buildProtectedInterview({ withBob: true }),
  encryptedFor: { alice: 'someone-else' },
});

export const ProtectedAnswerUnavailable: Story = {
  render: () => (
    <EncryptedStoryInterviewShell
      build={buildUnavailableInterview}
      passphrase={PASSPHRASE}
      currentStep={0}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: `The person's nickname is protected, but was encrypted for someone else, so the passphrase ("${PASSPHRASE}") cannot read it. Once the passphrase is entered, the question is shown as unavailable and its stored answer is kept as it is unless the participant chooses to enter a new one.`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await openLockedSlide(canvasElement);
    await enterPassphraseInPrompter(PASSPHRASE);

    const canvas = within(canvasElement);
    const nickname = await canvas.findByRole('textbox', {
      name: /What nickname do you use for this person/,
    });
    await expect(nickname).toHaveValue('Answer unavailable');
    await expect(nickname).toHaveAttribute('readonly');
    await expect(nickname).toHaveAccessibleDescription(/cannot be shown here/);
    await expect(
      canvas.getByRole('spinbutton', { name: /How old are they/ }),
    ).toHaveValue(34);

    await userEvent.click(
      canvas.getByRole('button', { name: 'Enter a new answer' }),
    );
    const replacement = canvas.getByRole('textbox', {
      name: /What nickname do you use for this person/,
    });
    await expect(replacement).toHaveValue('');
    await expect(replacement).toHaveFocus();
    // The same sentence covers the read-only and the replacing state; here it
    // describes the field that now takes the new answer.
    await expect(replacement).toHaveAccessibleDescription(
      /leave the field empty to keep the earlier answer/,
    );
  },
};

function buildComparedWithProtectedInterview() {
  const interview = new SyntheticInterview();
  const person = interview.addNodeType({ name: 'Person' });
  const name = person.addVariable({
    name: 'name',
    type: 'text',
    encrypted: true,
  });
  const nickname = person.addVariable({
    name: 'nickname',
    type: 'text',
    component: 'Text',
    validation: { differentFrom: name.id },
  });

  // A stage before the form gives Back somewhere to go.
  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the main stage.',
  });

  const stage = interview.addStage('AlterForm', {
    label: 'Alter Form (Compared with protected)',
    subject: { entity: 'node', type: person.id },
  });
  stage.addFormField({
    variable: nickname.id,
    component: 'Text',
    prompt: 'What nickname do you use for this person?',
  });
  interview.addManualNode(stage.id, person.id, 'alice', {
    [name.id]: 'Alice',
  });

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });

  return { interview, encryptedVariableIds: [name.id] };
}

export const DiscardingAnswerComparedWithProtected: Story = {
  render: () => (
    <EncryptedStoryInterviewShell
      build={buildComparedWithProtectedInterview}
      passphrase={PASSPHRASE}
      currentStep={1}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: `The nickname must differ from the person's name, which is protected with a passphrase ("${PASSPHRASE}") that has not been entered, so the nickname cannot be checked or saved. Going back asks before discarding it, and says the passphrase is needed rather than that the answer is invalid.`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nickname = await canvas.findByRole(
      'textbox',
      { name: /What nickname do you use for this person/ },
      { timeout: 10_000 },
    );
    await userEvent.type(nickname, 'Al');
    await userEvent.click(canvas.getByTestId('previous-button'));

    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog', {
      name: 'Discard changes?',
    });
    await expect(dialog).toHaveTextContent(
      'Your answers have not been saved. Enter your passphrase, then try again.',
    );
    await expect(dialog).not.toHaveTextContent(
      /Do you want to discard your changes\?/,
    );
    await userEvent.click(body.getByRole('button', { name: 'Cancel' }));

    await expect(
      await canvas.findByRole('textbox', {
        name: /What nickname do you use for this person/,
      }),
    ).toHaveValue('Al');
  },
};
