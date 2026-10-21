import {
  type CurrentProtocol,
  type ExtractedAsset,
  getAssetMimeType,
} from '@codaco/protocol-validation';

// The postMessage contract between Sketch and this route. Sketch opens
// `/import-from-sketch` with `window.open` (never `noopener`); this page posts
// `ready` to its opener until Sketch answers with one `payload`, then reports
// the outcome as a `result`.
//
// Every message carries `version` so either side can refuse a shape it does
// not know rather than misreading it.
const SKETCH_IMPORT_VERSION = 1;

type SketchImportReady = {
  type: 'sketch-import:ready';
  version: typeof SKETCH_IMPORT_VERSION;
};

type SketchImportAsset = {
  /** The asset manifest key. */
  id: string;
  /** The source file name Sketch gave the asset. */
  name: string;
  data: Blob;
};

type SketchImportPayload = {
  type: 'sketch-import:payload';
  version: typeof SKETCH_IMPORT_VERSION;
  protocol: CurrentProtocol;
  name: string;
  assets: SketchImportAsset[];
};

export type SketchImportResult =
  | {
      type: 'sketch-import:result';
      version: typeof SKETCH_IMPORT_VERSION;
      status: 'opened';
    }
  | {
      type: 'sketch-import:result';
      version: typeof SKETCH_IMPORT_VERSION;
      status: 'error';
      message: string;
    };

export const readyMessage: SketchImportReady = {
  type: 'sketch-import:ready',
  version: SKETCH_IMPORT_VERSION,
};

export const resultMessage = (
  outcome: { status: 'opened' } | { status: 'error'; message: string },
): SketchImportResult => ({
  type: 'sketch-import:result',
  version: SKETCH_IMPORT_VERSION,
  ...outcome,
});

/**
 * What an incoming message is.
 *
 * - `ignore`: not a Sketch payload at all (another script's message, or one of
 *   our own types travelling the wrong way). Dropped silently.
 * - `invalid`: claims to be a Sketch payload but has the wrong shape. Answered
 *   with an error result, so Sketch need not wait for its timeout.
 * - `payload`: the right shape. The protocol itself is only checked to be an
 *   object here — `validateProtocol` decides whether it is a protocol.
 */
type ParsedSketchMessage =
  | { kind: 'ignore' }
  | { kind: 'invalid' }
  | { kind: 'payload'; payload: SketchImportPayload };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isSketchAsset = (value: unknown): value is SketchImportAsset =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  value.id !== '' &&
  typeof value.name === 'string' &&
  value.data instanceof Blob;

export function parseSketchMessage(data: unknown): ParsedSketchMessage {
  if (!isRecord(data) || data.type !== 'sketch-import:payload') {
    return { kind: 'ignore' };
  }
  const { version, protocol, name, assets } = data;
  if (
    version !== SKETCH_IMPORT_VERSION ||
    !isRecord(protocol) ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    !Array.isArray(assets) ||
    !assets.every(isSketchAsset)
  ) {
    return { kind: 'invalid' };
  }
  return {
    kind: 'payload',
    payload: {
      type: 'sketch-import:payload',
      version: SKETCH_IMPORT_VERSION,
      // Shape-checked only; validated as a protocol by the import itself.
      protocol: protocol as CurrentProtocol,
      name,
      assets,
    },
  };
}

/**
 * Sketch's assets in the shape `extractProtocol` gives a `.netcanvas`'s, so the
 * import stores them exactly as it would a file's: named by the manifest's
 * display name (Sketch's file name only when the manifest has none), and typed
 * by the manifest source's extension when the Blob arrived untyped.
 */
export function toExtractedAssets(
  protocol: CurrentProtocol,
  assets: readonly SketchImportAsset[],
): ExtractedAsset[] {
  const manifest = protocol.assetManifest ?? {};
  return assets.map((asset) => {
    const definition = Object.hasOwn(manifest, asset.id)
      ? manifest[asset.id]
      : undefined;
    const source =
      definition && 'source' in definition ? definition.source : asset.name;
    const data =
      asset.data.type === ''
        ? new Blob([asset.data], { type: getAssetMimeType(source) })
        : asset.data;
    return { id: asset.id, name: definition?.name ?? asset.name, data };
  });
}
