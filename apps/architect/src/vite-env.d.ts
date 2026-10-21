/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;
declare const __PWA_BUILD_ID__: string;
// The Architect 8 build bundled at `/v8/`, or null when none was. Read it
// through `getBundledLegacyArchitect`, which tolerates a build that does not
// define it.
declare const __ARCHITECT_V8__: { version: string; path: '/v8/' } | null;

interface ImportMetaEnv {
  readonly VITE_DISABLE_ANALYTICS?: string;
  readonly VITE_DISABLE_ANIMATIONS?: string;
  readonly VITE_PROTOCOL_SOURCE_AUTHORING?: string;
}
