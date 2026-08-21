import {
  type ExtractedAsset,
  getAssetMimeType,
  type VersionedProtocol,
} from '@codaco/protocol-validation';

export type BundledProtocol = {
  // The same shape `extractProtocolFromZip` returns for an imported archive:
  // asserted where the JSON module is loaded, validated by the import flow.
  // Typing it honestly here is what lets the import flow hash the document it
  // was handed rather than the schema's parse of it.
  document: VersionedProtocol;
  assets: ExtractedAsset[];
  name: string;
};

type ManifestEntry = {
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
  const { name, type, source, value: apiKeyValue } = value;
  return (
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
//
// The manifest KEY is the asset's identity — stages reference it, and the
// schema keeps the entry's inline `id` optional (a legacy echo of the key
// that some exports carry and the canonical protocol sources omit) — so the
// key is what lands on ExtractedAsset.id.
export function resolveAssets(
  document: unknown,
  globbed: Record<string, ArrayBuffer>,
): ExtractedAsset[] {
  const bySource = bytesBySource(globbed);
  const manifestEntries = hasAssetManifest(document)
    ? Object.entries(document.assetManifest).filter(
        (pair): pair is [string, ManifestEntry] => isManifestEntry(pair[1]),
      )
    : [];
  const assets: ExtractedAsset[] = [];
  for (const [id, entry] of manifestEntries) {
    if (entry.type === 'apikey') {
      assets.push({
        id,
        name: entry.name,
        data: entry.value ?? '',
      });
      continue;
    }
    if (!entry.source) continue;
    const bytes = bySource.get(entry.source);
    if (!bytes) {
      throw new Error(`Missing bundled asset "${entry.source}" for ${id}`);
    }
    assets.push({
      id,
      name: entry.name,
      data: new Blob([bytes], { type: getAssetMimeType(entry.source) }),
    });
  }
  return assets;
}
