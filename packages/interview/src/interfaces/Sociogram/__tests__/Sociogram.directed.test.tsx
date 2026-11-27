import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { InterviewQueryClientProvider } from '../../../contexts/InterviewQueryClientProvider';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import { createInitialNetwork } from '../../../contract/network';
import type { ProtocolPayload } from '../../../contract/types';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import Sociogram from '../Sociogram';

vi.mock('../../../hooks/useAssetUrl', () => ({
  useAssetUrl: () => ({ url: null, isLoading: false, error: null }),
}));

beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');
const FOLLOWS = testTypeId('follows');
const PERSON_NAME = testVariableId('person-name');
const PLACE_NAME = testVariableId('place-name');
const TRUSTED = testVariableId('trusted');
const LAYOUT = testId('layout');

type Stage = StageProps<'Sociogram'>['stage'];

const stage: Stage = {
  id: testId('sociogram'),
  type: 'Sociogram',
  label: { en: 'Sociogram' },
  subject: { entity: 'node', types: [PERSON, PLACE] },
  layout: LAYOUT,
  background: { concentricCircles: 3 },
  prompts: [
    {
      id: testId('follow'),
      task: 'connect',
      text: { en: 'Who follows whom?' },
      edges: { create: FOLLOWS, display: [FOLLOWS] },
    },
    {
      id: testId('trust'),
      task: 'highlight',
      text: { en: 'Tap the people you trust' },
      highlight: [
        {
          id: testId('entry'),
          type: PERSON,
          variable: asEntityAttributeReference(TRUSTED),
        },
      ],
    },
  ],
};

const rootReducer = combineReducers({ session, protocol, ui });

function renderSociogram({
  promptIndex = 0,
  endpointRules,
}: {
  promptIndex?: number;
  endpointRules?: { sourceType: string; targetType: string }[];
} = {}) {
  const protocolState: ProtocolPayload = {
    id: 'protocol',
    hash: 'hash',
    importedAt: '2026-11-27T00:00:00.000Z',
    assets: [],
    name: 'Test protocol',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    codebook: {
      node: {
        [PERSON]: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            [PERSON_NAME]: { name: 'name', type: 'text' },
            [TRUSTED]: { name: 'trusted', type: 'boolean' },
          },
        },
        [PLACE]: {
          name: 'Place',
          color: 'node-color-seq-2',
          shape: { default: 'square' },
          variables: { [PLACE_NAME]: { name: 'name', type: 'text' } },
        },
      },
      edge: {
        [FOLLOWS]: {
          name: 'Follows',
          color: 'edge-color-seq-1',
          directed: true,
          ...(endpointRules ? { endpointRules } : {}),
        },
      },
      ego: { variables: {} },
      layouts: { [LAYOUT]: { name: 'Map' } },
    },
    stages: [stage] satisfies CurrentProtocol['stages'],
  };
  const placed = (
    id: string,
    type: string,
    name: string,
    x: number,
  ): NcNode => ({
    [entityPrimaryKeyProperty]: id,
    type,
    [entityAttributesProperty]: {
      [type === PERSON ? PERSON_NAME : PLACE_NAME]: name,
      [LAYOUT]: { x, y: 0.5 },
    },
  });
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      session: {
        id: 'session',
        startTime: '2026-11-27T00:00:00.000Z',
        finishTime: null,
        exportTime: null,
        lastUpdated: '2026-11-27T00:00:00.000Z',
        promptIndex,
        network: {
          ...createInitialNetwork(),
          nodes: [
            placed('alex', PERSON, 'Alex', 0.2),
            placed('casey', PERSON, 'Casey', 0.5),
            placed('park', PLACE, 'Park', 0.8),
          ],
        },
      },
      protocol: protocolState,
    },
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  });

  const registerBeforeNext: RegisterBeforeNext = vi.fn();

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <InterviewQueryClientProvider protocolKey="test-protocol">
          <ContractProvider
            onFinish={vi.fn()}
            onRequestAsset={vi.fn()}
            flags={{ isE2E: false, isDevelopment: false }}
          >
            <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
              <StageMetadataContext.Provider value={registerBeforeNext}>
                <DndStoreProvider>
                  <TestProtocolLocalization>
                    {children}
                  </TestProtocolLocalization>
                </DndStoreProvider>
              </StageMetadataContext.Provider>
            </CurrentStepProvider>
          </ContractProvider>
        </InterviewQueryClientProvider>
      </Provider>
    );
  }

  render(
    <Sociogram
      stage={stage}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />,
    { wrapper: Wrapper },
  );

  return {
    edges: () =>
      store
        .getState()
        .session.network.edges.map(({ from, to }) => `${from}>${to}`),
  };
}

const nodeNamed = (name: string) => screen.findByRole('button', { name });

// Taps `first` and then `second`, waiting for `first` to be the pending
// source in between.
async function connect(first: string, second: string) {
  const source = await nodeNamed(first);
  fireEvent.click(source);
  await waitFor(() => expect(source).toHaveAttribute('data-node-linking'));
  fireEvent.click(await nodeNamed(second));
  await waitFor(() => expect(source).not.toHaveAttribute('data-node-linking'));
}

describe('Sociogram with a directed edge type', () => {
  it('second tap in the same order removes the edge', async () => {
    const { edges } = renderSociogram();
    await connect('Alex', 'Casey');
    await waitFor(() => expect(edges()).toEqual(['alex>casey']));

    await connect('Alex', 'Casey');
    await waitFor(() => expect(edges()).toEqual([]));
  });

  it('reverse order adds the opposite edge', async () => {
    const { edges } = renderSociogram();
    await connect('Alex', 'Casey');
    await waitFor(() => expect(edges()).toEqual(['alex>casey']));

    await connect('Casey', 'Alex');
    await waitFor(() => expect(edges()).toEqual(['alex>casey', 'casey>alex']));
  });

  it('a node that cannot be a source is disabled before the first tap', async () => {
    renderSociogram({
      endpointRules: [{ sourceType: PERSON, targetType: PLACE }],
    });
    expect(await nodeNamed('Park')).toBeDisabled();
    expect(await nodeNamed('Alex')).toBeEnabled();
  });

  it('an invalid target is disabled after the first tap', async () => {
    const { edges } = renderSociogram({
      endpointRules: [{ sourceType: PERSON, targetType: PLACE }],
    });
    const alex = await nodeNamed('Alex');
    fireEvent.click(alex);
    await waitFor(() => expect(alex).toHaveAttribute('data-node-linking'));

    expect(await nodeNamed('Casey')).toBeDisabled();
    expect(await nodeNamed('Park')).toBeEnabled();
    fireEvent.click(await nodeNamed('Park'));
    await waitFor(() => expect(edges()).toEqual(['alex>park']));
  });

  it('a node of a type with no highlight entry is disabled in a highlight task', async () => {
    renderSociogram({ promptIndex: 1 });
    expect(await nodeNamed('Park')).toBeDisabled();
    expect(await nodeNamed('Alex')).toBeEnabled();
  });
});
