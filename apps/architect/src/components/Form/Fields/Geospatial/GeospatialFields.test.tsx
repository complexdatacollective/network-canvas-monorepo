import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';

vi.mock('~/components/Thumbnail/APIKey', () => ({
  default: ({ id }: { id: string }) => <span>Selected key {id}</span>,
}));

vi.mock('~/components/Thumbnail/GeoJSON', () => ({
  default: ({ id }: { id: string }) => <span>Selected GeoJSON {id}</span>,
}));

vi.mock('./APIKeyBrowser', () => ({
  default: ({
    show,
    onSelect,
  }: {
    show: boolean;
    onSelect: (selection: {
      id: string;
      name: string;
      created: boolean;
    }) => void;
  }) =>
    show ? (
      <button
        type="button"
        onClick={() =>
          onSelect({ id: 'api-key-1', name: 'Mapbox key', created: false })
        }
      >
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

import ArchitectField from '../../ArchitectField';
import GeoAPIKey from './GeoAPIKey';
import GeoDataSource from './GeoDataSource';
import MapSelection, { completeMapView } from './MapSelection';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

let storeApi: StoreApi | null = null;
const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const getFormValues = () => {
  if (!storeApi) throw new Error('form store was not captured');
  return storeApi.getState().getFormValues();
};

describe('geospatial field adapters', () => {
  it('uses shared field groups and persists API-key and map selections', () => {
    storeApi = null;

    render(
      <Form onSubmit={() => ({ success: true })}>
        <CaptureStore />
        <ArchitectField
          name="apiKey"
          label="Mapbox API key"
          component={GeoAPIKey}
          validation={{ required: true }}
        />
        <ArchitectField
          name="map"
          label="Initial map view"
          component={MapSelection}
          validation={{ required: 'Required', completeMapView }}
        />
      </Form>,
    );

    expect(
      screen.getByRole('group', { name: 'Mapbox API key' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Initial map view' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Mapbox API key' }),
    ).toHaveAccessibleDescription(/Required/);
    expect(
      screen.getByRole('group', { name: 'Initial map view' }),
    ).toHaveAccessibleDescription(/Required/);

    fireEvent.click(screen.getByRole('button', { name: 'Select API key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose API key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set map view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save map view' }));

    expect(getFormValues()).toEqual({
      apiKey: 'api-key-1',
      map: { center: [1, 2], initialZoom: 4 },
    });
  });

  it('checks the center of present map options and leaves absence to required', () => {
    expect(completeMapView(undefined)).toBeUndefined();
    expect(completeMapView({ tokenAssetId: 'key' })).toBe('Required');
    expect(completeMapView({ center: [1] })).toBe('Required');
    expect(completeMapView({ center: ['x', 'y'] })).toBe('Required');
    expect(completeMapView({ center: [Number.NaN, 2] })).toBe('Required');
    expect(completeMapView({ center: [1, 2] })).toBeUndefined();
  });

  it('uses the same picker presentation and plus action for API keys and layer data', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <ArchitectField
          name="apiKey"
          label="Mapbox API key"
          component={GeoAPIKey}
          initialValue="api-key-1"
        />
        <ArchitectField
          name="geojson"
          label="Layer data source"
          component={GeoDataSource}
          initialValue="geojson-1"
        />
      </Form>,
    );

    const apiKeyGroup = screen.getByRole('group', {
      name: 'Mapbox API key',
    });
    const layerDataGroup = screen.getByRole('group', {
      name: 'Layer data source',
    });
    expect(apiKeyGroup.className).toBe(layerDataGroup.className);

    for (const name of ['Update API key', 'Update resource']) {
      expect(
        screen
          .getByRole('button', { name })
          .querySelector('svg[aria-hidden="true"]'),
      ).toBeInTheDocument();
    }
  });
});
