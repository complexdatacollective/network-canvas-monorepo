import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import EncryptedStoryInterviewShell from '../storybook-support/EncryptedStoryInterviewShell';
import { enterPassphraseInPrompter } from '../storybook-support/passphraseSteps';
import StoryInterviewShell from '../storybook-support/StoryInterviewShell';

const PASSPHRASE = 'correct horse battery staple';

function quickAddInterview() {
  const interview = new SyntheticInterview();
  const person = interview.addNodeType({ name: 'Person' });
  const name = person.addVariable({
    name: 'name',
    type: 'text',
    encrypted: true,
  });
  const stage = interview.addStage('NameGeneratorQuickAdd', {
    subject: { entity: 'node', type: person.id },
    quickAdd: name.id,
  });
  stage.addPrompt({ text: 'Who do you spend your free time with?' });
  return { interview, person, name, stage };
}

function buildInterview() {
  const { interview, person, name, stage } = quickAddInterview();
  interview.addManualNode(
    stage.id,
    person.id,
    'alice',
    { [name.id]: 'Alice' },
    { promptIndices: [0] },
  );
  return { interview, encryptedVariableIds: [name.id] };
}

function buildInterviewWithACopiedAnswer() {
  const { interview, person, name, stage } = quickAddInterview();
  interview.addManualNode(
    stage.id,
    person.id,
    'alice',
    { [name.id]: 'Alice' },
    { promptIndices: [0] },
  );
  interview.addManualNode(
    stage.id,
    person.id,
    'bob',
    { [name.id]: 'Bob' },
    { promptIndices: [0] },
  );
  return {
    interview,
    encryptedVariableIds: [name.id],
    encryptedFor: { bob: 'alice' },
  };
}

function buildNewInterview() {
  return SuperJSON.stringify(
    quickAddInterview().interview.getInterviewPayload({ currentStep: 0 }),
  );
}

// An answer saved by schema 8's experimental format, which kept a salt with
// every value. No passphrase can read it now.
const SCHEMA_8_ANSWER = {
  iv: Array.from({ length: 12 }, (_, index) => index),
  salt: Array.from({ length: 16 }, (_, index) => 100 + index),
  data: Array.from({ length: 32 }, (_, index) => 200 - index),
};

function buildSchema8Interview() {
  const interview = new SyntheticInterview();
  const person = interview.addNodeType({ name: 'Person' });
  const name = person.addVariable({
    name: 'name',
    type: 'text',
    encrypted: true,
  });
  const closeness = person.addVariable({
    name: 'Closeness',
    type: 'ordinal',
    options: [
      { label: 'Not close', value: 1 },
      { label: 'Close', value: 2 },
      { label: 'Very close', value: 3 },
    ],
  });
  const stage = interview.addStage('OrdinalBin', {
    subject: { entity: 'node', type: person.id },
  });
  stage.addPrompt({
    variable: closeness.id,
    text: 'How close are you to each person?',
  });
  interview.addManualNode(stage.id, person.id, 'alice', {
    [name.id]: 'Alice',
  });

  const payload = interview.getInterviewPayload({ currentStep: 0 });
  const { iv, salt, data } = SCHEMA_8_ANSWER;
  const nodes = payload.network.nodes.map((node) => ({
    ...node,
    [entityAttributesProperty]: {
      ...node[entityAttributesProperty],
      [name.id]: data,
    },
    [entitySecureAttributesMeta]: { [name.id]: { iv, salt } },
  }));
  return SuperJSON.stringify({
    ...payload,
    network: { ...payload.network, nodes },
  });
}

function InterviewFromPayload({ build }: { build: () => string }) {
  const rawPayload = useMemo(build, [build]);
  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={rawPayload}
        navigationOrientation="vertical"
      />
    </div>
  );
}

const meta: Meta = {
  title: 'Components/PassphrasePrompter',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          "Shown in the navigation, as a side rail or a bottom bar, when the screen needs the interview's passphrase and it is not in memory: before one has been chosen, or after the interview is resumed. The first passphrase of an interview is chosen and confirmed; any later one is accepted only if it matches it.",
      },
    },
  },
  render: () => (
    <EncryptedStoryInterviewShell
      build={buildInterview}
      passphrase={PASSPHRASE}
      currentStep={0}
    />
  ),
};

export default meta;
type Story = StoryObj;

const findKeyButton = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole(
    'button',
    { name: 'Enter your Passphrase' },
    { timeout: 10_000 },
  );

// Long enough for a passphrase prompt that is wrongly asked for to appear.
const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 500);
  });

const openPrompter = async (canvasElement: HTMLElement) => {
  await userEvent.click(await findKeyButton(canvasElement));
  // The label also carries a visual required marker.
  return screen.findByLabelText(/^Passphrase/, { selector: 'input' });
};

export const Locked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await findKeyButton(canvasElement)).toHaveTextContent('🔑');
    await expect(
      canvas.queryByRole('option', { name: 'Alice' }),
    ).not.toBeInTheDocument();
  },
};

export const TurnsAwayAWrongPassphrase: Story = {
  parameters: {
    docs: {
      description: {
        story: `A passphrase has been chosen in this interview ("${PASSPHRASE}"), so the prompter asks for it once, without confirmation, and turns away any other.`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    const field = await openPrompter(canvasElement);
    const dialog = screen.getByRole('dialog', {
      name: 'Enter your Passphrase',
    });
    await expect(field).toHaveAttribute('type', 'password');
    await expect(
      within(dialog).queryByLabelText(/^Confirm Passphrase/, {
        selector: 'input',
      }),
    ).not.toBeInTheDocument();

    await userEvent.type(field, 'not the passphrase');
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit passphrase' }),
    );

    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'), {
      timeout: 10_000,
    });
    await expect(field).toHaveAccessibleDescription(
      expect.stringContaining(
        'This passphrase does not match the one used earlier in this interview.',
      ),
    );
    await expect(
      screen.queryByText('Checking your passphrase…'),
    ).not.toBeInTheDocument();
    await expect(dialog).toBeInTheDocument();
    await expect(
      within(canvasElement).queryByRole('option', { name: 'Alice' }),
    ).not.toBeInTheDocument();
  },
};

export const AcceptsTheMatchingPassphrase: Story = {
  play: async ({ canvasElement }) => {
    await enterPassphraseInPrompter(PASSPHRASE);

    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('option', { name: 'Alice' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        canvas.queryByRole('button', { name: 'Enter your Passphrase' }),
      ).not.toBeInTheDocument(),
    );
  },
};

export const ChoosesAPassphrase: Story = {
  render: () => <InterviewFromPayload build={buildNewInterview} />,
  parameters: {
    docs: {
      description: {
        story:
          "No passphrase has been chosen in this interview yet, and this screen protects the names it collects. The prompter asks for a new passphrase, entered twice, that meets the minimum length (8 characters unless the protocol's Anonymisation stage sets its own).",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const field = await openPrompter(canvasElement);
    const dialog = within(
      screen.getByRole('dialog', { name: 'Choose a passphrase' }),
    );
    const confirm = dialog.getByLabelText(/^Confirm Passphrase/, {
      selector: 'input',
    });
    const submit = dialog.getByRole('button', { name: 'Submit passphrase' });

    await userEvent.type(field, 'short');
    await userEvent.type(confirm, 'short');
    await userEvent.click(submit);
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    await expect(field).toHaveAccessibleDescription(
      expect.stringContaining('Too short. Enter at least 8 characters.'),
    );

    await userEvent.clear(field);
    await userEvent.type(field, PASSPHRASE);
    await userEvent.clear(confirm);
    await userEvent.type(confirm, PASSPHRASE);
    await userEvent.click(submit);

    await expect(
      await screen.findByText('Checking your passphrase…'),
    ).toBeInTheDocument();
    await waitFor(
      () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      { timeout: 10_000 },
    );
    await expect(
      screen.queryByText('Checking your passphrase…'),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(canvasElement).queryByRole('button', {
          name: 'Enter your Passphrase',
        }),
      ).not.toBeInTheDocument(),
    );
  },
};

export const AnswerEncryptedForAnotherPerson: Story = {
  render: () => (
    <EncryptedStoryInterviewShell
      build={buildInterviewWithACopiedAnswer}
      passphrase={PASSPHRASE}
      currentStep={0}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: `Bob's name was encrypted for another person, as if copied from them, so it can never be read. Once the passphrase ("${PASSPHRASE}") is entered, Alice's name is shown and Bob's reads "Answer unavailable"; the prompter does not ask again.`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await enterPassphraseInPrompter(PASSPHRASE);

    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole(
        'option',
        { name: 'Answer unavailable' },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument();
    await settle();
    await expect(
      canvas.getByRole('option', { name: 'Alice' }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('option', { name: 'Bob' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        canvas.queryByRole('button', { name: 'Enter your Passphrase' }),
      ).not.toBeInTheDocument(),
    );
  },
};

export const NotShownForAnswersThatCannotBeRead: Story = {
  render: () => <InterviewFromPayload build={buildSchema8Interview} />,
  parameters: {
    docs: {
      description: {
        story:
          'Alice\'s name was protected by an earlier version of Network Canvas, in a format no passphrase can read. It is shown as "Answer unavailable", and since nothing on this screen needs the passphrase, the prompter is not shown.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Answer unavailable', {}, { timeout: 10_000 }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText('🔒')).not.toBeInTheDocument();
    await settle();
    await expect(
      canvas.queryByRole('button', { name: 'Enter your Passphrase' }),
    ).not.toBeInTheDocument();
  },
};
