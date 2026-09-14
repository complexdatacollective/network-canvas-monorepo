import JSZip from 'jszip';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { getAssetById } from './assetUtils';

/**
 * A resource the protocol declares but whose bytes Architect could not read.
 *
 * There is no benign route to this. Assets resolve from IndexedDB and fall
 * back to the in-memory store, so even a private window with no durable
 * storage answers; the editing scope is kept in sync with the active protocol;
 * the blob GC retains everything reachable through undo and redo; and an
 * import that cannot store its assets deletes the library row rather than
 * leaving one behind. Reaching this means one of those broke.
 *
 * So the export fails. It used to omit the asset and its manifest entry and
 * warn — which left the stages that referenced it pointing at nothing, and the
 * schema rejects a dangling asset reference, so the file the researcher was
 * handed as a backup would not open anywhere. A refusal costs them nothing:
 * the protocol is still in the library, exactly as it was.
 */
export class UnresolvedAssetsError extends Error {
  readonly assetNames: string[];

  constructor(assetNames: string[]) {
    super(
      `Protocol assets could not be read for export: ${assetNames.join(', ')}`,
    );
    this.name = 'UnresolvedAssetsError';
    this.assetNames = assetNames;
  }
}

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
//
// Sanitising is many-to-one (`photo 1` and `photo/1` both reduce to `photo_1`),
// so two distinct ids can still produce the same entry name. `usedEntryNames`
// tracks already-assigned names so a collision is disambiguated with a numeric
// suffix (`photo_1.jpg`, `photo_1-1.jpg`) rather than silently overwriting.
const entryNameFor = (
  assetId: string,
  source: string,
  usedEntryNames: Set<string>,
): string => {
  const dot = source.lastIndexOf('.');
  const extension = dot > 0 ? source.slice(dot) : '';
  // `assetId` is a manifest record key, which the schema doesn't constrain to a
  // safe basename, so a crafted id (`../evil`, `a/b`) must not become a
  // path-traversal zip entry. Reduce it to safe characters and collapse `..`.
  const safeStem = assetId
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_');

  let entryName = `${safeStem}${extension}`;
  let suffix = 0;
  while (usedEntryNames.has(entryName)) {
    suffix += 1;
    entryName = `${safeStem}-${suffix}${extension}`;
  }
  usedEntryNames.add(entryName);
  return entryName;
};

const getAllProtocolAssets = async (
  protocol: CurrentProtocol,
  protocolId?: string,
): Promise<ResolvedAsset[]> => {
  const resolved: ResolvedAsset[] = [];
  const unresolved: string[] = [];
  // Guards against two distinct ids sanitising to the same zip entry name.
  const usedEntryNames = new Set<string>();

  if (!protocol.assetManifest) {
    return resolved;
  }

  for (const [assetId, assetDefinition] of Object.entries(
    protocol.assetManifest,
  )) {
    // apikey assets have no file data to bundle (and no `source`).
    if (assetDefinition.type === 'apikey') {
      continue;
    }

    const assetData = await getAssetById(assetId, protocolId);

    if (!assetData) {
      unresolved.push(assetDefinition.name);
      continue;
    }

    // Only apikey assets carry string data, and those are handled above, so any
    // other string-data entry is a stored asset of the wrong shape — as
    // unwritable as one that is missing, and refused on the same terms.
    if (typeof assetData.data === 'string') {
      unresolved.push(assetDefinition.name);
      continue;
    }

    resolved.push({
      id: assetId,
      entryName: entryNameFor(assetId, assetDefinition.source, usedEntryNames),
      data: assetData.data,
    });
  }

  // Collected rather than thrown on the first one, so the researcher is told
  // about every resource they need to restore instead of one per attempt.
  if (unresolved.length > 0) {
    throw new UnresolvedAssetsError(unresolved);
  }

  return resolved;
};

type AssetManifest = NonNullable<CurrentProtocol['assetManifest']>;

// Produce the manifest to write into the exported protocol.json: point each
// resolved asset's `source` at its collision-free zip entry name.
//
// Every file entry is present in `resolved` — `getAllProtocolAssets` refuses
// the export otherwise — so nothing is dropped here and the manifest and the
// zip cannot disagree.
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
    rewritten[assetId] = {
      ...asset,
      source: entryNamesById.get(assetId) ?? asset.source,
    };
  }

  return rewritten;
};

export const bundleProtocol = async (
  protocol: CurrentProtocol,
  protocolId?: string,
): Promise<Blob> => {
  const zip = new JSZip();

  const resolved = protocol.assetManifest
    ? await getAllProtocolAssets(protocol, protocolId)
    : [];

  // The exported protocol.json must stay self-consistent with the zip: rewrite
  // each resolved asset's `source` to its collision-free entry name.
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

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });
};

export async function downloadProtocolAsNetcanvas(
  protocol: CurrentProtocol,
  protocolName?: string,
  protocolId?: string,
): Promise<void> {
  try {
    const blob = await bundleProtocol(protocol, protocolId);

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
  } catch (error) {
    // Passed through rather than wrapped: the caller describes this one to the
    // researcher by naming the resources, and wrapping would hide the type
    // behind a message no dialog should ever show.
    if (error instanceof UnresolvedAssetsError) {
      throw error;
    }
    throw new Error(
      `Failed to download protocol: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  }
}
