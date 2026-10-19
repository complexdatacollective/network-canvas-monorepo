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
    navigate: vi.fn((_url: string | (() => string)) => Promise.resolve(true)),
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
  deferArchitect9Navigation: (url: string) => {
    mocks.pendingNavigation ??= url;
  },
}));

// The URL a navigation would leave for, read as the hook reads it.
const leaveUrl = (call = 0): string | undefined => {
  const url = mocks.navigate.mock.calls[call]?.[0];
  return typeof url === 'function' ? url() : url;
};

// A launch arriving from outside React.
const launch = (url: string) => {
  act(() => {
    mocks.pendingNavigation = url;
    for (const listener of mocks.navigationListeners) listener();
  });
};

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

// The runner reads wouter's browser location. pushState is what wouter's own
// navigation uses, and it notifies wouter's subscribers.
const goTo = (path: string) => {
  act(() => {
    window.history.pushState(null, '', path);
  });
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
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
      expect(mocks.navigate).toHaveBeenCalledTimes(1);
    });
    expect(leaveUrl()).toBe('/?import=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
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

  it('leaves for the newest launch when one arrives while a prompt is open', async () => {
    let answer: (navigated: boolean) => void = () => {};
    mocks.navigate.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    renderApp();

    launch('/?import=first');
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledTimes(1);
    });
    launch('/?import=second');

    // The second launch waits for the first prompt instead of racing it.
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
    expect(leaveUrl()).toBe('/?import=second');
    await act(async () => {
      answer(true);
    });
    expect(mocks.pendingNavigation).toBeNull();
  });

  it('waits for the start screen before carrying out a navigation requested while in the editor', async () => {
    window.history.replaceState(null, '', '/protocol');
    mocks.pendingNavigation = '/?import=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

    renderApp();
    await act(async () => {});
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.pendingNavigation).toBe(
      '/?import=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    );

    goTo('/');

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledTimes(1);
    });
    expect(leaveUrl()).toBe('/?import=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
  });

  it('keeps a launch cancelled in the editor, and replays it only on the start screen', async () => {
    window.history.replaceState(null, '', '/protocol');
    mocks.navigate.mockResolvedValueOnce(false);
    renderApp();

    // A launch arriving in the editor is tried at once; the researcher
    // cancels the leave-editor prompt.
    launch('/?import=launched');
    await waitFor(() => {
      expect(mocks.pendingNavigation).toBe('/?import=launched');
    });
    expect(mocks.navigate).toHaveBeenCalledTimes(1);

    // Moving around the editor does not replay it.
    goTo('/protocol/codebook');
    await act(async () => {});
    expect(mocks.navigate).toHaveBeenCalledTimes(1);

    goTo('/');

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledTimes(2);
    });
    expect(leaveUrl(1)).toBe('/?import=launched');
    expect(mocks.pendingNavigation).toBeNull();
  });

  it('keeps the newest launch when the prompt is cancelled', async () => {
    let answer: (navigated: boolean) => void = () => {};
    mocks.navigate.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    renderApp();

    launch('/?import=first');
    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledTimes(1);
    });
    launch('/?import=second');
    await act(async () => {
      answer(false);
    });

    expect(mocks.pendingNavigation).toBe('/?import=second');
  });
});
