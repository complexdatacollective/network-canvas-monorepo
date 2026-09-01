import type { CurrentProtocol } from '@codaco/protocol-validation';

type PreviewReady = { type: 'preview:ready' };

// A protocol asset whose bytes are carried in the payload. Only populated when
// the editor could not persist the asset to IndexedDB (e.g. Safari private
// browsing) — the durable store is shared across tabs, but the in-memory
// fallback is per-realm, so those assets must be ferried to the preview tab.
export type PreviewMemoryAsset = {
  assetId: string;
  name: string;
  data: Blob;
};

export type PreviewPayload = {
  type: 'preview:payload';
  protocol: CurrentProtocol;
  protocolId: string;
  startStage: number;
  useSyntheticData: boolean;
  // When false, PreviewHost removes skip logic from every stage before handing
  // the protocol to Shell. When true, routing remains active except for Shell's
  // one-stage initial override on the stage launched from Architect.
  respectSkipLogic: boolean;
  // In-memory fallback assets ferried from the editor realm (blobs survive
  // structured clone over postMessage). Empty in the normal IndexedDB path.
  memoryAssets: PreviewMemoryAsset[];
};

type PreviewMessage = PreviewReady | PreviewPayload;

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return type === 'preview:ready' || type === 'preview:payload';
}
