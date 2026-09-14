import { useEffect, useState } from 'react';

import { useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import { getAssetManifest } from '~/selectors/protocol';
import { getUnresolvedAssetIds } from '~/utils/assetUtils';

const NONE: ReadonlySet<string> = new Set();

/**
 * Resources this protocol declares but has no stored file for.
 *
 * A protocol reaches this state by being imported from a `.netcanvas` whose
 * archive was missing the file — Architect opens it anyway so the rest of the
 * work is usable, and this is what tells the researcher which resources still
 * need supplying.
 *
 * Recomputed whenever the manifest changes, which covers the replacement: the
 * import writes the blob and then rewrites the entry, so the answer here moves
 * with it and nothing has to remember to clear a flag.
 */
export const useUnresolvedAssetIds = (): ReadonlySet<string> => {
  const assetManifest = useAppSelector(getAssetManifest);
  const protocolId = useAppSelector(getActiveProtocolId);
  const [unresolved, setUnresolved] = useState<ReadonlySet<string>>(NONE);

  useEffect(() => {
    let cancelled = false;

    void getUnresolvedAssetIds(assetManifest, protocolId ?? undefined).then(
      (ids) => {
        if (cancelled) return;
        // A new empty Set every time would re-render every card on every
        // manifest edit, for the common case of nothing being missing.
        setUnresolved((current) =>
          ids.length === 0 && current.size === 0 ? current : new Set(ids),
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [assetManifest, protocolId]);

  return unresolved;
};
