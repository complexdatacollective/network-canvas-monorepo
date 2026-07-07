// Single source of truth for the renderer-visible app version string. The
// underlying `__APP_VERSION__` is a build-time constant injected by
// `vite.renderer.config.ts` from this app's package.json.
export const APP_VERSION = __APP_VERSION__;
