import { useQueries, type UseQueryResult } from '@tanstack/react-query';

import { useOpenEditId } from '../resources/client.tsx';
import { nodeShapeSvgQuery } from '../resources/components/nodeShapeResource.ts';
import { useProtocolBuilderContext } from '../state/context.ts';

// Module level, so TanStack keeps the combined record while no read changes.
const bySvgAsset = (
  results: readonly UseQueryResult<Readonly<{ asset: string; svg: string }>>[],
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    results.flatMap(({ data }) =>
      data === undefined ? [] : [[data.asset, data.svg]],
    ),
  );

/**
 * The SVG text of each shape asset named, keyed by asset id, for
 * `resolveNodeShapeReference`.
 *
 * Each asset is read once through `nodeShapeSvgQuery`. An asset still loading,
 * or one that cannot be read, is absent, and the node falls back to a built-in
 * shape. Needs a `ProtocolBuilder`; a component that may be drawn without one
 * reads through `NodeShapeSvgs` instead.
 */
export function useNodeShapeSvgs(
  assets: readonly string[],
): Readonly<Record<string, string>> {
  const host = useProtocolBuilderContext();
  const editId = useOpenEditId();

  return useQueries({
    queries: [...new Set(assets)]
      .toSorted()
      .map((asset) => nodeShapeSvgQuery(host, editId, asset)),
    combine: bySvgAsset,
  });
}
