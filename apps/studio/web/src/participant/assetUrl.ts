import type { ResolvedAsset } from '@codaco/interview/contract';
import type { FaultCode } from '@codaco/studio-contract/schema/browser-logs';

import { participantRequestInit } from '../runtime/participantRuntime.ts';

const storagePath = (source: string): string =>
  `/storage/${source.split('.')[0]}`;

const isSvg = (source: string): boolean =>
  source.toLowerCase().endsWith('.svg');

type AssetFailure = (code: FaultCode) => void;

const svgDataUrl = async (
  path: string,
  onFailure: AssetFailure,
): Promise<string> => {
  const response = await fetch(path, participantRequestInit).catch(
    (error: unknown) => {
      onFailure('transport');
      throw error;
    },
  );
  if (!response.ok) {
    onFailure(response.status === 404 ? 'not_found' : 'http_error');
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
export type AssetResolver = ((assetId: string) => Promise<string>) & {
  readonly produced: (url: string) => boolean;
};

export const createAssetResolver = (
  assets: readonly ResolvedAsset[],
  failureReporter: () => AssetFailure = () => () => undefined,
): AssetResolver => {
  const resolved = new Map<string, Promise<string>>();
  const generated = new Set<string>();
  const resolve = (assetId: string): Promise<string> => {
    const known = resolved.get(assetId);
    if (known !== undefined) return known;
    const onFailure = failureReporter();
    const source = assets.find(
      (candidate) => candidate.assetId === assetId,
    )?.source;
    if (source === undefined) {
      onFailure('not_found');
      return Promise.reject(new Error(`No stored file for asset ${assetId}`));
    }
    const url = isSvg(source)
      ? svgDataUrl(storagePath(source), onFailure).then((dataUrl) => {
          generated.add(dataUrl);
          return dataUrl;
        })
      : Promise.resolve(storagePath(source));
    // A failed load is not kept, so the next request tries again.
    url.catch(() => resolved.delete(assetId));
    resolved.set(assetId, url);
    return url;
  };
  return Object.assign(resolve, {
    produced: (url: string) => generated.has(url),
  });
};
