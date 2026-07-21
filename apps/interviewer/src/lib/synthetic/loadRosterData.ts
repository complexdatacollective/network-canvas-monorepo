import {
  collectRosterExternalData,
  type ResolveRosterAsset,
} from '@codaco/interview/contract';
import type { NcNode } from '@codaco/shared-consts';
import { getProtocolAssets } from '~/lib/db/api';
import type { StoredAsset, StoredProtocol } from '~/lib/db/types';

/**
 * Host adapter for the shared roster-collection pipeline: reads this protocol's
 * stored (decrypted) assets and resolves each roster asset id to a fetchable
 * object URL, then delegates the parse/merge/filter work to
 * `collectRosterExternalData`. The stored assets are fetched lazily on first
 * resolve so a protocol with no roster stages never triggers an asset read.
 */
export async function loadRosterNodesForStages(
  protocol: StoredProtocol,
): Promise<Record<string, NcNode[]>> {
  let assetsByIdPromise: Promise<Map<string, StoredAsset>> | undefined;
  const getAssetsById = () => {
    assetsByIdPromise ??= getProtocolAssets(protocol.hash)
      .catch((error: unknown): StoredAsset[] => {
        // eslint-disable-next-line no-console
        console.error('Could not read protocol assets for roster data', error);
        return [];
      })
      .then(
        (records) => new Map(records.map((record) => [record.assetId, record])),
      );
    return assetsByIdPromise;
  };

  const resolveAsset: ResolveRosterAsset = async (assetId) => {
    const asset = (await getAssetsById()).get(assetId);
    if (!asset || asset.type !== 'network' || typeof asset.data === 'string') {
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

  return collectRosterExternalData({
    stages: protocol.protocol.stages,
    codebook: protocol.codebook,
    resolveAsset,
  });
}
