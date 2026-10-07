import type { ResolvedAsset } from '@codaco/interview/contract';

const storagePath = (source: string): string =>
  `/storage/${source.split('.')[0]}`;

const isSvg = (source: string): boolean =>
  source.toLowerCase().endsWith('.svg');

const svgDataUrl = async (path: string): Promise<string> => {
  const response = await fetch(path, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${String(response.status)}`);
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await response.text())}`;
};

/**
 * Resolves the protocol's assets to the URLs an interview loads them from:
 * Studio's storage serves every audio, video and raster image inline as
 * itself. It serves an SVG as an opaque download, since an SVG carries
 * script, so an SVG reaches the interview as a `data:` URL built from its
 * bytes, which renders in an <img> and which a browser will not open as a
 * page. Each asset is resolved once.
 */
export const createAssetResolver = (
  assets: readonly ResolvedAsset[],
): ((assetId: string) => Promise<string>) => {
  const resolved = new Map<string, Promise<string>>();
  return (assetId) => {
    const known = resolved.get(assetId);
    if (known !== undefined) return known;
    const source = assets.find(
      (candidate) => candidate.assetId === assetId,
    )?.source;
    if (source === undefined) {
      return Promise.reject(new Error(`No stored file for asset ${assetId}`));
    }
    const url = isSvg(source)
      ? svgDataUrl(storagePath(source))
      : Promise.resolve(storagePath(source));
    // A failed load is not kept, so the next request tries again.
    url.catch(() => resolved.delete(assetId));
    resolved.set(assetId, url);
    return url;
  };
};
