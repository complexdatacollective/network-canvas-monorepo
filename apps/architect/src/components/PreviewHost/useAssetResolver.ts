import { useCallback, useEffect, useRef } from 'react';

import type { AssetRequestHandler } from '@codaco/interview';
import { assetKey } from '~/utils/assetDB';
import { getAssetById } from '~/utils/assetUtils';

export function useAssetResolver(
  protocolId: string | null,
): AssetRequestHandler {
  const cache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const owned = cache.current;
    return () => {
      for (const url of owned.values()) {
        URL.revokeObjectURL(url);
      }
      owned.clear();
    };
  }, []);

  return useCallback(
    async (assetId: string) => {
      if (!protocolId) {
        throw new Error(`Missing protocol scope for asset ${assetId}`);
      }

      const key = assetKey(protocolId, assetId);
      const cached = cache.current.get(key);
      if (cached) return cached;

      // Mirror the editor's resolver: IndexedDB first, then the in-memory store
      // used when durable storage is unavailable (e.g. Safari private browsing).
      const entry = await getAssetById(assetId, protocolId);
      if (!entry || typeof entry.data === 'string') {
        throw new Error(`Asset ${assetId} not found in local store`);
      }

      const blob =
        entry.data instanceof Blob ? entry.data : new Blob([entry.data]);
      const url = URL.createObjectURL(blob);
      cache.current.set(key, url);
      return url;
    },
    [protocolId],
  );
}
