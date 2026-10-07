import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
import NameGenerator from '../NameGenerator';

vi.mock('../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));
vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));

// The list's virtualised rows do not lay out in jsdom; the tap it reports is
// what is under test, so its handler is captured and called directly.
let tapNode: ((node: NcNode) => void) | undefined;
vi.mock('../../../components/NodeList', () => ({
  default: (props: { id?: string; onItemClick?: (node: NcNode) => void }) => {
    if (props.id === 'MAIN_NODE_LIST') tapNode = props.onItemClick;
    return null;
  },
}));

// jsdom has neither observer; the stage's lists and dialogs use them.
class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubObserver);
  vi.stubGlobal('IntersectionObserver', StubObserver);
});

type Stages = Parameters<typeof createEncryptionStore>[1];

const quickAddStages: Stages = [
  {
    id: 'quick-add',
    type: 'NameGeneratorQuickAdd',
    label: 'Quick add',
    subject: { entity: 'node', type: NODE_TYPE },
    quickAdd: asEntityAttributeReference('name'),
    prompts: [{ id: 'prompt-1', text: 'Name people' }],
  },
];

async function renderNameGenerator({
  nodes = [],
  stages,
  unlocked = false,
}: { nodes?: NcNode[]; stages?: Stages; unlocked?: boolean } = {}) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(nodes, stages, undefined, { header });
  if (unlocked) await unlockWith(store, 'pw');

  const [stage] = store.getState().protocol.stages;
  if (
    stage?.type !== 'NameGenerator' &&
    stage?.type !== 'NameGeneratorQuickAdd'
  ) {
    throw new Error('The stage is a name generator');
  }

  render(
    <Provider store={store}>
      <InterviewI18nProvider requestedLocale="en">
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <NameGenerator
            stage={stage}
            getNavigationHelpers={() => ({
              moveForward: vi.fn(),
              moveBackward: vi.fn(),
            })}
          />
        </CurrentStepProvider>
      </InterviewI18nProvider>
    </Provider>,
  );

  return { store };
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

describe('NameGenerator asking for encrypted answers', () => {
  it('takes no new answers, and opens no one for editing, until the passphrase is entered', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { store } = await renderNameGenerator({ nodes: [person] });

    const add = screen.getByRole('button', { name: 'Add a person' });
    expect(add).toBeDisabled();
    expect(store.getState().ui.showPassphrasePrompter).toBe(true);

    expect(tapNode).toBeInstanceOf(Function);
    await act(async () => {
      tapNode?.(person);
      await encryptionFor('pw');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();

    await act(() => unlockWith(store, 'pw'));
    expect(add).toBeEnabled();
  });

  it('opens a tapped person on their decrypted answers once the passphrase works', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
    await renderNameGenerator({ nodes: [person], unlocked: true });

    act(() => {
      tapNode?.(person);
    });

    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue(
      'Alice',
    );
  });

  it('stores a person added through the form with their name encrypted for the id they are given', async () => {
    const { store } = await renderNameGenerator({ unlocked: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Name' }),
      'Bob',
    );
    await user.click(screen.getByRole('button', { name: 'Finished' }));

    await waitFor(() =>
      expect(store.getState().session.network.nodes).toHaveLength(1),
    );
    await expect(
      storedName(store.getState().session.network.nodes[0]),
    ).resolves.toBe('Bob');
  });

  it('stores a quickly added person with their name encrypted for the id they are given', async () => {
    const { store } = await renderNameGenerator({
      stages: quickAddStages,
      unlocked: true,
    });
    const user = userEvent.setup();

    await user.click(screen.getByTestId('quick-add-toggle'));
    const input = await screen.findByTestId('quick-add-input');
    await user.type(input, 'Bob');
    const form = input.closest('form');
    if (!form) throw new Error('Expected the quick-add field in a form');
    fireEvent.submit(form);

    await waitFor(() =>
      expect(store.getState().session.network.nodes).toHaveLength(1),
    );
    await expect(
      storedName(store.getState().session.network.nodes[0]),
    ).resolves.toBe('Bob');
  });
});
