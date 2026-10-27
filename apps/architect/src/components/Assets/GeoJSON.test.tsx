import { configureStore } from '@reduxjs/toolkit';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ArchitectI18nProvider } from '~/i18n/ArchitectI18nProvider';

import GeoJSON from './GeoJSON';

// GeoJSON lets a feature have no properties, or null ones. The preview lists
// the properties of the features that have them and skips the rest.
const geoJson = vi.hoisted(() => ({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { region: 'North', code: '01' } },
    { type: 'Feature' },
    { type: 'Feature', properties: null },
    { type: 'Feature', properties: { region: 'South', code: '02' } },
  ],
}));
vi.mock('~/utils/assetUtils', () => ({
  getAssetById: vi.fn(async () => ({
    id: 'areas',
    name: 'areas.geojson',
    data: new Blob([JSON.stringify(geoJson)]),
  })),
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('lists the properties of the features that have them', async () => {
  const store = configureStore({
    reducer: {
      activeProtocol: () => ({
        present: {
          assetManifest: {
            areas: { type: 'geojson', name: 'Areas', source: 'areas.geojson' },
          },
        },
      }),
    },
  });
  render(
    <Provider store={store}>
      <ArchitectI18nProvider>
        <GeoJSON id="areas" />
      </ArchitectI18nProvider>
    </Provider>,
  );

  await screen.findByRole('cell', { name: 'North' });

  expect(
    screen.getAllByRole('columnheader').map((cell) => cell.textContent),
  ).toEqual(['region', 'code']);
  expect(
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent),
  ).toEqual(['North01', 'South02']);
});
