import { Toast } from '@base-ui/react/toast';
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
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
    stageEditorDraft: () => ({
      ui: { initialValues: null, restoring: false },
      history: { past: [], present: null, future: [] },
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
});
