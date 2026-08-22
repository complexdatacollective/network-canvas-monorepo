import {
  collectGeospatialPropertyValues,
  collectRosterExternalData,
  type ResolveRosterAsset,
} from '@codaco/interview/contract';
import type { AssetData } from '@codaco/protocol-utilities';
import { getProtocolAssets } from '~/lib/db/api';
import type {
  StoredAsset,
  StoredAssetType,
  StoredProtocol,
} from '~/lib/db/types';

/**
 * Host adapter for the shared asset-collection pipeline: reads this protocol's
 * stored (decrypted) assets and resolves each asset id to a fetchable object
 * URL, then delegates the parse/merge/filter work to the two contract
 * collectors — `collectRosterExternalData` for roster-backed name generators
 * and their panels, `collectGeospatialPropertyValues` for the map values a
 * Geospatial stage can store.
 *
 * The engine cannot fetch anything itself, so everything it needs from a
 * researcher's asset files arrives through this one `AssetData` argument.
 *
 * A stage whose asset cannot be resolved contributes no key at all (both
 * collectors omit it rather than emitting an empty pool), which the engine
 * reads as "unresolved" and treats differently from a genuinely empty source.
 *
 * The stored assets are fetched lazily on first resolve, so a protocol with
 * neither roster nor map stages never triggers an asset read.
 */
export async function loadSyntheticAssetData(
  protocol: StoredProtocol,
): Promise<AssetData> {
  let assetsByIdPromise: Promise<Map<string, StoredAsset>> | undefined;
  const getAssetsById = () => {
    assetsByIdPromise ??= getProtocolAssets(protocol.hash)
      .catch((error: unknown): StoredAsset[] => {
        // eslint-disable-next-line no-console
        console.error(
          'Could not read protocol assets for synthetic data',
          error,
        );
        return [];
      })
      .then(
        (records) => new Map(records.map((record) => [record.assetId, record])),
      );
    return assetsByIdPromise;
  };

  // One resolver per expected asset type: the manifest's own `type` decides how
  // a file is parsed, so a stage pointed at the wrong kind of asset resolves to
  // nothing rather than being handed to a parser that cannot read it.
  const resolverFor =
    (expectedType: StoredAssetType): ResolveRosterAsset =>
    async (assetId) => {
      const asset = (await getAssetsById()).get(assetId);
      if (
        !asset ||
        asset.type !== expectedType ||
        typeof asset.data === 'string'
      ) {
        return null;
      }

      const url = URL.createObjectURL(asset.data);
      const manifestEntry = protocol.protocol.assetManifest?.[assetId];
      const sourceFileName =
        manifestEntry && 'source' in manifestEntry
          ? manifestEntry.source
          : asset.name;

      return { url, sourceFileName, cleanup: () => URL.revokeObjectURL(url) };
    };

  const [rosterNodes, geojsonPropertyValues] = await Promise.all([
    collectRosterExternalData({
      stages: protocol.protocol.stages,
      codebook: protocol.codebook,
      resolveAsset: resolverFor('network'),
    }),
    collectGeospatialPropertyValues({
      stages: protocol.protocol.stages,
      resolveAsset: resolverFor('geojson'),
    }),
  ]);

  return { rosterNodes, geojsonPropertyValues };
}
