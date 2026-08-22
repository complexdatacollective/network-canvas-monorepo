import {
  collectGeospatialPropertyValues,
  collectRosterExternalData,
  type ResolveRosterAsset,
} from '@codaco/interview/contract';
import type { AssetData } from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { StoredProtocolAsset } from '~/lib/synthetic/storedProtocol';

/**
 * The asset types each collector may read, mirroring what the schema's
 * cross-reference checks allow the corresponding stage field to name: a roster
 * `dataSource` must be a `network` asset, and a Geospatial map may be either
 * `geojson` or `network`. One resolver is built per collector rather than one
 * shared resolver, so a stage can never be handed an asset of a kind its
 * interface cannot read.
 */
const ROSTER_ASSET_TYPES = ['network'] as const;
const GEOSPATIAL_ASSET_TYPES = ['geojson', 'network'] as const;

/**
 * Fresco's host adapter for the shared collection pipeline: resolve a protocol
 * asset-manifest id to the stored object it was uploaded as.
 *
 * The manifest key is the row's `assetId` and the row's `name` is the file's
 * own name — the manifest `source` that `utils/protocolImport` wrote there — so
 * the id locates the row and the name is what decides whether the body is
 * parsed as CSV or as JSON.
 *
 * No `cleanup`: unlike the browser hosts, which mint an object URL per read,
 * this hands over a stored URL that outlives the read and owns nothing.
 */
function makeStoredAssetResolver(
  assets: readonly StoredProtocolAsset[],
  allowedTypes: readonly string[],
): ResolveRosterAsset {
  const byAssetId = new Map(assets.map((asset) => [asset.assetId, asset]));

  return (assetId) => {
    const asset = byAssetId.get(assetId);

    if (
      !asset ||
      !allowedTypes.includes(asset.type) ||
      asset.url.length === 0
    ) {
      return Promise.resolve(null);
    }

    return Promise.resolve({ url: asset.url, sourceFileName: asset.name });
  };
}

/**
 * Host-resolved asset content for a synthetic batch: per-stage roster pools and
 * per-stage Geospatial answer pools, keyed by stage id.
 *
 * Both halves soft-fail to `{}`. The collectors already isolate a single
 * unreadable asset — that stage's key is simply absent — but collection as a
 * whole can still throw on a shape neither anticipates (a malformed panel
 * filter, say), and an absent pool is not a licence to invent people: a stage
 * whose roster could not be read is an unresolved pool, which the engine's
 * feasibility gate refuses on rather than fabricating against. Losing the pools
 * therefore turns into a refusal naming the stage, never silent bad data.
 */
export async function collectSyntheticAssetData(
  protocol: CurrentProtocol,
  assets: readonly StoredProtocolAsset[],
): Promise<AssetData> {
  const [rosterNodes, geojsonPropertyValues] = await Promise.all([
    collectRosterExternalData({
      stages: protocol.stages,
      codebook: protocol.codebook,
      resolveAsset: makeStoredAssetResolver(assets, ROSTER_ASSET_TYPES),
    }).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Could not collect roster data for generation', error);
      return {};
    }),
    collectGeospatialPropertyValues({
      stages: protocol.stages,
      resolveAsset: makeStoredAssetResolver(assets, GEOSPATIAL_ASSET_TYPES),
    }).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('Could not collect GeoJSON data for generation', error);
      return {};
    }),
  ]);

  return { rosterNodes, geojsonPropertyValues };
}
