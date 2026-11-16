import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import protocolsReducer from '~/ducks/modules/protocols';

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
});
