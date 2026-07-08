/// <reference types="vite/client" />

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { NcNetwork } from '@codaco/shared-consts';

declare module '*.css';

declare global {
  // Injected at build time by `vite.renderer.config.ts` (read from
  // apps/interviewer/package.json `version`). Renderer-only.
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
    // The vault record is present but unreadable (corrupt, or written by a
    // newer app version). Distinct from unconfigured so the app can surface a
    // recovery screen rather than overwriting the wrapped DEK via fresh setup.
    corrupt?: boolean;
    mode?: 'pin' | 'passphrase' | 'biometric' | 'none';
  };

  // iOS Safari exposes installed-PWA (home-screen) state via this non-standard,
  // read-only flag, which predates the `display-mode` media query.
  interface Navigator {
    readonly standalone?: boolean;
  }

  // The File Handling API (Chromium desktop; manifest file_handlers) is not
  // in TypeScript's DOM lib. Captured pre-React in fileLaunchQueue.ts.
  interface LaunchParams {
    readonly files: readonly FileSystemFileHandle[];
    readonly targetURL?: string;
  }

  interface LaunchQueue {
    setConsumer(consumer: (params: LaunchParams) => void): void;
  }

  // The File System Access Save-As picker (Chromium desktop) is not in
  // TypeScript's DOM lib; only the subset the export save path uses is
  // declared. FileSystemFileHandle/createWritable come from lib.dom.
  interface SaveFilePickerType {
    readonly description?: string;
    readonly accept: Record<string, readonly string[]>;
  }

  interface SaveFilePickerOptions {
    readonly suggestedName?: string;
    readonly types?: readonly SaveFilePickerType[];
  }

  interface Window {
    readonly launchQueue?: LaunchQueue;
    readonly showSaveFilePicker?: (
      options?: SaveFilePickerOptions,
    ) => Promise<FileSystemFileHandle>;
  }

  // The PWA install prompt event is not in TypeScript's DOM lib. Captured
  // pre-React in installPrompt.ts and offered by InstallBanner.
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
