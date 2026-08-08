import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../hooks/useAssetUrl', () => ({
  useAssetUrl: vi.fn(),
}));

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataContext } from '../../../contexts/StageMetadataContext';
import { ContractProvider } from '../../../contract/context';
import { useAssetUrl } from '../../../hooks/useAssetUrl';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { RegisterBeforeNext, StageProps } from '../../../types';
import NetworkComposer from '../NetworkComposer';

// jsdom does not implement ResizeObserver; provide a no-op stub.
beforeAll(() => {
  // jsdom does not implement pointer capture, which the canvas drag uses.
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => undefined;
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = () => undefined;
  }
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// Default to "no image resolved" so existing tests (which don't configure
// background.image) exercise the ConcentricCircles fallback path.
beforeEach(() => {
  vi.mocked(useAssetUrl).mockReturnValue({
    url: null,
    isLoading: false,
    error: null,
  });
});

const NODE_TYPE = 'person';
const EDGE_TYPE = 'knows';
const LAYOUT_VAR = 'xy_position';
const QUICK_ADD_VAR = 'var-quick-add';

// Typed independently of the (currently narrower) protocol-validation schema
// so tests can exercise background.image ahead of the schema restoring it.
type TestBackground = {
  concentricCircles?: number;
  skewedTowardCenter?: boolean;
  image?: string;
};

const defaultBackground: TestBackground = {
  concentricCircles: 4,
  skewedTowardCenter: true,
};

const stage = {
  id: 'nc1',
  type: 'NetworkComposer' as const,
  label: 'Network Composer',
  subject: { entity: 'node' as const, type: NODE_TYPE },
  layoutVariable: LAYOUT_VAR,
  quickAdd: QUICK_ADD_VAR,
  edges: [{ subject: { entity: 'edge' as const, type: EDGE_TYPE } }],
  background: defaultBackground,
};

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: {
        [QUICK_ADD_VAR]: { name: 'name', type: 'text' as const },
        [LAYOUT_VAR]: { name: 'position', type: 'layout' as const },
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

const makeNodes = () => [
  {
    [entityPrimaryKeyProperty]: 'n1',
    type: NODE_TYPE,
    [entityAttributesProperty]: {
      [LAYOUT_VAR]: { x: 0.3, y: 0.3 },
    },
  },
  {
    [entityPrimaryKeyProperty]: 'n2',
    type: NODE_TYPE,
    [entityAttributesProperty]: {
      [LAYOUT_VAR]: { x: 0.7, y: 0.7 },
    },
  },
];

function renderInterface(stageOverride: typeof stage = stage) {
  const store = configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: makeNodes(),
          edges: [],
          ego: { [entityAttributesProperty]: {} },
        },
      } as never,
      protocol: {
        id: 'p',
        hash: 'h',
        schemaVersion: 8,
        codebook,
        stages: [stageOverride],
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });

  const registerBeforeNext: RegisterBeforeNext = vi.fn();
  const moveForward = vi.fn();

  const props: StageProps<'NetworkComposer'> = {
    stage: stageOverride as StageProps<'NetworkComposer'>['stage'],
    getNavigationHelpers: () => ({ moveForward, moveBackward: vi.fn() }),
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

describe('NetworkComposer canvas', () => {
  it('renders the interface root with the correct test id', () => {
    renderInterface();
    expect(screen.getByTestId('network-composer')).toBeTruthy();
  });

  it('renders both placed nodes by their label (codebook type name)', async () => {
    renderInterface();
    // ConnectedNode falls back to codebook.node[type].name when no label
    // attribute is set, so both nodes render as "Person".
    await waitFor(() => {
      const nodes = screen.getAllByRole('button', { name: 'Person' });
      expect(nodes).toHaveLength(2);
    });
  });

  it('puts placed nodes in the tab order so they can be reached at all', async () => {
    renderInterface();

    // A canvas node routes its tap through useCanvasDrag rather than an
    // onClick prop, so nothing infers interactivity for it; without an
    // explicit tab stop neither the canvas's own key handling nor a clipped
    // label's keyboard reveal is reachable.
    await waitFor(() => {
      const nodes = screen.getAllByRole('button', { name: 'Person' });
      expect(nodes).toHaveLength(2);
      for (const node of nodes) {
        expect(node).toHaveAttribute('tabindex', '0');
      }
    });
  });

  it('tells assistive technology which placed nodes are selected', async () => {
    renderInterface();

    await waitFor(() => {
      const nodes = screen.getAllByRole('button', { name: 'Person' });
      for (const node of nodes) {
        expect(node).toHaveAttribute('aria-pressed', 'false');
      }
    });
  });

  it('keeps focus on a node selected from the keyboard', async () => {
    renderInterface();

    const nodes = await screen.findAllByRole('button', { name: 'Person' });
    const node = nodes[0]!;
    node.focus();
    expect(node).toHaveFocus();

    // Pointer taps hand focus to the stage root so its shortcuts stay live;
    // doing that to a keyboard user drops them back at the tool palette.
    fireEvent.keyDown(node, { key: 'Enter' });

    await waitFor(() => expect(node).toHaveFocus());
  });

  it('does not apply stale pointer modifiers to a keyboard selection', async () => {
    renderInterface();

    const nodes = await screen.findAllByRole('button', { name: 'Person' });
    const [first, second] = [nodes[0]!, nodes[1]!];

    // A shift-modified pointer gesture leaves its modifiers cached.
    fireEvent.pointerDown(first, {
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      shiftKey: true,
    });
    fireEvent.pointerUp(document, { clientX: 0, clientY: 0, pointerId: 1 });
    await waitFor(() => expect(first).toHaveAttribute('aria-pressed', 'true'));

    // A later keyboard selection must select alone, not add to the selection.
    fireEvent.keyDown(second, { key: 'Enter' });

    await waitFor(() => {
      expect(second).toHaveAttribute('aria-pressed', 'true');
      expect(first).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('renders the concentric circles background svg when background.concentricCircles is set', () => {
    renderInterface();
    // ConcentricCircles renders an <svg aria-hidden> element
    const svgs = document.querySelectorAll('svg[aria-hidden="true"]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it('renders the resolved background image instead of concentric circles when background.image is set', () => {
    vi.mocked(useAssetUrl).mockReturnValue({
      url: 'blob:mock-background-image',
      isLoading: false,
      error: null,
    });

    renderInterface({
      ...stage,
      background: { image: 'asset-1' },
    });

    const img = document.querySelector('img[src="blob:mock-background-image"]');
    expect(img).toHaveAttribute('src', 'blob:mock-background-image');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');

    // Scope to the decorative background wrapper — other chrome (e.g. tool
    // palette icons) also renders aria-hidden svgs, so a page-wide query
    // isn't a reliable signal that ConcentricCircles specifically is absent.
    const canvas = screen.getByRole('application');
    const backgroundWrapper = Array.from(canvas.children).find(
      (el) =>
        el.tagName === 'DIV' &&
        el.className.includes('inset-0') &&
        el.className.includes('items-center'),
    );
    expect(
      backgroundWrapper?.querySelectorAll('svg[aria-hidden="true"]'),
    ).toHaveLength(0);
  });

  it('keeps the decorative background non-interactive so background taps reach the canvas', () => {
    // Regression guard: the background wrapper sits above the canvas (absolute
    // inset-0). If it captures pointer events, it — not the canvas — becomes the
    // pointerdown target, and the `e.target === e.currentTarget` gate in
    // ComposerCanvas silently swallows every background tap, breaking add-node,
    // tap-to-deselect and lasso. jsdom can't reproduce the hit-test (it dispatches
    // straight at the canvas), so assert the layer is pointer-events-none instead.
    renderInterface();
    const canvas = screen.getByRole('application');
    const backgroundWrapper = Array.from(canvas.children).find(
      (el) =>
        el.tagName === 'DIV' &&
        el.className.includes('inset-0') &&
        el.className.includes('items-center'),
    );
    expect(backgroundWrapper).toBeTruthy();
    expect(backgroundWrapper?.className).toContain('pointer-events-none');
  });
});
