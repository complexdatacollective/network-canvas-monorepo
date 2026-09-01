import { useCallback, useEffect, useRef } from 'react';

import {
  type AssetRequestHandler,
  type AssetUrlOwner,
  createAssetUrlOwner,
} from '@codaco/interview/contract';
import { assetKey } from '~/utils/assetDB';
import { getAssetById } from '~/utils/assetUtils';

// The preview shows one generation of one protocol: assets cannot be replaced
// underneath it, because re-opening the preview mounts a new host with a new
// owner. So every request is the same generation, and a cached URL always
// satisfies it.
const PREVIEW_GENERATION = 'preview';

export function useAssetResolver(
  protocolId: string | null,
): AssetRequestHandler {
  // One owner per mount, so unmounting revokes exactly what this preview
  // minted and nothing else — see the cleanup below.
  const ownerRef = useRef<AssetUrlOwner | null>(null);

  useEffect(() => {
    // A remount (a genuine one, which StrictMode also simulates) needs a live
    // owner, because the previous run's cleanup latched the old one closed.
    // Minting the replacement here and not in the cleanup is deliberate: after
    // a real unmount the handler can still be held by detached code, and it
    // must refuse those calls rather than mint a URL with no owner. The
    // preview entry mounts this once, without StrictMode, so in shipped code
    // the cleanup is terminal.
    const existing = ownerRef.current;
    const owner =
      existing !== null && !existing.closed ? existing : createAssetUrlOwner();
    ownerRef.current = owner;

    return () => {
      // Revokes every URL this mount minted, cancels the reads still running,
      // and refuses everything afterwards.
      owner.release();
    };
  }, []);

  return useCallback(
    async (assetId: string) => {
      if (!protocolId) {
        throw new Error(`Missing protocol scope for asset ${assetId}`);
      }

      // Non-null from the first effect onwards. A request that beats the
      // effect (a child's own effect runs first) creates the owner the effect
      // then adopts; a request that arrives after teardown finds the closed
      // owner still in place and is refused by it, never re-armed.
      ownerRef.current ??= createAssetUrlOwner();

      return ownerRef.current.resolve({
        key: assetKey(protocolId, assetId),
        scope: PREVIEW_GENERATION,
        read: async () => {
          // Mirror the editor's resolver: IndexedDB first, then the in-memory
          // store used when durable storage is unavailable (e.g. Safari
          // private browsing).
          const entry = await getAssetById(assetId, protocolId);
          if (!entry || typeof entry.data === 'string') {
            throw new Error(`Asset ${assetId} not found in local store`);
          }
          return entry.data instanceof Blob
            ? entry.data
            : new Blob([entry.data]);
        },
        // Callers already treat a rejection as "asset unavailable".
        unavailable: () =>
          new Error(`Preview closed before asset ${assetId} finished loading`),
      });
    },
    [protocolId],
  );
}
