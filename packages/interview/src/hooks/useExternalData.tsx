'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import type { Panel, StageSubject } from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';
import type { NcNode } from '@codaco/shared-consts';

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

/** What a read is made from: a change to any of it starts a new read. */
type ReadRequest = {
  dataSource: string;
  subject: StageSubject;
  assetManifest: ReturnType<typeof getAssetManifest>;
  codebook: ReturnType<typeof getCodebook>;
  onRequestAsset: ReturnType<typeof useContractHandlers>['onRequestAsset'];
  captureException: ReturnType<typeof useCaptureException>;
};

const sameRequest = (a: ReadRequest, b: ReadRequest) =>
  a.dataSource === b.dataSource &&
  a.subject === b.subject &&
  a.assetManifest === b.assetManifest &&
  a.codebook === b.codebook &&
  a.onRequestAsset === b.onRequestAsset &&
  a.captureException === b.captureException;

/** A settled read, tagged with the request it settled for. */
type ReadResult = {
  request: ReadRequest;
  externalData: NcNode[] | null;
  status: ExternalDataStatus;
};

const useExternalData = (
  dataSource: Panel['dataSource'],
  subject: StageSubject | null,
) => {
  const assetManifest = useSelector(getAssetManifest);
  const codebook = useSelector(getCodebook);
  const { onRequestAsset } = useContractHandlers();
  const captureException = useCaptureException();

  // Whether there is anything external to read.
  const isExternal =
    !!dataSource &&
    dataSource !== 'existing' &&
    !!subject &&
    subject.entity !== 'ego';

  const unknownAsset =
    isExternal && dataSource && !assetManifest[dataSource] ? dataSource : null;
  const unknownAssetStatus = useMemo<ExternalDataStatus | null>(
    () =>
      unknownAsset === null
        ? null
        : {
            state: 'error',
            error: new Error(`Unknown asset id: ${unknownAsset}`),
          },
    [unknownAsset],
  );

  // The read this render needs, or null when there is nothing external to
  // read.
  const request: ReadRequest | null =
    isExternal && dataSource && subject
      ? {
          dataSource,
          subject,
          assetManifest,
          codebook,
          onRequestAsset,
          captureException,
        }
      : null;

  // The latest settled read. Shown only while it still answers the read this
  // render needs: a result for an earlier source is never reported as the
  // current one, so a new source is loading until its own read settles.
  const [result, setResult] = useState<ReadResult | null>(null);
  let externalData: NcNode[] | null = null;
  let status: ExternalDataStatus = IDLE;
  if (request) {
    if (unknownAssetStatus) {
      status = unknownAssetStatus;
    } else if (result && sameRequest(result.request, request)) {
      ({ externalData, status } = result);
    } else {
      status = LOADING;
    }
  }

  useEffect(() => {
    if (
      !dataSource ||
      dataSource === 'existing' ||
      !subject ||
      subject.entity === 'ego'
    ) {
      return undefined;
    }
    const asset = assetManifest[dataSource];
    if (!asset) return undefined;

    const readRequest: ReadRequest = {
      dataSource,
      subject,
      assetManifest,
      codebook,
      onRequestAsset,
      captureException,
    };
    let cancelled = false;

    void (async () => {
      try {
        const url = await onRequestAsset(asset.assetId);
        // Prefer the original source filename for the CSV-vs-JSON decision; the
        // display `name` may lack an extension on hand-edited protocols.
        const sourceFileName = asset.source ?? asset.name;
        const formatted = await parseExternalNetworkAsset({
          sourceFileName,
          url,
          codebook,
          subject,
        });
        if (!cancelled) {
          setResult({
            request: readRequest,
            externalData: formatted,
            status: { state: 'ready' },
          });
        }
      } catch (e) {
        const error = ensureError(e);
        captureException(error, { feature: 'external-data' });
        // eslint-disable-next-line no-console
        console.error(error);
        if (!cancelled) {
          setResult({
            request: readRequest,
            externalData: null,
            status: { state: 'error', error },
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    dataSource,
    assetManifest,
    codebook,
    subject,
    onRequestAsset,
    captureException,
  ]);

  return { externalData, status };
};

export default useExternalData;
