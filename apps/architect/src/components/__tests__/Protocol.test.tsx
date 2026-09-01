import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type * as MotionReact from 'motion/react';
import type { ElementType, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import protocolsReducer, { addProtocol } from '~/ducks/modules/protocols';

import Protocol from '../Protocol';

// Mock Timeline to avoid complex rendering
vi.mock('~/components/Timeline', () => ({
  default: () => <div data-testid="timeline">Timeline Component</div>,
}));

// Mock motion/react to avoid animation issues in tests
type MockMotionProps = Record<string, unknown> & { children?: ReactNode };

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof MotionReact>();
  const renderMotionElement =
    (Component: ElementType) =>
    ({ children, ...props }: MockMotionProps) => (
      <Component {...props}>{children}</Component>
    );

  return {
    ...actual,
    motion: Object.assign({}, actual.motion, {
      create: renderMotionElement,
      div: renderMotionElement('div'),
    }),
    useScroll: () => ({ scrollY: { onChange: vi.fn() } }),
    useReducedMotion: () => false,
  };
});

const mockProtocolName = 'Test Protocol';
const mockProtocolDescription = 'test description';

const mockProtocol: CurrentProtocol = {
  name: mockProtocolName,
  description: mockProtocolDescription,
  schemaVersion: 8,
  stages: [],
  codebook: {
    node: {},
    edge: {},
    ego: {},
  },
  assetManifest: {},
};

const createTestStore = () => {
  return configureStore({
    reducer: {
      protocols: protocolsReducer,
      activeProtocol: (state = { present: null, past: [], future: [] }) =>
        state,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
  });
};

type TestStore = ReturnType<typeof createTestStore>;

const createWrapper = (store: TestStore) => {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
};

describe('Protocol Component', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should render protocol components when protocol is loaded', () => {
    // Add protocol to store
    const protocolWithName = {
      ...mockProtocol,
      name: mockProtocolName,
    };

    store.dispatch(
      addProtocol({
        protocol: mockProtocol,
        name: mockProtocolName,
        description: mockProtocolDescription,
      }),
    );

    // Set as active protocol with name
    store.dispatch({
      type: 'activeProtocol/setActiveProtocol',
      payload: protocolWithName,
    });

    render(<Protocol />, {
      wrapper: createWrapper(store),
    });

    expect(screen.getByTestId('timeline')).toBeInTheDocument();
  });

  it('should handle missing protocol ID', () => {
    render(<Protocol />, {
      wrapper: createWrapper(store),
    });

    // Should still render components even without protocol ID
    expect(screen.getByTestId('timeline')).toBeInTheDocument();
  });

  it('should update when protocol changes', () => {
    // Add protocols to store
    const protocol2 = {
      ...mockProtocol,
      name: 'Protocol 2',
    };

    store.dispatch(
      addProtocol({
        protocol: mockProtocol,
        name: 'Protocol 1',
        description: 'First protocol',
      }),
    );

    store.dispatch(
      addProtocol({
        protocol: protocol2,
        name: 'Protocol 2',
        description: 'Second protocol',
      }),
    );

    // Start with first protocol
    const { rerender } = render(<Protocol />, {
      wrapper: createWrapper(store),
    });

    expect(screen.getByTestId('timeline')).toBeInTheDocument();

    // Switch to second protocol
    rerender(<Protocol />);

    expect(screen.getByTestId('timeline')).toBeInTheDocument();
  });
});
