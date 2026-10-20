import type { ResolvedAsset } from '@codaco/interview/contract';
import type { FaultCode } from '@codaco/studio-contract/schema/browser-logs';

import { participantRequestInit } from '../runtime/participantRuntime.ts';

const storagePath = (source: string): string =>
  `/storage/${source.split('.')[0]}`;

const isSvg = (source: string): boolean =>
  source.toLowerCase().endsWith('.svg');

type AssetFailure = (code: FaultCode) => void;

type Fetched =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly code: FaultCode; readonly error: unknown };

const failedWith = (code: FaultCode, error: unknown): Fetched => ({
  ok: false,
  code,
  error,
});

const svgDataUrl = async (path: string): Promise<Fetched> => {
  let response: Response;
  try {
    response = await fetch(path, participantRequestInit);
  } catch (error) {
    return failedWith('transport', error);
  }
  if (!response.ok) {
    return failedWith(
      response.status === 404 ? 'not_found' : 'http_error',
      new Error(`Could not load ${path}: ${String(response.status)}`),
    );
  }
  try {
    const body = await response.text();
    return {
      ok: true,
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`,
    };
  } catch (error) {
    return failedWith('transport', error);
  }
};

export type AssetResolver = ((assetId: string) => Promise<string>) & {
  readonly produced: (url: string) => boolean;
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
  failureReporter: () => AssetFailure = () => () => undefined,
): AssetResolver => {
  const resolved = new Map<string, Promise<string>>();
  const generated = new Set<string>();
  const resolve = (assetId: string): Promise<string> => {
    const known = resolved.get(assetId);
    if (known !== undefined) return known;
    const report = failureReporter();
    const source = assets.find(
      (candidate) => candidate.assetId === assetId,
    )?.source;
    const fetched: Promise<Fetched> =
      source === undefined
        ? Promise.resolve(
            failedWith(
              'not_found',
              new Error(`No stored file for asset ${assetId}`),
            ),
          )
        : isSvg(source)
          ? svgDataUrl(storagePath(source))
          : Promise.resolve({ ok: true, url: storagePath(source) });
    const url = fetched.then((outcome) => {
      if (!outcome.ok) {
        report(outcome.code);
        throw outcome.error;
      }
      if (source !== undefined && isSvg(source)) generated.add(outcome.url);
      return outcome.url;
    });
    // A failed load is not kept, so the next request tries again.
    url.catch(() => resolved.delete(assetId));
    resolved.set(assetId, url);
    return url;
  };
  return Object.assign(resolve, {
    produced: (url: string) => generated.has(url),
  });
};
