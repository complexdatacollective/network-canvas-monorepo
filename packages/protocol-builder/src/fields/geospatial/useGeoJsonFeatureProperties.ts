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
  const [names, setNames] = useState<readonly string[] | undefined>(undefined);
  const [unreadable, setUnreadable] = useState(false);
  // What the properties were read from. A layer's properties are only ever
  // shown against that layer: choosing another, another client, or leaving the
  // selection and choosing the same layer again, drops what was read before,
  // so a picker never offers the previous layer's properties against the
  // newly chosen one, and a read from before the selection was left does not
  // come back while the new one is pending or after it fails. Adjusted during
  // the render that sees the change, so no frame draws the stale ones.
  const [asked, setAsked] = useState({ resourceId, resources });
  if (asked.resourceId !== resourceId || asked.resources !== resources) {
    setAsked({ resourceId, resources });
    setNames(undefined);
    setUnreadable(false);
  }

  const load = useCallback(() => {
    if (resourceId === undefined || resourceId === '') {
      clear();
      return;
    }
    run(
      () => readResourceBytes(() => resources.resolvePreview(resourceId)),
      (bytes) => {
        const read = geoJsonFeatureProperties(bytes);
        if (read.unreadable) {
          setUnreadable(true);
          return;
        }
        setNames(read.names);
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
