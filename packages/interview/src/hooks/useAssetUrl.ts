'use client';

import { useEffect, useMemo, useState } from 'react';

import { useContractHandlers } from '../contract/context';

type AssetUrlState = {
  url: string | null;
  isLoading: boolean;
  error: Error | null;
};

// The resolved value is stored against the asset id it was requested for, so a
// render that has already moved on to a different asset reports "loading"
// without an effect having to reset the state first — and never shows the
// previous asset's URL for a frame.
type ResolvedAsset = {
  assetId: string;
  url: string | null;
  error: Error | null;
};

export function useAssetUrl(assetId: string | undefined): AssetUrlState {
  const { onRequestAsset } = useContractHandlers();
  const [resolved, setResolved] = useState<ResolvedAsset | null>(null);

  useEffect(() => {
    if (!assetId) {
      return;
    }

    let cancelled = false;

    onRequestAsset(assetId)
      .then((url) => {
        if (!cancelled) setResolved({ assetId, url, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setResolved({
            assetId,
            url: null,
            error: err instanceof Error ? err : new Error(String(err)),
          });
      });

    return () => {
      cancelled = true;
    };
  }, [assetId, onRequestAsset]);

  return useMemo(() => {
    if (!assetId) {
      return { url: null, isLoading: false, error: null };
    }
    if (!resolved || resolved.assetId !== assetId) {
      return { url: null, isLoading: true, error: null };
    }
    return { url: resolved.url, isLoading: false, error: resolved.error };
  }, [assetId, resolved]);
}
