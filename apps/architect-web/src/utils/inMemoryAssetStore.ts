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
