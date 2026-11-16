import { useEffect, useState, useSyncExternalStore } from 'react';

import { getActiveProtocolScope } from '~/utils/activeProtocolScope';
import {
  getAssetById,
  getAssetStoreVersion,
  subscribeToAssetStore,
} from '~/utils/assetUtils';

type ShapeAssets = Readonly<Record<string, Readonly<{ asset: string }>>>;

type ShapeSvgs = Readonly<Record<string, string>>;

const NO_SVGS: ShapeSvgs = {};

const SEPARATOR = '\u0000';

// Every icon on the codebook page draws from the same few assets, so each is
// read once per version of the asset store rather than once per icon.
const reads = new Map<string, Promise<string | undefined>>();

const readSvg = (asset: string, version: number) => {
  const key = [getActiveProtocolScope() ?? '', version, asset].join(SEPARATOR);
  let read = reads.get(key);
  if (read === undefined) {
    read = (async () => {
      const stored = await getAssetById(asset);
      return stored === undefined || typeof stored.data === 'string'
        ? undefined
        : await stored.data.text();
    })().catch(() => undefined);
    reads.set(key, read);
  }
  return read;
};

const readSvgs = async (
  assets: readonly string[],
  version: number,
): Promise<ShapeSvgs> => {
  const texts = await Promise.all(
    assets.map(async (asset) => ({
      asset,
      svg: await readSvg(asset, version),
    })),
  );
  return Object.fromEntries(
    texts.flatMap(({ asset, svg }) =>
      svg === undefined ? [] : [[asset, svg]],
    ),
  );
};

/**
 * The SVG text of each asset a node type's custom shapes draw from, keyed by
 * asset id, for `resolveNodeShapeReference`.
 *
 * Read from the open protocol's asset store, and read again when it changes.
 * Until an asset has been read, or when it cannot be, it is absent and the
 * node falls back to a built-in shape.
 */
export function useStoredShapeSvgs(
  customShapes: ShapeAssets | undefined,
): ShapeSvgs {
  const version = useSyncExternalStore(
    subscribeToAssetStore,
    getAssetStoreVersion,
  );
  const assetList = [
    ...new Set(Object.values(customShapes ?? {}).map(({ asset }) => asset)),
  ]
    .toSorted()
    .join(SEPARATOR);
  const [loaded, setLoaded] = useState<ShapeSvgs>(NO_SVGS);

  useEffect(() => {
    let current = true;
    const load = async () => {
      if (assetList === '') return;
      const svgs = await readSvgs(assetList.split(SEPARATOR), version);
      if (current) setLoaded(svgs);
    };
    void load();
    return () => {
      current = false;
    };
  }, [assetList, version]);

  // Kept while a new read is under way, so an icon does not flicker back to
  // its fallback shape whenever the store changes.
  return assetList === '' ? NO_SVGS : loaded;
}
