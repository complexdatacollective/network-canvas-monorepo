import type { Meta, StoryObj } from '@storybook/react-vite';

import { ChangePassphraseForm, ChangePinForm } from './ManageAuthenticator';

// The re-enrolment forms from Settings → Authenticator. Prop-driven: the story
// supplies onReEnrol (outcome-controlled) and no-op success/cancel.
type Outcome = 'success' | 'failure';
type StoryArgs = { form: 'pin' | 'passphrase'; outcome: Outcome };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const meta: Meta<StoryArgs> = {
  title: 'Auth/ManageAuthenticator',
  parameters: { layout: 'padded' },
  args: { form: 'pin', outcome: 'success' },
  argTypes: {
    form: { control: 'inline-radio', options: ['pin', 'passphrase'] },
    outcome: { control: 'inline-radio', options: ['success', 'failure'] },
  },
  render: ({ form, outcome }) => {
    const onReEnrol = async () => {
      await wait(120);
      return outcome === 'success'
        ? { ok: true }
        : { ok: false, message: 'Current secret is incorrect.' };
    };
    const props = { onReEnrol, onSuccess: () => {}, onCancel: () => {} };
    return (
      <div className="max-w-xl">
        {form === 'pin' ? (
          <ChangePinForm {...props} />
        ) : (
          <ChangePassphraseForm {...props} />
        )}
      </div>
    );
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Default: Story = {};
export const ChangePassphrase: Story = { args: { form: 'passphrase' } };
