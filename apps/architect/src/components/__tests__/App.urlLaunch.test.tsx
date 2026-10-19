import { Toast } from '@base-ui/react/toast';
import { configureStore } from '@reduxjs/toolkit';
import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../ViewManager/views/App';

const mocks = vi.hoisted(() => {
  const navigationListeners = new Set<() => void>();
  return {
    openRequest: null as string | null,
    openLibraryProtocol: vi.fn((args: { id: string }) => ({
      type: 'openLibraryProtocol',
      args,
    })),
    openResult: { status: 'opened' } as unknown,
    showResult: vi.fn(() => Promise.resolve()),
    pendingNavigation: null as string | null,
    navigationListeners,
    navigate: vi.fn(() => Promise.resolve(true)),
  };
});

beforeAll(() => {
  window.scrollTo = vi.fn();
});

vi.mock('~/components/Routes', () => ({
  default: () => <div data-testid="routes" />,
}));

vi.mock('~/utils/urlLaunchRequest', () => ({
  takeUrlOpenRequest: () => {
    const id = mocks.openRequest;
    mocks.openRequest = null;
    return id;
  },
}));

vi.mock('~/ducks/modules/userActions/userActions', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('~/ducks/modules/userActions/userActions')
  >()),
  openLibraryProtocol: mocks.openLibraryProtocol,
}));

vi.mock('~/ducks/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/ducks/hooks')>()),
  useAppDispatch: () => (action: { type: string }) =>
    action.type === 'openLibraryProtocol'
      ? { unwrap: () => Promise.resolve(mocks.openResult) }
      : action,
}));

vi.mock('~/components/protocolOpenDialogs', () => ({
  showProtocolOpenResultDialog: mocks.showResult,
}));

vi.mock('~/utils/architect9Handoff', () => ({
  architect9UpgradeUrl: (id: string) => `/?upgrade=${id}`,
  subscribeArchitect9Navigation: (listener: () => void) => {
    mocks.navigationListeners.add(listener);
    return () => mocks.navigationListeners.delete(listener);
  },
  takeArchitect9Navigation: () => {
    const url = mocks.pendingNavigation;
    mocks.pendingNavigation = null;
    return url;
  },
}));

vi.mock('~/hooks/useNavigateToArchitect9', () => ({
  useNavigateToArchitect9: () => mocks.navigate,
}));

const mockStore = configureStore({
  reducer: {
    app: () => ({}),
    ui: () => ({}),
    protocols: () => ({}),
    activeProtocol: () => ({
      past: [],
      present: null,
      future: [],
      timeline: [],
    }),
    protocolValidation: () => ({
      validationResult: null,
    }),
  },
});

const renderApp = () =>
  render(
    <Provider store={mockStore}>
      <Toast.Provider>
        <App />
      </Toast.Provider>
    </Provider>,
  );

beforeEach(() => {
  mocks.openRequest = null;
  mocks.pendingNavigation = null;
  mocks.openLibraryProtocol.mockClear();
  mocks.showResult.mockClear();
  mocks.navigate.mockClear();
});

describe('<App /> URL entry points', () => {
  it('opens the library row named by ?open= as the library’s Open does', async () => {
    mocks.openRequest = '3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f';
    mocks.openResult = { status: 'error', title: 'Protocol Not Found' };

    renderApp();

    await waitFor(() => {
      expect(mocks.showResult).toHaveBeenCalledTimes(1);
    });
    expect(mocks.openLibraryProtocol).toHaveBeenCalledWith({
      id: '3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f',
    });
    expect(mocks.showResult).toHaveBeenCalledWith(
      expect.objectContaining({ result: mocks.openResult }),
    );
  });

  it('opens nothing without a request', () => {
    renderApp();

    expect(mocks.openLibraryProtocol).not.toHaveBeenCalled();
  });

  it('carries out a navigation to Architect 9 requested before it mounted', async () => {
    mocks.pendingNavigation = '/?import=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

    renderApp();

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith(
        '/?import=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      );
    });
  });

  it('carries out a navigation to Architect 9 requested while mounted', async () => {
    renderApp();
    expect(mocks.navigate).not.toHaveBeenCalled();

    act(() => {
      mocks.pendingNavigation = '/?import=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      for (const listener of mocks.navigationListeners) listener();
    });

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledTimes(1);
    });
  });
});
