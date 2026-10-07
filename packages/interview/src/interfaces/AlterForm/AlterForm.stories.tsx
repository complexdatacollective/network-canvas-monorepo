import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

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
    introductionPanel: {
      title: 'About Each Person',
      text: 'Please provide details about each person.',
    },
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
    introductionPanel: {
      title: 'About Each Person',
      text: 'These fields have validation rules. Try advancing without filling them in to see errors.',
    },
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
    // Leave the introduction for the first person's questions.
    await userEvent.click(
      await canvas.findByTestId('next-button', {}, { timeout: 10_000 }),
    );

    // The introduction's exit animation runs before the questions appear.
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
    await userEvent.click(body.getByRole('button', { name: 'Keep changes' }));

    await expect(
      await canvas.findByRole('textbox', { name: /Notes \(required/ }),
    ).toHaveValue('ab');
    await expect(canvas.queryByText('About Each Person')).toBeNull();
  },
};

const PASSPHRASE = 'correct horse battery staple';

function buildProtectedInterview() {
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
    introductionPanel: {
      title: 'About Each Person',
      text: 'Please provide details about each person.',
    },
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
  await userEvent.click(
    await canvas.findByTestId('next-button', {}, { timeout: 10_000 }),
  );

  await expect(
    await canvas.findByText(
      /Some answers here are protected by your passphrase/,
    ),
  ).toBeInTheDocument();
  await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument();
  await expect(canvas.queryByRole('spinbutton')).not.toBeInTheDocument();
  await expect(
    await canvas.findByRole('button', { name: 'Enter your Passphrase' }),
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
// copied between people, so no passphrase can read it here.
const buildUnavailableInterview = () => ({
  ...buildProtectedInterview(),
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
    await expect(
      canvas.getByText(/Leave this empty to keep the earlier answer/),
    ).toBeInTheDocument();
  },
};

export const ProtectedAnswersRefused: Story = {
  render: () => (
    <EncryptedStoryInterviewShell
      build={buildProtectedInterview}
      passphrase={PASSPHRASE}
      currentStep={0}
      headerIterations={1_000_000_000}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The record this interview keeps to check a passphrase has been damaged (here, an impossible key-stretching count), so no passphrase can open the protected nickname. The form opens without asking for one: the nickname is shown as unavailable, with the reason, and cannot be replaced, while the other questions can still be answered.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByTestId('next-button', {}, { timeout: 10_000 }),
    );

    const nickname = await canvas.findByRole('textbox', {
      name: /What nickname do you use for this person/,
    });
    await expect(nickname).toHaveValue('Answer unavailable');
    await expect(nickname).toHaveAttribute('readonly');
    await expect(nickname).toHaveAccessibleDescription(
      /cannot be shown or saved in this interview/,
    );
    await expect(
      canvas.queryByRole('button', { name: 'Enter a new answer' }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole('spinbutton', { name: /How old are they/ }),
    ).toHaveValue(34);
    await expect(
      canvas.queryByRole('button', { name: 'Enter your Passphrase' }),
    ).not.toBeInTheDocument();
  },
};
