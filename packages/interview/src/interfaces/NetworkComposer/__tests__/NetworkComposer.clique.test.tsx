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
  type NcEdge,
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
const NODE_C_ID = 'node-c';

// Positions chosen so the lasso test geometry is clear:
//  - A: (0.2, 0.2) — top-left quadrant
//  - B: (0.5, 0.2) — top-center
//  - C: (0.8, 0.8) — bottom-right quadrant
// The lasso polygon will enclose A and B but NOT C.
function makePreloadedNodes() {
  return [
    {
      [entityPrimaryKeyProperty]: NODE_A_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Alice',
        [LAYOUT_VAR]: { x: 0.2, y: 0.2 },
      },
    },
    {
      [entityPrimaryKeyProperty]: NODE_B_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Bob',
        [LAYOUT_VAR]: { x: 0.5, y: 0.2 },
      },
    },
    {
      [entityPrimaryKeyProperty]: NODE_C_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Carol',
        [LAYOUT_VAR]: { x: 0.8, y: 0.8 },
      },
    },
  ];
}

function makeStore(extraEdges: NcEdge[] = []) {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: makePreloadedNodes(),
          edges: extraEdges,
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook,
        stages: [stage],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function renderInterface(store: ReturnType<typeof makeStore>) {
  const registerBeforeNext: RegisterBeforeNext = vi.fn();

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
            <StageMetadataContext.Provider value={registerBeforeNext}>
              {children}
            </StageMetadataContext.Provider>
          </CurrentStepProvider>
        </ContractProvider>
      </Provider>
    );
  }

  render(<NetworkComposer {...props} />, { wrapper: Wrapper });
}

/**
 * Simulates a tap on a node element (pointer down on element, pointer up on
 * document — mirrors useCanvasDrag's document-level pointerup listener).
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

/**
 * Simulates a shift-click tap on a node element (modifier keys set).
 */
function shiftTapNode(nodeEl: HTMLElement) {
  fireEvent.pointerDown(nodeEl, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
    shiftKey: true,
  });
  fireEvent.pointerUp(document, {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 1,
    shiftKey: true,
  });
}

describe('NetworkComposer — shift-select + connect-all clique', () => {
  it('shift-clicking three nodes then "Connect all with Knows" creates 3 pairwise edges', async () => {
    const store = makeStore();
    renderInterface(store);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    const nodeB = await screen.findByRole('button', { name: /bob/i });
    const nodeC = await screen.findByRole('button', { name: /carol/i });

    // First tap selects A normally; subsequent shift-taps add B and C.
    act(() => {
      tapNode(nodeA);
    });
    act(() => {
      shiftTapNode(nodeB);
    });
    act(() => {
      shiftTapNode(nodeC);
    });

    // "Connect all with Knows" button should now be visible (≥2 selected).
    const connectBtn = await screen.findByRole('button', {
      name: /connect all with knows/i,
    });

    await act(async () => {
      fireEvent.click(connectBtn);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      const knowsEdges = edges.filter((e) => e.type === EDGE_TYPE);
      expect(knowsEdges).toHaveLength(3);
    });
  });

  it('undo after connect-all removes all 3 pairwise edges in one step', async () => {
    const store = makeStore();
    renderInterface(store);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    const nodeB = await screen.findByRole('button', { name: /bob/i });
    const nodeC = await screen.findByRole('button', { name: /carol/i });

    act(() => {
      tapNode(nodeA);
    });
    act(() => {
      shiftTapNode(nodeB);
    });
    act(() => {
      shiftTapNode(nodeC);
    });

    const connectBtn = await screen.findByRole('button', {
      name: /connect all with knows/i,
    });
    await act(async () => {
      fireEvent.click(connectBtn);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      expect(edges.filter((e) => e.type === EDGE_TYPE)).toHaveLength(3);
    });

    // Click undo
    const undoBtn = await screen.findByRole('button', { name: /undo/i });
    act(() => {
      fireEvent.click(undoBtn);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      expect(edges.filter((e) => e.type === EDGE_TYPE)).toHaveLength(0);
    });
  });
});

describe('NetworkComposer — lasso selection', () => {
  it('background drag encloses A and B but not C, selecting only A and B', async () => {
    const store = makeStore();
    renderInterface(store);

    // Wait for nodes to render
    await screen.findByRole('button', { name: /alice/i });

    // The canvas element (role="application") is our drag target.
    const canvas = screen.getByRole('application');

    // jsdom doesn't layout elements, so getBoundingClientRect() returns a zero
    // rect. We mock it to return a 1000×1000 canvas so normalized positions
    // computed in ComposerCanvas map correctly:
    //   normalized = (clientX - rect.left) / rect.width
    // Node positions (from Redux) in normalized space:
    //   A = (0.2, 0.2) → clientX=200, clientY=200
    //   B = (0.5, 0.2) → clientX=500, clientY=200
    //   C = (0.8, 0.8) → clientX=800, clientY=800
    //
    // Lasso polygon (in normalized space) covers (0.0,0.0)→(0.65,0.0)→(0.65,0.45)→(0.0,0.45)
    // corresponding to clientX/Y: (0,0), (650,0), (650,450), (0,450)
    // A(0.2,0.2) and B(0.5,0.2) are inside; C(0.8,0.8) is outside.
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 1000,
      right: 1000,
      bottom: 1000,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    });

    // Simulate background drag (pointer events directly on the canvas element).
    // We pass `currentTarget` === `target` so the background gate passes.
    act(() => {
      fireEvent.pointerDown(canvas, {
        button: 0,
        clientX: 0,
        clientY: 0,
        pointerId: 1,
        // These events hit the canvas directly (background), not a child node.
      });
    });

    // Move past DRAG_THRESHOLD (5px) — first move to arm lasso, then trace rect.
    act(() => {
      fireEvent.pointerMove(canvas, {
        clientX: 10,
        clientY: 0,
        pointerId: 1,
      });
    });
    act(() => {
      fireEvent.pointerMove(canvas, {
        clientX: 650,
        clientY: 0,
        pointerId: 1,
      });
    });
    act(() => {
      fireEvent.pointerMove(canvas, {
        clientX: 650,
        clientY: 450,
        pointerId: 1,
      });
    });
    act(() => {
      fireEvent.pointerMove(canvas, {
        clientX: 0,
        clientY: 450,
        pointerId: 1,
      });
    });

    // Release pointer
    act(() => {
      fireEvent.pointerUp(canvas, {
        clientX: 0,
        clientY: 450,
        pointerId: 1,
      });
    });

    // "Connect all" control appears only when ≥2 nodes are selected.
    const connectBtn = await screen.findByRole('button', {
      name: /connect all with knows/i,
    });
    expect(connectBtn).not.toBeNull();

    // Click connect-all to produce edges for exactly the selected set.
    await act(async () => {
      fireEvent.click(connectBtn);
    });

    // If exactly {A, B} were selected, connect-all produces exactly 1 knows edge
    // (A–B). If C were also selected, there would be 3 edges (A–B, A–C, B–C).
    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      const knowsEdges = edges.filter((e) => e.type === EDGE_TYPE);

      expect(knowsEdges).toHaveLength(1);

      const [edge] = knowsEdges;
      const endpoints = new Set([edge!.from, edge!.to]);
      expect(endpoints).toContain(NODE_A_ID);
      expect(endpoints).toContain(NODE_B_ID);

      const cIncident = knowsEdges.some(
        (e) => e.from === NODE_C_ID || e.to === NODE_C_ID,
      );
      expect(cIncident).toBe(false);
    });
  });
});

describe('NetworkComposer — batch delete', () => {
  it('selecting two nodes and pressing Delete removes both and their edges in one undo step', async () => {
    // Preload an edge between A and B so we can verify incident-edge removal.
    const store = makeStore([
      {
        [entityPrimaryKeyProperty]: 'edge-ab',
        type: EDGE_TYPE,
        from: NODE_A_ID,
        to: NODE_B_ID,
        [entityAttributesProperty]: {},
      },
    ]);
    renderInterface(store);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    const nodeB = await screen.findByRole('button', { name: /bob/i });

    act(() => {
      tapNode(nodeA);
    });
    act(() => {
      shiftTapNode(nodeB);
    });

    // Both nodes should be selected; Delete key on the interface root removes them.
    const interfaceRoot = screen.getByTestId('network-composer');

    await act(async () => {
      fireEvent.keyDown(interfaceRoot, { key: 'Delete' });
    });

    await waitFor(() => {
      const { nodes, edges } = store.getState().session.network;
      const nodeAGone = !nodes.find(
        (n) => n[entityPrimaryKeyProperty] === NODE_A_ID,
      );
      const nodeBGone = !nodes.find(
        (n) => n[entityPrimaryKeyProperty] === NODE_B_ID,
      );
      const edgeGone = !edges.find(
        (e) => e[entityPrimaryKeyProperty] === 'edge-ab',
      );
      expect(nodeAGone).toBe(true);
      expect(nodeBGone).toBe(true);
      expect(edgeGone).toBe(true);
    });

    // Undo once — ONE undo entry restores both nodes and the edge.
    const undoBtn = await screen.findByRole('button', { name: /undo/i });
    act(() => {
      fireEvent.click(undoBtn);
    });

    await waitFor(() => {
      const { nodes, edges } = store.getState().session.network;
      const nodeABack = nodes.find(
        (n) => n[entityPrimaryKeyProperty] === NODE_A_ID,
      );
      const nodeBBack = nodes.find(
        (n) => n[entityPrimaryKeyProperty] === NODE_B_ID,
      );
      expect(nodeABack).toBeTruthy();
      expect(nodeBBack).toBeTruthy();
      // Edge between A and B is also restored.
      const edge = edges.find(
        (e) =>
          e.type === EDGE_TYPE &&
          ((e.from === NODE_A_ID && e.to === NODE_B_ID) ||
            (e.from === NODE_B_ID && e.to === NODE_A_ID)),
      );
      expect(edge).toBeTruthy();
    });
  });
});
