import { get } from 'es-toolkit/compat';
import { useContext, useEffect, useMemo, useState } from 'react';

import { getAssetPath, makeGetNetworkAssetVariables } from '~/selectors/assets';
import { getAssetBlobUrl, revokeBlobUrl } from '~/utils/assetUtils';
import { reportError } from '~/utils/reportError';

import SummaryContext from './SummaryContext';

type AssetData = {
  type?: string;
  name?: string;
  source?: string;
  [key: string]: unknown;
};

const useAssetData = (id: string) => {
  const { protocol } = useContext(SummaryContext);

  const data = get(protocol.assetManifest, id) as AssetData | undefined;
  const [variables, setVariables] = useState<string[] | null>(null);
  const [url, setUrl] = useState<string | undefined>(undefined);

  const assetManifest = useMemo(
    () => protocol.assetManifest ?? {},
    [protocol.assetManifest],
  );
  const getNetworkAssetVariables = useMemo(
    () => makeGetNetworkAssetVariables(assetManifest),
    [assetManifest],
  );
  const assetPath = getAssetPath(assetManifest, id);

  useEffect(() => {
    if (!data || data.type !== 'network') {
      return;
    }

    void getNetworkAssetVariables(id).then((v) => {
      if (!v) {
        return;
      }
      setVariables(
        v.map((variable) =>
          typeof variable === 'string' ? variable : variable.label,
        ),
      );
    });
  }, [data, data?.type, getNetworkAssetVariables, id]);

  useEffect(() => {
    let isMounted = true;
    let currentUrl: string | null = null;

    const loadAsset = async () => {
      if (!id) return;

      try {
        const blobUrl = await getAssetBlobUrl(id);

        if (!blobUrl) return;

        // The effect was cleaned up (unmount or id change) while the read was
        // in flight, so no one will render or revoke this URL — revoke it now.
        if (!isMounted) {
          revokeBlobUrl(blobUrl);
          return;
        }

        currentUrl = blobUrl;
        setUrl(blobUrl);
      } catch (error) {
        // The asset can't be shown; report it rather than leaving a blank
        // image with no trace of why.
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
