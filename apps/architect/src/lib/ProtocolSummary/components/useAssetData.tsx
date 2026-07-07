import { get } from 'es-toolkit/compat';
import { useContext, useEffect, useState } from 'react';

import type { RootState } from '~/ducks/modules/root';
import { getAssetPath, makeGetNetworkAssetVariables } from '~/selectors/assets';
import { getAssetBlobUrl, revokeBlobUrl } from '~/utils/assetUtils';
import { reportError } from '~/utils/reportError';

import SummaryContext from './SummaryContext';

const stubState = (assetManifest: Record<string, unknown>): RootState =>
  ({
    activeProtocol: { present: { assetManifest } },
  }) as unknown as RootState;

type AssetData = {
  type?: string;
  name?: string;
  source?: string;
  [key: string]: unknown;
};

const useAssetData = (id: string) => {
  const { protocol } = useContext(SummaryContext);

  const data = get(protocol.assetManifest, id) as AssetData | undefined;
  const [variables, setVariables] = useState<string | null>(null);
  const [url, setUrl] = useState<string | undefined>(undefined);

  const stubbedState = stubState(protocol.assetManifest ?? {});
  const getNetworkAssetVariables = makeGetNetworkAssetVariables(stubbedState);
  const assetPath = getAssetPath(stubbedState, id);

  useEffect(() => {
    if (!data || data.type !== 'network') {
      return;
    }

    void getNetworkAssetVariables(id).then((v) => {
      if (!v) {
        return;
      }
      setVariables(v.join(', '));
    });
  }, [data, data?.type, getNetworkAssetVariables, id]);

  useEffect(() => {
    let isMounted = true;
    let currentUrl: string | null = null;

    const loadAsset = async () => {
      if (!id) return;

      try {
        const blobUrl = await getAssetBlobUrl(id);

        if (!isMounted) return;

        if (blobUrl) {
          currentUrl = blobUrl;
          setUrl(blobUrl);
        }
      } catch (error) {
        // The asset can't be shown; report it rather than leaving a blank
        // image with no trace of why.
        console.error('Failed to load asset blob URL', error);
        reportError(error);
      }
    };

    void loadAsset();

    return () => {
      isMounted = false;
      if (currentUrl) {
        revokeBlobUrl(currentUrl);
      }
    };
  }, [id]);

  if (!data) {
    return {};
  }

  return {
    name: data.name,
    type: data.type,
    value: data.value,
    variables,
    assetPath,
    url,
  };
};

export default useAssetData;
