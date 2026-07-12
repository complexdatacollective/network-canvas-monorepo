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
  // True when skip logic was stripped from the previewed stage so it always
  // shows. The preview surfaces a notice on that stage when this is set.
  skipLogicBypassed: boolean;
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
