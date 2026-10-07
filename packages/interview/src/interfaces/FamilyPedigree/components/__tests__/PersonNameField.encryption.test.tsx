import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import type { Variable } from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../../contexts/CurrentStepContext';
import { TestProtocolLocalization } from '../../../__tests__/TestProtocolLocalization';
import {
  alterFormStages,
  createEncryptionStore,
  encryptionFor,
  makeEncryptedPerson,
  unlockWith,
} from '../../../Anonymisation/__tests__/encryptionFixtures';
import PersonNameField from '../PersonNameField';

const pedigree = vi.hoisted(() => ({ nodes: new Map<string, NcNode>() }));

vi.mock('../../utils/nodeUtils', () => {
  const noFields: never[] = [];
  return {
    getNodeType: () => 'person',
    getNodeLabelVariable: () => 'name',
    getNodeForm: () => noFields,
  };
});

vi.mock('../../FamilyPedigreeContext', () => ({
  useFamilyPedigreeStore: (
    selector: (state: { network: { nodes: Map<string, NcNode> } }) => unknown,
  ) => selector({ network: { nodes: pedigree.nodes } }),
}));

const variables: Record<string, Variable> = {
  name: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
    validation: { unique: true },
  },
  age: { name: 'age', label: 'age', type: 'number', component: 'Number' },
};

/**
 * The name field of a pedigree in an interview where Alice, from an earlier
 * screen, is already named, encrypted.
 */
async function renderNameField({ unlocked }: { unlocked: boolean }) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(
    [await makeEncryptedPerson('alice', 'Alice', 'pw')],
    alterFormStages,
    variables,
    { header },
  );
  if (unlocked) await unlockWith(store, 'pw');
  const onSubmit = vi.fn(() => ({ success: true as const }));

  render(
    <Provider store={store}>
      <TestProtocolLocalization>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <Form onSubmit={onSubmit}>
            <PersonNameField label="Name" />
            <button type="submit">Save</button>
          </Form>
        </CurrentStepProvider>
      </TestProtocolLocalization>
    </Provider>,
  );
  return { onSubmit };
}

async function submitName(name: string) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Name' }), name);
  await user.click(screen.getByRole('button', { name: 'Save' }));
}

describe('PersonNameField with an encrypted, unique name', () => {
  it('rejects a name someone already has, comparing with the decrypted name', async () => {
    const { onSubmit } = await renderNameField({ unlocked: true });

    await submitName('Alice');

    expect(await screen.findByTestId('name-field-error')).toHaveTextContent(
      /must be unique/i,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts a name no one else has', async () => {
    const { onSubmit } = await renderNameField({ unlocked: true });

    await submitName('Bob');

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it('asks for the passphrase, rather than accepting the name, while the key is not in force', async () => {
    const { onSubmit } = await renderNameField({ unlocked: false });

    await submitName('Alice');

    expect(await screen.findByTestId('name-field-error')).toHaveTextContent(
      'This answer is checked against answers protected by your passphrase. Enter your passphrase, then try again.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
