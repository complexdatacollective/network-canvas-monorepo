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

function makeStore() {
  return configureStore({
    reducer: { session, protocol, ui },
    preloadedState: {
      session: {
        id: 's',
        promptIndex: 0,
        network: {
          nodes: [],
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

function renderInterface() {
  const store = makeStore();
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

function tapCanvas() {
  const canvas = screen.getByRole('application');
  fireEvent.pointerDown(canvas, { button: 0, clientX: 200, clientY: 200 });
  fireEvent.pointerUp(canvas, { button: 0, clientX: 200, clientY: 200 });
}

describe('NetworkComposer tool palette', () => {
  it('renders a Select button in the palette', () => {
    renderInterface();
    expect(screen.getByRole('button', { name: /select/i })).toBeTruthy();
  });

  it('renders an Add Node button in the palette', () => {
    renderInterface();
    expect(screen.getByRole('button', { name: /add node/i })).toBeTruthy();
  });

  it('renders one edge-tool button per configured edge type (knows)', () => {
    renderInterface();
    expect(screen.getByRole('button', { name: /knows/i })).toBeTruthy();
  });

  it('Select tool is aria-pressed by default', () => {
    renderInterface();
    const selectBtn = screen.getByRole('button', { name: /select/i });
    expect(selectBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking Add Node sets aria-pressed on Add Node button', async () => {
    renderInterface();

    const addNodeBtn = screen.getByRole('button', { name: /add node/i });
    act(() => {
      fireEvent.click(addNodeBtn);
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /add node/i }).getAttribute('aria-pressed'),
      ).toBe('true');
    });
  });

  it('Select button is no longer aria-pressed after Add Node is activated', async () => {
    renderInterface();

    const addNodeBtn = screen.getByRole('button', { name: /add node/i });
    act(() => {
      fireEvent.click(addNodeBtn);
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /select/i }).getAttribute('aria-pressed'),
      ).toBe('false');
    });
  });
});

describe('NetworkComposer add-node flow', () => {
  it('tapping the background in Add Node mode opens the inline rename input', async () => {
    renderInterface();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    });

    act(() => {
      tapCanvas();
    });

    await waitFor(() => {
      expect(screen.getByTestId('composer-node-rename')).toBeTruthy();
    });
  });

  it('typing a name and pressing Enter commits it to the node quickAdd variable', async () => {
    const { store } = renderInterface();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    });

    act(() => {
      tapCanvas();
    });

    const input = await screen.findByTestId('composer-node-rename');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('composer-node-rename')).toBeNull();
    });

    await waitFor(() => {
      const nodes = store.getState().session.network.nodes;
      expect(nodes).toHaveLength(1);
      const node = nodes[0];
      expect(node?.[entityAttributesProperty]?.[QUICK_ADD_VAR]).toBe('Alice');
    });
  });

  it('blurring the rename input commits the value', async () => {
    const { store } = renderInterface();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    });

    act(() => {
      tapCanvas();
    });

    const input = await screen.findByTestId('composer-node-rename');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Bob' } });
      fireEvent.blur(input);
    });

    await waitFor(() => {
      const nodes = store.getState().session.network.nodes;
      expect(nodes).toHaveLength(1);
      const node = nodes[0];
      expect(node?.[entityAttributesProperty]?.[QUICK_ADD_VAR]).toBe('Bob');
    });
  });

  it('the new node has a layoutVariable position set', async () => {
    const { store } = renderInterface();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /add node/i }));
    });

    act(() => {
      tapCanvas();
    });

    const input = await screen.findByTestId('composer-node-rename');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Carlos' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await waitFor(() => {
      const nodes = store.getState().session.network.nodes;
      expect(nodes).toHaveLength(1);
      const node = nodes[0];
      const pos = node?.[entityAttributesProperty]?.[LAYOUT_VAR] as
        | { x: number; y: number }
        | undefined;
      expect(pos).toBeDefined();
      expect(typeof pos?.x).toBe('number');
      expect(typeof pos?.y).toBe('number');
    });
  });
});
