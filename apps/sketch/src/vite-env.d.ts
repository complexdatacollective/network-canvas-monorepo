/// <reference types="vite/client" />

// Build-time settings. Interfaces because they merge with Vite's own.
// oxlint-disable-next-line typescript/consistent-type-definitions
interface ImportMetaEnv {
  // The Architect deployment the handoff opens. Defaults to the dev site.
  readonly VITE_ARCHITECT_URL?: string;
}
