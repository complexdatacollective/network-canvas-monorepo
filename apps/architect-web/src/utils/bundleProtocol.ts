import JSZip from 'jszip';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { getAssetById } from './assetUtils';

// An asset that could not be included in the export (unresolvable scope or a
// stranded manifest entry). Reported back to the caller so it can warn the
// author rather than shipping a broken .netcanvas or aborting the whole export.
type SkippedAsset = {
  id: string;
  name: string;
};

type ResolvedAsset = {
  id: string;
  // Collision-free entry name derived from the asset id (see `entryNameFor`).
  entryName: string;
  data: Blob;
};

// Two uploads can share a filename (`source` is set to `file.name`), so keying
// the zip entry on `source` lets one asset's bytes overwrite another's. Derive a
// unique entry name from the asset id, preserving any extension for downstream
// type sniffing.
const entryNameFor = (assetId: string, source: string): string => {
  const dot = source.lastIndexOf('.');
  const extension = dot > 0 ? source.slice(dot) : '';
  return `${assetId}${extension}`;
};

const getAllProtocolAssets = async (
  protocol: CurrentProtocol,
  protocolId?: string,
): Promise<{ resolved: ResolvedAsset[]; skipped: SkippedAsset[] }> => {
  const resolved: ResolvedAsset[] = [];
  const skipped: SkippedAsset[] = [];

  if (!protocol.assetManifest) {
    return { resolved, skipped };
  }

  for (const [assetId, assetDefinition] of Object.entries(
    protocol.assetManifest,
  )) {
    // apikey assets have no file data to bundle (and no `source`).
    if (assetDefinition.type === 'apikey') {
      continue;
    }

    const assetData = await getAssetById(assetId, protocolId);

    // A missing asset means an unresolvable scope or stranded manifest entry.
    // Skip it (and drop its manifest entry, see `bundleProtocol`) so one broken
    // reference can't block the whole export — the exact scenario the storage-
    // unavailable rescue export exists for.
    if (!assetData) {
      skipped.push({ id: assetId, name: assetDefinition.name });
      continue;
    }

    // Only apikey assets carry string data, and those are handled above; any
    // other string-data entry is anomalous — leave it out of the zip (and so out
    // of the exported manifest) rather than writing an unreadable file.
    if (typeof assetData.data === 'string') {
      continue;
    }

    resolved.push({
      id: assetId,
      entryName: entryNameFor(assetId, assetDefinition.source),
      data: assetData.data,
    });
  }

  return { resolved, skipped };
};

type BundleResult = {
  blob: Blob;
  skippedAssets: SkippedAsset[];
};

type AssetManifest = NonNullable<CurrentProtocol['assetManifest']>;

// Produce the manifest to write into the exported protocol.json: point each
// resolved asset's `source` at its collision-free zip entry name, and omit
// entries whose file couldn't be resolved so the file re-imports cleanly.
const rewriteManifest = (
  manifest: AssetManifest,
  resolved: ResolvedAsset[],
): AssetManifest => {
  const entryNamesById = new Map(resolved.map((r) => [r.id, r.entryName]));
  const rewritten: AssetManifest = {};

  for (const [assetId, asset] of Object.entries(manifest)) {
    if (asset.type === 'apikey') {
      rewritten[assetId] = asset;
      continue;
    }
    const entryName = entryNamesById.get(assetId);
    if (entryName === undefined) {
      continue;
    }
    rewritten[assetId] = { ...asset, source: entryName };
  }

  return rewritten;
};

export const bundleProtocol = async (
  protocol: CurrentProtocol,
  protocolId?: string,
): Promise<BundleResult> => {
  const zip = new JSZip();

  const { resolved, skipped } = protocol.assetManifest
    ? await getAllProtocolAssets(protocol, protocolId)
    : { resolved: [], skipped: [] };

  // The exported protocol.json must stay self-consistent with the zip: rewrite
  // each resolved asset's `source` to its collision-free entry name, and drop
  // manifest entries whose file couldn't be resolved so re-import doesn't fail
  // on a missing asset file.
  const sourceManifest = protocol.assetManifest;
  const exportedProtocol = sourceManifest
    ? { ...protocol, assetManifest: rewriteManifest(sourceManifest, resolved) }
    : protocol;

  zip.file('protocol.json', JSON.stringify(exportedProtocol, null, 2));

  if (resolved.length > 0) {
    const assetsFolder = zip.folder('assets');
    if (assetsFolder) {
      for (const asset of resolved) {
        assetsFolder.file(asset.entryName, asset.data);
      }
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });

  return { blob, skippedAssets: skipped };
};

export async function downloadProtocolAsNetcanvas(
  protocol: CurrentProtocol,
  protocolName?: string,
  protocolId?: string,
): Promise<SkippedAsset[]> {
  try {
    const { blob, skippedAssets } = await bundleProtocol(protocol, protocolId);

    // build local timestamp YYYY-MM-DD_HH-MM
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `${year}-${month}-${day}_${hours}-${minutes}`;

    // Use provided name, or default to "protocol"
    const fileName = `${(protocolName ?? 'protocol').replace(/\s+/g, '_')}-${timestamp}.netcanvas`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return skippedAssets;
  } catch (error) {
    throw new Error(
      `Failed to download protocol: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  }
}
