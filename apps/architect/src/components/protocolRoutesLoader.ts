import type { ComponentType } from 'react';

type ProtocolRoutesModule = typeof import('./ProtocolRoutes');

// The protocol editor is a chunk of its own, so the start screen renders
// without waiting for it. One shared promise backs both the lazy route and the
// background preload, so whichever asks first starts the download and the other
// reuses it. A failed load is forgotten, so the next attempt fetches again.
let protocolRoutes: Promise<ProtocolRoutesModule> | null = null;
let loadedProtocolRoutes: ComponentType | null = null;

export const loadProtocolRoutes = () => {
  protocolRoutes ??= import('./ProtocolRoutes').then(
    (module) => {
      loadedProtocolRoutes = module.default;
      return module;
    },
    (error: unknown) => {
      protocolRoutes = null;
      throw error;
    },
  );
  return protocolRoutes;
};

// The editor's routes, once they are here. React.lazy suspends on its first
// render even when its promise has already settled, so a route that rendered
// it then would show its loading fallback for a frame over an editor that was
// already loaded.
export const getLoadedProtocolRoutes = () => loadedProtocolRoutes;
