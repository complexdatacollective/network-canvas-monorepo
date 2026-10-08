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
  entitySecureAttributesMeta,
  type NcNode,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { setPassphrase } from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { createEncryptionStore } from '../../Anonymisation/__tests__/encryptionFixtures';
import { isNumberArray } from '../../Anonymisation/decryptionScope';
import { decryptData } from '../../Anonymisation/utils';

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

function makeStore(encryptionEnabled = true) {
  const store = createEncryptionStore([], [stage], variables, {
    encryptionEnabled,
  });
  if (encryptionEnabled) store.dispatch(setPassphrase(PASSPHRASE));
  return store;
}

function renderStage(store: ReturnType<typeof makeStore>) {
  mainListDrops.length = 0;
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
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
  it('stores a dropped external value as ciphertext with its metadata', async () => {
    const store = makeStore();
    const drop = renderStage(store);

    const externalNode: NcNode = {
      [entityPrimaryKeyProperty]: 'roster-row-1',
      type: NODE_TYPE,
      [entityAttributesProperty]: { [NAME_VAR]: 'Alice' },
    };
    act(() => {
      drop(externalNode);
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
    const [node] = store.getState().session.network.nodes;
    const value = node?.[entityAttributesProperty][NAME_VAR];
    const secure = node?.[entitySecureAttributesMeta]?.[NAME_VAR];
    if (!isNumberArray(value)) throw new Error('Expected a stored ciphertext');
    if (!secure) throw new Error('Expected secure-attribute metadata');
    expect(
      await decryptData({ secureAttributes: secure, data: value }, PASSPHRASE),
    ).toBe('Alice');
  });
});

describe('NameGenerator panel data while the encryptedVariables experiment is off', () => {
  it('stores a dropped external value as plaintext without a passphrase', async () => {
    const store = makeStore(false);
    const drop = renderStage(store);

    act(() => {
      drop({
        [entityPrimaryKeyProperty]: 'roster-row-1',
        type: NODE_TYPE,
        [entityAttributesProperty]: { [NAME_VAR]: 'Alice' },
      });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
    const [node] = store.getState().session.network.nodes;
    expect(node?.[entityAttributesProperty][NAME_VAR]).toBe('Alice');
    expect(node?.[entitySecureAttributesMeta]).toBeUndefined();
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});
