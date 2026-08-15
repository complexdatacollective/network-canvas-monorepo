import type { ResolvedAsset } from '@codaco/interview';

import {
  getProtocolAsset,
  getProtocolAssets,
  getProtocolByHash,
} from '../db/api';

type CacheEntry = {
  // The import this URL was minted for. `importedAt` is an ISO-8601 UTC
  // timestamp that db/protocols.ts forces strictly upwards on every re-import,
  // so comparing two of them lexicographically compares them chronologically.
  importedAt: string;
  url: string;
  // Whether `url` is an object URL we minted (and therefore must revoke), as
  // opposed to a plain string returned verbatim (apikey / already-a-URL data).
  isObjectUrl: boolean;
};

// Keyed by protocol + asset, never by import, so an asset has exactly one live
// URL at a time and that URL has exactly one owner. The protocol hash
// intentionally ignores `assetManifest`, so re-importing the same protocol with
// updated asset files keeps the same hash; the entry's `importedAt` is what
// distinguishes a superseded URL from the live one.
const urlCache = new Map<string, CacheEntry>();

type InflightRead = {
  promise: Promise<string>;
  // Stops the read publishing a URL for a protocol that was deleted while it
  // was still running.
  cancel: () => void;
};

// De-duplicates concurrent reads. Two callers requesting the same asset before
// either read returns would otherwise both miss the cache and both mint, and
// the second write would orphan the first URL — nothing holds it, so nothing
// ever revokes it. Keyed by import as well, because a re-import must re-read
// the (replaced) row rather than share a read against the old one.
const inflight = new Map<string, InflightRead>();

function cacheKey(protocolHash: string, assetId: string) {
  return `${protocolHash}::${assetId}`;
}

// Install `url` as this asset's single live URL, releasing the older import's
// URL it supersedes. Only ever called for an import at least as new as the
// entry it replaces, so the URL being revoked is one no current resolver will
// hand out again.
function publishUrl(
  key: string,
  importedAt: string,
  url: string,
  isObjectUrl: boolean,
): string {
  const superseded = urlCache.get(key);
  if (superseded?.isObjectUrl) {
    URL.revokeObjectURL(superseded.url);
  }
  urlCache.set(key, { importedAt, url, isObjectUrl });
  return url;
}

// Deleting a protocol strands every URL minted for it: the key can never be
// requested again, so no later write can supersede it, and the object URL —
// holding asset bytes that db/protocols.ts already decrypted — would stay
// resident for the lifetime of the tab. Only the protocol list calls this, and
// only after the delete has committed, so nothing on screen can be showing one
// of these URLs.
export function revokeProtocolAssetUrls(protocolHash: string): void {
  const prefix = `${protocolHash}::`;
  for (const [key, entry] of urlCache) {
    if (!key.startsWith(prefix)) continue;
    if (entry.isObjectUrl) {
      URL.revokeObjectURL(entry.url);
    }
    urlCache.delete(key);
  }
  // A read that is still running would otherwise land afterwards and publish a
  // URL under a key nothing can reach again, so cancel those too.
  for (const [key, read] of inflight) {
    if (!key.startsWith(prefix)) continue;
    read.cancel();
    inflight.delete(key);
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
    const key = cacheKey(protocolHash, assetId);
    const cached = urlCache.get(key);
    // A newer import's URL is the live one for this asset, so serve it rather
    // than minting a second owner (or returning a URL a re-import revoked).
    if (cached && cached.importedAt >= importedAt) return cached.url;

    const readKey = `${key}::${importedAt}`;
    const pending = inflight.get(readKey);
    if (pending) return pending.promise;

    let cancelled = false;
    const request = (async () => {
      const record = await getProtocolAsset(protocolHash, assetId);
      if (!record) {
        throw new Error(
          `Asset "${assetId}" not found for protocol ${protocolHash}`,
        );
      }

      // The protocol was deleted while this read was in flight. Everything from
      // here to the cache write is synchronous, so checking now is enough:
      // don't mint a URL no one can reach.
      if (cancelled) {
        throw new Error(`Asset "${assetId}" is no longer available`);
      }

      // Re-check the cache: a same-or-newer import may have published this
      // asset's URL while the read was in flight. That URL is the live one and
      // already has an owner, so serve it rather than minting a second URL for
      // one asset — and rather than displacing an entry nothing would revoke.
      const live = urlCache.get(key);
      if (live && live.importedAt >= importedAt) return live.url;

      if (typeof record.data === 'string') {
        return publishUrl(key, importedAt, record.data, false);
      }

      // `record.data` is already decrypted at the db boundary (db/protocols.ts
      // decrypts asset rows on read), so this Blob holds plaintext bytes.
      return publishUrl(
        key,
        importedAt,
        URL.createObjectURL(record.data),
        true,
      );
    })();

    // Once the read settles the promise is redundant: a success is in
    // `urlCache`, and a failure must not be replayed to a caller that could
    // retry. Settle through a derived promise that always resolves, so this
    // bookkeeping can never raise an unhandled rejection of its own.
    const forget = () => {
      if (inflight.get(readKey)?.promise === request) {
        inflight.delete(readKey);
      }
    };
    inflight.set(readKey, {
      promise: request,
      cancel: () => {
        cancelled = true;
      },
    });
    void request.then(forget, forget);

    return request;
  };
}
