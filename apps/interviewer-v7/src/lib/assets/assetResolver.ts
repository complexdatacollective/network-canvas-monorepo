import type { ResolvedAsset } from '@codaco/interview';

import { getProtocolAsset, getProtocolAssets } from '../db/api';

const urlCache = new Map<string, string>();

// The protocol hash intentionally ignores `assetManifest`, so re-importing
// the same protocol with updated asset files keeps the same hash. Include
// `importedAt` in the cache key so a re-import evicts stale blob URLs.
function cacheKey(protocolHash: string, importedAt: string, assetId: string) {
  return `${protocolHash}::${importedAt}::${assetId}`;
}

export async function buildResolvedAssets(
  protocolHash: string,
): Promise<ResolvedAsset[]> {
  const records = await getProtocolAssets(protocolHash);
  return records.map((r) => ({
    assetId: r.assetId,
    name: r.name,
    type: r.type,
    value:
      r.type === 'apikey' && typeof r.data === 'string' ? r.data : undefined,
  }));
}

export function makeAssetResolver(
  protocolHash: string,
  importedAt: string,
): (assetId: string) => Promise<string> {
  return async (assetId: string) => {
    const key = cacheKey(protocolHash, importedAt, assetId);
    const cached = urlCache.get(key);
    if (cached) return cached;

    const record = await getProtocolAsset(protocolHash, assetId);
    if (!record) {
      throw new Error(
        `Asset "${assetId}" not found for protocol ${protocolHash}`,
      );
    }

    if (record.type === 'apikey' && typeof record.data === 'string') {
      urlCache.set(key, record.data);
      return record.data;
    }

    if (typeof record.data === 'string') {
      urlCache.set(key, record.data);
      return record.data;
    }

    const url = URL.createObjectURL(record.data);
    urlCache.set(key, url);
    return url;
  };
}

export function clearAssetUrlCache(): void {
  for (const url of urlCache.values()) {
    if (url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  }
  urlCache.clear();
}
