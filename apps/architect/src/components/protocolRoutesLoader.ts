// The protocol editor is a chunk of its own, so the start screen renders
// without waiting for it. One shared promise backs both the lazy route and the
// background preload, so whichever asks first starts the download and the other
// reuses it. A failed load is forgotten, so the next attempt fetches again.
let protocolRoutes: Promise<typeof import('./ProtocolRoutes')> | null = null;

export const loadProtocolRoutes = () => {
  protocolRoutes ??= import('./ProtocolRoutes').catch((error: unknown) => {
    protocolRoutes = null;
    throw error;
  });
  return protocolRoutes;
};
