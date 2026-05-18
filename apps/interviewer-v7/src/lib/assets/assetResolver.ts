import type { ResolvedAsset } from '@codaco/interview';

import { getProtocolAsset, getProtocolAssets } from '../db/api';

const urlCache = new Map<string, string>();

function cacheKey(protocolHash: string, assetId: string) {
  return `${protocolHash}::${assetId}`;
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
): (assetId: string) => Promise<string> {
  return async (assetId: string) => {
    const key = cacheKey(protocolHash, assetId);
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
