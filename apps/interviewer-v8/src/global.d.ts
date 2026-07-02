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
    mode?: 'pin' | 'passphrase' | 'biometric' | 'none';
  };

  // iOS Safari exposes installed-PWA (home-screen) state via this non-standard,
  // read-only flag, which predates the `display-mode` media query.
  interface Navigator {
    readonly standalone?: boolean;
  }

  // The PWA install prompt event is not in TypeScript's DOM lib. Captured
  // pre-React in installPrompt.ts and offered by PwaInstallNudge.
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: readonly string[];
    readonly userChoice: Promise<{
      readonly outcome: 'accepted' | 'dismissed';
      readonly platform: string;
    }>;
    prompt(): Promise<void>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
