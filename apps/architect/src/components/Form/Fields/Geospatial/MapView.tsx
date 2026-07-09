import { get } from 'es-toolkit/compat';
import { ArrowRight } from 'lucide-react';
import type { Map as MapboxMap } from 'mapbox-gl/esm';
import * as mapboxgl from 'mapbox-gl/esm';

import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { Layout, Section } from '~/components/EditorLayout';
import { getAssetManifest } from '~/selectors/protocol';

type MapOptions = {
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
  const { tokenAssetId, style } = mapOptions;
  const assetManifest = useSelector(getAssetManifest);
  const mapboxAPIKey = tokenAssetId
    ? get(assetManifest, [tokenAssetId, 'value'], '')
    : '';

  const mapRef = useRef<MapboxMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const [center, setCenter] = useState<[number, number]>(
    (mapOptions.center as [number, number]) || [0, 0],
  );
  const [zoom, setZoom] = useState(mapOptions.initialZoom || 0);
  const saveMapSelection = (newCenter: [number, number], newZoom: number) => {
    onChange({
      ...mapOptions,
      center: newCenter,
      initialZoom: newZoom,
    });
  };

  const isMapChanged =
    center !== mapOptions.center || zoom !== mapOptions.initialZoom;

  useEffect(() => {
    if (!mapboxAPIKey || !mapContainerRef.current || mapRef.current) {
      return;
    }

    let map: MapboxMap | null = null;
    const frame = window.requestAnimationFrame(() => {
      if (!mapContainerRef.current || mapRef.current) {
        return;
      }

      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: style || 'mapbox://styles/mapbox/streets-v12',
        center: (mapOptions.center as [number, number]) || [0, 0],
        zoom: mapOptions.initialZoom || 0,
        accessToken: mapboxAPIKey,
      });

      mapRef.current = map;

      map.addControl(
        new mapboxgl.NavigationControl({
          showCompass: false,
        }),
      );

      map.on('move', () => {
        if (!map) {
          return;
        }
        const mapCenter = map.getCenter();
        const mapZoom = map.getZoom();

        setCenter([mapCenter.lng, mapCenter.lat]);
        setZoom(mapZoom);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      map?.remove();
      mapRef.current = null;
    };
  }, [mapboxAPIKey, style, mapOptions.center, mapOptions.initialZoom]);

  return (
    <Dialog
      open={true}
      closeDialog={close}
      title="Initial Map View"
      footer={
        <>
          <Button color="default" onClick={close}>
            Cancel
          </Button>
          {isMapChanged && (
            <Button
              color="primary"
              onClick={() => {
                saveMapSelection(center, zoom);
                close();
              }}
              iconPosition="right"
              icon={<ArrowRight />}
            >
              Save Changes
            </Button>
          )}
        </>
      }
    >
      <Layout>
        <Section
          title="Set Initial Map View"
          summary={
            <p>
              Pan and zoom the map below to configure the initial view. When the
              map is first loaded, it will be centered at the initial center and
              zoom level as it appears here. Resetting the map will return it to
              this view.
            </p>
          }
          layout="vertical"
        >
          <div ref={mapContainerRef} className="h-[50vh] w-full" />
        </Section>
      </Layout>
    </Dialog>
  );
};

export default MapView;
