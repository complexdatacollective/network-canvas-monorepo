import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { Field, reducer as formReducer, reduxForm } from 'redux-form';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/Thumbnail/APIKey', () => ({
  default: ({ id }: { id: string }) => <span>Selected key {id}</span>,
}));

vi.mock('./APIKeyBrowser', () => ({
  default: ({
    show,
    onSelect,
  }: {
    show: boolean;
    onSelect: (id: string) => void;
  }) =>
    show ? (
      <button type="button" onClick={() => onSelect('api-key-1')}>
        Choose API key
      </button>
    ) : null,
}));

vi.mock('./MapView', () => ({
  default: ({
    onChange,
    close,
  }: {
    onChange: (value: { center: number[]; initialZoom: number }) => void;
    close: () => void;
  }) => (
    <div role="dialog" aria-label="Map editor">
      <button
        type="button"
        onClick={() => {
          onChange({ center: [1, 2], initialZoom: 4 });
          close();
        }}
      >
        Save map view
      </button>
    </div>
  ),
}));

import GeoAPIKey from './GeoAPIKey';
import MapSelection, { requiredMapView } from './MapSelection';

type FormValues = {
  apiKey?: string;
  map?: { center?: number[]; initialZoom?: number };
};

const Harness = reduxForm<FormValues>({ form: 'geospatial-fields-test' })(
  () => (
    <>
      <Field
        name="apiKey"
        component={GeoAPIKey}
        label="Mapbox API key"
        required
      />
      <Field
        name="map"
        component={MapSelection}
        label="Initial map view"
        required
      />
    </>
  ),
);

describe('geospatial field adapters', () => {
  it('uses shared field groups and persists API-key and map selections', () => {
    const store = configureStore({
      reducer: { form: formReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    render(
      <Provider store={store}>
        <Harness />
      </Provider>,
    );

    expect(
      screen.getByRole('group', { name: 'Mapbox API key' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Initial map view' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Mapbox API key' }),
    ).toHaveAccessibleDescription('Required');
    expect(
      screen.getByRole('group', { name: 'Initial map view' }),
    ).toHaveAccessibleDescription('Required');

    fireEvent.click(screen.getByRole('button', { name: 'Select API key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose API key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set map view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save map view' }));

    expect(store.getState().form['geospatial-fields-test']?.values).toEqual({
      apiKey: 'api-key-1',
      map: { center: [1, 2], initialZoom: 4 },
    });
  });

  it('requires a complete center rather than any truthy map-options object', () => {
    expect(requiredMapView(undefined)).toBe('Required');
    expect(requiredMapView({ tokenAssetId: 'key' })).toBe('Required');
    expect(requiredMapView({ center: [1] })).toBe('Required');
    expect(requiredMapView({ center: ['x', 'y'] })).toBe('Required');
    expect(requiredMapView({ center: [Number.NaN, 2] })).toBe('Required');
    expect(requiredMapView({ center: [1, 2] })).toBeUndefined();
  });
});
