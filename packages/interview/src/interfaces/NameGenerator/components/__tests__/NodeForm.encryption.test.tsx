import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../../contexts/CurrentStepContext';
import { writeSubmissionResult } from '../../../../forms/writeSubmissionResult';
import { InterviewI18nProvider } from '../../../../i18n/InterviewI18nProvider';
import { addNode as addSessionNode } from '../../../../store/modules/session';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from '../../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../../Anonymisation/decryptionScope';
import { decryptValue } from '../../../Anonymisation/encryptionFormat';
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

async function renderNodeForm({
  selected,
  unlocked = false,
}: {
  /** The person being edited; none for a form adding a new one. */
  selected: NcNode | null;
  unlocked?: boolean;
}) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(
    selected ? [selected] : [],
    undefined,
    undefined,
    { header },
  );
  if (unlocked) await unlockWith(store, 'pw');
  const onClose = vi.fn();

  // Every time the passphrase is asked for, not only the latest state.
  let prompts = 0;
  store.subscribe(() => {
    if (store.getState().ui.showPassphrasePrompter) prompts += 1;
  });

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
          useEncryption: true,
          currentStep: 0,
        }),
      ),
    );

  const tree = () => (
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
    </Provider>
  );
  const { rerender } = render(tree());

  return {
    store,
    onClose,
    rerender: () => rerender(tree()),
    prompts: () => prompts,
  };
}

/** The plaintext of a node's stored name, which must be bound to its id. */
async function storedName(node: NcNode | undefined) {
  const stored = node
    ? readEncryptedAttribute(node, 'name', encryptedVariables)
    : undefined;
  if (stored?.status !== 'encrypted') {
    throw new Error('Expected the name to be stored encrypted');
  }
  expect(stored.value.nodeId).toBe(node?.[entityPrimaryKeyProperty]);
  const { key } = await encryptionFor('pw');
  return decryptValue(key, stored.value, stored.value);
}

describe('NodeForm editing a person with an encrypted answer', () => {
  it('opens on the decrypted answer, and saves the change encrypted', async () => {
    const { store, onClose } = await renderNodeForm({
      selected: await makeEncryptedPerson('n1', 'Alice', 'pw'),
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Alice');

    await user.clear(name);
    await user.type(name, 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Finished' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await expect(
      storedName(store.getState().session.network.nodes[0]),
    ).resolves.toBe('Alicia');
  });

  it('keeps an edit in progress through a re-render and an unrelated change to the interview', async () => {
    const { store, rerender } = await renderNodeForm({
      selected: await makeEncryptedPerson('n1', 'Alice', 'pw'),
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Alicia');

    rerender();
    await act(async () => {
      await store.dispatch(
        addSessionNode({
          type: NODE_TYPE,
          attributeData: { age: 30 },
          useEncryption: true,
          currentStep: 0,
        }),
      );
    });
    rerender();

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Alicia');
  });

  it('opens without an answer its key cannot read, asks for no passphrase, and saves a new answer over it', async () => {
    // A ciphertext written for another person fails to decrypt for this one.
    const elsewhere = await makeEncryptedPerson('elsewhere', 'Alice', 'pw');
    const { store, onClose, prompts } = await renderNodeForm({
      selected: { ...elsewhere, [entityPrimaryKeyProperty]: 'n1' },
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(40);
    expect(onClose).not.toHaveBeenCalled();

    await user.type(name, 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Finished' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await expect(
      storedName(store.getState().session.network.nodes[0]),
    ).resolves.toBe('Alicia');
    expect(prompts()).toBe(0);
  });

  it('does not open without a passphrase, and asks for one', async () => {
    const { store, onClose } = await renderNodeForm({
      selected: await makeEncryptedPerson('n1', 'Alice', 'pw'),
    });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('opens without the unreadable answer when its encryption metadata is missing', async () => {
    const encrypted = await makeEncryptedPerson('n1', 'Alice', 'pw');
    await renderNodeForm({
      selected: {
        [entityPrimaryKeyProperty]: encrypted[entityPrimaryKeyProperty],
        type: encrypted.type,
        [entityAttributesProperty]: encrypted[entityAttributesProperty],
      },
      unlocked: true,
    });

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(40);
  });
});

describe('NodeForm adding a person with an encrypted answer', () => {
  it('keeps the dialog and the answers open, and says so, when the save is refused', async () => {
    const { store, onClose } = await renderNodeForm({ selected: null });
    const user = userEvent.setup();
    const before = store.getState().session.network;

    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    const name = await screen.findByRole('textbox', { name: 'Name' });
    await user.type(name, 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Finished' }));

    expect(
      await screen.findByText(/Your answers have not been saved/),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Alicia');
    expect(onClose).not.toHaveBeenCalled();
    expect(store.getState().session.network).toBe(before);
  });
});
