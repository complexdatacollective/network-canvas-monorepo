import type { Map as MapboxMap } from 'mapbox-gl/esm';
import * as mapboxgl from 'mapbox-gl/esm';
import { useEffect, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ResourceFailureNotice from '../../resources/components/ResourceFailureNotice.tsx';
import { useResourceGateway } from '../../resources/context.tsx';
import type {
  ResourceGatewayFailure,
  ResourcePreview,
} from '../../resources/gateway.ts';
import { geospatialMessages } from '../../sections/geospatial/geospatialMessages.ts';
import {
  hasMapViewChanged,
  type MapCenter,
  resolveCenter,
  resolveZoom,
} from './mapView.ts';

export type MapPreviewDialogProps = Readonly<{
  /** The stored key this map is drawn with. The VALUE never comes here. */
  tokenAssetId: string | undefined;
  center: unknown;
  zoom: unknown;
  onSave(center: MapCenter, zoom: number): void;
  onClose(): void;
}>;

type MapStatus = 'resolving' | 'loading' | 'ready' | 'error';

/**
 * Sets a stage's starting view by panning and zooming a real map.
 *
 * The key itself never reaches this component, and cannot: the resource
 * gateway consumes secret material and hands back only an asset id. What it
 * will hand back for that id — when the host can serve one — is a preview URL
 * the map is drawn from, with the host adding the credentials on its own side.
 * A host that cannot do that reports `unsupported-kind`, and the researcher is
 * told the map is unavailable and sets the same two numbers by hand in the
 * section behind this dialog. There is no path here that reads, receives, or
 * stores an API key.
 */
export default function MapPreviewDialog({
  tokenAssetId,
  center,
  zoom,
  onSave,
  onClose,
}: MapPreviewDialogProps) {
  const intl = useAppIntl();
  const gateway = useResourceGateway();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [styleUrl, setStyleUrl] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<MapStatus>('resolving');
  const [failure, setFailure] = useState<ResourceGatewayFailure | undefined>(
    undefined,
  );
  const [attempt, setAttempt] = useState(0);
  const [viewCenter, setViewCenter] = useState<MapCenter>(() =>
    resolveCenter(center),
  );
  const [viewZoom, setViewZoom] = useState(() => resolveZoom(zoom));
  const mapRef = useRef<MapboxMap | null>(null);

  useEffect(() => {
    if (tokenAssetId === undefined || tokenAssetId === '') {
      setStyleUrl(undefined);
      setStatus('error');
      setFailure(undefined);
      return undefined;
    }

    let released = false;
    let resolved: ResourcePreview | undefined;
    setStyleUrl(undefined);
    setFailure(undefined);
    setStatus('resolving');

    const resolve = async () => {
      const result = await gateway.resolvePreview(tokenAssetId);
      if (result.status === 'failed') {
        if (released) return;
        setFailure(result.failure);
        setStatus('error');
        return;
      }
      if (released) {
        result.data.release();
        return;
      }
      resolved = result.data;
      setStyleUrl(result.data.url);
      setStatus('loading');
    };

    void resolve();

    return () => {
      released = true;
      resolved?.release();
    };
  }, [attempt, gateway, tokenAssetId]);

  useEffect(() => {
    if (container === null || styleUrl === undefined) return undefined;

    let disposed = false;
    let map: MapboxMap | null = null;

    try {
      // No `accessToken`: the style URL the host resolved is already
      // credentialled on its side, and a token has no way of reaching here.
      map = new mapboxgl.Map({
        container,
        style: styleUrl,
        center: [viewCenter[0], viewCenter[1]],
        zoom: viewZoom,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));
      map.on('load', () => {
        if (disposed) return;
        setStatus((current) => (current === 'error' ? current : 'ready'));
      });
      map.on('error', () => {
        if (disposed) return;
        setStatus('error');
      });
      map.on('move', () => {
        if (map === null || disposed) return;
        const nextCenter = map.getCenter();
        setViewCenter([nextCenter.lng, nextCenter.lat]);
        setViewZoom(map.getZoom());
      });
    } catch {
      map?.remove();
      map = null;
      mapRef.current = null;
      if (!disposed) setStatus('error');
    }

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
    };
    // The view the map OPENS on is seeded once per map. Re-reading it as it
    // moves would rebuild the map under the researcher's hand on every pan.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [container, styleUrl]);

  const moved = hasMapViewChanged(viewCenter, viewZoom, center, zoom);
  const message =
    tokenAssetId === undefined || tokenAssetId === ''
      ? intl.formatMessage(geospatialMessages.previewMissingKey)
      : status === 'error' && failure === undefined
        ? intl.formatMessage(geospatialMessages.previewLoadFailure)
        : undefined;

  return (
    <Dialog
      open
      closeDialog={onClose}
      title={intl.formatMessage(geospatialMessages.viewTitle)}
      size="workspace"
      footer={
        <>
          <Button color="default" onClick={onClose}>
            {intl.formatMessage(commonMessages.cancel)}
          </Button>
          {status === 'ready' && moved && (
            <Button
              color="primary"
              onClick={() => {
                onSave(viewCenter, viewZoom);
                onClose();
              }}
            >
              {intl.formatMessage(geospatialMessages.previewAcceptLabel)}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Paragraph margin="none" emphasis="muted">
          {intl.formatMessage(geospatialMessages.previewInstructions)}
        </Paragraph>

        {status === 'resolving' && (
          <output className="sr-only">
            {intl.formatMessage(geospatialMessages.previewLoading)}
          </output>
        )}

        {message !== undefined && (
          <Alert variant="warning" density="compact">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {failure !== undefined && (
          <ResourceFailureNotice
            failure={failure}
            retryLabel={intl.formatMessage(
              geospatialMessages.previewRetryLabel,
            )}
            onRetry={() => setAttempt((current) => current + 1)}
          />
        )}

        {styleUrl !== undefined && (
          <section
            ref={setContainer}
            aria-label={intl.formatMessage(geospatialMessages.previewMapLabel)}
            aria-busy={status === 'loading'}
            className="h-[50vh] w-full"
          />
        )}
      </div>
    </Dialog>
  );
}
