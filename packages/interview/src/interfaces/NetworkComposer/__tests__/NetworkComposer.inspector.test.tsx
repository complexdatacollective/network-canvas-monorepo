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

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
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

  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }

  // SlidesForm uses IntersectionObserver via useScrolledToBottom; stub it so
  // the sentinel is immediately "visible" (intersection fires on observe).
  class MockIntersectionObserver {
    private callback: IntersectionObserverCallback;

    constructor(cb: IntersectionObserverCallback) {
      this.callback = cb;
    }

    observe(target: Element) {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }

    unobserve() {}
    disconnect() {}
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];
    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

const NODE_TYPE = 'person';
const EDGE_TYPE = 'knows';
const QUICK_ADD_VAR = 'var-quick-add';
const LAYOUT_VAR = 'var-layout';
const NODE_NAME_VAR = 'var-name';
const EDGE_STRENGTH_VAR = 'var-strength';

const nodeForm = {
  fields: [
    {
      variable: NODE_NAME_VAR,
      prompt: 'Full name',
    },
  ],
};

const edgeForm = {
  fields: [
    {
      variable: EDGE_STRENGTH_VAR,
      prompt: 'Strength',
    },
  ],
};

const stage = {
  id: 'nc1',
  type: 'NetworkComposer' as const,
  label: 'Network Composer',
  subject: { entity: 'node' as const, type: NODE_TYPE },
  layoutVariable: LAYOUT_VAR,
  quickAdd: QUICK_ADD_VAR,
  nodeForm,
  edges: [
    {
      subject: { entity: 'edge' as const, type: EDGE_TYPE },
      form: edgeForm,
    },
  ],
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
        [QUICK_ADD_VAR]: {
          name: 'name',
          type: 'text' as const,
          component: 'Text' as const,
        },
        [LAYOUT_VAR]: { name: 'position', type: 'layout' as const },
        [NODE_NAME_VAR]: {
          name: 'Full name',
          type: 'text' as const,
          component: 'Text' as const,
        },
      },
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Knows',
      color: 'edge-color-seq-1',
      variables: {
        [EDGE_STRENGTH_VAR]: {
          name: 'Strength',
          type: 'text' as const,
          component: 'Text' as const,
        },
      },
    },
  },
  ego: { variables: {} },
};

const NODE_A_ID = 'node-a';
const NODE_B_ID = 'node-b';
const EDGE_ID = 'edge-ab';

function makePreloadedNodes() {
  return [
    {
      [entityPrimaryKeyProperty]: NODE_A_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Alice',
        [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
        [NODE_NAME_VAR]: 'Alice Smith',
      },
    },
    {
      [entityPrimaryKeyProperty]: NODE_B_ID,
      type: NODE_TYPE,
      [entityAttributesProperty]: {
        [QUICK_ADD_VAR]: 'Bob',
        [LAYOUT_VAR]: { x: 0.7, y: 0.7 },
        [NODE_NAME_VAR]: 'Bob Jones',
      },
    },
  ];
}

function makePreloadedEdges() {
  return [
    {
      [entityPrimaryKeyProperty]: EDGE_ID,
      type: EDGE_TYPE,
      from: NODE_A_ID,
      to: NODE_B_ID,
      [entityAttributesProperty]: {
        [EDGE_STRENGTH_VAR]: 'strong',
      },
    },
  ];
}

function makeStore(includeEdges = false, stageForStore: object = stage) {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: makePreloadedNodes(),
          edges: includeEdges ? makePreloadedEdges() : [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook,
        stages: [stageForStore],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

function renderInterface(
  store: ReturnType<typeof makeStore>,
  stageForProps: object = stage,
) {
  const registerBeforeNext: RegisterBeforeNext = vi.fn();

  const props: StageProps<'NetworkComposer'> = {
    stage: stageForProps as StageProps<'NetworkComposer'>['stage'],
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
          <DialogProvider>
            <CurrentStepProvider currentStep={0} onStepChange={() => undefined}>
              <StageMetadataContext.Provider value={registerBeforeNext}>
                {children}
              </StageMetadataContext.Provider>
            </CurrentStepProvider>
          </DialogProvider>
        </ContractProvider>
      </Provider>
    );
  }

  render(<NetworkComposer {...props} />, { wrapper: Wrapper });
}

/**
 * Simulates a tap on a node element (mirrors edges.test.tsx helper).
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

describe('NetworkComposer inspector — node', () => {
  it('tapping a node in Select mode opens the inspector with the node form', async () => {
    const store = makeStore();
    renderInterface(store);

    // Default tool is 'select', so no tool switching needed.
    const nodeA = await screen.findByRole('button', { name: /alice/i });

    act(() => {
      tapNode(nodeA);
    });

    // Inspector should appear with the node form field prompt.
    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });
  });

  it('editing a node field in the inspector auto-saves the value', async () => {
    const store = makeStore();
    renderInterface(store);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });

    // Change the field; the drawer persists valid edits automatically (no Save).
    const nameInput = await screen.findByLabelText(/full name/i);
    fireEvent.change(nameInput, { target: { value: 'Alice Updated' } });

    await waitFor(
      () => {
        const nodes = store.getState().session.network.nodes;
        const updatedNode = nodes.find(
          (n) => n[entityPrimaryKeyProperty] === NODE_A_ID,
        );
        expect(updatedNode?.[entityAttributesProperty]?.[NODE_NAME_VAR]).toBe(
          'Alice Updated',
        );
      },
      { timeout: 2000 },
    );
  });

  it('clicking Delete in the inspector removes the node', async () => {
    const store = makeStore();
    renderInterface(store);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    act(() => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      const nodes = store.getState().session.network.nodes;
      expect(
        nodes.find((n) => n[entityPrimaryKeyProperty] === NODE_A_ID),
      ).toBeUndefined();
    });
  });
});

async function clickEdge(edgeId: string) {
  const edgeLine = await waitFor(() => {
    const el = document.querySelector(`line[data-edge-id="${edgeId}"]`);
    expect(el).not.toBeNull();
    return el as Element;
  });
  act(() => {
    fireEvent.click(edgeLine);
  });
}

describe('NetworkComposer inspector — edge', () => {
  it('clicking an edge in Select mode opens the inspector with the edge form', async () => {
    const store = makeStore(true);
    renderInterface(store);

    await clickEdge(EDGE_ID);

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });
  });

  it('editing an edge field in the inspector auto-saves the value', async () => {
    const store = makeStore(true);
    renderInterface(store);

    await clickEdge(EDGE_ID);

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });

    const strengthInput = await screen.findByLabelText(/strength/i);
    fireEvent.change(strengthInput, { target: { value: 'weak' } });

    await waitFor(
      () => {
        const edges = store.getState().session.network.edges;
        const edge = edges.find((e) => e[entityPrimaryKeyProperty] === EDGE_ID);
        expect(edge?.[entityAttributesProperty]?.[EDGE_STRENGTH_VAR]).toBe(
          'weak',
        );
      },
      { timeout: 2000 },
    );
  });

  it('clicking Delete in the inspector removes the edge', async () => {
    const store = makeStore(true);
    renderInterface(store);

    await clickEdge(EDGE_ID);

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel')).toBeTruthy();
    });

    const deleteBtn = screen.getByRole('button', { name: /delete/i });
    act(() => {
      fireEvent.click(deleteBtn);
    });

    await waitFor(() => {
      const edges = store.getState().session.network.edges;
      expect(
        edges.find((e) => e[entityPrimaryKeyProperty] === EDGE_ID),
      ).toBeUndefined();
    });
  });
});

describe('NetworkComposer inspector — no attributes', () => {
  it('opens the drawer with an empty state when the node has no form', async () => {
    const stageNoForm = { ...stage, nodeForm: undefined };
    const store = makeStore(false, stageNoForm);
    renderInterface(store, stageNoForm);

    const nodeA = await screen.findByRole('button', { name: /alice/i });
    act(() => {
      tapNode(nodeA);
    });

    expect(await screen.findByText(/no attributes to edit/i)).toBeTruthy();
    // A node with a form would render its field; here there is none.
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
  });
});
