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

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '../../../types';
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

function makeStore(preloadedNodes: unknown[] = []) {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: preloadedNodes,
          edges: [],
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

function renderInterface(preloadedNodes: unknown[] = []) {
  const store = makeStore(preloadedNodes);
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

  return { store };
}

async function createNodeNamed(name: string) {
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: /add node/i }));
  });
  const input = await screen.findByRole('textbox', { name: /name/i });
  await act(async () => {
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  });
}

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

describe('NetworkComposer keyboard undo/redo', () => {
  it('⌘Z after creating a node removes the node', async () => {
    const { store } = renderInterface();

    await createNodeNamed('Alice');

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });

    // Press ⌘Z on the interface root
    const root = screen.getByTestId('network-composer');
    await act(async () => {
      fireEvent.keyDown(root, { key: 'z', metaKey: true });
    });

    // The node should be gone
    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(0);
    });
  });

  it('⇧⌘Z after undo restores the node', async () => {
    const { store } = renderInterface();

    await createNodeNamed('Alice');

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });

    const root = screen.getByTestId('network-composer');

    // Undo: node gone
    await act(async () => {
      fireEvent.keyDown(root, { key: 'z', metaKey: true });
    });
    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(0);
    });

    // Redo: node back
    await act(async () => {
      fireEvent.keyDown(root, { key: 'z', metaKey: true, shiftKey: true });
    });
    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
  });
});

describe('NetworkComposer keyboard delete (single-select node)', () => {
  const preloadedNode = {
    [entityPrimaryKeyProperty]: 'node-alice',
    type: NODE_TYPE,
    [entityAttributesProperty]: {
      [QUICK_ADD_VAR]: 'Alice',
      [LAYOUT_VAR]: { x: 0.5, y: 0.5 },
    },
  };

  it('Delete key with a selected node removes that node', async () => {
    const { store } = renderInterface([preloadedNode]);

    // Select the node via the Select tool (already active by default)
    const nodeEl = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeEl);
    });

    // Wait for selection to register
    await waitFor(() => {
      // The node should still exist at this point
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });

    const root = screen.getByTestId('network-composer');
    await act(async () => {
      fireEvent.keyDown(root, { key: 'Delete' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(0);
    });
  });

  it('⌘Z after deleting a selected node restores it', async () => {
    const { store } = renderInterface([preloadedNode]);

    const nodeEl = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeEl);
    });

    const root = screen.getByTestId('network-composer');

    // Delete
    await act(async () => {
      fireEvent.keyDown(root, { key: 'Delete' });
    });
    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(0);
    });

    // Undo — node should come back
    await act(async () => {
      fireEvent.keyDown(root, { key: 'z', metaKey: true });
    });
    await waitFor(() => {
      expect(store.getState().session.network.nodes).toHaveLength(1);
    });
  });
});

describe('NetworkComposer keyboard delete (single-select edge)', () => {
  const NODE_A_ID = 'node-a';
  const NODE_B_ID = 'node-b';
  const EDGE_ID = 'edge-ab';

  const preloadedNodes = [
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

  function makeStoreWithEdge() {
    return configureStore({
      reducer: { session, protocol, ui },
      preloadedState: {
        session: {
          id: 's',
          promptIndex: 0,
          network: {
            nodes: preloadedNodes,
            edges: [
              {
                [entityPrimaryKeyProperty]: EDGE_ID,
                type: EDGE_TYPE,
                from: NODE_A_ID,
                to: NODE_B_ID,
                [entityAttributesProperty]: {},
              },
            ],
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

  it('Delete key with a selected edge removes that edge', async () => {
    const store = makeStoreWithEdge();
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

    // Confirm edge exists initially
    expect(store.getState().session.network.edges).toHaveLength(1);

    // The EdgeLayer creates SVG line elements with data-edge-id attributes
    // and native click listeners (not React delegation) in a useEffect.
    // We query and click the line to trigger the handleEdgeTap callback.
    const edgeLine = document.querySelector(`[data-edge-id="${EDGE_ID}"]`);
    expect(edgeLine).not.toBeNull();

    await act(async () => {
      edgeLine!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const root = screen.getByTestId('network-composer');

    // Press Delete — the edge is now selected, so it should be removed
    await act(async () => {
      fireEvent.keyDown(root, { key: 'Delete' });
    });

    await waitFor(() => {
      expect(store.getState().session.network.edges).toHaveLength(0);
    });
  });
});
