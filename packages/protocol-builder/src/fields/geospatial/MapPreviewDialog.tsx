import type { Map as MapboxMap } from 'mapbox-gl/esm';
import * as mapboxgl from 'mapbox-gl/esm';
import { useEffect, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { useResourceClient } from '../../resources/client.tsx';
import ResourceFailureNotice from '../../resources/components/ResourceFailureNotice.tsx';
import { useResourceAttempt } from '../../resources/components/useResourceAttempt.ts';
import { geospatialMessages } from './geospatialMessages.ts';
import {
  hasMapViewChanged,
  type MapCenter,
  resolveCenter,
  resolveZoom,
  wrapLongitude,
} from './mapView.ts';

export type MapPreviewDialogProps = Readonly<{
  /** The stored key this map is drawn with. The VALUE never comes here. */
  tokenAssetId: string | undefined;
  center: unknown;
  zoom: unknown;
  onSave(center: MapCenter, zoom: number): void;
  onClose(): void;
}>;

/** Whether the map itself has finished drawing, once there is one to draw. */
type MapStatus = 'loading' | 'ready' | 'error';

/**
 * Sets a stage's starting view by panning and zooming a real map.
 *
 * The key itself never reaches this component and cannot: the contract's
 * resource procedures consume secret material and hand back only an asset id.
 * What a host CAN answer with for that id is the URL a preview renders from —
 * a style it has credentialled on its own side — and that is what the map is
 * built with. A host that will not do that answers `unsupported-kind`, as the
 * package's in-memory host does: the researcher is told the map is unavailable
 * here and sets the same two numbers by hand in the section behind this
 * dialog, which is why those boxes are the control and this is the
 * convenience.
 */
export default function MapPreviewDialog({
  tokenAssetId,
  center,
  zoom,
  onSave,
  onClose,
}: MapPreviewDialogProps) {
  const intl = useAppIntl();
  const resources = useResourceClient();
  const { busy, failure, retry, run, clear } = useResourceAttempt();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [styleUrl, setStyleUrl] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [viewCenter, setViewCenter] = useState<MapCenter>(() =>
    resolveCenter(center),
  );
  const [viewZoom, setViewZoom] = useState(() => resolveZoom(zoom));

  useEffect(() => {
    if (tokenAssetId === undefined || tokenAssetId === '') {
      setStyleUrl(undefined);
      clear();
      return;
    }
    run(
      () => resources.resolvePreview(tokenAssetId),
      (resolved) => {
        setStatus('loading');
        setStyleUrl(resolved.url);
      },
    );
  }, [clear, resources, run, tokenAssetId]);

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
        const moved = map.getCenter();
        // Taken as a place rather than as the map's running count of how far
        // the researcher has panned: see `wrapLongitude`. Wrapped where the
        // map is READ, so the comparison below judges the view the researcher
        // is looking at against the one the stage holds in the same terms — a
        // map panned all the way around to where it started offers nothing to
        // accept, and what "Use this view" writes is a centre the stage can
        // save.
        setViewCenter([wrapLongitude(moved.lng), moved.lat]);
        setViewZoom(map.getZoom());
      });
    } catch {
      map?.remove();
      map = null;
      if (!disposed) setStatus('error');
    }

    return () => {
      disposed = true;
      map?.remove();
    };
    // The view the map OPENS on is seeded once per map. Re-reading it as the
    // map moves would rebuild the map under the researcher's hand on every
    // pan.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [container, styleUrl]);

  const missingKey = tokenAssetId === undefined || tokenAssetId === '';
  const moved = hasMapViewChanged(viewCenter, viewZoom, center, zoom);
  // The one thing that cannot be recovered from here: a host that will never
  // resolve a map for a stored key. Every other failure is transient and the
  // notice below offers its own retry.
  const refusedOutright = failure?.reason === 'unsupported-kind';

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
          {intl.formatMessage(
            refusedOutright
              ? geospatialMessages.previewUnavailable
              : geospatialMessages.previewInstructions,
          )}
        </Paragraph>

        {busy && (
          <output className="sr-only">
            {intl.formatMessage(geospatialMessages.previewLoading)}
          </output>
        )}

        {missingKey && (
          <Alert variant="warning" density="compact">
            <AlertDescription>
              {intl.formatMessage(geospatialMessages.previewMissingKey)}
            </AlertDescription>
          </Alert>
        )}

        {failure !== undefined && (
          <ResourceFailureNotice
            failure={failure}
            onRetry={retry}
            retryLabel={intl.formatMessage(
              geospatialMessages.previewRetryLabel,
            )}
            busy={busy}
          />
        )}

        {status === 'error' && styleUrl !== undefined && (
          <Alert variant="warning" density="compact">
            <AlertDescription>
              {intl.formatMessage(geospatialMessages.previewLoadFailure)}
            </AlertDescription>
          </Alert>
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
