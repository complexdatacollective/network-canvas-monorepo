import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../contexts/CurrentStepContext';
import protocol from '../../store/modules/protocol';
import session from '../../store/modules/session';
import ui from '../../store/modules/ui';
import StagesMenu from '../StagesMenu';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class StubWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('Worker', StubWorker);
});

describe('StagesMenu route status', () => {
  it('visibly and accessibly distinguishes locally hidden and bypassed screens', () => {
    const store = configureStore({
      reducer: { session, protocol, ui },
      preloadedState: {
        session: {
          id: 'session',
          network: {
            ego: { [entityAttributesProperty]: {} },
            nodes: [],
            edges: [],
          },
        } as never,
        protocol: {
          id: 'protocol',
          hash: 'hash',
          schemaVersion: 8,
          codebook: { node: {}, edge: {}, ego: { variables: {} } },
          stages: [
            {
              id: 'decision',
              type: 'Information',
              label: 'Decision',
              items: [],
            },
            {
              id: 'hidden',
              type: 'Information',
              label: 'Hidden screen',
              items: [],
              skipLogic: {
                action: 'SKIP',
                filter: { join: 'AND', rules: [] },
                destination: { type: 'stage', stageId: 'destination' },
              },
            },
            {
              id: 'bypassed',
              type: 'Information',
              label: 'Bypassed screen',
              items: [],
            },
            {
              id: 'destination',
              type: 'Information',
              label: 'Destination',
              items: [],
            },
          ],
        } as never,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <CurrentStepProvider currentStep={0} onStepChange={vi.fn()}>
          <StagesMenu open onClosed={vi.fn()} onSelect={vi.fn()} />
        </CurrentStepProvider>
      </Provider>,
    );

    expect(
      screen.getByRole('listbox', { name: 'Interview screens' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hidden by answers')).toBeVisible();
    expect(screen.getByText('Outside current path')).toBeVisible();
  });
});
