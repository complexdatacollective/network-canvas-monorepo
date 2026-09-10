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
    // Stored against the id it was read for, and matched against the current
    // id below. That is what stops a changed id (or one that resolves to
    // nothing) from rendering the old, now-wrong asset while the new one
    // loads, without a clearing setState that races the read replacing it.
    const [loaded, setLoaded] = useState<{ id: string; url: string }>();

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
          setLoaded({ id, url: blobUrl });
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

    const url = loaded?.id === id ? loaded.url : undefined;

    return <WrappedComponent {...({ ...restProps, url } as unknown as P)} />;
  };

  WithAssetUrlComponent.displayName = `withAssetUrl(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithAssetUrlComponent;
};

export default withAssetUrl;
