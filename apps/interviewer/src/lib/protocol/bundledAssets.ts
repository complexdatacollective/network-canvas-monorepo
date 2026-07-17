import {
  type ExtractedAsset,
  getAssetMimeType,
} from '@codaco/protocol-validation';

export type BundledProtocol = {
  document: unknown;
  assets: ExtractedAsset[];
  name: string;
};

type ManifestEntry = {
  id: string;
  name: string;
  source?: string;
  type: string;
  value?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasAssetManifest(
  document: unknown,
): document is { assetManifest: Record<string, unknown> } {
  return (
    isRecord(document) &&
    'assetManifest' in document &&
    isRecord(document.assetManifest)
  );
}

function isManifestEntry(value: unknown): value is ManifestEntry {
  if (!isRecord(value)) return false;
  const { id, name, type, source, value: apiKeyValue } = value;
  return (
    typeof id === 'string' &&
    typeof name === 'string' &&
    typeof type === 'string' &&
    (source === undefined || typeof source === 'string') &&
    (apiKeyValue === undefined || typeof apiKeyValue === 'string')
  );
}

function bytesBySource(
  globbed: Record<string, ArrayBuffer>,
): Map<string, ArrayBuffer> {
  return new Map(
    Object.entries(globbed).map(([path, bytes]) => [
      path.slice(path.lastIndexOf('/') + 1),
      bytes,
    ]),
  );
}

// Resolves a protocol document's assetManifest entries against a glob of
// bundled asset bytes (keyed by file name), used by both the Sample and
// Development bundled-protocol loaders.
export function resolveAssets(
  document: unknown,
  globbed: Record<string, ArrayBuffer>,
): ExtractedAsset[] {
  const bySource = bytesBySource(globbed);
  const manifestEntries = hasAssetManifest(document)
    ? Object.values(document.assetManifest).filter(isManifestEntry)
    : [];
  const assets: ExtractedAsset[] = [];
  for (const entry of manifestEntries) {
    if (entry.type === 'apikey') {
      assets.push({
        id: entry.id,
        name: entry.name,
        data: entry.value ?? '',
      });
      continue;
    }
    if (!entry.source) continue;
    const bytes = bySource.get(entry.source);
    if (!bytes) {
      throw new Error(
        `Missing bundled asset "${entry.source}" for ${entry.id}`,
      );
    }
    assets.push({
      id: entry.id,
      name: entry.name,
      data: new Blob([bytes], { type: getAssetMimeType(entry.source) }),
    });
  }
  return assets;
}
