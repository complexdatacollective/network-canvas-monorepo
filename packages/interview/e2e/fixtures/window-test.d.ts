import type { ProtocolPayload, SessionPayload } from '@codaco/interview';

declare global {
  // `interface` is required (not `type`) so this declaration MERGES with
  // the global Window from lib.dom.d.ts.
  // biome-ignore lint/style/useConsistentTypeDefinitions: declaration merging
  interface Window {
    __test: {
      installProtocol(protocol: ProtocolPayload): void;
      setAssetUrl(assetId: string, url: string): void;
      createInterview(protocolId: string, participantId?: string): string;
      getNetworkState(): SessionPayload['network'] | undefined;
      reset(): void;
    };
    __e2eMap?: {
      getSource(id: string): unknown;
      isSourceLoaded(id: string): boolean;
      querySourceFeatures(id: string): unknown[];
      queryRenderedFeatures(options: { layers: string[] }): unknown[];
      once(event: string, fn: () => void): void;
      resize(): void;
      triggerRepaint(): void;
    };
  }

  var __test: Window['__test'];
  var __e2eMap: Window['__e2eMap'];
}
