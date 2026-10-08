import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/DndStoreProvider';
import { asEntityAttributeReference } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { interviewToastManager } from '../../../toast/interviewToastManager';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  outOfBoundsHeader,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';
import NameGenerator from '../NameGenerator';

vi.mock('../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));
vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));

// A panel's roster row whose name the codebook marks encrypted.
vi.mock('../../../hooks/useExternalData', () => ({
  default: () => ({
    externalData: [
      {
        [entityPrimaryKeyProperty]: 'roster-row-1',
        type: NODE_TYPE,
        [entityAttributesProperty]: { name: 'Alice' },
      },
    ],
    status: { state: 'ready' },
  }),
}));

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
    label: { en: 'Quick add' },
    subject: { entity: 'node', type: NODE_TYPE },
    quickAdd: asEntityAttributeReference('name'),
    prompts: [{ id: 'prompt-1', text: { en: 'Name people' } }],
  },
];

async function renderNameGenerator({
  nodes = [],
  stages,
  unlocked = false,
  refused = false,
}: {
  nodes?: NcNode[];
  stages?: Stages;
  unlocked?: boolean;
  /** Stores a header no passphrase can open, as a damaged copy might. */
  refused?: boolean;
} = {}) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(nodes, stages, undefined, {
    header: refused ? outOfBoundsHeader(header) : header,
  });
  if (unlocked) await unlockWith(store, 'pw');

  const [stage] = store.getState().protocol.stages;
  if (
    stage?.type !== 'NameGenerator' &&
    stage?.type !== 'NameGeneratorQuickAdd'
  ) {
    throw new Error('The stage is a name generator');
  }

  const onStepChange = vi.fn();
  let moveForward: (() => Promise<void>) | undefined;

  function Navigation({ children }: { children: ReactNode }) {
    const navigation = useInterviewNavigation(0);
    moveForward = navigation.moveForward;
    return (
      <StageMetadataProvider value={navigation.registerBeforeNext}>
        {children}
      </StageMetadataProvider>
    );
  }

  render(
    <Provider store={store}>
      <TestProtocolLocalization>
        <InterviewI18nProvider requestedLocale="en">
          <CurrentStepProvider currentStep={0} onStepChange={onStepChange}>
            <Navigation>
              <DndStoreProvider>
                <NameGenerator
                  stage={stage}
                  getNavigationHelpers={() => ({
                    moveForward: vi.fn(),
                    moveBackward: vi.fn(),
                  })}
                />
              </DndStoreProvider>
            </Navigation>
          </CurrentStepProvider>
        </InterviewI18nProvider>
      </TestProtocolLocalization>
    </Provider>,
  );

  const next = () =>
    act(async () => {
      await moveForward?.();
    });

  return { store, onStepChange, next };
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

/** A name generator asking for at least two people, then another screen. */
const twoPeopleStages: Stages = [
  {
    id: 'stage-1',
    type: 'NameGenerator',
    label: { en: 'Name generator' },
    subject: { entity: 'node', type: NODE_TYPE },
    behaviours: { minNodes: 2 },
    form: {
      title: { en: 'Add a person' },
      fields: [
        {
          variable: asEntityAttributeReference('name'),
          prompt: { en: 'Name' },
        },
        { variable: asEntityAttributeReference('age'), prompt: { en: 'Age' } },
      ],
    },
    prompts: [{ id: 'prompt-1', text: { en: 'Name people' } }],
  },
  {
    id: 'next-screen',
    type: 'Information',
    label: { en: 'Next screen' },
    title: { en: 'Next screen' },
    items: [],
  },
];

/**
 * As `twoPeopleStages`, but the form asks only for an age, so an encrypted
 * name can only arrive with a row from the stage's panel.
 */
const panelEncryptsStages: Stages = [
  {
    id: 'stage-1',
    type: 'NameGenerator',
    label: { en: 'Name generator' },
    subject: { entity: 'node', type: NODE_TYPE },
    behaviours: { minNodes: 2 },
    form: {
      title: { en: 'Add a person' },
      fields: [
        { variable: asEntityAttributeReference('age'), prompt: { en: 'Age' } },
      ],
    },
    panels: [
      { id: 'panel-1', title: { en: 'Roster' }, dataSource: 'roster-asset' },
    ],
    prompts: [{ id: 'prompt-1', text: { en: 'Name people' } }],
  },
  ...twoPeopleStages.slice(1),
];

describe('NameGenerator under an encryption header no passphrase can open', () => {
  it('says why no one can be added, and lets the participant move on short of the minimum', async () => {
    const toast = vi.spyOn(interviewToastManager, 'add');
    const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { store, onStepChange, next } = await renderNameGenerator({
      nodes: [person],
      stages: twoPeopleStages,
      refused: true,
    });

    expect(screen.getByRole('button', { name: 'Add a person' })).toBeDisabled();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    render(
      <InterviewI18nProvider requestedLocale="en">
        {toast.mock.calls.map(([options], index) => (
          <p key={index}>{options.description}</p>
        ))}
      </InterviewI18nProvider>,
    );
    expect(
      screen.getByText(/cannot be shown or saved in this interview/),
    ).toBeInTheDocument();

    await next();

    expect(onStepChange).toHaveBeenCalled();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
    toast.mockRestore();
  });

  // Only the panel's rows are refused, and the panel says why. The form still
  // adds people, so the minimum can still be met and still holds.
  it('keeps the form open and the minimum in force when only the panel would save encrypted answers', async () => {
    const { onStepChange, next } = await renderNameGenerator({
      stages: panelEncryptsStages,
      refused: true,
    });

    expect(
      await screen.findByText(/cannot be shown or saved in this interview/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add a person' })).toBeEnabled();

    await next();

    expect(onStepChange).not.toHaveBeenCalled();
  });

  it('opens a tapped person with their protected answers shown as unavailable', async () => {
    const person = await makeEncryptedPerson('n1', 'Alice', 'pw');
    const { store } = await renderNameGenerator({
      nodes: [person],
      refused: true,
    });

    act(() => {
      tapNode?.(person);
    });

    const name = await screen.findByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('Answer unavailable');
    expect(name).toHaveAttribute('readonly');
    expect(screen.getByRole('spinbutton', { name: 'Age' })).toHaveValue(40);
    expect(
      screen.queryByRole('button', { name: 'Enter a new answer' }),
    ).toBeNull();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});

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
