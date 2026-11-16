'use client';

import { type QueryObserverResult, useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { Codebook } from '@codaco/protocol-validation';
import { ensureError } from '@codaco/shared-consts';

import { useCaptureException } from '../analytics/useTrack';
import { useContractHandlers } from '../contract/context';
import { getCodebook } from '../store/modules/protocol';
import { readAssetText } from '../utils/readAssetText';

type ShapeSvgs = Readonly<Record<string, string>>;

const NO_SHAPE_SVGS: ShapeSvgs = Object.freeze({});

function getCustomShapeAssetIds(codebook: Codebook): string[] {
  const assetIds = new Set<string>();
  for (const nodeDefinition of Object.values(codebook.node ?? {})) {
    for (const shape of Object.values(nodeDefinition.customShapes ?? {})) {
      assetIds.add(shape.asset);
    }
  }
  return [...assetIds].toSorted();
}

/**
 * The loaded SVG text of the protocol's custom node shapes, by asset id, for
 * `resolveNodeShape`. Each asset is read once for the whole interview and
 * appears as soon as it has loaded; until then, or if it fails to load, it is
 * absent and the shape draws as the circle fallback.
 */
export function useCustomShapeSvgs(): ShapeSvgs {
  const codebook = useSelector(getCodebook);
  const { onRequestAsset } = useContractHandlers();
  const captureException = useCaptureException();
  const assetIds = useMemo(() => getCustomShapeAssetIds(codebook), [codebook]);

  const combine = useCallback(
    (results: QueryObserverResult<string>[]): ShapeSvgs => {
      const loaded = assetIds.flatMap((assetId, index): [string, string][] => {
        const svg = results[index]?.data;
        return svg === undefined ? [] : [[assetId, svg]];
      });
      return loaded.length === 0 ? NO_SHAPE_SVGS : Object.fromEntries(loaded);
    },
    [assetIds],
  );

  return useQueries({
    queries: assetIds.map((assetId) => ({
      queryKey: ['shape-svg', assetId],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        try {
          return await readAssetText(onRequestAsset, assetId, signal);
        } catch (e) {
          if (!signal.aborted) {
            captureException(ensureError(e), { feature: 'custom-shapes' });
          }
          throw e;
        }
      },
    })),
    combine,
  });
}
