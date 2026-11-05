import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import createTimeline from '~/ducks/middleware/timeline';
import activeProtocol, {
  setActiveProtocol,
} from '~/ducks/modules/activeProtocol';
import app from '~/ducks/modules/app';
import protocolsReducer, { addProtocol } from '~/ducks/modules/protocols';
import protocolValidation from '~/ducks/modules/protocolValidation';

import { loadProtocolRoutes } from '../protocolRoutesLoader';
import Routes from '../Routes';

// Routes.test.tsx replaces wouter with a mock; an address no route matches is
// only meaningful against wouter's own Switch, so these tests use the real
// router over an in-memory location.

vi.mock('~/components/Home/Home', () => ({
  default: () => <div data-testid="home" />,
}));

vi.mock('~/components/Protocol', () => ({
  default: () => <div data-testid="protocol" />,
}));

vi.mock('~/components/pages/SummaryPage', () => ({
  default: () => <div data-testid="summary-page" />,
}));

vi.mock('~/components/ProjectNav/ProjectLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const protocol: CurrentProtocol = {
  name: 'Test Protocol',
  description: '',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
};

const renderAt = (path: string, { withProtocol = false } = {}) => {
  const store = configureStore({
    reducer: combineReducers({
      app,
      protocols: protocolsReducer,
      protocolValidation,
      activeProtocol: createTimeline(activeProtocol),
    }),
  });
  if (withProtocol) {
    store.dispatch(
      addProtocol({ protocol, name: protocol.name, description: '' }),
    );
    store.dispatch(setActiveProtocol(protocol));
  }

  const location = memoryLocation({ path, record: true });
  render(
    <Provider store={store}>
      <Router hook={location.hook}>
        <Routes />
      </Router>
    </Provider>,
  );
  return location;
};

describe('Routes, at an address no page answers', () => {
  beforeAll(async () => {
    await loadProtocolRoutes();
  }, 60_000);

  // A tab left on a removed page reopened to an empty screen.
  it('replaces the address with the start screen', async () => {
    const location = renderAt('/experiments');

    expect(await screen.findByTestId('home')).toBeInTheDocument();
    expect(location.history).toEqual(['/']);
  });

  it('replaces an unknown editor address with the protocol page', async () => {
    const location = renderAt('/protocol/experiments', { withProtocol: true });

    expect(await screen.findByTestId('protocol')).toBeInTheDocument();
    await waitFor(() => expect(location.history).toEqual(['/protocol']));
  });

  it('leaves an address a page answers alone', async () => {
    const location = renderAt('/protocol/summary', { withProtocol: true });

    expect(await screen.findByTestId('summary-page')).toBeInTheDocument();
    expect(location.history).toEqual(['/protocol/summary']);
  });
});
