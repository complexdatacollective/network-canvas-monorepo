import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import { actionCreators as protocolActions } from '~/ducks/modules/activeProtocol';
import protocolsReducer from '~/ducks/modules/protocols';
import { rootReducer } from '~/ducks/modules/root';
import {
  protocolShowingUnplacedLayout,
  protocolWithReachableLayouts,
} from '~/templates/__tests__/layoutReadFixtures';

import Protocol from '../Protocol';

vi.mock('~/components/Timeline', () => ({
  default: () => null,
}));

const createTestStore = () =>
  configureStore({
    reducer: {
      protocols: protocolsReducer,
      activeProtocol: (state = { present: null, past: [], future: [] }) =>
        state,
    },
  });

describe('Protocol', () => {
  it('gives the Stages page an h1 that route changes land focus on', () => {
    const store = createTestStore();
    render(<Protocol />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });

    const heading = screen.getByRole('heading', { level: 1, name: 'Stages' });
    expect(heading).toHaveAttribute('data-route-focus-target');
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('warns when a stage shows a layout no stage places its nodes in', () => {
    const renderWith = (
      protocol: ReturnType<typeof protocolWithReachableLayouts>,
    ) => {
      const store = configureStore({
        reducer: rootReducer,
        middleware: (getDefault) =>
          getDefault({ serializableCheck: false, immutableCheck: false }),
      });
      store.dispatch(protocolActions.setActiveProtocol(protocol));
      return render(
        <Provider store={store}>
          <Protocol />
        </Provider>,
      );
    };
    const title = 'No stage places some nodes in a layout';

    const reachable = renderWith(protocolWithReachableLayouts());
    expect(screen.queryByText(title)).not.toBeInTheDocument();
    reachable.unmount();

    renderWith(protocolShowingUnplacedLayout().protocol);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
