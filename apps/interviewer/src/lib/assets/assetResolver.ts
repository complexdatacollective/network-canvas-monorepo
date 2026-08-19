// The React-free contract entry, deliberately: this module is imported by the
// protocol list as well as the interview route, and pulling the package's
// component graph in behind it would make every one of those a heavy import.
import {
  createAssetUrlOwner,
  type ResolvedAsset,
} from '@codaco/interview/contract';

import {
  getProtocolAsset,
  getProtocolAssets,
  getProtocolByHash,
} from '../db/api';

// One owner for the whole app, so an asset has exactly one live URL at a time
// and that URL has exactly one owner, no matter which resolver minted it. The
// owner is never closed: this app opens and closes interviews for the lifetime
// of the tab, and only ever releases one protocol at a time (below).
const assetUrls = createAssetUrlOwner();

// Keyed by protocol + asset, never by import. The protocol hash intentionally
// ignores `assetManifest`, so re-importing the same protocol with updated asset
// files keeps the same hash; the import timestamp passed as the request's scope
// is what distinguishes a superseded URL from the live one.
function cacheKey(protocolHash: string, assetId: string) {
  return `${protocolHash}::${assetId}`;
}

/**
 * Deleting a protocol strands every URL minted for it: the key can never be
 * requested again, so no later write can supersede it, and the object URL —
 * holding asset bytes that db/protocols.ts already decrypted — would stay
 * resident for the lifetime of the tab. Only the protocol list calls this, and
 * only after the delete has committed, so nothing on screen can be showing one
 * of these URLs.
 */
export function revokeProtocolAssetUrls(protocolHash: string): void {
  // Releases this protocol's keys and cancels its in-flight reads, leaving
  // every other protocol's URLs — and the owner itself — untouched.
  assetUrls.release(`${protocolHash}::`);
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
  // An ISO-8601 UTC timestamp that db/protocols.ts forces strictly upwards on
  // every re-import, so comparing two of them lexicographically — which is
  // what the owner does with a request's scope — compares them chronologically.
  importedAt: string,
): (assetId: string) => Promise<string> {
  return (assetId: string) =>
    assetUrls.resolve({
      key: cacheKey(protocolHash, assetId),
      scope: importedAt,
      read: async () => {
        const record = await getProtocolAsset(protocolHash, assetId);
        if (!record) {
          throw new Error(
            `Asset "${assetId}" not found for protocol ${protocolHash}`,
          );
        }
        // A string is an apikey (or an already-usable URL) and is passed
        // through un-owned. A Blob is already decrypted at the db boundary
        // (db/protocols.ts decrypts asset rows on read), so the object URL the
        // owner mints from it holds plaintext bytes — which is why releasing
        // the protocol has to revoke it.
        return record.data;
      },
      unavailable: () => new Error(`Asset "${assetId}" is no longer available`),
    });
}
