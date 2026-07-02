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
const GROUP_VAR = 'var-group';

const stage = {
  id: 'nc1',
  type: 'NetworkComposer' as const,
  label: 'Network Composer',
  subject: { entity: 'node' as const, type: NODE_TYPE },
  layoutVariable: LAYOUT_VAR,
  quickAdd: QUICK_ADD_VAR,
  edges: [{ subject: { entity: 'edge' as const, type: EDGE_TYPE } }],
  convexHullVariable: GROUP_VAR,
  background: {
    concentricCircles: 4,
    skewedTowardCenter: true,
  },
};

// Widened so a variant without the hull variable can share the fixture helpers.
type StageFixture = Omit<typeof stage, 'convexHullVariable'> & {
  convexHullVariable?: string;
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
        [GROUP_VAR]: {
          name: 'Team',
          type: 'categorical',
          options: [
            { value: 'red', label: 'Team Red' },
            { value: 'blue', label: 'Team Blue' },
          ],
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

function makeStore(extraEdges: NcEdge[] = [], stageDef: StageFixture = stage) {
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
        stages: [stageDef],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function renderInterface(
  store: ReturnType<typeof makeStore>,
  stageDef: StageFixture = stage,
) {
  const registerBeforeNext: RegisterBeforeNext = vi.fn();

  const props: StageProps<'NetworkComposer'> = {
    stage: stageDef as StageProps<'NetworkComposer'>['stage'],
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

// The Groups tool lives behind a popover; open it and pick "Team Red" so the
// group tool is active and its lasso/"Add all" flow is available.
async function activateTeamRedGroup() {
  fireEvent.click(screen.getByRole('button', { name: /groups/i }));
  fireEvent.click(await screen.findByRole('button', { name: /team red/i }));
}

// Drags a rectangular lasso over the canvas enclosing nodes A and B but not C.
// jsdom does not lay out elements, so getBoundingClientRect() returns a zero
// rect; mock it to a 1000×1000 canvas so normalized positions map correctly:
//   normalized = (clientX - rect.left) / rect.width
// Node positions (from Redux) in normalized space:
//   A = (0.2, 0.2) → clientX=200, clientY=200
//   B = (0.5, 0.2) → clientX=500, clientY=200
//   C = (0.8, 0.8) → clientX=800, clientY=800
// Lasso polygon covers (0,0)→(650,0)→(650,450)→(0,450) — A and B inside, C out.
function lassoAB(canvas: HTMLElement) {
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

  act(() => {
    fireEvent.pointerDown(canvas, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
    });
  });

  // Move past DRAG_THRESHOLD (5px) — first move arms the lasso, then trace rect.
  for (const [clientX, clientY] of [
    [10, 0],
    [650, 0],
    [650, 450],
    [0, 450],
  ]) {
    act(() => {
      fireEvent.pointerMove(canvas, { clientX, clientY, pointerId: 1 });
    });
  }

  act(() => {
    fireEvent.pointerUp(canvas, { clientX: 0, clientY: 450, pointerId: 1 });
  });
}

describe('NetworkComposer — group lasso', () => {
  it('lasso in group mode selects the enclosed nodes; "Add all" adds them to the group', async () => {
    const store = makeStore();
    renderInterface(store);

    await screen.findByRole('button', { name: /alice/i });

    // Enter group mode with Team Red active — lasso is group-only.
    await activateTeamRedGroup();

    const canvas = screen.getByRole('application');
    lassoAB(canvas);

    // "Add all to Team Red" appears only when ≥2 nodes are selected (A and B).
    const addAllBtn = await screen.findByRole('button', {
      name: /add all to team red/i,
    });

    await act(async () => {
      fireEvent.click(addAllBtn);
    });

    // A and B gain the 'red' membership; C (outside the lasso) does not.
    await waitFor(() => {
      const byId = (id: string) =>
        store
          .getState()
          .session.network.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === id,
          );
      expect(byId(NODE_A_ID)![entityAttributesProperty][GROUP_VAR]).toEqual([
        'red',
      ]);
      expect(byId(NODE_B_ID)![entityAttributesProperty][GROUP_VAR]).toEqual([
        'red',
      ]);
      expect(
        byId(NODE_C_ID)![entityAttributesProperty][GROUP_VAR],
      ).toBeUndefined();
    });
  });
});

describe('NetworkComposer — select-mode lasso', () => {
  it('lasso in select mode selects nodes and offers an "Add all" button per group', async () => {
    const store = makeStore();
    renderInterface(store);

    await screen.findByRole('button', { name: /alice/i });

    // Select is the default tool — lasso directly, no tool activation needed.
    const canvas = screen.getByRole('application');
    lassoAB(canvas);

    // One button per option of the configured hull variable.
    await screen.findByRole('button', { name: /add all to team red/i });
    const addAllButtons = screen.getAllByRole('button', {
      name: /add all to/i,
    });
    expect(addAllButtons).toHaveLength(2);
  });

  it('clicking an "Add all" button writes the group value to every selected node', async () => {
    const store = makeStore();
    renderInterface(store);

    await screen.findByRole('button', { name: /alice/i });

    const canvas = screen.getByRole('application');
    lassoAB(canvas);

    const addAllBlue = await screen.findByRole('button', {
      name: /add all to team blue/i,
    });
    await act(async () => {
      fireEvent.click(addAllBlue);
    });

    // A and B gain the 'blue' membership; C (outside the lasso) does not.
    await waitFor(() => {
      const byId = (id: string) =>
        store
          .getState()
          .session.network.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === id,
          );
      expect(byId(NODE_A_ID)![entityAttributesProperty][GROUP_VAR]).toEqual([
        'blue',
      ]);
      expect(byId(NODE_B_ID)![entityAttributesProperty][GROUP_VAR]).toEqual([
        'blue',
      ]);
      expect(
        byId(NODE_C_ID)![entityAttributesProperty][GROUP_VAR],
      ).toBeUndefined();
    });
  });

  it('lasso in select mode selects nothing when no hull variable is configured', async () => {
    const stageWithoutHullVariable: StageFixture = {
      ...stage,
      convexHullVariable: undefined,
    };
    const store = makeStore([], stageWithoutHullVariable);
    renderInterface(store, stageWithoutHullVariable);

    await screen.findByRole('button', { name: /alice/i });

    const canvas = screen.getByRole('application');
    lassoAB(canvas);

    expect(screen.queryByRole('button', { name: /add all to/i })).toBeNull();
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
