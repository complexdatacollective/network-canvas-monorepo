import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { type DndStore, DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { useDndStoreApi } from '@codaco/fresco-ui/dnd/DndStoreProvider';
import {
  asEntityAttributeReference,
  type Codebook,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import BinSelectAnnouncer from '../../../components/BinSelectAnnouncer';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../../contract/types';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import protocol from '../../../store/modules/protocol';
import session, {
  type SessionState,
  updateNode,
} from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import OrdinalBin from '../OrdinalBin';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

vi.mock('../../../analytics/useTrack', () => ({
  useTrack: () => track,
  useCaptureException: () => vi.fn(),
}));

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has no IntersectionObserver; drag mode's drop targets need one.
class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    setTimeout(() => {
      const bounds = target.getBoundingClientRect();
      this.callback(
        [
          {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: bounds,
            intersectionRect: bounds,
            rootBounds: null,
            time: 0,
          },
        ],
        this,
      );
    }, 0);
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  // jsdom has no matchMedia; the bins ask whether the screen is portrait.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  vi.stubGlobal('scrollTo', vi.fn());
});

beforeEach(() => {
  track.mockClear();
});

const NODE_TYPE = 'person';
const STAGE_ID = 'ordinal-bin-stage';
const PROMPT_ID = 'prompt-1';

const person = (id: string, name: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: NODE_TYPE,
  [entityAttributesProperty]: { name },
});

const codebook: Codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        name: { name: 'name', label: 'Name', type: 'text', component: 'Text' },
        closeness: {
          name: 'Closeness',
          label: 'Closeness',
          type: 'ordinal',
          component: 'LikertScale',
          options: [
            { label: { en: 'Distant' }, value: 1 },
            { label: { en: 'Close' }, value: 2 },
          ],
        },
      },
    },
  },
  edge: {},
  ego: { variables: {} },
};

type Mode = 'drag' | 'select';

const buildStage = (
  mode: Mode,
  { sortByName = false }: { sortByName?: boolean } = {},
): StageProps<'OrdinalBin'>['stage'] => ({
  id: STAGE_ID,
  type: 'OrdinalBin',
  label: { en: 'Rate people' },
  subject: { entity: 'node', type: NODE_TYPE },
  ...(mode === 'select' && { behaviours: { interactionMode: 'select' } }),
  prompts: [
    {
      id: PROMPT_ID,
      text: { en: 'How close?' },
      variable: asEntityAttributeReference('closeness'),
      color: 'ord-color-seq-1',
      ...(sortByName && {
        bucketSortOrder: [
          { property: asEntityAttributeReference('name'), direction: 'asc' },
        ],
      }),
    },
  ],
});

const defaultNodes = () => [
  person('a', 'Ann'),
  person('b', 'Ben'),
  person('c', 'Cal'),
];

const buildSession = (nodes: NcNode[] = defaultNodes()): SessionState => ({
  id: 'session',
  startTime: '2024-01-01T00:00:00.000Z',
  finishTime: null,
  exportTime: null,
  lastUpdated: '2024-01-01T00:00:00.000Z',
  network: {
    ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
    nodes,
    edges: [],
  },
});

const buildProtocol = (
  mode: Mode,
  options?: { sortByName?: boolean },
): ProtocolPayload => ({
  id: 'protocol',
  hash: 'hash',
  importedAt: '2024-01-01T00:00:00.000Z',
  assets: [],
  name: 'Test protocol',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook,
  stages: [buildStage(mode, options)],
});

function CaptureDndStore({
  onStore,
}: {
  onStore: (store: StoreApi<DndStore>) => void;
}) {
  const store = useDndStoreApi();
  useEffect(() => {
    onStore(store);
  }, [store, onStore]);
  return null;
}

function renderStage(
  mode: Mode,
  nodes?: NcNode[],
  options?: { sortByName?: boolean },
) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: buildSession(nodes),
      protocol: buildProtocol(mode, options),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  let dndStore: StoreApi<DndStore> | null = null;

  const view = render(
    <InterviewI18nProvider requestedLocale="en">
      <TestProtocolLocalization>
        <Provider store={store}>
          <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
            <DialogProvider>
              <DndStoreProvider>
                <CaptureDndStore
                  onStore={(s) => {
                    dndStore = s;
                  }}
                />
                <OrdinalBin
                  stage={buildStage(mode, options)}
                  getNavigationHelpers={() => ({
                    moveForward: () => {},
                    moveBackward: () => {},
                  })}
                />
              </DndStoreProvider>
            </DialogProvider>
          </CurrentStepProvider>
        </Provider>
      </TestProtocolLocalization>
    </InterviewI18nProvider>,
  );

  const attributesOf = (id: string) =>
    store
      .getState()
      .session.network?.nodes.find(
        (node: NcNode) => node[entityPrimaryKeyProperty] === id,
      )?.[entityAttributesProperty];

  return { store, view, getDndStore: () => dndStore!, attributesOf };
}

const startDragOf = (getDndStore: () => StoreApi<DndStore>, node: NcNode) =>
  act(() => {
    getDndStore().getState().startDrag(
      {
        id: node[entityPrimaryKeyProperty],
        type: 'NODE',
        metadata: node,
        _sourceZone: null,
      },
      { x: 0, y: 0, width: 10, height: 10 },
    );
  });

const binListZone = (index: number) =>
  `ORDBIN_NODE_LIST_${STAGE_ID}_${PROMPT_ID}_${index}-container`;

const announcement = (name: string) =>
  screen.findAllByText(`Choose where ${name} belongs.`);

describe('OrdinalBin in select mode (#1652)', () => {
  it('places the focal person in the tapped bin and moves on to the next', async () => {
    const { attributesOf } = renderStage('select');

    await announcement('Ann');
    // The person being placed is shown once, selected in the drawer.
    expect(screen.getAllByText('Ann')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Ann' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Place Ann in Close' }));

    await waitFor(() => expect(attributesOf('a')?.closeness).toBe(2));
    await announcement('Ben');
    expect(screen.getByRole('button', { name: 'Ben' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(track).toHaveBeenCalledWith('node_binned', {
      node_id: 'a',
      node_type_index: 0,
      bin_index: 1,
      interaction_mode: 'select',
    });
  });

  it('writes what dropping the same person on the same bin writes', async () => {
    const selected = renderStage('select');
    await announcement('Ann');
    fireEvent.click(screen.getByRole('button', { name: 'Place Ann in Close' }));
    await waitFor(() => expect(selected.attributesOf('a')?.closeness).toBe(2));
    const selectedNodes = selected.store.getState().session.network?.nodes;
    selected.view.unmount();

    const dragged = renderStage('drag');
    startDragOf(dragged.getDndStore, person('a', 'Ann'));
    await waitFor(() =>
      expect(
        dragged.getDndStore().getState().getDropTargetState(binListZone(1))
          ?.canDrop,
      ).toBe(true),
    );
    act(() => {
      dragged.getDndStore().getState().setActiveDropTarget(binListZone(1));
      dragged.getDndStore().getState().endDrag();
    });
    await waitFor(() => expect(dragged.attributesOf('a')?.closeness).toBe(2));

    expect(dragged.store.getState().session.network?.nodes).toEqual(
      selectedNodes,
    );
  });

  it.each([
    ['drag', true],
    ['select', false],
  ] as const)(
    'in %s mode, drag sources and drop targets exist: %s',
    async (mode, present) => {
      const { getDndStore } = renderStage(mode);
      await screen.findByText('Close');

      expect(document.querySelector('[aria-grabbed]') !== null).toBe(present);

      startDragOf(getDndStore, person('a', 'Ann'));
      const canDrop = () =>
        [0, 1].map(
          (index) =>
            getDndStore().getState().getDropTargetState(binListZone(index))
              ?.canDrop ?? false,
        );
      if (present) {
        await waitFor(() => expect(canDrop()).toContain(true));
      } else {
        expect(canDrop()).toEqual([false, false]);
      }
    },
  );

  it('lets a placed person be chosen again and moved to another bin', async () => {
    const { attributesOf } = renderStage('select');

    await announcement('Ann');
    fireEvent.click(screen.getByRole('button', { name: 'Place Ann in Close' }));
    await announcement('Ben');

    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }));
    await announcement('Ann');
    // The bin's list has no selection of its own, so it says who is chosen.
    expect(screen.getByRole('option', { name: 'Ann' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Place Ann in Distant' }),
    );
    await waitFor(() => expect(attributesOf('a')?.closeness).toBe(1));
    expect(track).toHaveBeenCalledWith('node_rebinned', {
      node_id: 'a',
      node_type_index: 0,
      from_bin_index: 1,
      to_bin_index: 0,
      interaction_mode: 'select',
    });
    await announcement('Ben');
  });

  it('records moving someone placed before the stage was left as a move', async () => {
    const placedBefore: NcNode = {
      ...person('a', 'Ann'),
      [entityAttributesProperty]: { name: 'Ann', closeness: 2 },
    };
    const { attributesOf } = renderStage('select', [
      placedBefore,
      person('b', 'Ben'),
    ]);

    await announcement('Ben');
    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }));
    await announcement('Ann');
    fireEvent.click(
      screen.getByRole('button', { name: 'Place Ann in Distant' }),
    );

    await waitFor(() => expect(attributesOf('a')?.closeness).toBe(1));
    expect(track).toHaveBeenCalledWith('node_rebinned', {
      node_id: 'a',
      node_type_index: 0,
      from_bin_index: 1,
      to_bin_index: 0,
      interaction_mode: 'select',
    });
    expect(track).not.toHaveBeenCalledWith(
      'node_binned',
      expect.objectContaining({ node_id: 'a' }),
    );
  });

  it('keeps the person being placed when the drawer re-sorts', async () => {
    const { store } = renderStage('select', undefined, { sortByName: true });
    await announcement('Ann');

    // Renaming Cal sorts him first in the drawer, as an encrypted sort rule
    // does when the passphrase is entered. Ann is still the one being placed.
    await act(() =>
      store.dispatch(
        updateNode({
          nodeId: 'c',
          attributePatch: { set: { name: 'Abe' }, unset: [] },
          currentStep: 0,
        }),
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Place Ann in Close' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Place Ann in Close' }));
    await announcement('Ben');
  });

  it('shows that everyone is placed once nobody is left', async () => {
    renderStage('select');

    for (const name of ['Ann', 'Ben', 'Cal']) {
      await announcement(name);
      fireEvent.click(
        screen.getByRole('button', { name: `Place ${name} in Distant` }),
      );
    }

    expect(
      await screen.findAllByText('Nothing left to place.'),
    ).not.toHaveLength(0);
  });

  it('announces the same person again on the next prompt', async () => {
    const store = configureStore({
      reducer: { session, protocol, ui },
      preloadedState: {
        session: buildSession(),
        protocol: buildProtocol('select'),
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });
    const focal = person('a', 'Ann');
    const focus = (promptId: string) => (
      <InterviewI18nProvider requestedLocale="en">
        <TestProtocolLocalization>
          <Provider store={store}>
            <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
              <BinSelectAnnouncer node={focal} promptId={promptId} />
            </CurrentStepProvider>
          </Provider>
        </TestProtocolLocalization>
      </InterviewI18nProvider>
    );

    // The hint under the node says the same; the live region's copy is the
    // one inside the status element.
    const spoken = async () =>
      (await announcement('Ann')).find((element) =>
        element.closest('[role="status"]'),
      );

    const { rerender } = render(focus('first'));
    const first = await spoken();
    rerender(focus('second'));
    const second = await spoken();

    // A new node in the live region is what makes screen readers speak.
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(first?.isConnected).toBe(false);
  });
});
