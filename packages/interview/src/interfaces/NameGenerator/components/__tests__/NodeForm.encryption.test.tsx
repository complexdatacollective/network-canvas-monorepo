import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
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
import { TestProtocolLocalization } from '../../../__tests__/TestProtocolLocalization';
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
import { writesEncryptedValue } from '../../../Anonymisation/utils';
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
  stored = selected ? [selected] : [],
  stages,
  variables = encryptedVariables,
}: {
  /** The person being edited; none for a form adding a new one. */
  selected: NcNode | null;
  unlocked?: boolean;
  /** Everyone in the interview, by default only the person being edited. */
  stored?: NcNode[];
  stages?: Parameters<typeof createEncryptionStore>[1];
  variables?: Record<string, Variable>;
}) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(stored, stages, variables, { header });
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
          // As the name generator decides it.
          useEncryption: writesEncryptedValue(attributes, variables),
          currentStep: 0,
        }),
      ),
    );

  const tree = () => (
    <Provider store={store}>
      <TestProtocolLocalization>
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
      </TestProtocolLocalization>
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

/** A ciphertext written for another person fails to decrypt for this one. */
async function unreadablePerson(): Promise<NcNode> {
  const elsewhere = await makeEncryptedPerson('elsewhere', 'Alice', 'pw');
  return { ...elsewhere, [entityPrimaryKeyProperty]: 'n1' };
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
    await user.click(screen.getByRole('button', { name: 'Done' }));

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

  it('shows an answer its key cannot read as unavailable, asks for no passphrase, and keeps it when the form is finished', async () => {
    const person = await unreadablePerson();
    const { store, onClose, prompts } = await renderNodeForm({
      selected: person,
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Answer unavailable');
    expect(name).toHaveAttribute('readonly');
    expect(name).toHaveAccessibleDescription(/cannot be shown here/);
    const age = screen.getByRole('spinbutton', { name: 'Age' });
    expect(age).toHaveValue(40);
    expect(onClose).not.toHaveBeenCalled();

    await user.clear(age);
    await user.type(age, '41');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [saved] = store.getState().session.network.nodes;
    expect(saved?.[entityAttributesProperty]).toEqual({
      ...person[entityAttributesProperty],
      age: 41,
    });
    expect(saved?.[entitySecureAttributesMeta]).toEqual(
      person[entitySecureAttributesMeta],
    );
    expect(prompts()).toBe(0);
  });

  it('saves a new answer over one its key cannot read', async () => {
    const { store, onClose } = await renderNodeForm({
      selected: await unreadablePerson(),
      unlocked: true,
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Enter a new answer' }),
    );
    const name = screen.getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('');
    await user.type(name, 'Alicia');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await expect(
      storedName(store.getState().session.network.nodes[0]),
    ).resolves.toBe('Alicia');
  });

  it('does not open without a passphrase, and asks for one', async () => {
    const { store, onClose } = await renderNodeForm({
      selected: await makeEncryptedPerson('n1', 'Alice', 'pw'),
    });

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
  });

  it('shows an answer whose encryption metadata is missing as unavailable, and keeps it when the form is finished', async () => {
    const encrypted = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { store, onClose } = await renderNodeForm({
      selected: {
        [entityPrimaryKeyProperty]: encrypted[entityPrimaryKeyProperty],
        type: encrypted.type,
        [entityAttributesProperty]: encrypted[entityAttributesProperty],
      },
      unlocked: true,
    });
    const user = userEvent.setup();

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Answer unavailable');
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(40);

    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty],
    ).toEqual(encrypted[entityAttributesProperty]);
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
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(
      await screen.findByText(/Your answers have not been saved/),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Alicia');
    expect(onClose).not.toHaveBeenCalled();
    expect(store.getState().session.network).toBe(before);
  });
});

// A form asking only for a nickname, which is not encrypted, that must differ
// from the person's name, which is.
const nicknameVariables: Record<string, Variable> = {
  ...encryptedVariables,
  nickname: {
    name: 'nickname',
    label: 'nickname',
    type: 'text',
    component: 'Text',
    validation: { differentFrom: asEntityAttributeReference('name') },
  },
};

const nicknameStages: Parameters<typeof createEncryptionStore>[1] = [
  {
    id: 'stage-1',
    type: 'NameGenerator',
    label: { en: 'Name generator' },
    subject: { entity: 'node', type: NODE_TYPE },
    form: {
      title: { en: 'Add a person' },
      fields: [
        {
          variable: asEntityAttributeReference('nickname'),
          prompt: { en: 'Nickname' },
        },
      ],
    },
    prompts: [{ id: 'prompt-1', text: { en: 'Name people' } }],
  },
];

describe('NodeForm whose answer is checked against a protected one', () => {
  it('takes the passphrase inside the form, then checks and saves the answer', async () => {
    const { store, onClose } = await renderNodeForm({
      selected: await makeEncryptedPerson('n1', 'Alice', 'pw'),
      stages: nicknameStages,
      variables: nicknameVariables,
    });
    const user = userEvent.setup();

    const nickname = await screen.findByRole('textbox', { name: 'Nickname' });
    await user.type(nickname, 'Ali');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(nickname).toHaveAccessibleDescription(
        /Your answers have not been saved/,
      ),
    );

    const form = screen.getByRole('dialog', { name: 'Add a person' });
    await user.click(within(form).getByRole('button', { name: 'Passphrase' }));
    const prompt = await screen.findByRole('dialog', {
      name: 'Passphrase',
    });
    await user.type(
      within(prompt).getByLabelText(/^Passphrase/, { selector: 'input' }),
      'pw',
    );
    await user.click(within(prompt).getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus(),
    );
    expect(
      within(form).queryByRole('button', { name: 'Passphrase' }),
    ).toBeNull();
    expect(nickname).toHaveValue('Ali');

    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(
      store.getState().session.network.nodes[0]?.[entityAttributesProperty]
        .nickname,
    ).toBe('Ali');
  });

  it('asks for no passphrase for a new person, whose own name is not stored', async () => {
    const { store, onClose } = await renderNodeForm({
      selected: null,
      stored: [await makeEncryptedPerson('n1', 'Alice', 'pw')],
      stages: nicknameStages,
      variables: nicknameVariables,
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    const nickname = await screen.findByRole('textbox', { name: 'Nickname' });
    expect(screen.queryByRole('button', { name: 'Passphrase' })).toBeNull();

    await user.type(nickname, 'Alice');
    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(
      store
        .getState()
        .session.network.nodes.map(
          (node) => node[entityAttributesProperty].nickname,
        ),
    ).toEqual([undefined, 'Alice']);
  });
});
