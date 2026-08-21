import {
  collectGeospatialPropertyValues,
  collectRosterExternalData,
  type ResolveRosterAsset,
} from '@codaco/interview/contract';
import type { AssetData } from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';
import { getAssetById } from '~/utils/assetUtils';

/** The manifest entry types this module knows how to hand to a collector. */
type ResolvableAssetType = 'network' | 'geojson';

/**
 * Resolves a protocol asset id to a fetchable asset for synthetic preview
 * generation, reusing the editor's own asset store (IndexedDB, then the
 * Safari-private in-memory fallback). Previews run on draft protocols, so an
 * asset may be of the wrong kind, may lack a source, or may not exist yet —
 * every unresolvable case returns null and any error is swallowed, so an asset
 * problem can never break a preview. The worst case is that a stage's pool goes
 * unresolved and generation fabricates values for it instead, exactly as before
 * asset data was wired in.
 *
 * `assetType` is checked here because the manifest is the only place an asset's
 * kind is recorded — the contract collectors see nothing but a URL, so handing
 * an image to the roster parser would be indistinguishable from a corrupt CSV.
 */
export function makeAssetResolver(
  protocol: CurrentProtocol,
  protocolId: string,
  assetType: ResolvableAssetType,
): ResolveRosterAsset {
  return async (assetId) => {
    try {
      const manifestEntry = protocol.assetManifest?.[assetId];
      if (!manifestEntry) return null;
      // Two steps: the first narrows the manifest union to the file-backed
      // entries (the ones that carry a `source`), the second picks the kind
      // this resolver was built for.
      if (
        manifestEntry.type !== 'network' &&
        manifestEntry.type !== 'geojson'
      ) {
        return null;
      }
      if (manifestEntry.type !== assetType || !manifestEntry.source) {
        return null;
      }

      const asset = await getAssetById(assetId, protocolId);
      if (!asset || typeof asset.data === 'string') {
        return null;
      }

      // Deliberately not `createAssetUrlOwner`: this satisfies the
      // `ResolveRosterAsset` contract, which hands the caller an explicit
      // `cleanup` and uses the URL exactly once, to parse the asset. There is
      // nothing to cache, de-duplicate or supersede, and no second owner.
      const url = URL.createObjectURL(asset.data);
      return {
        url,
        sourceFileName: manifestEntry.source,
        cleanup: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Could not resolve asset "${assetId}" for preview`, error);
      return null;
    }
  };
}

/**
 * Roster node pools (keyed by stage id) for a preview's synthetic session,
 * drawn from the protocol's actual roster assets.
 */
export async function collectPreviewRosterData(
  protocol: CurrentProtocol,
  protocolId: string,
): Promise<Record<string, NcNode[]>> {
  // Load-bearing soft-fail: previews run on draft protocols, so collection can
  // throw on half-built shapes that per-asset error isolation can't anticipate
  // (e.g. a malformed panel filter throwing inside network-query). Any failure
  // returns {} so the preview still renders, falling back to fabricated people.
  try {
    return await collectRosterExternalData({
      stages: protocol.stages,
      codebook: protocol.codebook,
      resolveAsset: makeAssetResolver(protocol, protocolId, 'network'),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not collect roster data for preview', error);
    return {};
  }
}

/**
 * Geospatial answer pools (keyed by stage id) for a preview's synthetic
 * session: the values a map tap can store, read off each Geospatial stage's
 * GeoJSON asset. Soft-fails to {} for the same reason its roster sibling does.
 */
export async function collectPreviewGeospatialData(
  protocol: CurrentProtocol,
  protocolId: string,
): Promise<Record<string, string[]>> {
  try {
    return await collectGeospatialPropertyValues({
      stages: protocol.stages,
      resolveAsset: makeAssetResolver(protocol, protocolId, 'geojson'),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not collect geospatial data for preview', error);
    return {};
  }
}

/**
 * Everything `generateInterviews` cannot fetch for itself, resolved from the
 * editor's own asset store: the roster rows a roster stage draws people from,
 * and the feature-property values a Geospatial stage's map can produce.
 *
 * A stage whose asset could not be resolved contributes no key at all, which is
 * what the engine reads as "no pool was supplied" — distinct from a pool known
 * to be empty — and fabricates for instead.
 */
export async function collectPreviewAssetData(
  protocol: CurrentProtocol,
  protocolId: string,
): Promise<AssetData> {
  const [rosterNodes, geojsonPropertyValues] = await Promise.all([
    collectPreviewRosterData(protocol, protocolId),
    collectPreviewGeospatialData(protocol, protocolId),
  ]);

  return { rosterNodes, geojsonPropertyValues };
}
