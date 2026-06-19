import { configureStore } from '@reduxjs/toolkit';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';
import { CurrentStepProvider } from '~/contexts/CurrentStepContext';
import protocol from '~/store/modules/protocol';
import session from '~/store/modules/session';
import ui from '~/store/modules/ui';

import { useCategoricalBins } from '../useCategoricalBins';

const NODE_TYPE = 'person';
const CAT_VAR = 'cat';
const NAME_VAR = 'name';
const AGE_VAR = 'age';

const makeNode = (
  id: string,
  attributes: Record<string, string | number | null>,
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: NODE_TYPE,
  [entityAttributesProperty]: attributes,
});

// Two binned nodes share bin 'a'; their bucket order (name asc) is the reverse
// of their bin order (age desc). One uncategorised node lands in the drawer.
const nodes: NcNode[] = [
  makeNode('alice', { [CAT_VAR]: 'a', [NAME_VAR]: 'alice', [AGE_VAR]: 30 }),
  makeNode('bob', { [CAT_VAR]: 'a', [NAME_VAR]: 'bob', [AGE_VAR]: 50 }),
  makeNode('carol', { [CAT_VAR]: null, [NAME_VAR]: 'carol', [AGE_VAR]: 40 }),
  makeNode('dave', { [CAT_VAR]: null, [NAME_VAR]: 'dave', [AGE_VAR]: 20 }),
];

function makeWrapper() {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: { nodes, edges: [], ego: { [entityAttributesProperty]: {} } },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook: {
          node: {
            [NODE_TYPE]: {
              name: NODE_TYPE,
              variables: {
                [CAT_VAR]: {
                  name: CAT_VAR,
                  type: 'categorical',
                  options: [
                    { label: 'A', value: 'a' },
                    { label: 'B', value: 'b' },
                  ],
                },
                [NAME_VAR]: { name: NAME_VAR, type: 'text' },
                [AGE_VAR]: { name: AGE_VAR, type: 'number' },
              },
            },
          },
        },
        stages: [
          {
            id: 'stage1',
            type: 'CategoricalBin',
            subject: { entity: 'node', type: NODE_TYPE },
            prompts: [
              {
                id: 'prompt1',
                text: 'sort me',
                variable: CAT_VAR,
                bucketSortOrder: [{ property: NAME_VAR, direction: 'asc' }],
                binSortOrder: [{ property: AGE_VAR, direction: 'desc' }],
              },
            ],
          },
        ],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
          {children}
        </CurrentStepProvider>
      </Provider>
    );
  };
}

describe('useCategoricalBins sort order', () => {
  it('orders within-bin nodes by binSortOrder, not bucketSortOrder', () => {
    const { result } = renderHook(() => useCategoricalBins(), {
      wrapper: makeWrapper(),
    });

    const binA = result.current.bins.find((bin) => bin.value === 'a');
    expect(binA).toBeDefined();
    // age desc => bob (50) before alice (30); bucketSortOrder (name asc) would
    // have produced [alice, bob].
    expect(binA!.nodes.map((n) => n[entityPrimaryKeyProperty])).toEqual([
      'bob',
      'alice',
    ]);
  });

  it('orders the uncategorised drawer by bucketSortOrder', () => {
    const { result } = renderHook(() => useCategoricalBins(), {
      wrapper: makeWrapper(),
    });

    // name asc => carol before dave.
    expect(
      result.current.uncategorisedNodes.map((n) => n[entityPrimaryKeyProperty]),
    ).toEqual(['carol', 'dave']);
  });
});
