import { ArrowRight } from 'lucide-react';
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
  /** The stored key this map is drawn with, by the id the stage holds. */
  tokenAssetId: string | undefined;
  /**
   * The basemap the STAGE is configured to show, which is what the framing is
   * being done against. Absent while the researcher has chosen none, and the
   * map is then drawn on Mapbox's own street map, as Architect's was.
   */
  style: string | undefined;
  center: unknown;
  zoom: unknown;
  onSave(center: MapCenter, zoom: number): void;
  /** Whether the dialog is open; false keeps it mounted for the exit. */
  open: boolean;
  /** Called once the dialog has finished animating out. */
  onExitComplete(): void;
  onClose(): void;
}>;

/** Whether the map itself has finished drawing, once there is one to draw. */
type MapStatus = 'loading' | 'ready' | 'error';

/** Mapbox's own street map, which Architect drew a stage with no basemap on. */
const DEFAULT_MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

/**
 * Sets a stage's starting view by panning and zooming a real map.
 *
 * Built exactly as Architect built it and as the interview runtime builds the
 * map the participant will see: the chosen key's own value as the access
 * token, and the basemap the stage is configured to show as the style. The
 * framing is the whole purpose of this dialog, and a view framed on a
 * satellite basemap is a different decision from the same view framed on a
 * street map — so the map has to be the participant's map from the first
 * frame, not a substitute the editor swaps afterwards.
 *
 * The value is read back through `inspect`, which is where a resource says
 * what it is. There is nothing to keep from the editor: every host writes a
 * promoted key into the asset manifest, which is the file the researcher sends
 * to other people, and the runtime reads it from there. It reaches the map
 * constructor and nowhere else — never a log, never the DOM.
 */
export default function MapPreviewDialog({
  tokenAssetId,
  style,
  center,
  zoom,
  onSave,
  open,
  onExitComplete,
  onClose,
}: MapPreviewDialogProps) {
  const intl = useAppIntl();
  const resources = useResourceClient();
  const { busy, failure, retry, run, clear } = useResourceAttempt();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [accessToken, setAccessToken] = useState<string | undefined>(undefined);
  /**
   * Whether the host answered for the key but had no value to give — a stage
   * naming a manifest entry the protocol holds no key in. Told apart from a
   * call that has not come back, which is still loading.
   */
  const [keyUnreadable, setKeyUnreadable] = useState(false);
  const [status, setStatus] = useState<MapStatus>('loading');
  const [viewCenter, setViewCenter] = useState<MapCenter>(() =>
    resolveCenter(center),
  );
  const [viewZoom, setViewZoom] = useState(() => resolveZoom(zoom));
  const chosenStyle = style === '' ? undefined : style;

  useEffect(() => {
    if (tokenAssetId === undefined || tokenAssetId === '') {
      setAccessToken(undefined);
      setKeyUnreadable(false);
      clear();
      return;
    }
    run(
      () => resources.inspect(tokenAssetId),
      (inspection) => {
        setStatus('loading');
        setKeyUnreadable(inspection.value === undefined);
        setAccessToken(inspection.value);
      },
    );
  }, [clear, resources, run, tokenAssetId]);

  useEffect(() => {
    if (container === null || accessToken === undefined) return undefined;

    let disposed = false;
    let map: MapboxMap | null = null;

    try {
      // The key's own value and the stage's own basemap, which is the pair
      // Architect built its map from and the pair the interview runtime builds
      // the participant's map from.
      map = new mapboxgl.Map({
        container,
        style: chosenStyle ?? DEFAULT_MAP_STYLE,
        center: [viewCenter[0], viewCenter[1]],
        zoom: viewZoom,
        accessToken,
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
  }, [accessToken, chosenStyle, container]);

  const missingKey = tokenAssetId === undefined || tokenAssetId === '';
  const moved = hasMapViewChanged(viewCenter, viewZoom, center, zoom);

  return (
    <Dialog
      open={open}
      onExitComplete={onExitComplete}
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
              icon={<ArrowRight aria-hidden="true" />}
              iconPosition="right"
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

        {keyUnreadable && (
          <Alert variant="warning" density="compact">
            <AlertDescription>
              {intl.formatMessage(geospatialMessages.previewUnreadableKey)}
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

        {status === 'error' && accessToken !== undefined && (
          <Alert variant="warning" density="compact">
            <AlertDescription>
              {intl.formatMessage(geospatialMessages.previewLoadFailure)}
            </AlertDescription>
          </Alert>
        )}

        {accessToken !== undefined && (
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
