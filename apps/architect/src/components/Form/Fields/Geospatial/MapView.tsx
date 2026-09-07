import { get } from 'es-toolkit/compat';
import { ArrowRight } from 'lucide-react';
import type { Map as MapboxMap } from 'mapbox-gl/esm';
import * as mapboxgl from 'mapbox-gl/esm';

import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Section from '@codaco/fresco-ui/Section';
import { getAssetManifest } from '~/selectors/protocol';
const messages = defineMessages({
  initialMapView: {
    id: 'architect.form.fields.geospatial.mapView.initialMapView',
    defaultMessage: 'Initial Map View',
    description:
      'The title text in components / Form / Fields / Geospatial / MapView.',
  },
  saveChanges: {
    id: 'architect.form.fields.geospatial.mapView.saveChanges',
    defaultMessage: 'Save Changes',
    description:
      'Visible text in components / Form / Fields / Geospatial / MapView.',
  },
  initialMapViewe0149: {
    id: 'architect.form.fields.geospatial.mapView.initialMapViewe0149',
    defaultMessage: 'Initial map view',
    description:
      'The title text in components / Form / Fields / Geospatial / MapView.',
  },
  panAndZoomTheMapTo: {
    id: 'architect.form.fields.geospatial.mapView.panAndZoomTheMapTo',
    defaultMessage:
      'Pan and zoom the map to set the view participants see when the map first loads or is reset.',
    description:
      'The description text in components / Form / Fields / Geospatial / MapView.',
  },
  loadingMapPreview: {
    id: 'architect.form.fields.geospatial.mapView.loadingMapPreview',
    defaultMessage: 'Loading map preview.',
    description:
      'Visible text in components / Form / Fields / Geospatial / MapView.',
  },
  interactiveMapPreview: {
    id: 'architect.form.fields.geospatial.mapView.interactiveMapPreview',
    defaultMessage: 'Interactive map preview',
    description:
      'The aria-label text in components / Form / Fields / Geospatial / MapView.',
  },
});

export type MapOptions = {
  center?: number[];
  tokenAssetId?: string;
  initialZoom?: number;
  dataSourceAssetId?: string;
  color?: string;
  targetFeatureProperty?: string;
  style?: string;
};
type MapViewProps = {
  mapOptions?: MapOptions;
  onChange: (options: MapOptions) => void;
  close: () => void;
};

const defaultCenter: [number, number] = [0, 0];

const isValidCenter = (center?: number[]): center is [number, number] =>
  Array.isArray(center) &&
  center.length === 2 &&
  center.every(
    (coordinate) =>
      typeof coordinate === 'number' && Number.isFinite(coordinate),
  );

const resolveCenter = (center?: number[]): [number, number] => {
  if (!isValidCenter(center)) {
    return defaultCenter;
  }

  return [center[0], center[1]];
};

const resolveZoom = (zoom?: number) =>
  typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 0;

export const hasMapViewChanged = (
  center: [number, number],
  zoom: number,
  initialOptions: MapOptions,
) => {
  if (!isValidCenter(initialOptions.center)) {
    return true;
  }

  const initialCenter = resolveCenter(initialOptions.center);
  const initialZoom = resolveZoom(initialOptions.initialZoom);

  return (
    center[0] !== initialCenter[0] ||
    center[1] !== initialCenter[1] ||
    zoom !== initialZoom
  );
};

type MapStatus = 'loading' | 'ready' | 'error';

const MapView = ({
  mapOptions = {
    center: [0, 0],
    tokenAssetId: '',
    initialZoom: 0,
    dataSourceAssetId: '',
    color: '',
    targetFeatureProperty: '',
    style: '',
  },
  onChange,
  close,
}: MapViewProps) => {
  const intl = useAppIntl();
  const { tokenAssetId, style } = mapOptions;
  const assetManifest = useSelector(getAssetManifest);
  const mapboxAPIKey = tokenAssetId
    ? get(assetManifest, [tokenAssetId, 'value'], '')
    : '';
  const mapRef = useRef<MapboxMap | null>(null);
  const [mapContainer, setMapContainer] = useState<HTMLElement | null>(null);
  const [center, setCenter] = useState<[number, number]>(() =>
    resolveCenter(mapOptions.center),
  );
  const [zoom, setZoom] = useState(() => resolveZoom(mapOptions.initialZoom));
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const [mapError, setMapError] = useState<keyof typeof failureMessages | null>(
    null,
  );
  const saveMapSelection = (newCenter: [number, number], newZoom: number) => {
    onChange({
      ...mapOptions,
      center: newCenter,
      initialZoom: newZoom,
    });
  };
  const isMapChanged = hasMapViewChanged(center, zoom, mapOptions);

  useEffect(() => {
    if (!mapContainer || mapRef.current) {
      return undefined;
    }

    if (!mapboxAPIKey) {
      setMapError('unavailableKeyMessage');
      setMapStatus('error');
      return undefined;
    }

    setMapError(null);
    setMapStatus('loading');

    let disposed = false;
    let map: MapboxMap | null = null;
    const frame = window.requestAnimationFrame(() => {
      if (disposed || mapRef.current) {
        return;
      }

      try {
        map = new mapboxgl.Map({
          container: mapContainer,
          style: style || 'mapbox://styles/mapbox/streets-v12',
          center: resolveCenter(mapOptions.center),
          zoom: resolveZoom(mapOptions.initialZoom),
          accessToken: mapboxAPIKey,
        });
        mapRef.current = map;
        map.addControl(
          new mapboxgl.NavigationControl({
            showCompass: false,
          }),
        );
        map.on('load', () => {
          if (disposed) return;
          setMapStatus((status) => (status === 'error' ? status : 'ready'));
        });
        map.on('error', () => {
          if (disposed) return;
          setMapError('mapLoadErrorMessage');
          setMapStatus('error');
        });
        map.on('move', () => {
          if (!map || disposed) {
            return;
          }
          const mapCenter = map.getCenter();
          const mapZoom = map.getZoom();
          setCenter([mapCenter.lng, mapCenter.lat]);
          setZoom(mapZoom);
        });
      } catch {
        map?.remove();
        map = null;
        mapRef.current = null;
        if (!disposed) {
          setMapError('mapLoadErrorMessage');
          setMapStatus('error');
        }
      }
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      map?.remove();
      mapRef.current = null;
    };
  }, [
    mapContainer,
    mapboxAPIKey,
    style,
    mapOptions.center,
    mapOptions.initialZoom,
  ]);
  return (
    <Dialog
      open={true}
      closeDialog={close}
      title={intl.formatMessage(messages.initialMapView)}
      size="workspace"
      footer={
        <>
          <Button color="default" onClick={close}>
            {intl.formatMessage(commonMessages.cancel)}
          </Button>
          {isMapChanged && mapStatus === 'ready' && (
            <Button
              color="primary"
              onClick={() => {
                saveMapSelection(center, zoom);
                close();
              }}
              iconPosition="right"
              icon={<ArrowRight />}
            >
              {intl.formatMessage(messages.saveChanges)}
            </Button>
          )}
        </>
      }
    >
      <Section
        title={intl.formatMessage(messages.initialMapViewe0149)}
        description={intl.formatMessage(messages.panAndZoomTheMapTo)}
      >
        {mapStatus === 'loading' && (
          <output className="sr-only">
            {intl.formatMessage(messages.loadingMapPreview)}
          </output>
        )}
        {mapError && (
          <Alert variant="destructive" density="compact">
            <AlertDescription>
              {intl.formatMessage(failureMessages[mapError])}
            </AlertDescription>
          </Alert>
        )}
        <section
          ref={setMapContainer}
          aria-label={intl.formatMessage(messages.interactiveMapPreview)}
          aria-busy={mapStatus === 'loading'}
          className="h-[50vh] w-full"
        />
      </Section>
    </Dialog>
  );
};
export default MapView;

const failureMessages = defineMessages({
  unavailableKeyMessage: {
    id: 'architect.mapView.failure.unavailableKeyMessage',
    defaultMessage:
      'The map preview could not be loaded because its API key is unavailable. Select an API key and try again.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  mapLoadErrorMessage: {
    id: 'architect.mapView.failure.mapLoadErrorMessage',
    defaultMessage:
      'The map preview could not be loaded. Check the API key and map style, then try again.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
