import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import EncryptedStoryInterviewShell from '../../storybook-support/EncryptedStoryInterviewShell';
import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

type StoryArgs = {
  title: string;
  body: string;
  /** The stage's own minimum passphrase length, replacing the default. */
  minLength?: number;
};

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the anonymisation stage.',
  });

  interview.addStage('Anonymisation', {
    explanationText: { title: args.title, body: args.body },
    ...(args.minLength !== undefined && {
      validation: { minLength: args.minLength },
    }),
  });

  interview.addInformationStage({
    title: 'Complete',
    text: 'After the anonymisation stage.',
  });

  return interview;
}

const AnonymisationStoryWrapper = (args: StoryArgs) => {
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
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/Anonymisation',
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    title: {
      control: 'text',
      description: 'Explanation text title',
    },
    body: {
      control: 'text',
      description: 'Explanation text body (supports markdown)',
    },
    minLength: {
      control: 'number',
      description:
        'Minimum passphrase length set by the stage (`validation.minLength`). Without one, a new passphrase must be at least 8 characters.',
    },
  },
  args: {
    title: 'Data Anonymisation',
    body: 'Your data will be anonymised using a **passphrase** that you create below.\n\nThis passphrase is used to generate a unique encryption key that replaces any identifying information in your responses. Only someone with the same passphrase can link your data back to you.\n\nPlease choose a passphrase that is memorable but not easily guessed.',
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

const PASSPHRASE = 'correct horse battery staple';

// Each label also carries a visual required marker.
const findPassphraseField = (canvas: ReturnType<typeof within>) =>
  canvas.findByLabelText(
    /^Passphrase/,
    { selector: 'input' },
    { timeout: 10_000 },
  );

const CONFIRM_LABEL = /^Confirm Passphrase/;

// One message covers choosing, entering again, and returning to the stage.
const PASSPHRASE_ACCEPTED = 'Passphrase accepted! Click "Next" to continue.';
const ANY_SUCCESS = /Passphrase accepted/;

/**
 * Submits the passphrase form and waits for the check to show as under way
 * and then to finish with `successMessage`.
 */
async function submitAndWaitForAcceptance(
  canvas: ReturnType<typeof within>,
  successMessage: string,
) {
  await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
  await expect(
    await canvas.findByText('Checking your passphrase…'),
  ).toBeInTheDocument();
  await expect(
    await canvas.findByText(successMessage, {}, { timeout: 10_000 }),
  ).toBeInTheDocument();
  await expect(
    canvas.queryByText('Checking your passphrase…'),
  ).not.toBeInTheDocument();
}

export const Default: Story = {
  render: (args) => <AnonymisationStoryWrapper {...args} />,
};

export const MinimalExplanation: Story = {
  render: (args) => <AnonymisationStoryWrapper {...args} />,
  args: {
    title: 'Anonymise Your Data',
    body: 'Please create a passphrase to protect your identity.',
  },
};

export const DetailedInstructions: Story = {
  render: (args) => <AnonymisationStoryWrapper {...args} />,
  args: {
    title: 'Participant Data Protection',
    body: [
      '## Why Anonymisation?',
      '',
      'This study collects information about your social network. To protect',
      'your privacy and the privacy of the people you mention, we use a',
      'passphrase-based anonymisation process.',
      '',
      '## How It Works',
      '',
      '1. You create a **unique passphrase** below',
      '2. This passphrase generates a cryptographic key',
      '3. All names and identifying details are replaced with anonymous codes',
      '4. Only someone with your exact passphrase can reverse the process',
      '',
      '## Important',
      '',
      '- Choose something **memorable** — you may need it again in follow-up sessions',
      '- Do **not** share your passphrase with anyone',
      '- If you forget your passphrase, your data cannot be de-anonymised',
      '',
      '> Your passphrase is never stored. It is used only to derive the encryption key.',
    ].join('\n'),
  },
};

export const ChoosesAPassphrase: Story = {
  render: (args) => <AnonymisationStoryWrapper {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          'No passphrase has been chosen in this interview yet, so the participant chooses one and confirms it. Without a minimum set by the stage, it must be at least 8 characters. Neither field offers to save the passphrase to a password manager.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const passphrase = await findPassphraseField(canvas);
    const confirm = canvas.getByLabelText(CONFIRM_LABEL, { selector: 'input' });
    await expect(passphrase).toHaveAttribute('autocomplete', 'off');
    await expect(confirm).toHaveAttribute('autocomplete', 'off');

    await userEvent.type(passphrase, 'short');
    await userEvent.type(confirm, 'short');
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(passphrase).toHaveAttribute('aria-invalid', 'true'),
    );
    await expect(passphrase).toHaveAccessibleDescription(
      expect.stringContaining('Enter at least 8 characters.'),
    );

    await userEvent.clear(passphrase);
    await userEvent.type(passphrase, PASSPHRASE);
    await userEvent.clear(confirm);
    await userEvent.type(confirm, PASSPHRASE);
    await submitAndWaitForAcceptance(canvas, PASSPHRASE_ACCEPTED);
  },
};

export const ShorterMinimumLength: Story = {
  render: (args) => <AnonymisationStoryWrapper {...args} />,
  args: { minLength: 4 },
  parameters: {
    docs: {
      description: {
        story:
          'The stage sets its own minimum length of 4 characters, which replaces the default of 8: a 3-character passphrase is turned away, a 4-character one is accepted.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const passphrase = await findPassphraseField(canvas);
    const confirm = canvas.getByLabelText(CONFIRM_LABEL, { selector: 'input' });

    await userEvent.type(passphrase, 'abc');
    await userEvent.type(confirm, 'abc');
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(passphrase).toHaveAttribute('aria-invalid', 'true'),
    );
    await expect(passphrase).toHaveAccessibleDescription(
      expect.stringContaining('Enter at least 4 characters.'),
    );

    await userEvent.type(passphrase, 'd');
    await userEvent.type(confirm, 'd');
    await submitAndWaitForAcceptance(canvas, PASSPHRASE_ACCEPTED);
  },
};

export const ReturnsToTheStage: Story = {
  render: (args) => <AnonymisationStoryWrapper {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          'The participant chooses a passphrase, moves on, and comes back. The passphrase is still in force, so the stage asks for nothing and says it was entered already.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const passphrase = await findPassphraseField(canvas);
    await userEvent.type(passphrase, PASSPHRASE);
    await userEvent.type(
      canvas.getByLabelText(CONFIRM_LABEL, { selector: 'input' }),
      PASSPHRASE,
    );
    await submitAndWaitForAcceptance(canvas, PASSPHRASE_ACCEPTED);

    await userEvent.click(canvas.getByTestId('next-button'));
    await expect(
      await canvas.findByRole('heading', { name: 'Complete' }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByTestId('previous-button'));

    await expect(
      await canvas.findByText(PASSPHRASE_ACCEPTED, {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Submit' }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText('Checking your passphrase…'),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByLabelText(/^Passphrase/, { selector: 'input' }),
    ).not.toBeInTheDocument();
  },
};

function buildResumedInterview() {
  const interview = new SyntheticInterview();
  const person = interview.addNodeType({ name: 'Person' });
  const name = person.addVariable({
    name: 'name',
    type: 'text',
    encrypted: true,
  });
  interview.addStage('Anonymisation', {
    explanationText: {
      title: 'Protect your answers',
      body: 'Enter the passphrase you chose earlier in this interview.',
    },
  });
  const generator = interview.addStage('NameGeneratorQuickAdd', {
    subject: { entity: 'node', type: person.id },
    quickAdd: name.id,
  });
  generator.addPrompt({ text: 'Who do you spend your free time with?' });
  interview.addManualNode(
    generator.id,
    person.id,
    'alice',
    { [name.id]: 'Alice' },
    { promptIndices: [0] },
  );
  return { interview, encryptedVariableIds: [name.id] };
}

export const ResumedWithProtectedAnswers: Story = {
  render: () => (
    <EncryptedStoryInterviewShell
      build={buildResumedInterview}
      passphrase={PASSPHRASE}
      currentStep={0}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: `A passphrase ("${PASSPHRASE}") was chosen earlier in this interview, and is no longer in memory. The stage asks for it again, once and without length rules. A different passphrase is turned away with the reason under the field; the original one is accepted.`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const passphrase = await findPassphraseField(canvas);
    await expect(passphrase).toHaveAttribute('autocomplete', 'off');
    await expect(
      canvas.getByText(
        /^Some answers on this screen are protected by a passphrase\./,
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByLabelText(CONFIRM_LABEL, { selector: 'input' }),
    ).not.toBeInTheDocument();

    // Shorter than any minimum for choosing one, yet checked like any other.
    await userEvent.type(passphrase, 'nope');
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));

    await waitFor(
      () => expect(passphrase).toHaveAttribute('aria-invalid', 'true'),
      { timeout: 10_000 },
    );
    await expect(passphrase).toHaveAccessibleDescription(
      expect.stringContaining(
        'This passphrase does not match the one used earlier in this interview.',
      ),
    );
    await expect(passphrase).not.toHaveAccessibleDescription(
      expect.stringContaining('Enter at least'),
    );
    await expect(
      canvas.queryByText('Checking your passphrase…'),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText(ANY_SUCCESS)).not.toBeInTheDocument();

    await userEvent.clear(passphrase);
    await userEvent.type(passphrase, PASSPHRASE);
    await submitAndWaitForAcceptance(canvas, PASSPHRASE_ACCEPTED);
  },
};

export const DamagedPassphraseRecord: Story = {
  render: () => (
    <EncryptedStoryInterviewShell
      build={buildResumedInterview}
      passphrase={PASSPHRASE}
      currentStep={0}
      headerIterations={1_000_000_000}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The record this interview keeps to check a passphrase has been damaged (here, an impossible key-stretching count), so no passphrase can be checked. The stage asks for none, says the protected answers cannot be shown or saved, and lets the participant continue.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(
        'Answers protected by a passphrase cannot be shown or saved in this interview. Please let the person who recruited you to this study know.',
        {},
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByLabelText(/^Passphrase/, { selector: 'input' }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText(ANY_SUCCESS)).not.toBeInTheDocument();
    await expect(canvas.getByTestId('next-button')).toBeEnabled();
  },
};
