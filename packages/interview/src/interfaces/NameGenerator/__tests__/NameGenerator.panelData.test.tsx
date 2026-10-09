import { act, render, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  type Variable,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptionFor,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { readEncryptedAttribute } from '../../Anonymisation/decryptionScope';
import { decryptValue } from '../../Anonymisation/encryptionFormat';

// The main list's drop handler is the subject; everything else the stage
// renders is stubbed.
const mainListDrops: ((metadata?: Record<string, unknown>) => void)[] = [];

vi.mock('../../../components/NodeList', () => ({
  default: (props: {
    id?: string;
    onDrop?: (metadata?: Record<string, unknown>) => void;
  }) => {
    if (props.id === 'MAIN_NODE_LIST' && props.onDrop) {
      mainListDrops.push(props.onDrop);
    }
    return null;
  },
}));
vi.mock('../../../components/NodeBin', () => ({ default: () => null }));
vi.mock('../../../components/Prompts', () => ({ default: () => null }));
vi.mock('../components/NodePanels', () => ({ default: () => null }));
vi.mock('../components/NodeForm', () => ({ default: () => null }));
vi.mock('../components/QuickNodeForm', () => ({ default: () => null }));
vi.mock('../../../hooks/usePortalTarget', () => ({ default: () => null }));
vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));

const { default: NameGenerator } = await import('../NameGenerator');

const NODE_TYPE = 'person';
const NAME_VAR = 'var-name';
const NICKNAME_VAR = 'var-nickname';
const PASSPHRASE = 'name generator passphrase';

const variables: Record<string, Variable> = {
  [NAME_VAR]: {
    name: 'name',
    label: 'name',
    type: 'text',
    component: 'Text',
    encrypted: true,
  },
  [NICKNAME_VAR]: {
    name: 'nickname',
    label: 'nickname',
    type: 'text',
    component: 'Text',
  },
};

// The stage's own form asks only for a value that is not encrypted, so the
// encrypted name can only arrive through the panel's external data.
const stage: StageProps<'NameGenerator'>['stage'] = {
  id: 'ng1',
  type: 'NameGenerator',
  externalDataError: { en: 'External data could not be loaded.' },
  label: { en: 'Name Generator' },
  subject: { entity: 'node', type: NODE_TYPE },
  form: {
    title: { en: 'Add a person' },
    fields: [
      {
        variable: asEntityAttributeReference(NICKNAME_VAR),
        prompt: { en: 'Nickname' },
      },
    ],
  },
  panels: [
    { id: 'panel-1', title: { en: 'Roster' }, dataSource: 'roster-asset' },
  ],
  prompts: [{ id: 'p1', text: { en: 'Name the people you know' } }],
};

const externalNode: NcNode = {
  [entityPrimaryKeyProperty]: 'roster-row-1',
  type: NODE_TYPE,
  [entityAttributesProperty]: { [NAME_VAR]: 'Alice' },
};

async function makeStore({ unlocked }: { unlocked: boolean }) {
  const { header } = await encryptionFor(PASSPHRASE);
  const store = createEncryptionStore([], [stage], variables, { header });
  if (unlocked) await unlockWith(store, PASSPHRASE);
  return store;
}

function renderStage(store: Awaited<ReturnType<typeof makeStore>>) {
  mainListDrops.length = 0;
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <TestProtocolLocalization>
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            {children}
          </CurrentStepProvider>
        </TestProtocolLocalization>
      </Provider>
    );
  }
  render(
    <NameGenerator
      stage={stage}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />,
    { wrapper: Wrapper },
  );
  const drop = mainListDrops.at(-1);
  if (!drop) throw new Error('Expected the main list to accept drops');
  return drop;
}

describe('NameGenerator with an encrypted variable in panel data', () => {
  it('stores a dropped external value as ciphertext bound to the id the person keeps', async () => {
    const store = await makeStore({ unlocked: true });
    const drop = renderStage(store);

    act(() => {
      drop(externalNode);
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
    const [node] = store.getState().session.network.nodes;
    expect(node?.[entityPrimaryKeyProperty]).toBe('roster-row-1');
    const stored = node
      ? readEncryptedAttribute(node, NAME_VAR, variables)
      : undefined;
    if (stored?.status !== 'encrypted') {
      throw new Error('Expected the name to be stored encrypted');
    }
    expect(stored.value.nodeId).toBe('roster-row-1');
    const { key } = await encryptionFor(PASSPHRASE);
    await expect(decryptValue(key, stored.value, stored.value)).resolves.toBe(
      'Alice',
    );
  });

  it('asks for the passphrase instead of storing a dropped encrypted value it could not save', async () => {
    const store = await makeStore({ unlocked: false });
    const drop = renderStage(store);
    const before = store.getState().session.network;
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);

    await act(async () => {
      drop(externalNode);
      await encryptionFor(PASSPHRASE);
    });

    expect(store.getState().ui.showPassphrasePrompter).toBe(true);
    expect(store.getState().session.network).toBe(before);
  });
});
