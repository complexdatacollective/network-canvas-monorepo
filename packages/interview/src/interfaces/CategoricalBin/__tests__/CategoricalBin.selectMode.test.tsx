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

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import type { ProtocolPayload } from '../../../contract/types';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import protocol from '../../../store/modules/protocol';
import session, { type SessionState } from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import CategoricalBin from '../CategoricalBin';
import { getCatBinDropTargetId } from '../components/CategoricalBinItem';

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
  vi.stubGlobal('scrollTo', vi.fn());
});

beforeEach(() => {
  track.mockClear();
});

const NODE_TYPE = 'person';
const STAGE_ID = 'categorical-bin-stage';
const PROMPT_ID = 'prompt-1';
const OTHER_BIN_INDEX = 2;

const person = (
  id: string,
  name: string,
  attributes: Record<string, unknown> = {},
): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  type: NODE_TYPE,
  [entityAttributesProperty]: { name, ...attributes },
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
        category: {
          name: 'Category',
          label: 'Category',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: { en: 'Family' }, value: 1 },
            { label: { en: 'Friend' }, value: 2 },
          ],
        },
        otherReason: {
          name: 'Other reason',
          label: 'Other reason',
          type: 'text',
          component: 'Text',
        },
      },
    },
  },
  edge: {},
  ego: { variables: {} },
};

type Mode = 'drag' | 'select';

const buildStage = (mode: Mode): StageProps<'CategoricalBin'>['stage'] => ({
  id: STAGE_ID,
  type: 'CategoricalBin',
  label: { en: 'Categorise people' },
  subject: { entity: 'node', type: NODE_TYPE },
  ...(mode === 'select' && { behaviours: { interactionMode: 'select' } }),
  prompts: [
    {
      id: PROMPT_ID,
      text: { en: 'Which category?' },
      variable: asEntityAttributeReference('category'),
      otherVariable: asEntityAttributeReference('otherReason'),
      otherVariablePrompt: { en: 'Which other category?' },
      otherOptionLabel: { en: 'Other' },
    },
  ],
});

const defaultNodes = () => [
  person('a', 'Ann'),
  person('b', 'Ben'),
  person('c', 'Cal'),
];

const buildSession = (nodes: NcNode[]): SessionState => ({
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

const buildProtocol = (mode: Mode): ProtocolPayload => ({
  id: 'protocol',
  hash: 'hash',
  importedAt: '2024-01-01T00:00:00.000Z',
  assets: [],
  name: 'Test protocol',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook,
  stages: [buildStage(mode)],
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

function renderStage(mode: Mode, nodes: NcNode[] = defaultNodes()) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: buildSession(nodes),
      protocol: buildProtocol(mode),
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
                <CategoricalBin
                  stage={buildStage(mode)}
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

const announcement = (name: string) =>
  screen.findByText(`${name}: choose where this item belongs.`);

describe('CategoricalBin in select mode (#1652)', () => {
  it('places the focal person in the tapped bin and moves on to the next', async () => {
    const { attributesOf } = renderStage('select');

    await announcement('Ann');
    fireEvent.click(
      screen.getByRole('button', { name: 'Place Ann in Family' }),
    );

    await waitFor(() => expect(attributesOf('a')?.category).toEqual([1]));
    await announcement('Ben');
    expect(track).toHaveBeenCalledWith('node_binned', {
      node_id: 'a',
      node_type_index: 0,
      bin_index: 0,
      interaction_mode: 'select',
    });
  });

  it('writes what dropping the same person on the same bin writes', async () => {
    const selected = renderStage('select');
    await announcement('Ann');
    fireEvent.click(
      screen.getByRole('button', { name: 'Place Ann in Family' }),
    );
    await waitFor(() =>
      expect(selected.attributesOf('a')?.category).toEqual([1]),
    );
    const selectedNetwork = selected.store.getState().session.network;
    selected.view.unmount();

    const dragged = renderStage('drag');
    const dropTargetId = getCatBinDropTargetId(STAGE_ID, PROMPT_ID, 0);
    startDragOf(dragged.getDndStore, person('a', 'Ann'));
    await waitFor(() =>
      expect(
        dragged.getDndStore().getState().getDropTargetState(dropTargetId)
          ?.canDrop,
      ).toBe(true),
    );
    act(() => {
      dragged.getDndStore().getState().setActiveDropTarget(dropTargetId);
      dragged.getDndStore().getState().endDrag();
    });
    await waitFor(() =>
      expect(dragged.attributesOf('a')?.category).toEqual([1]),
    );

    expect(dragged.store.getState().session.network?.nodes).toEqual(
      selectedNetwork?.nodes,
    );
  });

  it.each([
    ['drag', true],
    ['select', false],
  ] as const)(
    'in %s mode, drag sources and drop targets exist: %s',
    async (mode, present) => {
      const { getDndStore } = renderStage(mode);
      await screen.findByRole('button', { name: /Family/ });

      expect(document.querySelector('[aria-grabbed]') !== null).toBe(present);

      startDragOf(getDndStore, person('a', 'Ann'));
      const canDrop = [0, 1, OTHER_BIN_INDEX].map(
        (index) =>
          getDndStore()
            .getState()
            .getDropTargetState(
              getCatBinDropTargetId(STAGE_ID, PROMPT_ID, index),
            )?.canDrop ?? false,
      );
      if (present) {
        await waitFor(() => expect(canDrop).toContain(true));
      } else {
        expect(canDrop).toEqual([false, false, false]);
      }
    },
  );

  it('lets a placed person be chosen again and moved to another bin', async () => {
    const { attributesOf } = renderStage('select');

    await announcement('Ann');
    fireEvent.click(
      screen.getByRole('button', { name: 'Place Ann in Family' }),
    );
    await announcement('Ben');

    fireEvent.click(
      screen.getByRole('button', { name: 'Show what is in Family, 1 item' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }));
    await announcement('Ann');

    fireEvent.click(
      screen.getByRole('button', { name: 'Place Ann in Friend' }),
    );
    await waitFor(() => expect(attributesOf('a')?.category).toEqual([2]));
    expect(track).toHaveBeenCalledWith('node_rebinned', {
      node_id: 'a',
      node_type_index: 0,
      from_bin_index: 0,
      to_bin_index: 1,
      interaction_mode: 'select',
    });
    await announcement('Ben');
  });

  it('asks about "other" for the focal person, and keeps them focal when cancelled', async () => {
    const { attributesOf } = renderStage('select');

    await announcement('Ann');
    fireEvent.click(screen.getByRole('button', { name: 'Place Ann in Other' }));
    await screen.findByRole('textbox');
    fireEvent.click(screen.getByTestId('dialog-cancel'));
    await waitFor(
      () =>
        expect(screen.queryByTestId('dialog-cancel')).not.toBeInTheDocument(),
      { timeout: 10_000 },
    );
    expect(attributesOf('a')?.otherReason).toBeUndefined();
    expect(
      screen.getByRole('button', { name: 'Place Ann in Other' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Place Ann in Other' }));
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'Neighbour' },
    });
    fireEvent.click(screen.getByTestId('dialog-submit'));

    await waitFor(() =>
      expect(attributesOf('a')?.otherReason).toBe('Neighbour'),
    );
    expect(attributesOf('a')?.category).toBeUndefined();
    await announcement('Ben');
  });

  it('shows that everyone is placed once nobody is left', async () => {
    renderStage('select');

    for (const name of ['Ann', 'Ben', 'Cal']) {
      await announcement(name);
      fireEvent.click(
        screen.getByRole('button', { name: `Place ${name} in Friend` }),
      );
    }

    expect(
      await screen.findAllByText('Every item has been placed.'),
    ).not.toHaveLength(0);
  });

  it('makes a person tapped in the drawer the one being placed', async () => {
    const { attributesOf } = renderStage('select');

    await announcement('Ann');
    fireEvent.click(screen.getByRole('button', { name: 'Cal' }));
    await announcement('Cal');

    fireEvent.click(
      screen.getByRole('button', { name: 'Place Cal in Family' }),
    );
    await waitFor(() => expect(attributesOf('c')?.category).toEqual([1]));
    await announcement('Ann');
  });

  it('records moving someone placed before the stage was left as a move', async () => {
    const { attributesOf } = renderStage('select', [
      person('a', 'Ann', { category: [1] }),
      person('b', 'Ben'),
    ]);

    await announcement('Ben');
    fireEvent.click(
      screen.getByRole('button', { name: 'Show what is in Family, 1 item' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }));
    await announcement('Ann');
    fireEvent.click(
      screen.getByRole('button', { name: 'Place Ann in Friend' }),
    );

    await waitFor(() => expect(attributesOf('a')?.category).toEqual([2]));
    expect(track).toHaveBeenCalledWith('node_rebinned', {
      node_id: 'a',
      node_type_index: 0,
      from_bin_index: 0,
      to_bin_index: 1,
      interaction_mode: 'select',
    });
    expect(track).not.toHaveBeenCalledWith(
      'node_binned',
      expect.objectContaining({ node_id: 'a' }),
    );
  });

  it('narrows a person with several answers to the bin tapped', async () => {
    const { attributesOf } = renderStage('select', [
      person('a', 'Ann', { category: [1, 2] }),
      person('b', 'Ben'),
    ]);

    await announcement('Ben');
    fireEvent.click(
      screen.getByRole('button', { name: 'Show what is in Family, 1 item' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }));
    await announcement('Ann');

    fireEvent.click(
      screen.getByRole('button', { name: 'Place Ann in Friend' }),
    );
    await waitFor(() => expect(attributesOf('a')?.category).toEqual([2]));
  });

  it('asks about "other" again when an "other" person taps it, so the answer can be edited', async () => {
    renderStage('select', [
      person('a', 'Ann', { otherReason: 'Neighbour' }),
      person('b', 'Ben'),
    ]);

    await announcement('Ben');
    fireEvent.click(
      screen.getByRole('button', { name: 'Show what is in Other, 1 item' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Ann' }));
    await announcement('Ann');

    fireEvent.click(screen.getByRole('button', { name: 'Place Ann in Other' }));
    // Ann's answer is there to edit, so saving it unchanged keeps it.
    expect(await screen.findByRole('textbox')).toHaveValue('Neighbour');
  });
});
