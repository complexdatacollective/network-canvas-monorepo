'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { Codebook } from '@codaco/protocol-validation';

import { useContractHandlers } from '../contract/context';

type ShapeSvgs = Readonly<Record<string, string>>;

const NO_SHAPE_SVGS: ShapeSvgs = Object.freeze({});

const CustomShapeSvgsContext = createContext<ShapeSvgs>(NO_SHAPE_SVGS);

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
 * Reads the text out of a `data:` URL without fetching it. A host may hand an
 * SVG over this way, and a page whose content security policy leaves `data:`
 * out of `connect-src` refuses to fetch one.
 */
function decodeDataUrl(url: string): string | undefined {
  if (!url.startsWith('data:')) return undefined;
  const comma = url.indexOf(',');
  if (comma === -1) return undefined;
  const body = url.slice(comma + 1);
  if (!url.slice(0, comma).endsWith(';base64')) {
    return decodeURIComponent(body);
  }
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

type LoadedShapeSvgs = {
  assetIdsKey: string;
  svgs: ShapeSvgs;
};

/**
 * Loads the SVG text of every custom node shape in the protocol once, so node
 * rendering can resolve `custom:` shapes synchronously. A shape whose SVG has
 * not loaded yet, or failed to load, is simply absent from the map, and draws
 * as the circle fallback.
 */
export function CustomShapeSvgsProvider({
  codebook,
  children,
}: {
  codebook: Codebook;
  children: ReactNode;
}) {
  const { onRequestAsset } = useContractHandlers();
  // Keyed by the asset ids rather than the codebook object, so a codebook that
  // is rebuilt with the same shapes does not refetch them.
  const assetIdsKey = useMemo(
    () => getCustomShapeAssetIds(codebook).join('\n'),
    [codebook],
  );
  const [loaded, setLoaded] = useState<LoadedShapeSvgs | null>(null);

  useEffect(() => {
    if (assetIdsKey === '') return undefined;

    const controller = new AbortController();
    const assetIds = assetIdsKey.split('\n');

    const loadSvg = async (assetId: string): Promise<string> => {
      const url = await onRequestAsset(assetId);
      controller.signal.throwIfAborted();
      const inline = decodeDataUrl(url);
      if (inline !== undefined) return inline;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(
          `Custom shape asset "${assetId}" failed to load (${response.status})`,
        );
      }
      return response.text();
    };

    const loadAll = async () => {
      const results = await Promise.allSettled(assetIds.map(loadSvg));
      if (controller.signal.aborted) return;
      const svgs: Record<string, string> = {};
      results.forEach((result, index) => {
        const assetId = assetIds[index];
        if (result.status === 'fulfilled' && assetId !== undefined) {
          svgs[assetId] = result.value;
        }
      });
      setLoaded({ assetIdsKey, svgs });
    };
    void loadAll();

    return () => {
      controller.abort();
    };
  }, [assetIdsKey, onRequestAsset]);

  const value =
    loaded?.assetIdsKey === assetIdsKey ? loaded.svgs : NO_SHAPE_SVGS;

  return (
    <CustomShapeSvgsContext.Provider value={value}>
      {children}
    </CustomShapeSvgsContext.Provider>
  );
}

/**
 * The loaded SVG text of the protocol's custom node shapes, by asset id, for
 * `resolveNodeShape`. Outside an interview it is empty, so custom shapes draw
 * as circles.
 */
export function useCustomShapeSvgs(): ShapeSvgs {
  return useContext(CustomShapeSvgsContext);
}
