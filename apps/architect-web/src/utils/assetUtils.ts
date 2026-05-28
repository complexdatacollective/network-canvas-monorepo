import type { ExtractedAsset } from '@codaco/protocol-validation';

import { getActiveProtocolScope } from './activeProtocolScope';
import { assetDb, assetKey, type StoredAsset } from './assetDB';

// Resolve the protocol to operate on: an explicit id wins, otherwise fall back
// to the active editing scope. Reads tolerate a missing scope (return empty);
// writes require one.
const resolveScope = (protocolId?: string): string | null =>
  protocolId ?? getActiveProtocolScope();

const toExtractedAsset = (row: StoredAsset): ExtractedAsset => ({
  id: row.assetId,
  name: row.name,
  data: row.data,
});

export const saveAssetToDb = async (
  asset: ExtractedAsset,
  protocolId?: string,
): Promise<void> => {
  const scope = resolveScope(protocolId);
  if (!scope) {
    throw new Error('Cannot save asset: no active protocol scope');
  }
  await assetDb.assets.put({
    id: assetKey(scope, asset.id),
    assetId: asset.id,
    protocolId: scope,
    name: asset.name,
    data: asset.data,
  });
};

export const saveProtocolAssets = async (
  assets: ExtractedAsset[],
  protocolId?: string,
): Promise<void> => {
  const scope = resolveScope(protocolId);
  if (!scope) {
    throw new Error('Cannot save assets: no active protocol scope');
  }

  const assetPromises = assets.map(async (asset) => {
    // Skip apikey assets as they're not actual files
    if (typeof asset.data === 'string') {
      return;
    }

    await saveAssetToDb(asset, scope);
  });

  await Promise.all(assetPromises);
};

export const getAssetById = async (
  assetId: string,
  protocolId?: string,
): Promise<ExtractedAsset | undefined> => {
  const scope = resolveScope(protocolId);
  if (!scope) {
    return undefined;
  }
  const row = await assetDb.assets.get(assetKey(scope, assetId));
  return row ? toExtractedAsset(row) : undefined;
};

export const deleteProtocolAssets = async (
  protocolId: string,
): Promise<void> => {
  await assetDb.assets.where('protocolId').equals(protocolId).delete();
};

const createBlobUrl = (asset: ExtractedAsset): string => {
  if (typeof asset.data === 'string') {
    return asset.data;
  }

  return URL.createObjectURL(asset.data);
};

export const revokeBlobUrl = (url: string): void => {
  URL.revokeObjectURL(url);
};

export const getAssetBlobUrl = async (
  assetId: string,
  protocolId?: string,
): Promise<string | null> => {
  const asset = await getAssetById(assetId, protocolId);
  if (!asset) {
    return null;
  }
  return createBlobUrl(asset);
};
