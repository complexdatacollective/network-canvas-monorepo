// Browser environment type overrides - prevent Node.js globals from being available

// Remove Buffer from global scope to ensure it causes TypeScript errors in browser context
declare const Buffer: undefined;

// iOS Safari exposes installed-PWA (home-screen) state via this non-standard,
// read-only flag, which predates the `display-mode` media query.
interface Navigator {
  readonly standalone?: boolean;
}

// The File Handling API (Chromium desktop; manifest file_handlers) is not in
// TypeScript's DOM lib. Captured pre-React in utils/fileLaunchQueue.ts.
interface LaunchParams {
  readonly files: readonly FileSystemFileHandle[];
  readonly targetURL?: string;
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

interface Window {
  readonly launchQueue?: LaunchQueue;
}

// The PWA install prompt event is not in TypeScript's DOM lib.
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

// Remove other Node.js globals that shouldn't be available in browser
declare const process: undefined;
declare const global: undefined;
declare const __dirname: undefined;
declare const __filename: undefined;
declare const require: undefined;
declare const module: undefined;
declare const exports: undefined;

// Map react-recompose types to @types/recompose declarations
declare module 'react-recompose' {
  // biome-ignore lint/correctness/noUndeclaredDependencies: reexporting types from @types/recompose for compatibility
  export * from 'recompose';
}
