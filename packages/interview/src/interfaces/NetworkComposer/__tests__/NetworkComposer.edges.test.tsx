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

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';
import { CurrentStepProvider } from '~/contexts/CurrentStepContext';
import { StageMetadataContext } from '~/contexts/StageMetadataContext';
import { ContractProvider } from '~/contract/context';
import protocol from '~/store/modules/protocol';
import session from '~/store/modules/session';
import ui from '~/store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '~/types';

import NetworkComposer from '../NetworkComposer';

beforeAll(() => {
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // jsdom does not implement pointer capture APIs; stub them so useCanvasDrag
  // does not throw when pointer events are fired on node elements.
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
});

const NODE_TYPE = 'person';
const EDGE_TYPE = 'knows';
const QUICK_ADD_VAR = 'var-quick-add';
const LAYOUT_VAR = 'var-layout';

const stage = {
  id: 'nc1',
  type: 'NetworkComposer' as const,
  label: 'Network Composer',
  subject: { entity: 'node' as const, type: NODE_TYPE },
  layoutVariable: LAYOUT_VAR,
  quickAdd: QUICK_ADD_VAR,
  edges: [{ subject: { entity: 'edge' as const, type: EDGE_TYPE } }],
  background: {
    concentricCircles: 4,
    skewedTowardCenter: true,
  },
};

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: {
        [QUICK_ADD_VAR]: { name: 'name', type: 'text' },
        [LAYOUT_VAR]: { name: 'position', type: 'layout' },
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

const NODE_A_ID = 'node-a';
const NODE_B_ID = 'node-b';

function makePreloadedNodes() {
  return [
    {
      [entityPrimaryKeyProperty]: NODE_A_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Alice',
        [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
      },
    },
    {
      [entityPrimaryKeyProperty]: NODE_B_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Bob',
        [LAYOUT_VAR]: { x: 0.7, y: 0.7 },
      },
    },
  ];
}

function makeStore(stageToRender: typeof stage = stage) {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: makePreloadedNodes(),
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook,
        stages: [stageToRender],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function renderInterface(stageToRender: typeof stage = stage) {
  const store = makeStore(stageToRender);
  const registerBeforeNext: RegisterBeforeNext = vi.fn();

  const props: StageProps<'NetworkComposer'> = {
    stage: stageToRender as StageProps<'NetworkComposer'>['stage'],
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
            <StageMetadataContext.Provider value={registerBeforeNext}>
              {children}
            </StageMetadataContext.Provider>
          </CurrentStepProvider>
        </ContractProvider>
      </Provider>
    );
  }

  render(<NetworkComposer {...props} />, { wrapper: Wrapper });

  return { store };
}

/**
 * Simulates a tap on a node element.
 * useCanvasDrag listens for pointerup on document (not the element), so we
 * fire pointerDown on the element to arm the handler, then fire pointerUp on
 * document to trigger it — mirroring the actual DOM event flow.
 */
function tapNode(nodeEl: HTMLElement) {
  fireEvent.pointerDown(nodeEl, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  });
  fireEvent.pointerUp(document, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
  });
}

// Edge types live behind a single "Draw edge" menu; open it and pick "Knows".
async function activateKnowsEdgeTool() {
  fireEvent.click(screen.getByRole('button', { name: /draw edge/i }));
  fireEvent.click(await screen.findByRole('menuitemradio', { name: /knows/i }));
}

describe('NetworkComposer edge-type tool', () => {
  it('hides the "Draw edge" tool when the stage defines no edge types', () => {
    renderInterface({ ...stage, edges: [] });
    expect(screen.queryByRole('button', { name: /draw edge/i })).toBeNull();
  });

  it('tapping node A then node B creates a knows edge between them', async () => {
    const { store } = renderInterface();

    // Activate the Knows edge tool
    await activateKnowsEdgeTool();

    // Wait for nodes to be rendered with their labels
    const nodeA = await screen.findByRole('button', { name: /alice/i });
    const nodeB = await screen.findByRole('button', { name: /bob/i });

    // Tap node A to arm the pending source
    act(() => {
      tapNode(nodeA);
    });

    // Tap node B to complete the edge
    await act(async () => {
      tapNode(nodeB);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      const knowsEdges = edges.filter(
        (e) =>
          e.type === EDGE_TYPE &&
          ((e.from === NODE_A_ID && e.to === NODE_B_ID) ||
            (e.from === NODE_B_ID && e.to === NODE_A_ID)),
      );
      expect(knowsEdges).toHaveLength(1);
    });
  });

  it('tapping A then B again removes the knows edge (toggle off)', async () => {
    const { store } = renderInterface();

    await activateKnowsEdgeTool();

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    const nodeB = await screen.findByRole('button', { name: /bob/i });

    // First tap pair — add the edge
    act(() => {
      tapNode(nodeA);
    });
    await act(async () => {
      tapNode(nodeB);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      expect(edges.filter((e) => e.type === EDGE_TYPE)).toHaveLength(1);
    });

    // Second tap pair — remove the edge
    act(() => {
      tapNode(nodeA);
    });
    await act(async () => {
      tapNode(nodeB);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      expect(edges.filter((e) => e.type === EDGE_TYPE)).toHaveLength(0);
    });
  });

  it('tapping the same node twice cancels the pending source (no edge created)', async () => {
    const { store } = renderInterface();

    await activateKnowsEdgeTool();

    const nodeA = await screen.findByRole('button', { name: /alice/i });

    // Tap A, then tap A again — should cancel
    act(() => {
      tapNode(nodeA);
    });
    await act(async () => {
      tapNode(nodeA);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      expect(edges.filter((e) => e.type === EDGE_TYPE)).toHaveLength(0);
    });
  });
});
