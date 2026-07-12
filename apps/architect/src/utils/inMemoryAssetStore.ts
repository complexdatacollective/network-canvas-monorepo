import type { ExtractedAsset } from '@codaco/protocol-validation';

import { assetKey, type StoredAsset } from './assetDB';

// Holds protocol assets when IndexedDB is unavailable (e.g. Safari private
// browsing, where the quota is too small for the bundled sample media). Keyed by
// the same compound `${protocolId}::${assetId}` as the durable store. Lives only
// for the session — nothing here survives a reload.
const memoryAssets = new Map<string, StoredAsset>();

export const putMemoryAsset = (asset: ExtractedAsset, scope: string): void => {
  const key = assetKey(scope, asset.id);
  memoryAssets.set(key, {
    id: key,
    assetId: asset.id,
    protocolId: scope,
    name: asset.name,
    data: asset.data,
  });
};

export const getMemoryAsset = (
  scope: string,
  assetId: string,
): StoredAsset | undefined => memoryAssets.get(assetKey(scope, assetId));

// All in-memory assets belonging to a scope. Used to ferry Safari-private
// fallback assets to the preview browsing context, which has its own empty map.
export const getMemoryAssetsForScope = (scope: string): StoredAsset[] =>
  Array.from(memoryAssets.values()).filter((row) => row.protocolId === scope);

// Insert a pre-built StoredAsset directly into this realm's map. Used by the
// preview tab to hydrate assets received (as blobs) over postMessage from the
// editor realm, so cross-realm in-memory assets resolve without re-deriving keys.
export const hydrateMemoryAsset = (asset: StoredAsset): void => {
  memoryAssets.set(assetKey(asset.protocolId, asset.assetId), asset);
};
