'use client';

import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ensureError } from '@codaco/shared-consts';

import { useContractHandlers } from '../contract/context';

type AssetUrlState = {
  url: string | null;
  isLoading: boolean;
  error: Error | null;
};

export function useAssetUrl(assetId: string | undefined): AssetUrlState {
  const { onRequestAsset } = useContractHandlers();
  const { data, error, isPending } = useQuery({
    queryKey: ['asset-url', assetId],
    queryFn: assetId
      ? async () => {
          try {
            return await onRequestAsset(assetId);
          } catch (e) {
            throw ensureError(e);
          }
        }
      : skipToken,
  });

  return useMemo(() => {
    if (!assetId) {
      return { url: null, isLoading: false, error: null };
    }
    if (isPending) {
      return { url: null, isLoading: true, error: null };
    }
    return { url: data ?? null, isLoading: false, error };
  }, [assetId, isPending, data, error]);
}
