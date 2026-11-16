import {
  type QueryClient,
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { getActiveProtocolScope } from '~/utils/activeProtocolScope';
import {
  getAssetById,
  getAssetStoreVersion,
  subscribeToAssetStore,
} from '~/utils/assetUtils';

type ShapeAssets = Readonly<Record<string, Readonly<{ asset: string }>>>;

type ShapeSvg = Readonly<{ asset: string; svg: string }>;

const QUERY_ROOT = 'architect-stored-shape-svg';

const readShapeSvg = async (
  scope: string,
  asset: string,
): Promise<ShapeSvg> => {
  const stored = await getAssetById(asset, scope);
  if (stored === undefined || typeof stored.data === 'string') {
    throw new Error(`the shape asset ${asset} is not a stored file`);
  }
  return { asset, svg: await stored.data.text() };
};

/**
 * A changed store version is a new query, and `useQueries` gives a new query a
 * new observer, so `keepPreviousData` has nothing to keep. The newest earlier
 * version's text stands in instead while the new version is read.
 */
const earlierShapeSvg = (
  queryClient: QueryClient,
  scope: string,
  asset: string,
): ShapeSvg | undefined =>
  queryClient
    .getQueriesData<ShapeSvg>({ queryKey: [QUERY_ROOT, scope, asset] })
    .flatMap(([key, data]) => {
      const version = key[3];
      return data === undefined || typeof version !== 'number'
        ? []
        : [{ version, data }];
    })
    .toSorted((a, b) => b.version - a.version)[0]?.data;

// Module level, so TanStack keeps the combined record while no read changes.
const bySvgAsset = (
  results: readonly UseQueryResult<ShapeSvg>[],
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    results.flatMap(({ data }) =>
      data === undefined ? [] : [[data.asset, data.svg]],
    ),
  );

/**
 * The SVG text of each asset a node type's custom shapes draw from, keyed by
 * asset id, for `resolveNodeShapeReference`.
 *
 * Each asset is read once per version of the open protocol's asset store.
 * While a newer version is read the earlier text is kept, so an icon does not
 * flicker back to its fallback shape. An asset not yet read, or one that cannot
 * be, is absent and the node falls back to a built-in shape.
 */
export function useStoredShapeSvgs(
  customShapes: ShapeAssets | undefined,
): Readonly<Record<string, string>> {
  const queryClient = useQueryClient();
  const version = useSyncExternalStore(
    subscribeToAssetStore,
    getAssetStoreVersion,
  );
  const scope = getActiveProtocolScope();
  const assets = [
    ...new Set(Object.values(customShapes ?? {}).map(({ asset }) => asset)),
  ].toSorted();

  return useQueries({
    queries:
      scope === null
        ? []
        : assets.map((asset) => ({
            queryKey: [QUERY_ROOT, scope, asset, version],
            queryFn: () => readShapeSvg(scope, asset),
            staleTime: Number.POSITIVE_INFINITY,
            retry: false,
            placeholderData: () => earlierShapeSvg(queryClient, scope, asset),
          })),
    combine: bySvgAsset,
  });
}
