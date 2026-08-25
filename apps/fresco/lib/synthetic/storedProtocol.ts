import { isValidAssetType } from '@codaco/interview/contract';
import {
  type CurrentProtocol,
  CurrentProtocolSchema,
  formatProtocolValidationIssues,
} from '@codaco/protocol-validation';

/**
 * A protocol's asset as Fresco stores one. `assetId` is the key the protocol's
 * asset manifest used, `name` is the manifest entry's `source` for a file asset
 * and its `name` for an apikey (see `utils/protocolImport`), and `url` points at
 * the stored object (empty for an apikey, which carries its `value` instead).
 */
export type StoredProtocolAsset = {
  assetId: string;
  name: string;
  type: string;
  url: string;
  value: string | null;
};

/**
 * The stored columns a protocol document is rebuilt from — the shape
 * `prisma.protocol.findUnique({ include: { assets: true } })` returns, narrowed
 * to what generation reads.
 */
export type StoredProtocolRecord = {
  name: string;
  description: string | null;
  lastModified: Date;
  stages: CurrentProtocol['stages'];
  codebook: CurrentProtocol['codebook'];
  experiments: CurrentProtocol['experiments'];
  assets: StoredProtocolAsset[];
};

type AssetManifest = NonNullable<CurrentProtocol['assetManifest']>;

/**
 * Rebuild the protocol's asset manifest from the rows the assets were split
 * into on import.
 *
 * Fresco stores a protocol's assets in their own table rather than as a
 * manifest on the document, so the manifest has to be reassembled before the
 * document can be parsed: the schema's cross-reference checks resolve a roster
 * `dataSource`, a Geospatial map, a canvas background and a pedigree intro item
 * through it, and a document without it fails validation for every protocol
 * that uses an asset at all.
 *
 * The inverse of `extractApikeyAssetsFromManifest`/`fetchFileAssetsFromProtocol`
 * in `utils/protocolImport`: the row's `assetId` is the manifest key, and the
 * row's `name` is the file asset's `source` (which is what that import wrote
 * there). An asset whose stored type is not one the schema knows, or an apikey
 * with no value, is left out rather than guessed at — a stage that references
 * it then fails validation naming that stage, which is the actionable answer.
 */
function buildAssetManifest(
  assets: readonly StoredProtocolAsset[],
): AssetManifest {
  const manifest: AssetManifest = {};

  for (const asset of assets) {
    if (!isValidAssetType(asset.type)) continue;

    if (asset.type === 'apikey') {
      if (!asset.value) continue;
      manifest[asset.assetId] = {
        id: asset.assetId,
        name: asset.name,
        type: 'apikey',
        value: asset.value,
      };
      continue;
    }

    manifest[asset.assetId] = {
      id: asset.assetId,
      name: asset.name,
      type: asset.type,
      source: asset.name,
    };
  }

  return manifest;
}

export type StoredProtocolParseResult =
  | { success: true; protocol: CurrentProtocol }
  | { success: false; message: string };

/**
 * Reassemble a stored protocol into a document and parse it through the current
 * protocol schema.
 *
 * The parse is the generation boundary, not a formality. `generateInterviews`
 * requires schema-parse output — every stage's `synthetic` descriptor exists
 * because parsing put it there, and the engine refuses rather than re-defaulting
 * — and Fresco holds `stages` and `codebook` as separate columns, so the whole
 * document (manifest included) has to be put back together to be parsed at all.
 *
 * Parsed asynchronously because that is how the rest of the app validates a
 * protocol (`validateAndMigrateProtocol` → `validateProtocol`), keeping one
 * answer for whether a document is admissible.
 */
export async function parseStoredProtocol(
  record: StoredProtocolRecord,
): Promise<StoredProtocolParseResult> {
  const document = {
    name: record.name,
    schemaVersion: 8,
    codebook: record.codebook,
    stages: record.stages,
    assetManifest: buildAssetManifest(record.assets),
    lastModified: record.lastModified.toISOString(),
    ...(record.description ? { description: record.description } : {}),
    ...(record.experiments && Object.keys(record.experiments).length > 0
      ? { experiments: record.experiments }
      : {}),
  };

  const result = await CurrentProtocolSchema.safeParseAsync(document);

  if (!result.success) {
    return {
      success: false,
      message: formatProtocolValidationIssues(
        result.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map((segment) =>
            typeof segment === 'number' ? segment : String(segment),
          ),
          message: issue.message,
        })),
      ),
    };
  }

  return { success: true, protocol: result.data };
}
