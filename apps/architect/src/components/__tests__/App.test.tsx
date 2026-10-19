import { Toast } from '@base-ui/react/toast';
import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { enqueueLaunchRead } from '~/utils/fileLaunchQueue';

import App from '../ViewManager/views/App';

// Mock window.scrollTo
beforeAll(() => {
  window.scrollTo = vi.fn();
});

// Mock the components that App renders
vi.mock('~/components/Routes', () => ({
  default: () => <div data-testid="routes" />,
}));

const flow = vi.hoisted(() => ({
  confirmLegacyProtocolUpgrade: vi.fn(),
  openNetcanvasFile: vi.fn(),
}));
vi.mock('~/components/protocolOpenFlow', () => flow);

const upgradeRequest = vi.hoisted(() => ({
  current: undefined as string | undefined,
}));
vi.mock('~/utils/urlEntryRequests', () => ({
  takeUpgradeRequest: () => {
    const taken = upgradeRequest.current;
    upgradeRequest.current = undefined;
    return taken;
  },
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

describe('<App />', () => {
  it('renders main app components', () => {
    // `main.tsx` mounts the toast provider above `AppView`; `App` reads it to
    // announce a protocol upgraded on open.
    const { getByTestId } = render(
      <Provider store={mockStore}>
        <Toast.Provider>
          <App />
        </Toast.Provider>
      </Provider>,
    );

    expect(getByTestId('routes')).toBeInTheDocument();
  });

  it('offers the upgrade Architect 8 asked for in the address, once', () => {
    upgradeRequest.current = '0b6c1f8e-6c0e-4d2a-9a51-2f7d3c9e8a10';
    flow.confirmLegacyProtocolUpgrade.mockReset();

    const { rerender } = render(
      <Provider store={mockStore}>
        <Toast.Provider>
          <App />
        </Toast.Provider>
      </Provider>,
    );
    rerender(
      <Provider store={mockStore}>
        <Toast.Provider>
          <App />
        </Toast.Provider>
      </Provider>,
    );

    expect(flow.confirmLegacyProtocolUpgrade).toHaveBeenCalledOnce();
    expect(flow.confirmLegacyProtocolUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({
        legacyId: '0b6c1f8e-6c0e-4d2a-9a51-2f7d3c9e8a10',
      }),
    );
  });

  it('asks for no upgrade when the address did not', () => {
    flow.confirmLegacyProtocolUpgrade.mockReset();

    render(
      <Provider store={mockStore}>
        <Toast.Provider>
          <App />
        </Toast.Provider>
      </Provider>,
    );

    expect(flow.confirmLegacyProtocolUpgrade).not.toHaveBeenCalled();
  });

  it('opens a launched or handed-over file through the shared open flow', async () => {
    flow.openNetcanvasFile.mockReset();
    const file = new File(['zip'], 'handed-over.netcanvas');
    enqueueLaunchRead(() => Promise.resolve(file));

    render(
      <Provider store={mockStore}>
        <Toast.Provider>
          <App />
        </Toast.Provider>
      </Provider>,
    );

    await waitFor(() =>
      expect(flow.openNetcanvasFile).toHaveBeenCalledWith(
        expect.objectContaining({ file }),
      ),
    );
  });
});
