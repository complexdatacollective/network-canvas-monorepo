import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildMapboxToken } from '~/templates/__tests__/buildMapboxToken';
import {
  RETIRED_MAPBOX_TOKEN_IDS,
  TESTING_MAPBOX_TOKEN,
} from '~/templates/testingMapboxToken';

import TestingMapboxTokenAlert from '../TestingMapboxTokenAlert';

// Same store shape as `VariableRoleConflictsAlert.test.tsx`: the selectors
// behind this banner read only `activeProtocol.present.assetManifest`.
const apiKey = (id: string, value: string) => ({
  id,
  type: 'apikey',
  name: `Mapbox token ${id}`,
  value,
});

const protocolWith = (assetManifest: Record<string, unknown>) => ({
  name: 'Test protocol',
  stages: [],
  codebook: {},
  assetManifest,
});

const createTestStore = (present: unknown) =>
  configureStore({
    reducer: {
      activeProtocol: (state = { present }) => state,
    },
  });

type TestStore = ReturnType<typeof createTestStore>;

const wrap = (store: TestStore) => {
  return ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
};

const renderWith = (assetManifest: Record<string, unknown>) =>
  render(<TestingMapboxTokenAlert />, {
    wrapper: wrap(createTestStore(protocolWith(assetManifest))),
  });

// Rebuilt at runtime from its id: the revoked token itself is never written
// into the repository.
const RETIRED_TOKEN = buildMapboxToken(RETIRED_MAPBOX_TOKEN_IDS[0]);
const HELP_BUTTON = { name: 'How to get a Mapbox token' };
const REVOKED_HEADING = { name: 'Revoked Mapbox testing token' };

describe('<TestingMapboxTokenAlert />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when the protocol carries no Network Canvas testing token', () => {
    const { container } = renderWith({
      own: apiKey('own', buildMapboxToken('cmsomeoneelsestoken00000')),
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('reminds, as a polite status, when the protocol carries the current testing token', () => {
    renderWith({ testing: apiKey('testing', TESTING_MAPBOX_TOKEN) });

    // `warning` renders role="status": a reminder, not an interruption.
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Using a testing Mapbox token');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', REVOKED_HEADING),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', HELP_BUTTON)).toBeInTheDocument();
  });

  it('errors, as an assertive alert, when the protocol carries a retired testing token', () => {
    renderWith({ old: apiKey('old', RETIRED_TOKEN) });

    // `destructive` renders role="alert": the map is broken right now.
    const alert = screen.getByRole('alert');
    expect(screen.getByRole('heading', REVOKED_HEADING)).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      'This protocol uses a retired Network Canvas Mapbox testing token. It was revoked on 2 September 2026, so maps in Geospatial stages will not load. Replace it with your own token in the Resource Library.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', HELP_BUTTON)).toBeInTheDocument();
  });

  it('shows only the revoked banner when the protocol carries both tokens', () => {
    renderWith({
      old: apiKey('old', RETIRED_TOKEN),
      testing: apiKey('testing', TESTING_MAPBOX_TOKEN),
    });

    expect(screen.getByRole('heading', REVOKED_HEADING)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Using a testing Mapbox token'),
    ).not.toBeInTheDocument();
    // One banner, one button.
    expect(screen.getAllByRole('button', HELP_BUTTON)).toHaveLength(1);
  });

  it('keeps the Mapbox help link working from the revoked banner', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderWith({ old: apiKey('old', RETIRED_TOKEN) });

    fireEvent.click(screen.getByRole('button', HELP_BUTTON));

    expect(open).toHaveBeenCalledWith(
      'https://docs.mapbox.com/help/getting-started/access-tokens/',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
