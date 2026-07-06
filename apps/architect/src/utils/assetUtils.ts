import type { ExtractedAsset } from '@codaco/protocol-validation';

import { getActiveProtocolScope } from './activeProtocolScope';
import { assetDb, assetKey, type StoredAsset } from './assetDB';
import { getMemoryAsset, putMemoryAsset } from './inMemoryAssetStore';
import { isStorageUnavailableError } from './storageErrors';

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

const saveAssetToDb = async (
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

// Persist a single asset, falling back to the in-memory store when IndexedDB is
// unavailable (e.g. Safari private browsing). Returns whether the durable write
// succeeded, so callers can flag the protocol as storage-unavailable. Non-storage
// errors are real bugs and are rethrown.
export const saveAssetWithFallback = async (
  asset: ExtractedAsset,
  protocolId?: string,
): Promise<{ persisted: boolean }> => {
  const scope = resolveScope(protocolId);
  if (!scope) {
    throw new Error('Cannot save asset: no active protocol scope');
  }
  try {
    await saveAssetToDb(asset, scope);
    return { persisted: true };
  } catch (error) {
    if (!isStorageUnavailableError(error)) {
      throw error;
    }
    putMemoryAsset(asset, scope);
    return { persisted: false };
  }
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

// Fallback used when IndexedDB writes fail (e.g. Safari private browsing). Keeps
// the protocol's assets in memory so they still render and can be exported this
// session. apikey assets are plain strings, not files, so they're skipped.
export const saveProtocolAssetsToMemory = (
  assets: ExtractedAsset[],
  protocolId: string,
): void => {
  for (const asset of assets) {
    if (typeof asset.data === 'string') {
      continue;
    }
    putMemoryAsset(asset, protocolId);
  }
};

export const getAssetById = async (
  assetId: string,
  protocolId?: string,
): Promise<ExtractedAsset | undefined> => {
  const scope = resolveScope(protocolId);
  if (!scope) {
    return undefined;
  }
  try {
    const row = await assetDb.assets.get(assetKey(scope, assetId));
    if (row) {
      return toExtractedAsset(row);
    }
  } catch {
    // IndexedDB unavailable (e.g. private browsing) — fall back to memory below.
  }
  const memoryRow = getMemoryAsset(scope, assetId);
  return memoryRow ? toExtractedAsset(memoryRow) : undefined;
};

export const deleteProtocolAssets = async (
  protocolId: string,
): Promise<void> => {
  await assetDb.assets.where('protocolId').equals(protocolId).delete();
};

// Remove stored blobs for a protocol that are no longer referenced by its
// manifest. Manifest deletes are timeline-tracked (undoable), so the blob can't
// be dropped at delete time or undo/redo would lose it; instead the durable save
// path calls this to GC blobs that survived a committed delete.
export const deleteOrphanedAssets = async (
  protocolId: string,
  referencedAssetIds: Iterable<string>,
): Promise<void> => {
  const keep = new Set(referencedAssetIds);
  const orphanKeys = await assetDb.assets
    .where('protocolId')
    .equals(protocolId)
    .filter((row) => !keep.has(row.assetId))
    .primaryKeys();
  if (orphanKeys.length > 0) {
    await assetDb.assets.bulkDelete(orphanKeys);
  }
};

export const getProtocolAssetCount = async (
  protocolId: string,
): Promise<number> =>
  assetDb.assets.where('protocolId').equals(protocolId).count();

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
