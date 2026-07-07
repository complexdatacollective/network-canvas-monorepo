import type { ResolvedAsset } from '@codaco/interview';

import {
  getProtocolAsset,
  getProtocolAssets,
  getProtocolByHash,
} from '../db/api';

type CacheEntry = {
  protocolHash: string;
  importedAt: string;
  assetId: string;
  url: string;
  // Whether `url` is an object URL we minted (and therefore must revoke), as
  // opposed to a plain string returned verbatim (apikey / already-a-URL data).
  isObjectUrl: boolean;
};

const urlCache = new Map<string, CacheEntry>();

// The protocol hash intentionally ignores `assetManifest`, so re-importing
// the same protocol with updated asset files keeps the same hash. `importedAt`
// is refreshed on every re-import (see db/protocols.ts), so including it in the
// cache key evicts stale blob URLs.
function cacheKey(protocolHash: string, importedAt: string, assetId: string) {
  return `${protocolHash}::${importedAt}::${assetId}`;
}

// A re-import mints a new key (fresh `importedAt`) rather than overwriting the
// old one, so a superseded object URL would otherwise leak. When caching a new
// entry, revoke any prior object URL for the same protocol+asset from an
// earlier import. The old-`importedAt` key is never requested again by the
// current resolver, so nothing in flight still reads it.
function revokeSupersededObjectUrls(next: CacheEntry) {
  for (const [key, entry] of urlCache) {
    if (
      entry.isObjectUrl &&
      entry.protocolHash === next.protocolHash &&
      entry.assetId === next.assetId &&
      entry.importedAt !== next.importedAt
    ) {
      URL.revokeObjectURL(entry.url);
      urlCache.delete(key);
    }
  }
}

export async function buildResolvedAssets(
  protocolHash: string,
): Promise<ResolvedAsset[]> {
  const [records, protocol] = await Promise.all([
    getProtocolAssets(protocolHash),
    getProtocolByHash(protocolHash),
  ]);
  // The original `source` filename lives in the protocol's asset manifest
  // (apikey assets carry no source). It drives MIME-type and CSV/JSON
  // decisions downstream, where the display `name` may lack an extension.
  const manifest = protocol?.protocol.assetManifest;
  return records.map((r) => {
    const manifestEntry = manifest?.[r.assetId];
    const source =
      manifestEntry && 'source' in manifestEntry
        ? manifestEntry.source
        : undefined;
    return {
      assetId: r.assetId,
      name: r.name,
      type: r.type,
      source,
      value:
        r.type === 'apikey' && typeof r.data === 'string' ? r.data : undefined,
    };
  });
}

export function makeAssetResolver(
  protocolHash: string,
  importedAt: string,
): (assetId: string) => Promise<string> {
  return async (assetId: string) => {
    const key = cacheKey(protocolHash, importedAt, assetId);
    const cached = urlCache.get(key);
    if (cached) return cached.url;

    const record = await getProtocolAsset(protocolHash, assetId);
    if (!record) {
      throw new Error(
        `Asset "${assetId}" not found for protocol ${protocolHash}`,
      );
    }

    if (typeof record.data === 'string') {
      urlCache.set(key, {
        protocolHash,
        importedAt,
        assetId,
        url: record.data,
        isObjectUrl: false,
      });
      return record.data;
    }

    // `record.data` is already decrypted at the db boundary (db/protocols.ts
    // decrypts asset rows on read), so this Blob holds plaintext bytes.
    const url = URL.createObjectURL(record.data);
    const entry: CacheEntry = {
      protocolHash,
      importedAt,
      assetId,
      url,
      isObjectUrl: true,
    };
    revokeSupersededObjectUrls(entry);
    urlCache.set(key, entry);
    return url;
  };
}
