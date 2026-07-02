/// <reference types="vite/client" />

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

declare module '*.css';

declare global {
  // Injected at build time by `vite.renderer.config.ts` (read from
  // apps/interviewer-v8/package.json `version`). Renderer-only.
  const __APP_VERSION__: string;

  type WireAsset = {
    id: string;
    protocolHash: string;
    assetId: string;
    name: string;
    type: 'image' | 'video' | 'audio' | 'network' | 'geojson' | 'apikey';
    kind: 'string' | 'blob';
    mimeType?: string;
    data: string | Uint8Array;
  };

  type WireAssetInput =
    | { id: string; name: string; kind: 'string'; data: string }
    | {
        id: string;
        name: string;
        kind: 'blob';
        mimeType: string;
        data: Uint8Array;
      };

  type AuthStatus = {
    configured: boolean;
    locked: boolean;
    mode?: 'pin' | 'passphrase' | 'none';
  };
}
