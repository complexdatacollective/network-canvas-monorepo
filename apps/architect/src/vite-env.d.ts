/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_DISABLE_ANALYTICS?: string;
  readonly VITE_DISABLE_ANIMATIONS?: string;
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;
  readonly VITE_PROTOCOL_SOURCE_AUTHORING?: string;
}
