import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';
import { asEntityAttributeReference } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { testId, testTypeId, testVariableId } from '../../../__tests__/testIds';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { InterviewQueryClientProvider } from '../../../contexts/InterviewQueryClientProvider';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import protocol from '../../../store/modules/protocol';
import session, { updatePrompt } from '../../../store/modules/session';
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
const KNOWS = testTypeId('knows');
const NAME = testVariableId('name');
const TRUSTED = testVariableId('trusted');
const LAYOUT = testId('layout');

type Task = 'layout' | 'highlight' | 'connect';

const stage: StageProps<'Sociogram'>['stage'] = {
  id: testId('sociogram'),
  type: 'Sociogram',
  label: { en: 'Sociogram' },
  subject: { entity: 'node', types: [PERSON] },
  layout: LAYOUT,
  background: { concentricCircles: 3 },
  prompts: [
    { id: testId('place'), task: 'layout', text: { en: 'Place people' } },
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
    {
      id: testId('link'),
      task: 'connect',
      text: { en: 'Link people who know each other' },
      edges: { create: KNOWS },
    },
  ],
};

const promptIndexOf: Record<Task, number> = {
  layout: 0,
  highlight: 1,
  connect: 2,
};

const codebook = {
  node: {
    [PERSON]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: {
        [NAME]: { name: 'name', type: 'text' as const },
        [TRUSTED]: { name: 'trusted', type: 'boolean' as const },
      },
    },
  },
  edge: {
    [KNOWS]: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
  },
  layouts: { [LAYOUT]: { name: 'Map' } },
  ego: { variables: {} },
};

const node = (id: string, attributes: Record<string, unknown>) => ({
  [entityPrimaryKeyProperty]: id,
  type: PERSON,
  [entityAttributesProperty]: attributes,
});

function CaptureDndStore({
  onStore,
}: {
  onStore: (store: StoreApi<DndStore>) => void;
}) {
  const store = useDndStoreApi();
  useEffect(() => onStore(store), [onStore, store]);
  return null;
}

function renderSociogram(task: Task) {
  let dndStore: StoreApi<DndStore> | null = null;
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: promptIndexOf[task],
        network: {
          nodes: [
            node('alex', {
              [NAME]: 'Alex',
              [TRUSTED]: true,
              [LAYOUT]: { x: 0.3, y: 0.3 },
            }),
            node('blair', { [NAME]: 'Blair' }),
            node('casey', { [NAME]: 'Casey', [LAYOUT]: { x: 0.7, y: 0.7 } }),
          ],
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 9,
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook,
        stages: [stage],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
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
                  <CaptureDndStore
                    onStore={(captured) => {
                      dndStore = captured;
                    }}
                  />
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
    goToTask: (next: Task) =>
      act(() => {
        store.dispatch(updatePrompt(promptIndexOf[next]));
      }),
    edgeCount: () => store.getState().session.network.edges.length,
    canvasAcceptsDrops: () =>
      [...(dndStore?.getState().dropTargets.values() ?? [])].some((target) =>
        target.accepts.includes('UNPOSITIONED_NODE'),
      ),
  };
}

const placedNode = () => screen.findByRole('button', { name: 'Alex' });
const unplacedNode = () => screen.findByRole('button', { name: 'Blair' });

describe('Sociogram tasks', () => {
  it('nodes cannot be dragged in a highlight task', async () => {
    renderSociogram('highlight');
    const alex = await placedNode();
    expect(alex.style.left).toBe('30%');

    fireEvent.keyDown(alex, { key: 'ArrowRight' });
    fireEvent.pointerDown(alex, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(alex, { clientX: 80, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(alex, { clientX: 80, clientY: 80, pointerId: 1 });

    expect(alex.style.left).toBe('30%');
    expect(alex.style.cursor).not.toBe('grab');
  });

  it('nodes can be moved in a layout task', async () => {
    renderSociogram('layout');
    const alex = await placedNode();
    expect(alex.style.left).toBe('30%');

    fireEvent.keyDown(alex, { key: 'ArrowRight' });

    await waitFor(() => expect(alex.style.left).not.toBe('30%'));
  });

  it('the canvas refuses a drop in a connect task', async () => {
    const { canvasAcceptsDrops } = renderSociogram('connect');
    await placedNode();
    expect(canvasAcceptsDrops()).toBe(false);
  });

  it('the canvas takes a drop in a layout task', async () => {
    const { canvasAcceptsDrops } = renderSociogram('layout');
    await placedNode();
    await waitFor(() => expect(canvasAcceptsDrops()).toBe(true));
  });

  it('an unplaced node is disabled in a connect task and enabled in a layout task', async () => {
    renderSociogram('connect');
    expect(await unplacedNode()).toBeDisabled();
    expect(await placedNode()).toBeEnabled();
  });

  it('an unplaced node is enabled in a layout task', async () => {
    renderSociogram('layout');
    expect(await unplacedNode()).toBeEnabled();
  });

  it('an unplaced node is disabled in a highlight task', async () => {
    renderSociogram('highlight');
    expect(await unplacedNode()).toBeDisabled();
    expect(await placedNode()).toBeEnabled();
  });

  it('a source chosen in a connect task is dropped when the prompt changes', async () => {
    const { goToTask, edgeCount } = renderSociogram('connect');
    const alex = await placedNode();
    fireEvent.click(alex);
    await waitFor(() => expect(alex).toHaveAttribute('data-node-linking'));

    goToTask('highlight');
    expect(await placedNode()).not.toHaveAttribute('data-node-linking');

    goToTask('connect');
    const casey = await screen.findByRole('button', { name: 'Casey' });
    expect(await placedNode()).not.toHaveAttribute('data-node-linking');
    fireEvent.click(casey);

    await waitFor(() => expect(casey).toHaveAttribute('data-node-linking'));
    expect(edgeCount()).toBe(0);
  });

  it('a highlight is drawn only during a highlight task', async () => {
    const tasks: Task[] = ['layout', 'highlight', 'connect'];
    const drawn: boolean[] = [];
    for (const task of tasks) {
      renderSociogram(task);
      const alex = await placedNode();
      drawn.push(alex.hasAttribute('data-node-highlighted'));
      cleanup();
    }
    expect(drawn).toEqual([false, true, false]);
  });
});
