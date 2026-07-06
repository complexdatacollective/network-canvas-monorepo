import type React from 'react';
import { useEffect, useState } from 'react';

import { getAssetBlobUrl, revokeBlobUrl } from '~/utils/assetUtils';
import { reportError } from '~/utils/reportError';

type AssetUrlProps = {
  id: string;
};

type WithAssetUrlProps = {
  url?: string;
};

const withAssetUrl = <P extends WithAssetUrlProps>(
  WrappedComponent: React.ComponentType<P>,
) => {
  const WithAssetUrlComponent = (
    props: Omit<P, keyof WithAssetUrlProps> & AssetUrlProps,
  ) => {
    const { id, ...restProps } = props;
    const [url, setUrl] = useState<string | undefined>();

    useEffect(() => {
      let isMounted = true;
      let currentUrl: string | null = null;

      // Clear any previously-shown URL up front so a changed id (or one that
      // resolves to nothing) can't keep rendering the old, now-wrong asset while
      // the new one loads.
      setUrl(undefined);

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
          console.error('Failed to load asset blob URL', error);
          reportError(error);
        }
      };

      loadAsset();

      return () => {
        isMounted = false;
        if (currentUrl) {
          revokeBlobUrl(currentUrl);
        }
      };
    }, [id]);

    return <WrappedComponent {...({ ...restProps, url } as unknown as P)} />;
  };

  WithAssetUrlComponent.displayName = `withAssetUrl(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithAssetUrlComponent;
};

export default withAssetUrl;
