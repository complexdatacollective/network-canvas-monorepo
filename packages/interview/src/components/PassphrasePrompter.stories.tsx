import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import EncryptedStoryInterviewShell from '../storybook-support/EncryptedStoryInterviewShell';
import { expectMaskedPassphraseField } from '../storybook-support/expectMaskedPassphraseField';

const PASSPHRASE = 'correct horse battery staple';

function buildInterview() {
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
  interview.addManualNode(
    stage.id,
    person.id,
    'alice',
    { [name.id]: 'Alice' },
    { promptIndices: [0] },
  );
  return { interview, encryptedVariableIds: [name.id] };
}

const meta: Meta = {
  title: 'Components/PassphrasePrompter',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Shown in the vertical navigation when the interview holds answers protected by a passphrase that is not in memory, such as after the interview is resumed. A passphrase is accepted only if it unlocks those answers.',
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

const openPrompter = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole(
      'button',
      { name: 'Enter your Passphrase' },
      { timeout: 10_000 },
    ),
  );
  // The label also carries a visual required marker.
  return screen.findByLabelText(/^Passphrase/, { selector: 'input' });
};

export const Locked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole(
        'button',
        { name: 'Enter your Passphrase' },
        { timeout: 10_000 },
      ),
    ).toHaveTextContent('🔑');
    await expect(
      canvas.queryByRole('option', { name: 'Alice' }),
    ).not.toBeInTheDocument();
  },
};

export const TurnsAwayAWrongPassphrase: Story = {
  play: async ({ canvasElement }) => {
    const field = await openPrompter(canvasElement);
    await expectMaskedPassphraseField(field);

    await userEvent.type(field, 'not the passphrase');
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit passphrase' }),
    );

    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    await expect(field).toHaveAccessibleDescription(
      expect.stringContaining(
        'This passphrase does not match the one used earlier in this interview.',
      ),
    );
    await expect(screen.getByRole('dialog')).toBeInTheDocument();
    await expect(
      within(canvasElement).queryByRole('option', { name: 'Alice' }),
    ).not.toBeInTheDocument();
  },
};

export const AcceptsTheMatchingPassphrase: Story = {
  play: async ({ canvasElement }) => {
    const field = await openPrompter(canvasElement);

    await userEvent.type(field, PASSPHRASE);
    await userEvent.click(
      screen.getByRole('button', { name: 'Submit passphrase' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
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
