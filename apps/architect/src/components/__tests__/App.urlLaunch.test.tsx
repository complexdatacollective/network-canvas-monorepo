import { Toast } from '@base-ui/react/toast';
import { configureStore } from '@reduxjs/toolkit';
import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { isLaunchActivityInProgress } from '~/utils/launchActivity';

import App from '../ViewManager/views/App';

const mocks = vi.hoisted(() => {
  return {
    openRequest: null as string | null,
    openLibraryProtocol: vi.fn((args: { id: string }) => ({
      type: 'openLibraryProtocol',
      args,
    })),
    openResult: { status: 'opened' } as unknown,
    showResult: vi.fn(() => Promise.resolve()),
    // Architect 8 served inside Architect 9, unless a test says otherwise.
    isSubpath: true,
  };
});

vi.mock('~/utils/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return mocks.isSubpath;
  },
}));

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
  window.history.replaceState(null, '', '/');
  mocks.isSubpath = true;
  mocks.openRequest = null;
  mocks.openLibraryProtocol.mockClear();
  mocks.showResult.mockClear();
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

  it('counts the open as launch activity until its dialog closes', async () => {
    let closeDialog: () => void = () => {};
    mocks.showResult.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          closeDialog = resolve;
        }),
    );
    mocks.openRequest = '3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f';
    mocks.openResult = { status: 'error', title: 'Protocol Not Found' };

    renderApp();

    await waitFor(() => {
      expect(mocks.showResult).toHaveBeenCalledTimes(1);
    });
    expect(isLaunchActivityInProgress()).toBe(true);
    await act(async () => {
      closeDialog();
    });
    expect(isLaunchActivityInProgress()).toBe(false);
  });

  it('opens nothing without a request', () => {
    renderApp();

    expect(mocks.openLibraryProtocol).not.toHaveBeenCalled();
  });

  it('opens nothing in standalone Architect 8, which no other app hands protocols to', async () => {
    mocks.isSubpath = false;
    mocks.openRequest = '3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f';

    renderApp();
    await act(async () => {});

    expect(mocks.openLibraryProtocol).not.toHaveBeenCalled();
  });
});
