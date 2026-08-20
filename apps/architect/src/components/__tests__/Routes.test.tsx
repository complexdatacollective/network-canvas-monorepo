import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app from '~/ducks/modules/app';
import protocolsReducer, { addProtocol } from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

import Routes from '../Routes';

// Mock wouter
const mockLocation = vi.fn();
const mockNavigate = vi.fn();

type RouteProps = {
  path: string;
  component?: React.ComponentType<Record<string, unknown>>;
  children?: ReactNode;
} & Record<string, unknown>;

vi.mock('wouter', () => ({
  useLocation: () => [mockLocation(), mockNavigate],
  Route: ({ path, component: Component, children }: RouteProps) => {
    const currentPath = mockLocation();
    // Simple path matching for testing
    if (
      path === currentPath ||
      (path === '/protocol' && currentPath.startsWith('/protocol/'))
    ) {
      if (Component) return <Component />;
      return <>{children}</>;
    }
    return null;
  },
  Switch: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// ProtocolRouteGuard sends a protocol route with no protocol home through the
// raw browser-location navigate (not wouter's setter, which would raise the
// leave-editor confirmation over a redirect the user never asked for).
const { mockBrowserNavigate } = vi.hoisted(() => ({
  mockBrowserNavigate: vi.fn(),
}));

vi.mock('wouter/use-browser-location', () => ({
  navigate: mockBrowserNavigate,
}));

// Mock components to avoid complex rendering
vi.mock('~/components/Home/Home', () => ({
  default: () => <div data-testid="home">Home Component</div>,
}));

vi.mock('~/components/Protocol', () => ({
  default: () => <div data-testid="protocol">Protocol Component</div>,
}));

vi.mock('~/components/pages/SummaryPage', () => ({
  default: () => <div data-testid="summary">Summary Component</div>,
}));

// Mock ProjectLayout so children render directly without needing the full nav setup
vi.mock('~/components/ProjectNav/ProjectLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

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

const createTestStore = () =>
  configureStore({
    reducer: combineReducers({
      app,
      protocols: protocolsReducer,
      protocolValidation,
      stageEditorDraft,
      activeProtocol: createTimeline(activeProtocol),
    }),
  });

type TestStore = ReturnType<typeof createTestStore>;

const createWrapper = (store: TestStore) => {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
};

describe('Routes', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createTestStore();
    mockLocation.mockClear();
    mockNavigate.mockClear();
    mockBrowserNavigate.mockClear();
  });

  it('should render Home component on root path', () => {
    mockLocation.mockReturnValue('/');

    render(<Routes />, {
      wrapper: createWrapper(store),
    });

    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('should render Protocol component on protocol path', () => {
    // Add protocol to store
    store.dispatch(
      addProtocol({
        protocol: mockProtocol,
        name: mockProtocolName,
        description: mockProtocolDescription,
      }),
    );
    store.dispatch(setActiveProtocol(mockProtocol));

    mockLocation.mockReturnValue('/protocol');

    render(<Routes />, {
      wrapper: createWrapper(store),
    });

    expect(screen.getByTestId('protocol')).toBeInTheDocument();
    expect(mockBrowserNavigate).not.toHaveBeenCalled();
  });

  // The phantom "Untitled protocol": every reducer under activeProtocol no-ops
  // against a null present, so an editor rendered here accepts input and drops
  // all of it.
  it('renders no protocol route, and leaves for Home, when no protocol is open', () => {
    mockLocation.mockReturnValue('/protocol');

    const { container } = render(<Routes />, {
      wrapper: createWrapper(store),
    });

    expect(screen.queryByTestId('protocol')).not.toBeInTheDocument();
    // Nothing but RouteFocus's always-mounted (and empty) announcement region:
    // a live region has to exist before its content changes to be announced at
    // all, so it is deliberately outside the guard and outside the Switch.
    expect(container.textContent).toBe('');
    expect(
      container.querySelector(':scope > *:not([role="status"])'),
    ).toBeNull();
    expect(mockBrowserNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('should handle invalid protocol routes gracefully', () => {
    store.dispatch(setActiveProtocol(mockProtocol));
    mockLocation.mockReturnValue('/protocol/non-existent-id');

    render(<Routes />, {
      wrapper: createWrapper(store),
    });

    // Should still render the Protocol component, which will handle the missing protocol
    expect(screen.getByTestId('protocol')).toBeInTheDocument();
  });

  it('should handle root path with trailing slash', () => {
    mockLocation.mockReturnValue('/');

    render(<Routes />, {
      wrapper: createWrapper(store),
    });

    expect(screen.getByTestId('home')).toBeInTheDocument();
  });

  it('should handle unknown routes', () => {
    mockLocation.mockReturnValue('/unknown-route');

    render(<Routes />, {
      wrapper: createWrapper(store),
    });

    // Should not render any specific component for unknown routes
    expect(screen.queryByTestId('home')).not.toBeInTheDocument();
    expect(screen.queryByTestId('protocol')).not.toBeInTheDocument();
  });
});
