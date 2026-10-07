import { configureStore } from '@reduxjs/toolkit';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import Network from './Network';

// A roster's column names are the researcher's own, so any of them may look
// like a property path or name a property every object inherits.
const network = vi.hoisted(() => ({
  nodes: [
    {
      attributes: {
        'name': 'Ada',
        'home.city': 'Leeds',
        'tags[0]': 'first',
        'constructor': 'builder',
      },
    },
    {
      attributes: { 'name': 'Grace', 'home.city': 'York', 'tags[0]': 'second' },
    },
  ],
  edges: [],
}));
vi.mock('~/utils/protocols/assetTools', () => ({
  networkReader: vi.fn(async () => network),
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('shows each column its own values, whatever the column is called', async () => {
  const store = configureStore({
    reducer: {
      activeProtocol: () => ({
        present: {
          assetManifest: {
            roster: { type: 'network', name: 'People', source: 'people.csv' },
          },
        },
      }),
    },
  });
  render(
    <Provider store={store}>
      <ArchitectI18nProvider>
        <Network id="roster" />
      </ArchitectI18nProvider>
    </Provider>,
  );

  await screen.findByRole('cell', { name: 'Ada' });
  const columns = screen
    .getAllByRole('columnheader')
    .map((cell) => cell.textContent);
  const table = screen
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      Object.fromEntries(
        within(row)
          .getAllByRole('cell')
          .map((cell, index) => [columns[index], cell.textContent]),
      ),
    );

  expect(table).toEqual([
    {
      'name': 'Ada',
      'home.city': 'Leeds',
      'tags[0]': 'first',
      'constructor': 'builder',
    },
    {
      'name': 'Grace',
      'home.city': 'York',
      'tags[0]': 'second',
      'constructor': '',
    },
  ]);
});
