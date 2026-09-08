'use client';

import { useEffect, useState } from 'react';
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
 * `idle` is a real state, not a synonym for "loaded nothing": it covers both a
 * source that is not external at all and the render before the effect has
 * started reading one. A caller that cannot tell it apart from `ready` reports
 * an empty roster to the participant on the first frame of every roster stage —
 * which is a statement about their data, and it is false.
 */
export type ExternalDataStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; error: Error };

const IDLE: ExternalDataStatus = { state: 'idle' };

const useExternalData = (
  dataSource: Panel['dataSource'],
  subject: StageSubject | null,
) => {
  const assetManifest = useSelector(getAssetManifest);
  const codebook = useSelector(getCodebook);
  const { onRequestAsset } = useContractHandlers();
  const captureException = useCaptureException();

  const [externalData, setExternalData] = useState<NcNode[] | null>(null);
  const [status, setStatus] = useState<ExternalDataStatus>(IDLE);

  useEffect(() => {
    if (
      !dataSource ||
      dataSource === 'existing' ||
      !subject ||
      subject.entity === 'ego'
    ) {
      // Nothing external to read. Say so rather than leaving whatever the
      // previous source left behind.
      setExternalData(null);
      setStatus((current) => (current.state === 'idle' ? current : IDLE));
      return;
    }

    let cancelled = false;

    setExternalData(null);
    setStatus({ state: 'loading' });

    const asset = assetManifest[dataSource];
    if (!asset) {
      setStatus({
        state: 'error',
        error: new Error(`Unknown asset id: ${dataSource}`),
      });
      return () => {
        cancelled = true;
      };
    }

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
          setExternalData(formatted);
          setStatus({ state: 'ready' });
        }
      } catch (e) {
        const error = ensureError(e);
        captureException(error, { feature: 'external-data' });
        // eslint-disable-next-line no-console
        console.error(error);
        if (!cancelled) setStatus({ state: 'error', error });
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
