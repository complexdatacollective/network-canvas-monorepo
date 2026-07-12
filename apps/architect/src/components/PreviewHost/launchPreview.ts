import type { CurrentProtocol } from '@codaco/protocol-validation';
import { posthog } from '~/analytics';
import { getActiveProtocolScope } from '~/utils/activeProtocolScope';
import { getMemoryAssetsForScope } from '~/utils/inMemoryAssetStore';

import {
  isPreviewMessage,
  type PreviewMemoryAsset,
  type PreviewPayload,
} from './messages';

const HANDSHAKE_TIMEOUT_MS = 10_000;
const POPUP_CLOSED_POLL_MS = 1_000;

type LaunchOptions = {
  protocol: CurrentProtocol;
  startStage: number;
  useSyntheticData: boolean;
  skipLogicBypassed: boolean;
};

type LaunchPreviewResult =
  | { kind: 'delivered' }
  | { kind: 'popup-blocked' }
  | { kind: 'popup-closed' };

export function launchPreview({
  protocol,
  startStage,
  useSyntheticData,
  skipLogicBypassed,
}: LaunchOptions): Promise<LaunchPreviewResult> {
  const protocolId = getActiveProtocolScope();
  if (!protocolId) {
    return Promise.reject(
      new Error(
        'No active protocol to preview. Open or save a protocol first.',
      ),
    );
  }

  // Trailing slash is required: a bare '/preview' hits Vite's SPA html fallback
  // (and equivalent static-host fallbacks) and serves the main app's index.html
  // instead of the preview entry, leaving a blank tab.
  const popup = window.open('/preview/', '_blank');
  if (!popup) {
    return Promise.resolve({ kind: 'popup-blocked' });
  }

  posthog.capture('protocol_previewed', {
    stage_count: protocol.stages?.length ?? 0,
    start_stage_index: startStage,
    asset_count: Object.keys(protocol.assetManifest ?? {}).length,
    use_synthetic_data: useSyntheticData,
  });

  const expectedOrigin = window.location.origin;
  // Ferry any Safari-private in-memory fallback assets to the preview tab: the
  // durable IndexedDB store is shared across tabs, but the in-memory map is
  // per-realm, so the preview context would otherwise resolve nothing. Blobs
  // survive structured clone over postMessage.
  const memoryAssets: PreviewMemoryAsset[] = getMemoryAssetsForScope(protocolId)
    .filter(
      (row): row is typeof row & { data: Blob } => row.data instanceof Blob,
    )
    .map((row) => ({ assetId: row.assetId, name: row.name, data: row.data }));
  const payload: PreviewPayload = {
    type: 'preview:payload',
    protocol,
    protocolId,
    startStage,
    useSyntheticData,
    skipLogicBypassed,
    memoryAssets,
  };

  return new Promise<LaunchPreviewResult>((resolve, reject) => {
    // The listener stays registered for the popup's lifetime so a reloaded
    // preview tab can re-request the payload. Cleanup happens when the popup
    // closes or when the initial handshake times out.
    let initialDelivered = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(initialTimeoutId);
      clearInterval(closedPollId);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== popup) return;
      if (event.origin !== expectedOrigin) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type !== 'preview:ready') return;

      popup.postMessage(payload, expectedOrigin);
      if (!initialDelivered) {
        initialDelivered = true;
        clearTimeout(initialTimeoutId);
        resolve({ kind: 'delivered' });
      }
    };

    const initialTimeoutId = setTimeout(() => {
      if (initialDelivered) return;
      cleanup();
      reject(
        new Error("Preview tab didn't load in time. Close it and try again."),
      );
    }, HANDSHAKE_TIMEOUT_MS);

    const closedPollId = setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      // Closing the tab before the handshake would otherwise leave the promise
      // pending forever, stranding the Preview button in its disabled state.
      if (!initialDelivered) {
        resolve({ kind: 'popup-closed' });
      }
    }, POPUP_CLOSED_POLL_MS);

    window.addEventListener('message', onMessage);
  });
}
