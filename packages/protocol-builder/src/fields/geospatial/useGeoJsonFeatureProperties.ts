import { Redacted } from 'effect';
import { useCallback, useEffect, useState } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';

import { useResourceClient } from '../../resources/client.tsx';
import { useResourceAttempt } from '../../resources/components/useResourceAttempt.ts';
import { resourceFailureMessages } from '../../resources/resourceMessages.ts';
import {
  resourceFailure,
  resourceOk,
  type ResourceGatewayFailure,
  type ResourceResult,
} from '../../resources/types.ts';
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

const UNREACHABLE = createMessageError(resourceFailureMessages.unreachable);

/**
 * The bytes of one stored resource, in two steps.
 *
 * `preview` is the only thing the contract has that turns an asset id into
 * something a browser can fetch, so reading a file is that URL fetched. The
 * fetch is inside the result contract rather than beside it, so a URL that has
 * expired, or a host that is unreachable, is one failure the control already
 * knows how to show and offer a retry for.
 */
async function readResourceBytes(
  resolve: () => Promise<ResourceResult<Readonly<{ url: Redacted.Redacted }>>>,
): Promise<ResourceResult<Uint8Array>> {
  const resolved = await resolve();
  if (resolved.status !== 'ok') return resolved;
  try {
    const response = await fetch(Redacted.value(resolved.data.url));
    if (!response.ok) {
      return resourceFailure('unavailable', UNREACHABLE, { retryable: true });
    }
    return resourceOk(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return resourceFailure('unavailable', UNREACHABLE, { retryable: true });
  }
}

/**
 * The property names a chosen GeoJSON layer offers.
 *
 * The bytes are asked for rather than the metadata: `inspect` reports content
 * facts only for network rosters, and the one fact a geospatial stage needs
 * about a layer — which properties its features carry — can only be had by
 * reading it.
 */
export function useGeoJsonFeatureProperties(
  resourceId: string | undefined,
): GeoJsonPropertiesState {
  const resources = useResourceClient();
  const { busy, failure, retry, run, clear } = useResourceAttempt();
  // What was read, and which layer it was read from. A layer's properties are
  // only ever shown against that layer, so choosing another drops the previous
  // layer's properties at once, without a reset to wait for.
  const [read, setRead] = useState<
    | Readonly<{
        resourceId: string | undefined;
        names?: readonly string[];
        unreadable: boolean;
      }>
    | undefined
  >(undefined);
  const current = read?.resourceId === resourceId ? read : undefined;
  const names = current?.names;
  const unreadable = current?.unreadable ?? false;

  const load = useCallback(() => {
    if (resourceId === undefined || resourceId === '') {
      clear();
      return;
    }
    run(
      () => readResourceBytes(() => resources.resolvePreview(resourceId)),
      (bytes) => {
        const properties = geoJsonFeatureProperties(bytes);
        setRead(
          properties.unreadable
            ? { resourceId, unreadable: true }
            : { resourceId, names: properties.names, unreadable: false },
        );
      },
    );
  }, [clear, resourceId, resources, run]);

  useEffect(load, [load]);

  return {
    ...(names === undefined ? {} : { names }),
    busy,
    ...(failure === undefined ? {} : { failure }),
    ...(retry === undefined ? {} : { retry }),
    unreadable,
  };
}
