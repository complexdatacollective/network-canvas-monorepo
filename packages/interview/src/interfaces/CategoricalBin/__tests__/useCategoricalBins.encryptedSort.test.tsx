import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

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
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptedVariables,
  encryptionFor,
  makeEncryptedPerson,
  NODE_TYPE,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { useCategoricalBins } from '../useCategoricalBins';

const variables: Record<string, Variable> = {
  ...encryptedVariables,
  group: {
    name: 'group',
    label: 'group',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [{ label: { en: 'Friends' }, value: 'friends' }],
  },
};

const byName = [
  { property: asEntityAttributeReference('name'), direction: 'asc' as const },
];

const inGroup = (node: NcNode): NcNode => ({
  ...node,
  [entityAttributesProperty]: {
    ...node[entityAttributesProperty],
    group: ['friends'],
  },
});

const ids = (nodes: readonly NcNode[]) =>
  nodes.map((node) => node[entityPrimaryKeyProperty]);

async function unlockedStore(nodes: NcNode[]) {
  const { header } = await encryptionFor('pw');
  const store = createEncryptionStore(
    nodes,
    [
      {
        id: 'categorical-bin',
        type: 'CategoricalBin',
        label: { en: 'Categorise' },
        subject: { entity: 'node', type: NODE_TYPE },
        prompts: [
          {
            id: 'prompt-1',
            text: { en: 'Which group?' },
            variable: asEntityAttributeReference('group'),
            bucketSortOrder: byName,
            binSortOrder: byName,
          },
        ],
      },
    ],
    variables,
    { header },
  );
  await unlockWith(store, 'pw');
  return store;
}

function renderBins(store: Awaited<ReturnType<typeof unlockedStore>>) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProtocolLocalization>
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
      </Provider>
    </TestProtocolLocalization>
  );
  return renderHook(() => useCategoricalBins(), { wrapper });
}

describe('useCategoricalBins with encrypted names', () => {
  it('orders the bins and the drawer by the decrypted names', async () => {
    const nodes = [
      inGroup(await makeEncryptedPerson('carol', 'Carol', 'pw')),
      await makeEncryptedPerson('dave', 'Dave', 'pw'),
      inGroup(await makeEncryptedPerson('alice', 'Alice', 'pw')),
      await makeEncryptedPerson('bob', 'Bob', 'pw'),
    ];
    const store = await unlockedStore(nodes);

    const { result } = renderBins(store);

    await waitFor(() => {
      expect(ids(result.current.bins[0]?.nodes ?? [])).toEqual([
        'alice',
        'carol',
      ]);
      expect(ids(result.current.uncategorisedNodes)).toEqual(['bob', 'dave']);
    });
  });
});
