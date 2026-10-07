import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../../contexts/CurrentStepContext';
import { writeSubmissionResult } from '../../../../forms/writeSubmissionResult';
import { InterviewI18nProvider } from '../../../../i18n/InterviewI18nProvider';
import { addNode as addSessionNode } from '../../../../store/modules/session';
import {
  setPassphrase,
  setPassphraseInvalid,
} from '../../../../store/modules/ui';
import {
  createEncryptionStore,
  makeEncryptedPerson,
  makePlainPerson,
  NODE_TYPE,
} from '../../../Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../../../Anonymisation/decryptionScope';
import { decryptData } from '../../../Anonymisation/utils';
import NodeForm from '../NodeForm';

vi.mock('../../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

// jsdom has neither observer; the dialog's scroll area and form errors use them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

async function renderEditing(
  node: NcNode | Promise<NcNode>,
  passphrase?: string,
  encryptionEnabled = true,
) {
  const selected = await node;
  const store = createEncryptionStore(
    [selected],
    undefined,
    undefined,
    encryptionEnabled,
  );
  if (passphrase) store.dispatch(setPassphrase(passphrase));
  const onClose = vi.fn();

  const [stage] = store.getState().protocol.stages;
  if (stage?.type !== 'NameGenerator') {
    throw new Error('The fixture stage is a name generator');
  }

  const addNode = async (attributes: NcNode[typeof entityAttributesProperty]) =>
    writeSubmissionResult(
      await store.dispatch(
        addSessionNode({
          type: NODE_TYPE,
          attributeData: attributes,
          useEncryption: encryptionEnabled,
          currentStep: 0,
        }),
      ),
    );

  render(
    <Provider store={store}>
      <InterviewI18nProvider requestedLocale="en">
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <NodeForm
            selectedNode={selected}
            form={stage.form}
            disabled={false}
            onClose={onClose}
            addNode={addNode}
          />
        </CurrentStepProvider>
      </InterviewI18nProvider>
    </Provider>,
  );

  return { store, onClose };
}

const storedName = (node: NcNode | undefined) => {
  const data = node?.[entityAttributesProperty].name;
  const secureAttributes = node?.[entitySecureAttributesMeta]?.name;
  return { data, secureAttributes };
};

describe('NodeForm editing a person with an encrypted answer', () => {
  it('opens on the decrypted answer, and saves the change encrypted', async () => {
    const { store, onClose } = await renderEditing(
      makeEncryptedPerson('n1', 'Alice', 'pw'),
      'pw',
    );
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Alice');

    await user.clear(name);
    await user.type(name, 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Finished' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const { data, secureAttributes } = storedName(
      store.getState().session.network.nodes[0],
    );
    expect(isNumberArray(data)).toBe(true);
    if (!secureAttributes || !isNumberArray(data)) return;
    await expect(decryptData({ secureAttributes, data }, 'pw')).resolves.toBe(
      'Alicia',
    );
  });

  it('keeps the dialog and the answers open, and says so, when the save is refused', async () => {
    const { store, onClose } = await renderEditing(
      makeEncryptedPerson('n1', 'Alice', 'pw'),
      'pw',
    );
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Alicia');
    const before = store.getState().session.network;

    act(() => {
      store.dispatch(setPassphraseInvalid(true));
    });
    await user.click(screen.getByRole('button', { name: 'Finished' }));

    expect(
      await screen.findByText(/Your answers have not been saved/),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Alicia');
    expect(onClose).not.toHaveBeenCalled();
    expect(store.getState().session.network).toBe(before);
  });

  it('does not open, and flags the passphrase, when it cannot decrypt the answer', async () => {
    const { store, onClose } = await renderEditing(
      makeEncryptedPerson('n1', 'Alice', 'pw'),
      'wrong',
    );

    await waitFor(() =>
      expect(store.getState().ui.passphraseInvalid).toBe(true),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('does not open without a passphrase, and asks for one', async () => {
    const { store, onClose } = await renderEditing(
      makeEncryptedPerson('n1', 'Alice', 'pw'),
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('opens without the unreadable answer when its encryption metadata is missing', async () => {
    const encrypted = await makeEncryptedPerson('n1', 'Alice', 'pw');
    await renderEditing(
      {
        [entityPrimaryKeyProperty]: encrypted[entityPrimaryKeyProperty],
        type: encrypted.type,
        [entityAttributesProperty]: encrypted[entityAttributesProperty],
      },
      'pw',
    );

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(40);
  });
});

describe('NodeForm with the encrypted-variables experiment off', () => {
  it('opens on the stored answer and saves the change as plaintext without a passphrase', async () => {
    const { store, onClose } = await renderEditing(
      makePlainPerson('n1', 'Alice'),
      undefined,
      false,
    );
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Alice');
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    await user.clear(name);
    await user.type(name, 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Finished' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const { data, secureAttributes } = storedName(
      store.getState().session.network.nodes[0],
    );
    expect(data).toBe('Alicia');
    expect(secureAttributes).toBeUndefined();
  });
});
