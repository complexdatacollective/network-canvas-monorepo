/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_DISABLE_ANIMATIONS?: string;
  readonly VITE_PROTOCOL_SOURCE_AUTHORING?: string;
}

declare var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
