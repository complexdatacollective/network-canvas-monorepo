import type {
  CurrentProtocol,
  ExtractedAsset,
} from '@codaco/protocol-validation';

import { getActiveProtocolScope } from './activeProtocolScope';
import { assetDb, assetKey, type StoredAsset } from './assetDB';
import {
  getMemoryAsset,
  getMemoryAssetsForScope,
  putMemoryAsset,
} from './inMemoryAssetStore';
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

/**
 * A resource the protocol declares, read at a point where its bytes are
 * required, with nothing stored for it.
 *
 * A distinct type because this is a state the researcher can see and fix — an
 * archive arrived without the file, and Resources offers to add it — not a
 * defect. Callers use it to tell "this resource is missing" apart from "the
 * read failed", and to keep the first out of exception reporting.
 */
export class MissingAssetDataError extends Error {
  readonly assetId: string;

  constructor(assetId: string) {
    super(`No stored file for asset "${assetId}"`);
    this.name = 'MissingAssetDataError';
    this.assetId = assetId;
  }
}

/**
 * Which of a protocol's resources have no stored bytes.
 *
 * Derived on demand rather than recorded on the protocol, because a recorded
 * list is wrong the moment a researcher replaces the file — and the cost of
 * being wrong is either a resource flagged as broken when it is not, or an
 * export allowed when it should be refused. Presence in the store is the same
 * question `getAssetById` asks, so the answer cannot disagree with it.
 *
 * apikey entries carry their value in the manifest and have no bytes to store,
 * so they are never unresolved.
 *
 * Returns manifest keys, which is what stages reference and what the resources
 * list is keyed by.
 */
export const getUnresolvedAssetIds = async (
  assetManifest: CurrentProtocol['assetManifest'],
  protocolId?: string,
): Promise<string[]> => {
  if (!assetManifest) {
    return [];
  }

  const fileAssetIds = Object.entries(assetManifest)
    .filter(([, asset]) => asset.type !== 'apikey')
    .map(([assetId]) => assetId);

  if (fileAssetIds.length === 0) {
    return [];
  }

  const scope = resolveScope(protocolId);
  if (!scope) {
    // No scope means nothing can be read, so every file resource is
    // unresolved. Saying "all of them" is the honest answer and is what stops
    // an export writing a manifest with no files behind it.
    return fileAssetIds;
  }

  const stored = new Set<string>();
  try {
    await assetDb.assets
      .where('protocolId')
      .equals(scope)
      .each((row) => {
        stored.add(row.assetId);
      });
  } catch {
    // IndexedDB unavailable (e.g. private browsing) — the memory store below
    // is the whole answer, exactly as it is in `getAssetById`.
  }
  for (const row of getMemoryAssetsForScope(scope)) {
    stored.add(row.assetId);
  }

  return fileAssetIds.filter((assetId) => !stored.has(assetId));
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
