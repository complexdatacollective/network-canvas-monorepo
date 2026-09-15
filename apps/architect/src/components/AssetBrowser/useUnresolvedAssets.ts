import { useEffect, useState, useSyncExternalStore } from 'react';

import { useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import { getAssetManifest } from '~/selectors/protocol';
import {
  getAssetStoreVersion,
  getUnresolvedAssetIds,
  subscribeToAssetStore,
} from '~/utils/assetUtils';

const NONE: ReadonlySet<string> = new Set();

/**
 * Resources this protocol declares but has no stored file for.
 *
 * A protocol reaches this state by being imported from a `.netcanvas` whose
 * archive was missing the file — Architect opens it anyway so the rest of the
 * work is usable, and this is what tells the researcher which resources still
 * need supplying.
 *
 * Recomputed whenever the manifest changes or the store is written. The store
 * is the one that has to be watched: supplying a file under the name the
 * manifest already records changes no field, so the reducer returns the same
 * state and a manifest-only dependency would leave the card calling a resource
 * missing that export can already read.
 */
export const useUnresolvedAssetIds = (): ReadonlySet<string> => {
  const assetManifest = useAppSelector(getAssetManifest);
  const protocolId = useAppSelector(getActiveProtocolId);
  const storeVersion = useSyncExternalStore(
    subscribeToAssetStore,
    getAssetStoreVersion,
    getAssetStoreVersion,
  );
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
    // `storeVersion` is a dependency, not a value this reads: a write to the
    // store can change the answer without changing the manifest.
  }, [assetManifest, protocolId, storeVersion]);

  return unresolved;
};
