import JSZip from 'jszip';

import {
  type CurrentProtocol,
  type FinishStageTextProblem,
  findFinishStageTextProblems,
} from '@codaco/protocol-validation';

import { getAssetById } from './assetUtils';
import {
  getLegacyAssets,
  type LegacyProtocol,
  type LegacyStoredProtocolRow,
} from './legacyProtocolLibrary';

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

/**
 * The stage that ends the interview has no heading or text in the protocol's
 * default language. Architect lets a protocol be written and saved like this
 * — a new protocol in a language Network Canvas supplies no closing text for
 * starts so — but not handed out: every host refuses to import it, and a
 * participant would finish the interview on an empty screen.
 *
 * Checked here, where every download and export is produced, so no path can
 * hand one out.
 */
export class MissingFinishStageTextError extends Error {
  readonly problem: FinishStageTextProblem;

  constructor(problem: FinishStageTextProblem) {
    super(
      `The finish stage has no ${problem.missing.join(' or ')} in ${problem.locale}`,
    );
    this.name = 'MissingFinishStageTextError';
    this.problem = problem;
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

// The fields of a manifest entry that bundling reads. Every schema's entries
// have them; `apikey` entries carry their value inline and have no `source`.
type BundledManifestEntry = { type: string; name: string; source?: string };

type AssetLookup = (
  assetId: string,
) => Promise<{ data: Blob | string } | undefined>;

const resolveManifestAssets = async (
  manifest: Record<string, BundledManifestEntry>,
  lookup: AssetLookup,
): Promise<ResolvedAsset[]> => {
  const resolved: ResolvedAsset[] = [];
  const unresolved: string[] = [];
  // Guards against two distinct ids sanitising to the same zip entry name.
  const usedEntryNames = new Set<string>();

  for (const [assetId, assetDefinition] of Object.entries(manifest)) {
    // apikey assets have no file data to bundle (and no `source`).
    if (assetDefinition.type === 'apikey') {
      continue;
    }

    const assetData = await lookup(assetId);

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
      entryName: entryNameFor(
        assetId,
        assetDefinition.source ?? '',
        usedEntryNames,
      ),
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

// Produce the manifest to write into the exported protocol.json: point each
// resolved asset's `source` at its collision-free zip entry name.
//
// Every file entry is present in `resolved` — `getAllProtocolAssets` refuses
// the export otherwise — so nothing is dropped here and the manifest and the
// zip cannot disagree.
const rewriteManifest = <Entry extends BundledManifestEntry>(
  manifest: Record<string, Entry>,
  resolved: ResolvedAsset[],
): Record<string, Entry> => {
  const entryNamesById = new Map(resolved.map((r) => [r.id, r.entryName]));
  const rewritten: Record<string, Entry> = {};

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

// Zip a protocol document and the bytes of every file its manifest lists.
const zipProtocol = async <Entry extends BundledManifestEntry>(
  document: object,
  manifest: Record<string, Entry> | undefined,
  lookup: AssetLookup,
): Promise<Blob> => {
  const zip = new JSZip();

  const resolved = manifest
    ? await resolveManifestAssets(manifest, lookup)
    : [];

  // The exported protocol.json must stay self-consistent with the zip: rewrite
  // each resolved asset's `source` to its collision-free entry name.
  const exportedProtocol = manifest
    ? { ...document, assetManifest: rewriteManifest(manifest, resolved) }
    : document;

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

export const bundleProtocol = async (
  protocol: CurrentProtocol,
  protocolId?: string,
): Promise<Blob> => {
  const [finishStageTextProblem] = findFinishStageTextProblems(protocol);
  if (finishStageTextProblem !== undefined) {
    throw new MissingFinishStageTextError(finishStageTextProblem);
  }

  return zipProtocol(protocol, protocol.assetManifest, (assetId) =>
    getAssetById(assetId, protocolId),
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A schema 8 (or older) document is not validated here, so its manifest is
// read defensively: an entry without a name or type cannot be bundled and is
// reported as unresolved rather than written out half-formed.
const readLegacyManifest = (
  protocol: LegacyProtocol,
): Record<string, BundledManifestEntry> | undefined => {
  const manifest: unknown = protocol.assetManifest;
  if (!isRecord(manifest)) return undefined;
  const entries: Record<string, BundledManifestEntry> = {};
  for (const [assetId, entry] of Object.entries(manifest)) {
    const name =
      isRecord(entry) && typeof entry.name === 'string' ? entry.name : assetId;
    if (!isRecord(entry) || typeof entry.type !== 'string') {
      throw new UnresolvedAssetsError([name]);
    }
    entries[assetId] = {
      ...entry,
      type: entry.type,
      name,
      source: typeof entry.source === 'string' ? entry.source : undefined,
    };
  }
  return entries;
};

/**
 * Bundle a protocol from Architect 8's library exactly as it is stored there,
 * with its resources read from that library, into a `.netcanvas` Architect 8
 * (or this app, which offers to upgrade it) can open.
 *
 * No finish-stage text check: that requirement belongs to schema 9, and a
 * schema 8 document has no localization for it to read.
 */
export const bundleLegacyProtocol = async (
  row: LegacyStoredProtocolRow,
): Promise<Blob> => {
  const assets = await getLegacyAssets(row.id);
  const byAssetId = new Map(assets.map((asset) => [asset.assetId, asset]));
  return zipProtocol(
    row.protocol,
    readLegacyManifest(row.protocol),
    (assetId) => Promise.resolve(byAssetId.get(assetId)),
  );
};

// Hand a bundled protocol to the browser as a file download.
const saveNetcanvas = (blob: Blob, protocolName?: string): void => {
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
};

/**
 * Download a protocol from Architect 8's library. Fails with
 * `UnresolvedAssetsError` when a resource cannot be read, like any download.
 */
export const downloadLegacyProtocolAsNetcanvas = async (
  row: LegacyStoredProtocolRow,
): Promise<void> => {
  saveNetcanvas(await bundleLegacyProtocol(row), row.name);
};

export async function downloadProtocolAsNetcanvas(
  protocol: CurrentProtocol,
  protocolName?: string,
  protocolId?: string,
): Promise<void> {
  try {
    saveNetcanvas(await bundleProtocol(protocol, protocolId), protocolName);
  } catch (error) {
    // Passed through rather than wrapped: the caller describes these to the
    // researcher by naming what is missing, and wrapping would hide the type
    // behind a message no dialog should ever show.
    if (
      error instanceof UnresolvedAssetsError ||
      error instanceof MissingFinishStageTextError
    ) {
      throw error;
    }
    throw new Error(
      `Failed to download protocol: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  }
}
