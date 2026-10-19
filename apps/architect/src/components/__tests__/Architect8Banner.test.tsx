import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app, {
  setActiveProtocolId,
  setProtocolLockState,
  setStorageUnavailable,
} from '~/ducks/modules/app';

import Architect8Banner from '../Architect8Banner';

const mocks = vi.hoisted(() => ({
  location: '/protocol',
  isSubpath: true,
  navigate: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('wouter', () => ({
  useLocation: () => [mocks.location, vi.fn()],
}));

vi.mock('~/utils/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return mocks.isSubpath;
  },
}));

vi.mock('~/hooks/useNavigateToArchitect9', () => ({
  useNavigateToArchitect9: () => mocks.navigate,
}));

const PROTOCOL_ID = '3f0c1f7e-8a8e-4f43-9d6a-1d2c3b4a5e6f';

const protocol: CurrentProtocol = {
  name: 'Test Protocol',
  schemaVersion: 8,
  stages: [],
  codebook: {},
};

const createTestStore = () => {
  const store = configureStore({
    reducer: combineReducers({
      app,
      activeProtocol: createTimeline(activeProtocol),
    }),
  });
  store.dispatch(setActiveProtocolId(PROTOCOL_ID));
  store.dispatch(setActiveProtocol(protocol));
  return store;
};

const renderBanner = (store = createTestStore()) =>
  render(
    <Provider store={store}>
      <Architect8Banner />
    </Provider>,
  );

const upgradeButton = () =>
  screen.queryByRole('button', { name: 'Upgrade to schema 9' });

beforeEach(() => {
  mocks.location = '/protocol';
  mocks.isSubpath = true;
  mocks.navigate.mockClear();
});

describe('<Architect8Banner />', () => {
  it('says which Architect this is across the protocol editor', () => {
    renderBanner();

    expect(screen.getByText(/This is Architect 8/)).toBeInTheDocument();
    expect(upgradeButton()).toBeEnabled();
  });

  it('sends the open protocol to Architect 9’s upgrade, as a saved-protocol navigation', () => {
    renderBanner();

    fireEvent.click(upgradeButton() as HTMLElement);

    expect(mocks.navigate).toHaveBeenCalledWith(`/?upgrade=${PROTOCOL_ID}`, {
      requireSavedProtocol: true,
    });
  });

  it('is shown in the stage editor too', () => {
    mocks.location = '/protocol/stage/abc';
    renderBanner();

    expect(upgradeButton()).toBeInTheDocument();
  });

  it('is not shown on the start screen', () => {
    mocks.location = '/';
    renderBanner();

    expect(upgradeButton()).not.toBeInTheDocument();
  });

  it('is not shown by the root build', () => {
    mocks.isSubpath = false;
    renderBanner();

    expect(screen.queryByText(/This is Architect 8/)).not.toBeInTheDocument();
  });

  it('is not shown without a protocol in the editor', () => {
    const store = configureStore({
      reducer: combineReducers({
        app,
        activeProtocol: createTimeline(activeProtocol),
      }),
    });
    renderBanner(store);

    expect(upgradeButton()).not.toBeInTheDocument();
  });

  it.each(['open-elsewhere', 'reclaim-blocked'] as const)(
    'refuses the upgrade while the tab is read-only (%s)',
    (lockState) => {
      const store = createTestStore();
      store.dispatch(setProtocolLockState(lockState));
      renderBanner(store);

      expect(upgradeButton()).toBeDisabled();
      fireEvent.click(upgradeButton() as HTMLElement);
      expect(mocks.navigate).not.toHaveBeenCalled();
    },
  );

  it('refuses the upgrade when the protocol could not be saved to the library', () => {
    const store = createTestStore();
    store.dispatch(setStorageUnavailable(true));
    renderBanner(store);

    expect(upgradeButton()).toBeDisabled();
  });
});
