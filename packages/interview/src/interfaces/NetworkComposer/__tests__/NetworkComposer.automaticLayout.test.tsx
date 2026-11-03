import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import type { CanvasStoreApi } from '../../../canvas/useCanvasStore';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import protocol from '../../../store/modules/protocol';
import session, { updateNode } from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import NetworkComposer from '../NetworkComposer';

// jsdom has no Worker, and automatic mode would otherwise construct the shared
// auto-layout worker. These tests cover the metadata-driven layout toggle, not
// the simulation, so stub the engine out. The stub keeps the canvas store it
// is handed, so a test can move people on screen as the simulation would.
const autoLayout = vi.hoisted(() => ({
  store: null as CanvasStoreApi | null,
}));

vi.mock('../../../canvas/useAutoLayout', () => ({
  useAutoLayout: ({ store }: { store: CanvasStoreApi }) => {
    autoLayout.store = store;
    return {
      isRunning: false,
      start: vi.fn(),
      stop: vi.fn(),
      reheat: vi.fn(),
      moveNode: vi.fn(),
      releaseNode: vi.fn(),
      simulationEnabled: false,
      toggleSimulation: vi.fn(),
    };
  },
}));

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const NODE_TYPE = 'person';
const EDGE_TYPE = 'knows';
const LAYOUT_VAR = 'xy_position';
const QUICK_ADD_VAR = 'var-quick-add';

const makeStage = (defaultEnabled: boolean) => ({
  id: 'nc1',
  type: 'NetworkComposer' as const,
  label: { en: 'Network Composer' },
  subject: { entity: 'node' as const, type: NODE_TYPE },
  layoutVariable: asEntityAttributeReference(LAYOUT_VAR),
  quickAdd: asEntityAttributeReference(QUICK_ADD_VAR),
  edges: [
    {
      id: 'edge-config',
      subject: { entity: 'edge' as const, type: EDGE_TYPE },
      label: { en: 'Knows' },
    },
  ],
  background: { concentricCircles: 4 },
  behaviours: { automaticLayout: defaultEnabled },
});

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: {
        [QUICK_ADD_VAR]: {
          name: 'name',
          type: 'text' as const,
        },
        [LAYOUT_VAR]: {
          name: 'position',
          type: 'layout' as const,
        },
      },
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Knows',
      color: 'edge-color-seq-1',
      variables: {},
    },
  },
  ego: { variables: {} },
};

const MANUAL_LAYOUT = {
  alex: { x: 0.2, y: 0.3 },
  blake: { x: 0.7, y: 0.6 },
};

const makeNodes = (): NcNode[] =>
  Object.entries(MANUAL_LAYOUT).map(([id, position]) => ({
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: {
      [QUICK_ADD_VAR]: id === 'alex' ? 'Alex' : 'Blake',
      [LAYOUT_VAR]: position,
    },
  }));

function renderInterface({
  defaultEnabled = false,
  stageMetadata,
  nodes = [],
}: {
  defaultEnabled?: boolean;
  stageMetadata?: Record<number, unknown>;
  nodes?: NcNode[];
} = {}) {
  const stage = makeStage(defaultEnabled);
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        stageMetadata,
        network: {
          nodes,
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

  const props: StageProps<'NetworkComposer'> = {
    stage: stage as StageProps<'NetworkComposer'>['stage'],
    getNavigationHelpers: () => ({
      moveForward: vi.fn(),
      moveBackward: vi.fn(),
    }),
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <ContractProvider
          onFinish={vi.fn()}
          onRequestAsset={vi.fn()}
          flags={{ isE2E: false, isDevelopment: false }}
        >
          <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
            <StageMetadataContext.Provider
              value={vi.fn() as unknown as RegisterBeforeNext}
            >
              <TestProtocolLocalization>{children}</TestProtocolLocalization>
            </StageMetadataContext.Provider>
          </CurrentStepProvider>
        </ContractProvider>
      </Provider>
    );
  }

  render(<NetworkComposer {...props} />, { wrapper: Wrapper });

  return { store };
}

type Store = ReturnType<typeof renderInterface>['store'];

const storedPositions = (store: Store) =>
  Object.fromEntries(
    store
      .getState()
      .session.network.nodes.map((node) => [
        node[entityPrimaryKeyProperty],
        node[entityAttributesProperty][LAYOUT_VAR],
      ]),
  );

// What the simulation's settle does: save a position for everyone.
const saveLayout = async (
  store: Store,
  positions: Record<string, { x: number; y: number }>,
) => {
  await act(async () => {
    for (const [nodeId, position] of Object.entries(positions)) {
      await store
        .dispatch(
          updateNode({
            nodeId,
            attributePatch: { set: { [LAYOUT_VAR]: position }, unset: [] },
            currentStep: 0,
          }),
        )
        .unwrap();
    }
  });
};

const pressUndo = () =>
  fireEvent.keyDown(screen.getByTestId('network-composer'), {
    key: 'z',
    metaKey: true,
  });
const pressRedo = () =>
  fireEvent.keyDown(screen.getByTestId('network-composer'), {
    key: 'z',
    metaKey: true,
    shiftKey: true,
  });

const layoutMode = () =>
  screen.getByTestId('network-composer').getAttribute('data-layout-mode');
// Automatic layout is a toggle button (aria-pressed) in the tool palette.
const layoutToggle = () =>
  screen.getByRole('button', { name: 'Automatic layout' });

describe('NetworkComposer automatic layout', () => {
  it('defaults to manual when defaultEnabled is false and there is no metadata', () => {
    renderInterface({ defaultEnabled: false });
    expect(layoutMode()).toBe('MANUAL');
    expect(layoutToggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('starts in automatic mode when defaultEnabled is true', () => {
    renderInterface({ defaultEnabled: true });
    expect(layoutMode()).toBe('AUTOMATIC');
    expect(layoutToggle().getAttribute('aria-pressed')).toBe('true');
  });

  it('lets stage metadata override the schema default', () => {
    // Default is on, but the participant previously switched it off — metadata wins.
    renderInterface({
      defaultEnabled: true,
      stageMetadata: { 0: { automaticLayout: false } },
    });
    expect(layoutMode()).toBe('MANUAL');
    expect(layoutToggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('falls back to the default when persisted metadata is malformed', () => {
    // A non-boolean (or otherwise malformed) value must not be treated as
    // enabled, and must not throw on the `in` operator.
    renderInterface({
      defaultEnabled: false,
      stageMetadata: { 0: { automaticLayout: 'yes' } as unknown },
    });
    expect(layoutMode()).toBe('MANUAL');
    expect(layoutToggle().getAttribute('aria-pressed')).toBe('false');
  });

  it('persists the participant toggle to stage metadata', async () => {
    const { store } = renderInterface({ defaultEnabled: false });
    fireEvent.click(layoutToggle());
    await waitFor(() => expect(layoutMode()).toBe('AUTOMATIC'));
    const metadata = store.getState().session.stageMetadata as
      | Record<number, unknown>
      | undefined;
    expect(metadata?.[0]).toEqual({ automaticLayout: true });
  });

  it('puts everyone back where they were when turning automatic layout on is undone', async () => {
    const { store } = renderInterface({ nodes: makeNodes() });

    fireEvent.click(layoutToggle());
    await waitFor(() => expect(layoutMode()).toBe('AUTOMATIC'));
    await saveLayout(store, {
      alex: { x: 0.5, y: 0.5 },
      blake: { x: 0.55, y: 0.45 },
    });
    expect(storedPositions(store)).not.toEqual(MANUAL_LAYOUT);

    pressUndo();
    await waitFor(() => expect(layoutMode()).toBe('MANUAL'));
    expect(storedPositions(store)).toEqual(MANUAL_LAYOUT);
    expect(layoutToggle().getAttribute('aria-pressed')).toBe('false');

    pressRedo();
    await waitFor(() => expect(layoutMode()).toBe('AUTOMATIC'));
  });

  it('keeps everyone where they are shown when automatic layout is turned off', async () => {
    const { store } = renderInterface({
      defaultEnabled: true,
      nodes: makeNodes(),
    });
    // The simulation has moved Alex on screen but not yet saved it.
    act(() => {
      autoLayout.store?.getState().setPosition('alex', { x: 0.45, y: 0.4 });
    });

    fireEvent.click(layoutToggle());
    await waitFor(() => expect(layoutMode()).toBe('MANUAL'));
    expect(storedPositions(store)).toEqual({
      alex: { x: 0.45, y: 0.4 },
      blake: MANUAL_LAYOUT.blake,
    });

    pressUndo();
    await waitFor(() => expect(layoutMode()).toBe('AUTOMATIC'));
  });

  it('does not make moving someone in automatic layout a step to undo', async () => {
    const { store } = renderInterface({ nodes: makeNodes() });

    fireEvent.click(layoutToggle());
    await waitFor(() => expect(layoutMode()).toBe('AUTOMATIC'));
    fireEvent.keyDown(screen.getByRole('button', { name: /Alex/ }), {
      key: 'ArrowUp',
    });

    // One undo reverses turning the layout on, not the move.
    pressUndo();
    await waitFor(() => expect(layoutMode()).toBe('MANUAL'));
    expect(storedPositions(store)).toEqual(MANUAL_LAYOUT);
  });
});
