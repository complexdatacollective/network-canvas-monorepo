import {
  collectRosterExternalData,
  type ResolveRosterAsset,
} from '@codaco/interview/contract';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';
import { getAssetById } from '~/utils/assetUtils';

/**
 * Resolves a protocol asset id to a fetchable roster asset for synthetic
 * preview generation, reusing the editor's own asset store (IndexedDB, then
 * the Safari-private in-memory fallback). Previews run on draft protocols, so
 * an asset may not be a roster, may lack a source, or may not exist yet — every
 * unresolvable case returns null and any error is swallowed, so a roster
 * problem can never break a preview. The worst case is that a roster stage
 * falls back to fabricated people, exactly as before roster data was wired in.
 */
export function makeRosterAssetResolver(
  protocol: CurrentProtocol,
  protocolId: string,
): ResolveRosterAsset {
  return async (assetId) => {
    try {
      const manifestEntry = protocol.assetManifest?.[assetId];
      if (
        !manifestEntry ||
        manifestEntry.type !== 'network' ||
        !manifestEntry.source
      ) {
        return null;
      }

      const asset = await getAssetById(assetId, protocolId);
      if (!asset || typeof asset.data === 'string') {
        return null;
      }

      const url = URL.createObjectURL(asset.data);
      return {
        url,
        sourceFileName: manifestEntry.source,
        cleanup: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Could not resolve roster asset "${assetId}" for preview`,
        error,
      );
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
      resolveAsset: makeRosterAssetResolver(protocol, protocolId),
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not collect roster data for preview', error);
    return {};
  }
}
