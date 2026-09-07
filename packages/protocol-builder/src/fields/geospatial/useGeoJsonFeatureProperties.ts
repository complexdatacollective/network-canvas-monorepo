import { useCallback, useEffect, useState } from 'react';

import { useResourceAttempt } from '../../resources/components/useResourceAttempt.ts';
import { useResourceGateway } from '../../resources/context.tsx';
import type { ResourceGatewayFailure } from '../../resources/gateway.ts';
import { geoJsonFeatureProperties } from './geojsonFeatureProperties.ts';

export type GeoJsonPropertiesState = Readonly<{
  /** Absent while loading, when no layer is chosen, and after a failure. */
  names?: readonly string[];
  busy: boolean;
  failure?: ResourceGatewayFailure;
  retry?: () => void;
  /** The bytes came back but are not a GeoJSON document this can read. */
  unreadable: boolean;
}>;

/**
 * The property names a chosen GeoJSON layer offers.
 *
 * The bytes are asked for rather than the metadata: `inspect` reports content
 * facts only for network rosters, and the one fact a geospatial stage needs
 * about a layer — which properties its features carry — can only be had by
 * reading it. That is exactly what `download` is for.
 */
export function useGeoJsonFeatureProperties(
  resourceId: string | undefined,
): GeoJsonPropertiesState {
  const gateway = useResourceGateway();
  const { busy, failure, retry, run, clear } = useResourceAttempt();
  const [names, setNames] = useState<readonly string[] | undefined>(undefined);
  const [unreadable, setUnreadable] = useState(false);

  const load = useCallback(() => {
    // Dropped before the next layer is asked for, so a picker never offers the
    // previous layer's properties against the newly chosen one.
    setNames(undefined);
    setUnreadable(false);
    if (resourceId === undefined) {
      clear();
      return;
    }
    run(
      () => gateway.download(resourceId),
      (content) => {
        const read = geoJsonFeatureProperties(content.bytes);
        if (read.unreadable) {
          setUnreadable(true);
          return;
        }
        setNames(read.names);
      },
    );
  }, [clear, gateway, resourceId, run]);

  useEffect(load, [load]);

  return {
    ...(names === undefined ? {} : { names }),
    busy,
    ...(failure === undefined ? {} : { failure }),
    ...(retry === undefined ? {} : { retry }),
    unreadable,
  };
}
