'use client';

import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { Panel, ResolvedSubject } from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';

import { useCaptureException } from '../analytics/useTrack';
import { useContractHandlers } from '../contract/context';
import { parseExternalNetworkAsset } from '../contract/rosterData';
import { getAssetManifest, getCodebook } from '../store/modules/protocol';

/**
 * Where the external roster/panel data has got to.
 *
 * `idle` is a real state, not a synonym for "loaded nothing": it means the
 * source is not external at all. An external source reports `loading` from
 * its first render until its read settles. A caller that cannot tell either
 * apart from `ready` reports an empty roster to the participant on the first
 * frame of every roster stage — which is a statement about their data, and it
 * is false.
 */
export type ExternalDataStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; error: Error };

const IDLE: ExternalDataStatus = { state: 'idle' };
const LOADING: ExternalDataStatus = { state: 'loading' };
const READY: ExternalDataStatus = { state: 'ready' };

const useExternalData = (
  dataSource: Panel['dataSource'],
  subject: ResolvedSubject | null,
) => {
  const assetManifest = useSelector(getAssetManifest);
  const codebook = useSelector(getCodebook);
  const { onRequestAsset } = useContractHandlers();
  const captureException = useCaptureException();

  // The asset to read, or null when the source is not external.
  const externalSubject = subject && subject.entity !== 'ego' ? subject : null;
  const source =
    dataSource && dataSource !== 'existing' && externalSubject
      ? dataSource
      : null;
  const asset = source ? assetManifest[source] : undefined;

  // The codebook and asset manifest belong to the protocol, which the query
  // client is already scoped to, so the source and subject identify a read.
  const { data, error, isPending } = useQuery({
    queryKey: ['external-data', source, externalSubject],
    queryFn:
      asset && externalSubject
        ? async () => {
            try {
              const url = await onRequestAsset(asset.assetId);
              // Prefer the original source filename for the CSV-vs-JSON
              // decision; the display `name` may lack an extension on
              // hand-edited protocols.
              return await parseExternalNetworkAsset({
                sourceFileName: asset.source ?? asset.name,
                url,
                codebook,
                subject: externalSubject,
              });
            } catch (e) {
              const readError = ensureError(e);
              captureException(readError, { feature: 'external-data' });
              // eslint-disable-next-line no-console
              console.error(readError);
              throw readError;
            }
          }
        : skipToken,
  });

  const unknownAsset = source !== null && !asset ? source : null;
  const status = useMemo<ExternalDataStatus>(() => {
    if (source === null) return IDLE;
    if (unknownAsset !== null) {
      return {
        state: 'error',
        error: new Error(`Unknown asset id: ${unknownAsset}`),
      };
    }
    if (isPending) return LOADING;
    if (error) return { state: 'error', error };
    return READY;
  }, [source, unknownAsset, isPending, error]);

  return {
    externalData: status.state === 'ready' ? (data ?? null) : null,
    status,
  };
};

export default useExternalData;
