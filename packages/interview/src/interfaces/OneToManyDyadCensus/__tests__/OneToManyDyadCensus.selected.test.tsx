import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestInterviewAssets } from '../../__tests__/TestInterviewAssets';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import OneToManyDyadCensus from '../OneToManyDyadCensus';

// The real list draws its items through a virtualised collection that lays
// out nothing under jsdom, so this draws each listed person directly.
vi.mock('../../../components/NodeList', () => ({
  default: ({
    items,
    renderItem,
  }: {
    items: NcNode[];
    renderItem: (node: NcNode, itemProps: ItemProps) => ReactNode;
  }) => (
    <div data-testid="targets">
      {items.map((item) => (
        <div key={item._uid}>{renderItem(item, { ref: () => undefined })}</div>
      ))}
    </div>
  ),
}));

const NODE_TYPE = testTypeId('person');
const EDGE_TYPE = testTypeId('friendship');
const NAME_VAR = testVariableId('name');

const stage = {
  id: testId('otm1'),
  type: 'OneToManyDyadCensus',
  label: { en: 'One to Many' },
  subject: { entity: 'node', type: NODE_TYPE },
  behaviours: { removeAfterConsideration: false },
  prompts: [
    { id: testId('p1'), text: { en: 'Prompt one' }, createEdge: EDGE_TYPE },
  ],
};

const codebookWith = (directed: boolean) => ({
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { [NAME_VAR]: { name: 'name', type: 'text' } },
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Friendship',
      color: 'edge-color-seq-1',
      variables: {},
      ...(directed ? { directed: true } : {}),
    },
  },
  ego: { variables: {} },
});

const nodes = ['Alice', 'Bob'].map((name, index) => ({
  [entityPrimaryKeyProperty]: `n${index + 1}`,
  type: NODE_TYPE,
  [entityAttributesProperty]: { [NAME_VAR]: name },
}));

const edge = (from: string, to: string): NcEdge => ({
  [entityPrimaryKeyProperty]: `${from}-${to}`,
  type: EDGE_TYPE,
  from,
  to,
  [entityAttributesProperty]: {},
});

function renderInterface(edges: NcEdge[], directed: boolean) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: { nodes, edges, ego: { [entityAttributesProperty]: {} } },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook: codebookWith(directed),
        stages: [stage],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  const { container } = render(
    <TestProtocolLocalization>
      <Provider store={store}>
        <TestInterviewAssets>
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            <StageMetadataContext.Provider value={() => undefined}>
              <OneToManyDyadCensus
                stage={stage as StageProps<'OneToManyDyadCensus'>['stage']}
                getNavigationHelpers={() => ({
                  moveForward: vi.fn(),
                  moveBackward: vi.fn(),
                })}
              />
            </StageMetadataContext.Provider>
          </CurrentStepProvider>
        </TestInterviewAssets>
      </Provider>
    </TestProtocolLocalization>,
  );

  // Alice is the first focal person; Bob is listed beneath her.
  return () =>
    container
      .querySelector('[data-testid="targets"] [aria-label="Bob"]')
      ?.getAttribute('aria-pressed') ?? null;
}

describe('OneToManyDyadCensus selected state', () => {
  it('selected state reads the edge from focal to listed node', async () => {
    const forward = renderInterface([edge('n1', 'n2')], true);
    await waitFor(() => expect(forward()).toBe('true'));
  });

  it('a directed edge from the listed node to the focal node does not select it', async () => {
    const reverse = renderInterface([edge('n2', 'n1')], true);
    await waitFor(() => expect(reverse()).toBe('false'));
  });

  it('an undirected edge selects the listed node in either order', async () => {
    const reverse = renderInterface([edge('n2', 'n1')], false);
    await waitFor(() => expect(reverse()).toBe('true'));
  });
});
