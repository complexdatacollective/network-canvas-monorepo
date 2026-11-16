import {
  QueryClient,
  useQueries,
  type UseQueryResult,
} from '@tanstack/react-query';
import { Redacted } from 'effect';

import { useOpenEditId } from '../resources/client.tsx';
import {
  type ProtocolBuilderContextValue,
  useOptionalProtocolBuilderContext,
} from '../state/context.ts';

type ShapeAssets = Readonly<Record<string, Readonly<{ asset: string }>>>;

type ShapeSvg = Readonly<{ asset: string; svg: string }>;

// Asked nothing: it stands in for the builder's cache where there is no host,
// so a field drawn outside a protocol still renders, with built-in shapes.
const NO_HOST_CLIENT = new QueryClient();

// Module level, so TanStack keeps the combined record while no read changes.
const bySvgAsset = (
  results: readonly UseQueryResult<ShapeSvg>[],
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    results.flatMap(({ data }) =>
      data === undefined ? [] : [[data.asset, data.svg]],
    ),
  );

const readShapeSvg = async (
  { adapter, protocolId }: ProtocolBuilderContextValue,
  editId: string | undefined,
  asset: string,
): Promise<ShapeSvg> => {
  const preview = await adapter.rpcCall('ResourcesPreview', {
    protocolId,
    ...(editId === undefined ? {} : { editId }),
    resourceId: asset,
  });
  if (preview.status !== 'ok') {
    throw new Error(`the shape asset ${asset} has no preview`);
  }
  const response = await fetch(Redacted.value(preview.data.url));
  if (!response.ok) {
    throw new Error(`the shape asset ${asset} could not be read`);
  }
  return { asset, svg: await response.text() };
};

/**
 * The SVG text of each asset a node type's custom shapes draw from, keyed by
 * asset id, for `resolveNodeShapeReference`.
 *
 * Each asset is read once through the host's preview URL and cached for the
 * session. Inside an open edit the read names it, so a shape imported but not
 * yet saved is drawn too. An asset still loading, or one that cannot be read,
 * is absent, and the node falls back to a built-in shape. Outside a
 * `ProtocolBuilder` nothing is read.
 */
export function useNodeShapeSvgs(
  customShapes: ShapeAssets | undefined,
): Readonly<Record<string, string>> {
  const host = useOptionalProtocolBuilderContext();
  const editId = useOpenEditId();
  const assets = [
    ...new Set(Object.values(customShapes ?? {}).map(({ asset }) => asset)),
  ].toSorted();

  return useQueries(
    {
      queries:
        host === undefined
          ? []
          : assets.map((asset) => ({
              queryKey: [
                'protocol-builder',
                host.protocolId,
                'node-shape-svg',
                asset,
              ],
              queryFn: () => readShapeSvg(host, editId, asset),
              staleTime: Number.POSITIVE_INFINITY,
              retry: false,
            })),
      combine: bySvgAsset,
    },
    host === undefined ? NO_HOST_CLIENT : undefined,
  );
}
