import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import EncryptedStoryInterviewShell from '../../storybook-support/EncryptedStoryInterviewShell';
import { expectMaskedPassphraseField } from '../../storybook-support/expectMaskedPassphraseField';
import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

type StoryArgs = {
  title: string;
  body: string;
};

function buildInterview(args: StoryArgs) {
  const interview = new SyntheticInterview();

  interview.addInformationStage({
    title: 'Welcome',
    text: 'Before the anonymisation stage.',
  });

  interview.addStage('Anonymisation', {
    explanationText: { title: args.title, body: args.body },
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
  },
  args: {
    title: 'Data Anonymisation',
    body: 'Your data will be anonymised using a **passphrase** that you create below.\n\nThis passphrase is used to generate a unique encryption key that replaces any identifying information in your responses. Only someone with the same passphrase can link your data back to you.\n\nPlease choose a passphrase that is memorable but not easily guessed.',
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

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

const PASSPHRASE = 'correct horse battery staple';

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
        story: `The interview already holds answers protected with a passphrase ("${PASSPHRASE}") that is no longer in memory. A different passphrase is turned away with the reason under the field; the original one is accepted.`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Each label also carries a visual required marker.
    const passphrase = await canvas.findByLabelText(
      /^Passphrase/,
      { selector: 'input' },
      { timeout: 10_000 },
    );
    const confirm = canvas.getByLabelText(/^Confirm Passphrase/, {
      selector: 'input',
    });
    const submit = canvas.getByRole('button', { name: 'Submit' });

    for (const field of [passphrase, confirm]) {
      await expectMaskedPassphraseField(field);
    }

    await userEvent.type(passphrase, 'not the passphrase');
    await userEvent.type(confirm, 'not the passphrase');
    await userEvent.click(submit);

    await waitFor(() =>
      expect(passphrase).toHaveAttribute('aria-invalid', 'true'),
    );
    await expect(passphrase).toHaveAccessibleDescription(
      expect.stringContaining(
        'This passphrase does not match the one used earlier in this interview.',
      ),
    );
    await expect(
      canvas.queryByText(/Passphrase set successfully/),
    ).not.toBeInTheDocument();

    await userEvent.clear(passphrase);
    await userEvent.type(passphrase, PASSPHRASE);
    await userEvent.clear(confirm);
    await userEvent.type(confirm, PASSPHRASE);
    await userEvent.click(submit);

    await expect(
      await canvas.findByText(/Passphrase set successfully/),
    ).toBeInTheDocument();
  },
};
