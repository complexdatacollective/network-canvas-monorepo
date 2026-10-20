import { Toast } from '@base-ui/react/toast';
import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

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
  openNetcanvasFile: vi.fn(),
}));
vi.mock('~/components/protocolOpenFlow', () => flow);

const launched = vi.hoisted(() => ({ files: [] as File[] }));
vi.mock('~/utils/fileLaunchQueue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/fileLaunchQueue')>()),
  takeLaunchFiles: () => launched.files.splice(0),
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

  it('opens a launched file through the shared open flow', async () => {
    flow.openNetcanvasFile.mockReset();
    const file = new File(['zip'], 'launched.netcanvas');
    launched.files.push(file);

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
