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

import { testId, testVariableId } from '../../../__tests__/testIds';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import {
  createEncryptionStore,
  encryptedVariables,
  makeEncryptedPerson,
  NAME_VARIABLE,
  NODE_TYPE,
  unlockWith,
} from '../../Anonymisation/__tests__/encryptionFixtures';
import { useCategoricalBins } from '../useCategoricalBins';

const GROUP_VARIABLE = testVariableId('group');

const variables: Record<string, Variable> = {
  ...encryptedVariables,
  [GROUP_VARIABLE]: {
    name: 'group',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [
      {
        id: testId('useCategoricalBins option 1'),
        label: { en: 'Friends' },
        value: 'friends',
      },
    ],
  },
};

const byName = [
  {
    id: testId('sort-name'),
    property: asEntityAttributeReference(NAME_VARIABLE),
    direction: 'asc' as const,
  },
];

const inGroup = (node: NcNode): NcNode => ({
  ...node,
  [entityAttributesProperty]: {
    ...node[entityAttributesProperty],
    [GROUP_VARIABLE]: ['friends'],
  },
});

const ids = (nodes: readonly NcNode[]) =>
  nodes.map((node) => node[entityPrimaryKeyProperty]);

async function unlockedStore(nodes: NcNode[]) {
  const store = createEncryptionStore(
    nodes,
    [
      {
        id: testId('categorical-bin'),
        type: 'CategoricalBin',
        label: { en: 'Categorise' },
        subject: { entity: 'node', types: [NODE_TYPE] },
        prompts: [
          {
            id: testId('prompt-1'),
            text: { en: 'Which group?' },
            variable: asEntityAttributeReference(GROUP_VARIABLE),
            bucketSortOrder: byName,
            binSortOrder: byName,
          },
        ],
      },
    ],
    variables,
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
